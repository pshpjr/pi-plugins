// side-chat pi extension: /btw side chats attached to a main pi conversation.
// Loaded into every main session. Side chats are in-process child AgentSessions
// stored under ~/.pi/agent/side-chats/<main sessionId>/. The main conversation is
// referenced (session file + leaf id at open time), not copied. The pi-web-ui
// plugin "side-chat" reaches this code through globalThis.__piSideChat.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildSessionContext,
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	migrateSessionEntries,
	parseSessionEntries,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const VERSION = 1;
const META = "side-chat-meta";
const ROOT = path.join(os.homedir(), ".pi", "agent", "side-chats");
const SETTINGS_FILE = path.join(os.homedir(), ".pi", "agent", "side-chat.json");
const READ_TOOLS = ["read", "grep", "find", "ls"];
const EDIT_TOOLS = ["edit", "write", "bash"];
const OWN_TOOLS = ["btw_read_main", "btw_send_to_main"];
const SCOPES = ["none", "last", "smart", "full"];
const SID_RE = /^[\w-]{1,128}$/;

const SIDE_PROMPT = [
	"<side_chat>",
	"You are a side chat (btw) opened next to a main pi conversation.",
	"The messages before the first message marked [side chat start] are the main conversation up to the moment this side chat was opened. They are context only: do not continue or redo the main conversation's task.",
	"Answer the user's side questions. Earlier tool calls in that history belong to the main conversation and are not your tools; use only the tools available to you now.",
	"To see what the main conversation did after this side chat was opened, call btw_read_main.",
	"Call btw_send_to_main only when the user asks you to pass something to the main conversation. Write a self-contained message, because the main agent cannot see this side chat.",
	"</side_chat>",
].join("\n");

// ---------------------------------------------------------------- settings
function readSettings() {
	let s = {};
	try { s = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) || {}; } catch {}
	return {
		editTools: s.editTools === true,
		lastN: clampInt(s.lastN, 1, 200, 8),
		smartBudgetTokens: clampInt(s.smartBudgetTokens, 500, 400000, 8000),
	};
}
function clampInt(v, lo, hi, dflt) {
	const n = Number.parseInt(v, 10);
	return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}

// ---------------------------------------------------------------- shared store
function getStore() {
	const g = globalThis;
	if (!g.__piSideChat || g.__piSideChat.version !== VERSION) {
		g.__piSideChat = {
			version: VERSION,
			mains: new Map(), // main sessionId -> { pi, ctx }
			sides: new Map(), // side id -> handle
			listeners: new Set(),
			api: null,
		};
	}
	const store = g.__piSideChat;
	store.api = makeApi(store); // refresh to the latest loaded code
	return store;
}
function emit(store, ev) {
	for (const fn of store.listeners) { try { fn(ev); } catch (e) { console.error("[side-chat] listener", e); } }
}

// ---------------------------------------------------------------- text helpers
function textOf(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.filter((p) => p && p.type === "text").map((p) => p.text).join("\n");
}
const short = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n) + "…" : s; };
const estTokens = (m) => Math.ceil(JSON.stringify(m.content ?? "").length / 4);

// ---------------------------------------------------------------- main context
function mainEntries(store, meta) {
	const main = store.mains.get(meta.mainSessionId);
	try {
		const live = main?.ctx?.sessionManager?.getEntries?.();
		if (Array.isArray(live) && live.length) return live;
	} catch {}
	const file = meta.mainSessionFile;
	if (!file || !fs.existsSync(file)) return [];
	const entries = parseSessionEntries(fs.readFileSync(file, "utf8"));
	migrateSessionEntries(entries);
	return entries.filter((e) => e && e.type !== "session");
}

