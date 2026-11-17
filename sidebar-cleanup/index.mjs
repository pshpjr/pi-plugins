// Sidebar Cleanup (server): exposes the subagent → parent conversation map so the
// client can nest subagent conversations under their parent in the left list.
// Source of truth: pi-web-ui's own run records, <dataDir>/subagent-runs/<runId>/status.json
// ({ sessionFile, parentSessionFile, template, title, prompt, state }).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export default {
	activate(host) {
		// host.dir = <dataDir>/plugins/sidebar-cleanup
		const runsDir = path.resolve(host.dir, "..", "..", "subagent-runs");

		host.route("GET", "/subagents", (_req, res) => {
			const items = [];
			let dirs = [];
			try { dirs = fs.readdirSync(runsDir); } catch { /* no runs yet */ }
			for (const d of dirs) {
				try {
					const s = JSON.parse(fs.readFileSync(path.join(runsDir, d, "status.json"), "utf8"));
					if (!s.sessionFile || !s.parentSessionFile) continue;
					items.push({
						sessionFile: s.sessionFile,
						parentSessionFile: s.parentSessionFile,
						template: s.template || s.type || "",
						title: String(s.prompt || s.title || ""),
						createdAt: s.createdAt || null,
					});
				} catch { /* partial or unreadable record */ }
			}
			res.json({ ok: true, items });
		});

		// Fork info for one conversation: pi writes the parent session file path into the
		// forked session's header line ({"type":"session", ..., "parentSession": "<path>"}).
		host.route("GET", "/fork-info", (req, res) => {
			const id = String(req.query?.id || new URL(req.url, "http://x").searchParams.get("id") || "").trim();
			if (!/^[\w-]{8,}$/.test(id)) return res.json({ ok: false, error: "bad id" });
			const file = findSessionFile(id);
			if (!file) return res.json({ ok: true, parent: null });
			const head = readHeader(file);
			const parentFile = head?.parentSession;
			if (!parentFile || !fs.existsSync(parentFile)) return res.json({ ok: true, parent: null });
			const ph = readHeader(parentFile);
			res.json({ ok: true, parent: { sessionFile: parentFile, id: ph?.id || null, title: readTitle(parentFile) } });
		});
	},
};

const SESS_ROOT = path.join(os.homedir(), ".pi", "agent", "sessions");
const fileById = new Map();

function findSessionFile(id) {
	const hit = fileById.get(id);
	if (hit && fs.existsSync(hit)) return hit;
	let dirs = [];
	try { dirs = fs.readdirSync(SESS_ROOT); } catch { return null; }
	for (const d of dirs) {
		let names;
		try { names = fs.readdirSync(path.join(SESS_ROOT, d)); } catch { continue; }
		const n = names.find((x) => x.endsWith(`_${id}.jsonl`));
		if (n) {
			const f = path.join(SESS_ROOT, d, n);
			fileById.set(id, f);
			return f;
		}
	}
	return null;
}

function readHeader(file) {
	try {
		const fd = fs.openSync(file, "r");
		const buf = Buffer.alloc(4096);
		const n = fs.readSync(fd, buf, 0, buf.length, 0);
		fs.closeSync(fd);
		const line = buf.subarray(0, n).toString("utf8").split("\n")[0];
		const h = JSON.parse(line);
		return h?.type === "session" ? h : null;
	} catch { return null; }
}

const textOf = (c) => (typeof c === "string" ? c : (c || []).filter((b) => b?.type === "text").map((b) => b.text).join(" "));

function readTitle(file) {
	let name = "";
	let first = "";
	try {
		for (const line of fs.readFileSync(file, "utf8").split("\n")) {
			if (line.includes('"type":"session_info"')) {
				try { const e = JSON.parse(line); if (e.name) name = String(e.name); } catch { /* skip */ }
			} else if (!first && line.includes('"role":"user"')) {
				try {
					const e = JSON.parse(line);
					if (e.type === "message" && e.message?.role === "user") first = textOf(e.message.content).replace(/\s+/g, " ").trim();
				} catch { /* skip */ }
			}
		}
	} catch { /* unreadable */ }
	const t = name || first;
	return t.length > 60 ? `${t.slice(0, 60)}…` : t;
}
