// Context Lens: reads the pi session JSONL of the conversation being viewed and
// breaks the context window down by category (dsh-context style).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SESS_ROOT = path.join(os.homedir(), ".pi", "agent", "sessions");

// Known context windows (tokens). Matched by substring of model id, first hit wins.
const WINDOWS = [
	["claude", 200000], ["glm-5", 200000], ["glm-4.6", 200000], ["glm", 128000],
	["gpt-5", 400000], ["gpt-4.1", 1000000], ["o3", 200000], ["o4", 200000],
	["deepseek", 128000], ["gemini", 1000000], ["kimi", 256000], ["qwen", 256000],
];
const windowFor = (id = "") => (WINDOWS.find(([k]) => id.toLowerCase().includes(k)) || [, 200000])[1];

// Rough token estimate: ASCII ~4 chars/token, CJK/Hangul ~1 char/token.
function est(s) {
	if (!s) return 0;
	if (typeof s !== "string") s = JSON.stringify(s);
	let wide = 0;
	for (const ch of s) if (ch.charCodeAt(0) > 0x2e80) wide++;
	return Math.ceil((s.length - wide) / 4 + wide);
}

function findSessionFile(sessionId) {
	if (!sessionId || !/^[\w-]+$/.test(sessionId)) return null;
	for (const d of fs.readdirSync(SESS_ROOT)) {
		const dir = path.join(SESS_ROOT, d);
		let names;
		try { names = fs.readdirSync(dir); } catch { continue; }
		const hit = names.find((n) => n.endsWith(`_${sessionId}.jsonl`));
		if (hit) return path.join(dir, hit);
	}
	return null;
}

const textOf = (content) =>
	typeof content === "string" ? content
		: (content || []).map((b) => b.type === "text" ? b.text : b.type === "thinking" ? b.thinking : b.type === "toolCall" ? JSON.stringify(b.arguments) : b.type === "image" ? "[image]" : "").join("\n");

const clip = (s, n = 4000) => (s && s.length > n ? s.slice(0, n) + `\n… (${s.length - n}자 생략)` : s || "");