function anchoredMessages(store, meta) {
	if (meta.scope === "none" || !meta.anchorLeafId) return [];
	const entries = mainEntries(store, meta);
	if (!entries.length) return [];
	let msgs;
	try { msgs = buildSessionContext(entries, meta.anchorLeafId).messages; } catch (e) { console.error("[side-chat] main context", e); return []; }
	msgs = msgs.filter((m) => m && m.role !== "system");
	const s = readSettings();
	if (meta.scope === "last") return lastTurns(msgs, meta.lastN || s.lastN);
	if (meta.scope === "smart") return smartTrim(msgs, meta.smartBudgetTokens || s.smartBudgetTokens);
	return msgs;
}
// keep the last N user turns (a turn = a user message and everything after it)
function lastTurns(msgs, n) {
	const users = [];
	msgs.forEach((m, i) => { if (m.role === "user") users.push(i); });
	if (users.length <= n) return msgs;
	return msgs.slice(users[users.length - n]);
}
// drop tool calls / tool results, then keep the newest turns within the token budget
function smartTrim(msgs, budget) {
	const out = [];
	for (const m of msgs) {
		if (m.role === "toolResult") continue;
		if (m.role === "assistant" && Array.isArray(m.content)) {
			const content = m.content.filter((p) => p && p.type === "text");
			if (!content.length) continue;
			out.push({ ...m, content });
			continue;
		}
		if (m.role === "user" || m.role === "assistant") out.push(m);
	}
	let total = 0;
	let start = out.length;
	for (let i = out.length - 1; i >= 0; i--) {
		total += estTokens(out[i]);
		if (total > budget) break;
		start = i;
	}
	while (start < out.length && out[start].role !== "user") start++; // begin on a user message
	return out.slice(start);
}

// current main branch after the anchor, rendered as text for btw_read_main
function mainSince(store, meta, limit) {
	const main = store.mains.get(meta.mainSessionId);
	let branch = null;
	try { branch = main?.ctx?.sessionManager?.getBranch?.() || null; } catch {}
	if (!branch) {
		const entries = mainEntries(store, meta);
		const byId = new Map(entries.filter((e) => e.id).map((e) => [e.id, e]));
		branch = [];
		let cur = [...entries].reverse().find((e) => e.id);
		while (cur) { branch.push(cur); cur = cur.parentId ? byId.get(cur.parentId) : null; }
		branch.reverse();
	}
	const at = branch.findIndex((e) => e.id === meta.anchorLeafId);
	const note = at < 0 ? "(메인의 현재 브랜치에 사이드를 연 지점이 없음: 메인이 다른 브랜치로 이동함. 현재 브랜치의 최근 항목만 보여줌)\n" : "";
	const after = (at < 0 ? branch : branch.slice(at + 1)).filter((e) => e.type === "message" && e.message && e.message.role !== "system");
	if (!after.length) return note + "사이드를 연 뒤 메인 대화에 새 메시지가 없음.";
	const lines = after.slice(-limit).map((e) => {
		const m = e.message;
		if (m.role === "toolResult") return `[tool result ${m.toolName ?? ""}] ${short(textOf(m.content), 400)}`;
		if (m.role === "assistant" && Array.isArray(m.content)) {
			const parts = m.content.map((p) => p.type === "text" ? p.text : p.type === "toolCall" ? `[tool call ${p.name} ${short(JSON.stringify(p.arguments ?? {}), 200)}]` : "").filter(Boolean);
			return `[assistant] ${short(parts.join("\n"), 2000)}`;
		}
		return `[${m.role}] ${short(textOf(m.content), 2000)}`;
	});
	const running = main ? (isIdle(main) ? "메인은 지금 대기 중." : "메인은 지금 작업 중.") : "메인 대화가 지금 열려 있지 않음.";
	return `${note}${running}\n사이드를 연 뒤 메인 메시지 ${after.length}개 중 최근 ${lines.length}개:\n\n${lines.join("\n\n")}`;
}

function isIdle(main) {
	try { return main.ctx.isIdle(); } catch { return true; }
}

// ---------------------------------------------------------------- side sessions
const sideDir = (mainSessionId) => path.join(ROOT, mainSessionId);

function readMetaFromEntries(entries) {
	let meta = null;
	for (const e of entries) if (e && e.type === "custom" && e.customType === META && e.data) meta = { ...(meta || {}), ...e.data };
	return meta;
}
function scanFile(file) {
	try {
		const entries = parseSessionEntries(fs.readFileSync(file, "utf8"));
		const header = entries.find((e) => e.type === "session");
		const meta = readMetaFromEntries(entries);
		if (!header || !meta) return null;
		const firstUser = entries.find((e) => e.type === "message" && e.message?.role === "user");
		const count = entries.filter((e) => e.type === "message").length;
		return { id: header.id, file, meta, title: firstUser ? short(textOf(firstUser.message.content), 60) : "", count, updatedAt: fs.statSync(file).mtimeMs };
	} catch { return null; }
}
function findSideFile(id) {
	if (!SID_RE.test(id || "")) return null;
	let dirs = [];
	try { dirs = fs.readdirSync(ROOT); } catch { return null; }
	for (const d of dirs) {
		let names = [];
		try { names = fs.readdirSync(path.join(ROOT, d)); } catch { continue; }
		const hit = names.find((n) => n.endsWith(`_${id}.jsonl`));
		if (hit) return path.join(ROOT, d, hit);
	}
	return null;
}

function sideTools(meta) {
	return [...READ_TOOLS, ...OWN_TOOLS, ...(meta.edit ? EDIT_TOOLS : [])];
}

function sideExtension(store, handle) {
	return (pi) => {
		pi.on("context", (event) => {
			const main = anchoredMessages(store, handle.meta);
			const own = markScopeChanges(markFirstUser(event.messages), handle.meta.scopeNotes);
			return { messages: [...main, ...own] };
		});
		pi.registerTool({
			name: "btw_read_main",
			label: "Read main conversation",
			description: "Read what the main conversation did after this side chat was opened (newest last).",
			parameters: Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: "Max messages to return (default 30)" })) }),
			async execute(_id, params) {
				const text = mainSince(store, handle.meta, params?.limit ?? 30);
				return { content: [{ type: "text", text }], details: {} };
			},
		});
		pi.registerTool({
			name: "btw_send_to_main",
			label: "Send to main conversation",
			description: "Put a message into the main conversation as a user message (steer while it is working, a new turn when it is idle). Use only when the user asks to pass something to the main conversation.",
			parameters: Type.Object({ message: Type.String({ description: "Self-contained message for the main agent" }) }),
			async execute(_id, params) {
				const text = String(params?.message ?? "").trim();
				if (!text) return { content: [{ type: "text", text: "오류: 빈 메시지" }], details: { ok: false } };
				const main = store.mains.get(handle.meta.mainSessionId);
				if (!main) return { content: [{ type: "text", text: "오류: 메인 대화가 열려 있지 않아 전달하지 못함." }], details: { ok: false } };
				const idle = isIdle(main);
				try {
					main.pi.sendUserMessage(`[사이드 채팅에서 전달]\n${text}`, idle ? undefined : { deliverAs: "steer" });
				} catch (e) {
					return { content: [{ type: "text", text: `오류: 전달 실패 (${e?.message || e})` }], details: { ok: false } };
				}
				return { content: [{ type: "text", text: idle ? "메인에 전달함. 메인이 대기 중이라 새 턴이 시작됨." : "메인에 전달함. 메인이 작업 중이라 steer로 들어감." }], details: { ok: true } };
			},
		});
	};
}
function markFirstUser(messages) {
	const i = messages.findIndex((m) => m && m.role === "user");
	if (i < 0) return messages;
	const m = messages[i];
	const tag = "[side chat start]\n";
	const content = typeof m.content === "string" ? tag + m.content
		: Array.isArray(m.content) ? [{ type: "text", text: tag }, ...m.content] : m.content;
	const out = messages.slice();
	out[i] = { ...m, content };
	return out;
}

const prefixUser = (m, tag) => ({
	...m,
	content: typeof m.content === "string" ? tag + m.content
		: Array.isArray(m.content) ? [{ type: "text", text: tag }, ...m.content] : m.content,
});

// notes = [{ at, scope, lastN }]: `at` = side user messages already sent when the scope changed.
// The tag goes on the next user message so the model knows earlier answers saw different main context.
function markScopeChanges(messages, notes) {
	if (!Array.isArray(notes) || !notes.length) return messages;
	const userIdx = [];
	messages.forEach((m, i) => { if (m && m.role === "user") userIdx.push(i); });
	const out = messages.slice();
	for (const n of notes) {
		const i = userIdx[n.at];
		if (i === undefined) continue;
		const label = n.scope === "last" ? `최근 ${n.lastN}턴` : { full: "전체", smart: "smart(도구 내용 제외, 최근 위주)", none: "없음" }[n.scope] || n.scope;
		const tag = `[사이드 채팅 안내: 메인 맥락 범위가 '${label}'(으)로 바뀌었습니다. 이전 답변들은 그때 보이던 메인 내용을 근거로 한 것이니, 지금 안 보인다고 해서 틀린 답이었다고 판단하지 마세요.]\n`;
		out[i] = prefixUser(out[i], tag);
	}
	return out;
}