function analyze(file) {
	const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
	const all = [];
	for (const l of lines) { try { all.push(JSON.parse(l)); } catch {} }
	const header = all.find((e) => e.type === "session") || {};
	const byId = new Map(all.filter((e) => e.id && e.type !== "session").map((e) => [e.id, e]));

	// Active branch = path from the last appended entry back to the root.
	const tail = [...all].reverse().find((e) => e.id && e.type !== "session");
	const branch = [];
	for (let e = tail; e; e = e.parentId ? byId.get(e.parentId) : null) branch.push(e);
	branch.reverse();

	// Apply context_edit replacements.
	const edits = new Map();
	for (const e of branch) if (e.type === "context_edit" && e.targetId) edits.set(e.targetId, e.replacement);

	// Latest compaction: entries before firstKeptEntryId are replaced by its summary.
	let compIdx = -1;
	branch.forEach((e, i) => { if (e.type === "compaction") compIdx = i; });
	const comp = compIdx >= 0 ? branch[compIdx] : null;
	let keptFrom = 0;
	if (comp) {
		const k = branch.findIndex((e) => e.id === comp.firstKeptEntryId);
		keptFrom = k >= 0 ? k : compIdx + 1;
	}

	const cats = {}; // key -> {label, tokens, items:[{label,tokens,preview}]}
	const add = (key, label, itemLabel, text, extra) => {
		const c = (cats[key] ||= { key, label, tokens: 0, items: [] });
		const t = est(text);
		c.tokens += t;
		c.items.push({ label: itemLabel, tokens: t, preview: clip(text), ...extra });
	};

	// System prompt: the latest system message on the branch (pi re-emits it when it changes).
	const sys = [...branch].reverse().find((e) => e.type === "message" && e.message?.role === "system");
	if (sys) {
		const m = sys.message;
		for (const [k, v] of Object.entries(m.sections || {})) {
			if (!v) continue;
			add(k === "skills" ? "skills" : "system", k === "skills" ? "스킬 목록" : "시스템 프롬프트", k, v);
		}
		if (!m.sections && m.content) add("system", "시스템 프롬프트", "system", textOf(m.content));
		for (const t of m.toolsAdded || []) add("tools", "도구 정의", t.name, JSON.stringify({ description: t.description, parameters: t.parameters }, null, 1));
	}
	if (comp) add("summary", "압축 요약", `compaction ${comp.timestamp?.slice(11, 19) || ""}`, comp.summary || "");

	const steps = [];
	const events = [];
	const files = new Map(); // path -> {read, write, edit}
	const commands = [];
	let lastUsage = null;
	let model = null;

	branch.forEach((e, i) => {
		const ts = e.timestamp?.slice(11, 19) || "";
		if (e.type === "model_change") { model = `${e.provider}/${e.modelId}`; events.push({ ts, kind: "model", text: `모델 → ${model}` }); }
		if (e.type === "thinking_level_change") events.push({ ts, kind: "thinking", text: `thinking → ${e.thinkingLevel}` });
		if (e.type === "compaction") events.push({ ts, kind: "compaction", text: `압축: ${e.tokensBefore ?? "?"} 토큰 → 요약 ${est(e.summary)} 토큰` });
		if (e.type === "branch_summary") events.push({ ts, kind: "branch", text: "브랜치 요약" });
		if (e.type === "context_edit") events.push({ ts, kind: "edit", text: `컨텍스트 편집 (${e.targetId})` });

		if (e.type === "message" && e.message?.role === "assistant") {
			const u = e.message.usage;
			if (u) {
				lastUsage = { ...u, model: `${e.message.provider}/${e.message.model}` };
				steps.push({
					ts, input: u.input || 0, cacheRead: u.cacheRead || 0, cacheWrite: u.cacheWrite || 0, output: u.output || 0,
					context: (u.input || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0), cost: u.cost?.total || 0,
					compactedBefore: false,
				});
			}
		}
		if (e.type === "compaction" && steps.length) steps[steps.length - 1].compactedAfter = true;

		const inContext = i >= keptFrom;
		const raw = e.type === "message" ? e.message : e.type === "custom_message" ? { role: "custom", content: e.content } : null;
		if (!raw) return;
		const msg = edits.has(e.id) ? { ...raw, content: edits.get(e.id) } : raw;
		const role = msg.role;

		// Tool activity is tracked across the whole branch (even compacted parts).
		if (role === "assistant") {
			for (const b of msg.content || []) if (b.type === "toolCall") {
				const a = b.arguments || {};
				const p = a.path || a.file_path || a.filePath;
				if (p) {
					const f = files.get(p) || { path: p, read: 0, write: 0, edit: 0, other: 0 };
					if (/read/i.test(b.name)) f.read++; else if (/write/i.test(b.name)) f.write++; else if (/edit/i.test(b.name)) f.edit++; else f.other++;
					files.set(p, f);
				}
				if (/bash|shell|exec/i.test(b.name) && a.command) commands.push({ ts, command: String(a.command).slice(0, 500) });
			}
		}
		if (!inContext || role === "system") return;

		if (role === "user") {
			const t = textOf(msg.content);
			add(/^<|^\[/.test(t.trim()) ? "injected" : "user", /^<|^\[/.test(t.trim()) ? "주입된 내용" : "사용자 메시지", `${ts} user`, t);
		} else if (role === "assistant") {
			for (const b of msg.content || []) {
				if (b.type === "thinking") add("reasoning", "추론(thinking)", `${ts} thinking`, b.thinking);
				else if (b.type === "text") add("answers", "답변", `${ts} answer`, b.text);
				else if (b.type === "toolCall") add("toolcalls", "도구 호출", `${ts} ${b.name}`, JSON.stringify(b.arguments, null, 1));
			}
		} else if (role === "toolResult") {
			add("toolresults", "도구 결과", `${ts} ${msg.toolName || "tool"}${msg.isError ? " ⚠" : ""}`, textOf(msg.content));
		} else {
			add("injected", "주입된 내용", `${ts} ${role}`, textOf(msg.content));
		}
	});

	const order = ["system", "skills", "tools", "summary", "user", "injected", "answers", "reasoning", "toolcalls", "toolresults"];
	const categories = order.filter((k) => cats[k]).map((k) => cats[k]);
	for (const c of categories) c.items.sort((a, b) => b.tokens - a.tokens);
	const estimated = categories.reduce((s, c) => s + c.tokens, 0);
	const actual = lastUsage ? (lastUsage.input || 0) + (lastUsage.cacheRead || 0) + (lastUsage.cacheWrite || 0) + (lastUsage.output || 0) : null;
	model = lastUsage?.model || model;

	const totals = steps.reduce((t, s) => ({ input: t.input + s.input, cacheRead: t.cacheRead + s.cacheRead, cacheWrite: t.cacheWrite + s.cacheWrite, output: t.output + s.output, cost: t.cost + s.cost }), { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, cost: 0 });
	const promptAll = totals.input + totals.cacheRead + totals.cacheWrite;

	return {
		ok: true,
		sessionId: header.id, cwd: header.cwd, file,
		model, window: windowFor(model || ""),
		estimated, actual,
		categories,
		steps,
		totals: { ...totals, cacheHitRate: promptAll ? totals.cacheRead / promptAll : 0 },
		events,
		files: [...files.values()].sort((a, b) => (b.read + b.write + b.edit + b.other) - (a.read + a.write + a.edit + a.other)).slice(0, 100),
		commands: commands.slice(-100).reverse(),
		compacted: comp ? { at: comp.timestamp, droppedEntries: keptFrom } : null,
	};
}

export default {
	activate(host) {
		host.route("GET", "/summary", async (req, res) => {
			try {
				const url = new URL(req.url, "http://x");
				let file = findSessionFile(url.searchParams.get("session"));
				if (!file) file = (await host.getActiveConversation())?.sessionFile;
				if (!file || !fs.existsSync(file)) return res.json ? res.json({ ok: false, error: "열린 대화의 세션 파일을 찾지 못함" }) : send(res, { ok: false, error: "no session" });
				send(res, analyze(file));
			} catch (err) {
				host.log?.("context-lens error", String(err?.stack || err));
				send(res, { ok: false, error: String(err?.message || err) });
			}
		});
	},
};

function send(res, obj) {
	if (typeof res.json === "function") return res.json(obj);
	res.setHeader?.("content-type", "application/json; charset=utf-8");
	res.end(JSON.stringify(obj));
}