function sharedRuntime(store, meta) {
	const main = store.mains.get(meta.mainSessionId) || [...store.mains.values()][0];
	const reg = main?.ctx?.modelRegistry;
	// ModelRegistry keeps its ModelRuntime in a (TS-private) field; reusing it shares
	// auth/token refresh with pi-web-ui instead of starting a second runtime.
	const rt = reg?.runtime;
	return { reg, rt: rt && typeof rt.getModel === "function" ? rt : undefined };
}

async function startSession(store, handle, sm) {
	const meta = handle.meta;
	const { reg, rt } = sharedRuntime(store, meta);
	let model;
	try { model = reg?.find?.(meta.model?.provider, meta.model?.id) || rt?.getModel?.(meta.model?.provider, meta.model?.id); } catch {}
	const loader = new DefaultResourceLoader({
		cwd: meta.cwd,
		agentDir: getAgentDir(),
		noExtensions: true,
		extensionFactories: [sideExtension(store, handle)],
		appendSystemPrompt: [SIDE_PROMPT],
	});
	await loader.reload();
	const { session } = await createAgentSession({
		cwd: meta.cwd,
		...(model ? { model } : {}),
		...(meta.thinkingLevel ? { thinkingLevel: meta.thinkingLevel } : {}),
		...(rt ? { modelRuntime: rt } : {}),
		sessionManager: sm,
		resourceLoader: loader,
		tools: sideTools(meta),
	});
	handle.session = session;
	handle.id = session.sessionId;
	handle.file = session.sessionFile || handle.file;
	handle.unsub?.();
	handle.unsub = session.subscribe((ev) => onSideEvent(store, handle, ev));
	return session;
}

function onSideEvent(store, handle, ev) {
	switch (ev.type) {
		case "agent_start": handle.running = true; handle.error = null; break;
		case "message_update": handle.partial = ev.message; break;
		case "message_end": handle.partial = null; if (ev.message?.role === "assistant" && ev.message.errorMessage) handle.error = ev.message.errorMessage; break;
		case "agent_end": case "agent_settled": handle.running = false; handle.partial = null; break;
		default: break;
	}
	if (!handle.title) {
		const u = handle.session?.messages?.find((m) => m.role === "user");
		if (u) handle.title = short(textOf(u.content), 60);
	}
	handle.updatedAt = Date.now();
	const now = Date.now();
	const final = ev.type === "agent_end" || ev.type === "agent_settled" || ev.type === "message_end";
	if (final || now - (handle.lastEmit || 0) > 150) {
		handle.lastEmit = now;
		emit(store, { type: "update", sideId: handle.id, mainSessionId: handle.meta.mainSessionId, running: !!handle.running });
	} else if (!handle.emitTimer) {
		handle.emitTimer = setTimeout(() => {
			handle.emitTimer = null;
			handle.lastEmit = Date.now();
			emit(store, { type: "update", sideId: handle.id, mainSessionId: handle.meta.mainSessionId, running: !!handle.running });
		}, 160);
	}
}

async function createSide(store, opts) {
	const main = store.mains.get(opts.mainSessionId);
	if (!main) throw new Error("메인 대화가 열려 있지 않음");
	const ctx = main.ctx;
	const s = readSettings();
	const scope = SCOPES.includes(opts.scope) ? opts.scope : "full";
	const model = ctx.model;
	let thinkingLevel;
	try { thinkingLevel = main.pi.getThinkingLevel(); } catch {}
	const meta = {
		mainSessionId: opts.mainSessionId,
		mainSessionFile: ctx.sessionManager.getSessionFile() || null,
		anchorLeafId: ctx.sessionManager.getLeafId() || null,
		cwd: ctx.sessionManager.getCwd?.() || ctx.cwd,
		scope,
		lastN: scope === "last" ? clampInt(opts.lastN, 1, 200, s.lastN) : undefined,
		edit: typeof opts.edit === "boolean" ? opts.edit : s.editTools,
		model: model ? { provider: model.provider, id: model.id } : null,
		thinkingLevel,
		createdAt: new Date().toISOString(),
	};
	const dir = sideDir(meta.mainSessionId);
	fs.mkdirSync(dir, { recursive: true });
	const sm = SessionManager.create(meta.cwd, dir);
	sm.appendCustomEntry(META, meta);
	const handle = { id: null, file: null, meta, session: null, running: false, partial: null, error: null, title: "", updatedAt: Date.now() };
	await startSession(store, handle, sm);
	store.sides.set(handle.id, handle);
	emit(store, { type: "created", sideId: handle.id, mainSessionId: meta.mainSessionId });
	return handle;
}

async function loadSide(store, id) {
	const live = store.sides.get(id);
	if (live) return live;
	const file = findSideFile(id);
	if (!file) throw new Error("사이드 채팅을 찾을 수 없음");
	const info = scanFile(file);
	if (!info) throw new Error("사이드 채팅 파일을 읽을 수 없음");
	const sm = SessionManager.open(file, path.dirname(file));
	const handle = { id, file, meta: info.meta, session: null, running: false, partial: null, error: null, title: info.title, updatedAt: info.updatedAt };
	await startSession(store, handle, sm);
	store.sides.set(handle.id, handle);
	return handle;
}

function renderMessages(handle) {
	const msgs = handle.session?.messages ?? [];
	const out = [];
	const results = new Map();
	for (const m of msgs) if (m.role === "toolResult") results.set(m.toolCallId, m);
	const push = (m, partial) => {
		if (m.role === "user") out.push({ role: "user", text: textOf(m.content) });
		else if (m.role === "assistant") {
			const parts = [];
			for (const p of Array.isArray(m.content) ? m.content : []) {
				if (p.type === "text") parts.push({ type: "text", text: p.text });
				else if (p.type === "thinking") parts.push({ type: "thinking", text: short(p.thinking ?? p.text ?? "", 4000) });
				else if (p.type === "toolCall") {
					const r = results.get(p.id);
					parts.push({ type: "tool", name: p.name, args: short(JSON.stringify(p.arguments ?? {}), 600), result: r ? short(textOf(r.content), 1500) : null, isError: !!r?.isError });
				}
			}
			out.push({ role: "assistant", parts, partial: !!partial, error: m.errorMessage || null });
		}
	};
	for (const m of msgs) if (m.role === "user" || m.role === "assistant") push(m, false);
	if (handle.partial && handle.partial.role === "assistant") push(handle.partial, true);
	return out;
}

function describe(handle) {
	const m = handle.meta;
	return {
		id: handle.id,
		title: handle.title || "",
		mainSessionId: m.mainSessionId,
		scope: m.scope,
		lastN: m.lastN ?? null,
		edit: !!m.edit,
		model: m.model ? `${m.model.provider}/${m.model.id}` : null,
		running: !!handle.running,
		createdAt: m.createdAt,
		updatedAt: handle.updatedAt,
	};
}

function appendMeta(handle, patch) {
	handle.meta = { ...handle.meta, ...patch };
	try { handle.session?.sessionManager?.appendCustomEntry?.(META, patch); } catch (e) { console.error("[side-chat] meta", e); }
}

function makeApi(store) {
	return {
		version: VERSION,
		scopes: SCOPES,
		isMainLoaded: (mainSessionId) => store.mains.has(mainSessionId),
		subscribe(fn) { store.listeners.add(fn); return () => store.listeners.delete(fn); },
		listSides(mainSessionId) {
			const byId = new Map();
			if (SID_RE.test(mainSessionId || "")) {
				let names = [];
				try { names = fs.readdirSync(sideDir(mainSessionId)); } catch {}
				for (const n of names) {
					if (!n.endsWith(".jsonl")) continue;
					const info = scanFile(path.join(sideDir(mainSessionId), n));
					if (info) byId.set(info.id, { id: info.id, title: info.title, mainSessionId, scope: info.meta.scope, lastN: info.meta.lastN ?? null, edit: !!info.meta.edit, model: info.meta.model ? `${info.meta.model.provider}/${info.meta.model.id}` : null, running: false, createdAt: info.meta.createdAt, updatedAt: info.updatedAt });
				}
			}
			for (const h of store.sides.values()) if (h.meta.mainSessionId === mainSessionId) byId.set(h.id, describe(h));
			return [...byId.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
		},
		async createSide(opts) { return describe(await createSide(store, opts)); },
		async getSide(id) {
			const h = await loadSide(store, id);
			return { ...describe(h), mainLoaded: store.mains.has(h.meta.mainSessionId), error: h.error, messages: renderMessages(h) };
		},
		async promptSide(id, text) {
			const h = await loadSide(store, id);
			const t = String(text ?? "").trim();
			if (!t) throw new Error("빈 메시지");
			const busy = h.session.isStreaming;
			h.error = null;
			const p = h.session.prompt(t, busy ? { streamingBehavior: "followUp" } : undefined);
			p.catch((e) => { h.error = String(e?.message || e); h.running = false; emit(store, { type: "update", sideId: h.id, mainSessionId: h.meta.mainSessionId, running: false }); });
			return { queued: busy };
		},
		async abortSide(id) {
			const h = store.sides.get(id);
			if (h?.session) await h.session.abort();
			return { ok: true };
		},
		async updateSide(id, patch) {
			const h = await loadSide(store, id);
			const next = {};
			if (patch.scope !== undefined) {
				if (!SCOPES.includes(patch.scope)) throw new Error("알 수 없는 범위");
				next.scope = patch.scope;
				if (patch.scope === "last") next.lastN = clampInt(patch.lastN, 1, 200, h.meta.lastN || readSettings().lastN);
				const changed = next.scope !== h.meta.scope || (next.scope === "last" && next.lastN !== h.meta.lastN);
				const sent = (h.session?.messages ?? []).filter((m) => m.role === "user").length;
				if (!changed) { delete next.scope; delete next.lastN; }
				else if (sent > 0) {
					// several changes before the next message: keep only the latest one at that point
					const notes = (h.meta.scopeNotes || []).filter((n) => n.at !== sent);
					next.scopeNotes = [...notes, { at: sent, scope: next.scope, lastN: next.lastN ?? null }];
				}
			}
			if (typeof patch.edit === "boolean" && patch.edit !== !!h.meta.edit) {
				if (h.session.isStreaming) throw new Error("사이드가 작업 중에는 도구 권한을 바꿀 수 없음");
				next.edit = patch.edit;
			}
			if (!Object.keys(next).length) return describe(h);
			appendMeta(h, next);
			if ("edit" in next) {
				// tool set is fixed at session creation: restart on the same session manager
				// (the file may not be on disk yet before the first answer)
				const sm = h.session.sessionManager;
				h.unsub?.();
				try { h.session.dispose(); } catch {}
				await startSession(store, h, sm);
			}
			emit(store, { type: "update", sideId: h.id, mainSessionId: h.meta.mainSessionId, running: !!h.running });
			return describe(h);
		},
	};
}

// ---------------------------------------------------------------- commands
function parseScopeArg(raw) {
	// none | full | smart | last | last:N | last N
	const m = String(raw || "").trim().match(/^(none|full|smart|last)(?:[:\s]+(\d+))?(?:\s+([\s\S]*))?$/i);
	if (!m) return null;
	return { scope: m[1].toLowerCase(), lastN: m[2] ? Number(m[2]) : undefined, rest: (m[3] || "").trim() };
}

export default function sideChatExtension(pi) {
	const store = getStore();
	let mySessionId = null;
	const register = (ctx) => {
		let id;
		try { id = ctx.sessionManager.getSessionId(); } catch { return; }
		if (!id) return;
		if (mySessionId && mySessionId !== id) store.mains.delete(mySessionId);
		mySessionId = id;
		store.mains.set(id, { pi, ctx });
	};
	pi.on("session_start", (_e, ctx) => register(ctx));
	pi.on("before_agent_start", (_e, ctx) => { register(ctx); });
	pi.on("turn_end", (_e, ctx) => { register(ctx); });
	pi.on("session_shutdown", (_e, ctx) => {
		let id = mySessionId;
		try { id = ctx.sessionManager.getSessionId() || id; } catch {}
		const cur = store.mains.get(id);
		if (cur && cur.pi === pi) store.mains.delete(id);
		if (id === mySessionId) mySessionId = null;
	});

	const openSide = async (ctx, opts, question) => {
		register(ctx);
		const id = ctx.sessionManager.getSessionId();
		const h = await createSide(store, { mainSessionId: id, ...opts });
		emit(store, { type: "open", sideId: h.id, mainSessionId: id });
		const label = `사이드 채팅 열림 (${h.meta.scope}${h.meta.scope === "last" ? ` ${h.meta.lastN}` : ""}, ${h.meta.edit ? "수정 도구 켬" : "읽기 전용"})`;
		if (!question) { notify(ctx, `${label}. 사이드 패널에서 대화하세요.`); return; }
		notify(ctx, `${label}. 질문을 보냈습니다.`);
		const before = h.session.messages.length;
		h.session.prompt(question).then(() => {
			const last = [...h.session.messages.slice(before)].reverse().find((m) => m.role === "assistant");
			const text = last ? textOf(last.content) : "";
			if (ctx.mode !== "rpc") notify(ctx, `btw: ${short(text || last?.errorMessage || "(빈 응답)", 400)}`);
		}).catch((e) => notify(ctx, `btw 실패: ${e?.message || e}`, "error"));
	};

	pi.registerCommand("btw", {
		description: "사이드 채팅 열기 (메인 맥락 전체 포함). /btw [질문]",
		handler: async (args, ctx) => {
			try { await openSide(ctx, { scope: "full" }, String(args || "").trim()); }
			catch (e) { notify(ctx, `btw 실패: ${e?.message || e}`, "error"); }
		},
	});
	pi.registerCommand("btw:context", {
		description: "맥락 범위를 골라 새 사이드 채팅 열기. /btw:context none|last[:N]|smart|full [질문]",
		getArgumentCompletions: (prefix) => SCOPES.filter((s) => s.startsWith(prefix || "")).map((s) => ({ value: s, label: s })),
		handler: async (args, ctx) => {
			const p = parseScopeArg(args);
			if (!p) { notify(ctx, "사용법: /btw:context none|last[:N]|smart|full [질문]", "warning"); return; }
			try { await openSide(ctx, { scope: p.scope, lastN: p.lastN }, p.rest); }
			catch (e) { notify(ctx, `btw 실패: ${e?.message || e}`, "error"); }
		},
	});
	pi.registerCommand("btw:tools", {
		description: "도구 권한을 골라 새 사이드 채팅 열기. /btw:tools read|edit [질문]",
		getArgumentCompletions: (prefix) => ["read", "edit"].filter((s) => s.startsWith(prefix || "")).map((s) => ({ value: s, label: s })),
		handler: async (args, ctx) => {
			const m = String(args || "").trim().match(/^(read|edit)(?:\s+([\s\S]*))?$/i);
			if (!m) { notify(ctx, "사용법: /btw:tools read|edit [질문]", "warning"); return; }
			try { await openSide(ctx, { scope: "full", edit: m[1].toLowerCase() === "edit" }, (m[2] || "").trim()); }
			catch (e) { notify(ctx, `btw 실패: ${e?.message || e}`, "error"); }
		},
	});
	pi.registerCommand("btw:list", {
		description: "이 대화의 사이드 채팅 목록",
		handler: async (_args, ctx) => {
			register(ctx);
			const list = store.api.listSides(ctx.sessionManager.getSessionId());
			if (!list.length) { notify(ctx, "사이드 채팅 없음. /btw 로 여세요."); return; }
			emit(store, { type: "list", mainSessionId: ctx.sessionManager.getSessionId() });
			const web = ctx.mode === "rpc"; // web notices collapse newlines
			const rows = list.map((s, i) => `${i + 1}${web ? ")" : "."} ${web ? short(s.title || "(질문 없음)", 30) : s.title || "(질문 없음)"} · ${s.scope}${s.scope === "last" ? ` ${s.lastN}` : ""} · ${s.edit ? "수정" : "읽기"}${s.running ? " · 작업 중" : ""}${web ? "" : ` · ${s.id.slice(0, 8)}`}`);
			notify(ctx, web ? `사이드 채팅 ${list.length}개 (사이드 패널 + → 사이드 채팅에서 열기): ${rows.join("  /  ")}` : rows.join("\n"));
		},
	});
}

function notify(ctx, text, level = "info") {
	try { ctx.ui.notify(text, level); } catch {}
}
