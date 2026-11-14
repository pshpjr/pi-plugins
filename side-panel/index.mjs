// side-panel server: per-conversation layout storage, conversation cwd lookup,
// file tree / preview / edit / upload (host.fs, anchored to the requesting tab's cwd
// via ?clientId=), and read-only git status / diff for the Changes tab.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";

const SESS_ROOT = path.join(os.homedir(), ".pi", "agent", "sessions");
const SID_RE = /^[\w-]{1,128}$/;
const MAX_LAYOUT = 64 * 1024;
const MAX_PREVIEW = 1024 * 1024;
const MAX_UPLOAD = 512 * 1024 * 1024;

function send(res, obj, status = 200) {
	if (typeof res.status === "function") res.status(status);
	else res.statusCode = status;
	if (typeof res.json === "function") return res.json(obj);
	res.setHeader?.("content-type", "application/json; charset=utf-8");
	res.end(JSON.stringify(obj));
}
const q = (req) => new URL(req.url, "http://x").searchParams;
const relOf = (p) => String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");

function findSessionFile(sessionId) {
	if (!SID_RE.test(sessionId || "")) return null;
	let dirs;
	try { dirs = fs.readdirSync(SESS_ROOT); } catch { return null; }
	for (const d of dirs) {
		let names;
		try { names = fs.readdirSync(path.join(SESS_ROOT, d)); } catch { continue; }
		const hit = names.find((n) => n.endsWith(`_${sessionId}.jsonl`));
		if (hit) return path.join(SESS_ROOT, d, hit);
	}
	return null;
}

function sessionCwd(file) {
	try {
		const fd = fs.openSync(file, "r");
		const buf = Buffer.alloc(64 * 1024);
		const n = fs.readSync(fd, buf, 0, buf.length, 0);
		fs.closeSync(fd);
		const first = buf.subarray(0, n).toString("utf8").split("\n")[0];
		const h = JSON.parse(first);
		return h.type === "session" && typeof h.cwd === "string" ? h.cwd : null;
	} catch { return null; }
}

function readBody(req, limit) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (c) => {
			size += c.length;
			if (size > limit) { reject(new Error("too large")); req.destroy?.(); return; }
			chunks.push(c);
		});
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}

async function jsonBody(req) {
	if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
	const buf = await readBody(req, MAX_LAYOUT * 4);
	return JSON.parse(buf.toString("utf8") || "{}");
}

function git(cwd, args, maxBuffer = 8 * 1024 * 1024) {
	return new Promise((resolve) => {
		execFile("git", ["--no-optional-locks", "-c", "core.quotepath=off", ...args], { cwd, maxBuffer, timeout: 15000 }, (err, stdout, stderr) => {
			resolve({ ok: !err || (err.code === 1 && args[0] === "diff"), out: String(stdout || ""), err: String(stderr || err?.message || "") });
		});
	});
}

function parseStatus(out) {
	// porcelain v1 -z: "XY path\0" (renames: "XY new\0old\0")
	const parts = out.split("\0");
	const files = [];
	for (let i = 0; i < parts.length; i++) {
		const p = parts[i];
		if (!p || p.length < 4) continue;
		const x = p[0], y = p[1], file = p.slice(3);
		let from;
		if (x === "R" || x === "C") from = parts[++i];
		files.push({ path: file, from, index: x, worktree: y, untracked: x === "?" });
	}
	return files;
}

export default {
	activate(host) {
		const offs = [];
		const route = (m, p, h) => offs.push(host.route(m, p, async (req, res) => {
			try { await h(req, res); }
			catch (err) {
				host.log?.("side-panel error", String(err?.stack || err));
				send(res, { ok: false, error: String(err?.message || err) }, 500);
			}
		}));

		// ---- layout persistence (key layout:<sessionId>) ----
		route("GET", "/layout", (req, res) => {
			const sid = q(req).get("sid") || "";
			if (!SID_RE.test(sid)) return send(res, { ok: false, error: "bad sid" }, 400);
			send(res, { ok: true, layout: host.storage.get(`layout:${sid}`) ?? null });
		});
		route("PUT", "/layout", async (req, res) => {
			const body = await jsonBody(req);
			const sid = String(body?.sid || "");
			if (!SID_RE.test(sid)) return send(res, { ok: false, error: "bad sid" }, 400);
			if (body.layout == null) { host.storage.delete(`layout:${sid}`); return send(res, { ok: true }); }
			const raw = JSON.stringify(body.layout);
			if (raw.length > MAX_LAYOUT) return send(res, { ok: false, error: "layout too large" }, 413);
			host.storage.set(`layout:${sid}`, { ...body.layout, savedAt: Date.now() });
			send(res, { ok: true });
		});

		// ---- conversation info ----
		route("GET", "/conv", (req, res) => {
			const sid = q(req).get("session") || "";
			const file = findSessionFile(sid);
			send(res, { ok: true, sessionId: file ? sid : null, cwd: (file && sessionCwd(file)) || host.cwd || "" });
		});

		// ---- files (relative to the requesting tab's cwd) ----
		route("GET", "/fs/list", async (req, res) => {
			const rel = relOf(q(req).get("path"));
			const list = await host.fs.list(rel);
			list.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
			send(res, { ok: true, cwd: host.cwd, path: rel, entries: list });
		});
		route("GET", "/fs/read", async (req, res) => {
			const rel = relOf(q(req).get("path"));
			const st = await host.fs.stat(rel);
			const buf = await host.fs.read(rel);
			const head = buf.subarray(0, Math.min(buf.length, 8000));
			const binary = head.includes(0);
			const truncated = buf.length > MAX_PREVIEW;
			send(res, {
				ok: true, path: rel, size: st.size, mtime: st.mtime, binary, truncated,
				text: binary ? "" : buf.subarray(0, MAX_PREVIEW).toString("utf8"),
			});
		});
		route("PUT", "/fs/write", async (req, res) => {
			const body = await jsonBody(req);
			const rel = relOf(body?.path);
			if (!rel) return send(res, { ok: false, error: "path required" }, 400);
			if (typeof body.text !== "string") return send(res, { ok: false, error: "text required" }, 400);
			if (body.expectMtime != null) {
				try {
					const st = await host.fs.stat(rel);
					if (Math.abs(st.mtime - Number(body.expectMtime)) > 1) return send(res, { ok: false, conflict: true, error: "파일이 그사이 바뀌었습니다" }, 409);
				} catch {}
			}
			await host.fs.write(rel, body.text);
			const st = await host.fs.stat(rel);
			send(res, { ok: true, mtime: st.mtime, size: st.size });
		});
		route("PUT", "/fs/upload", async (req, res) => {
			const rel = relOf(q(req).get("path"));
			if (!rel || rel.split("/").some((s) => s === ".." || s === "")) return send(res, { ok: false, error: "bad path" }, 400);
			const buf = await readBody(req, MAX_UPLOAD);
			await host.fs.write(rel, buf);
			send(res, { ok: true, path: rel, size: buf.length });
		});

		// ---- git (read-only) ----
		route("GET", "/git/status", async (req, res) => {
			const cwd = host.cwd;
			const top = await git(cwd, ["rev-parse", "--show-toplevel"]);
			if (!top.ok) return send(res, { ok: true, repo: false, cwd });
			const root = path.resolve(top.out.trim());
			const [br, st] = await Promise.all([
				git(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
				git(root, ["status", "--porcelain=v1", "-z", "-uall"]),
			]);
			if (!st.ok) return send(res, { ok: false, error: st.err });
			const files = parseStatus(st.out).slice(0, 2000);
			send(res, { ok: true, repo: true, cwd, root, branch: br.out.trim(), files });
		});
		route("GET", "/git/diff", async (req, res) => {
			const p = q(req);
			const file = String(p.get("path") || "");
			const untracked = p.get("untracked") === "1";
			const cwd = host.cwd;
			const top = await git(cwd, ["rev-parse", "--show-toplevel"]);
			if (!top.ok) return send(res, { ok: false, error: "git 저장소가 아님" });
			const root = path.resolve(top.out.trim());
			const abs = path.resolve(root, file);
			if (abs !== root && !abs.startsWith(root + path.sep)) return send(res, { ok: false, error: "bad path" }, 400);
			let r;
			if (untracked) r = await git(root, ["diff", "--no-color", "--no-index", "--", "/dev/null", file]);
			else {
				r = await git(root, ["diff", "--no-color", "HEAD", "--", file]);
				if (!r.ok || !r.out) r = await git(root, ["diff", "--no-color", "--cached", "--", file]);
			}
			const out = r.out.length > 400000 ? r.out.slice(0, 400000) + "\n… (잘림)" : r.out;
			send(res, { ok: true, diff: out, error: r.out ? undefined : r.err || undefined });
		});

		return () => { for (const off of offs) try { off?.(); } catch {} };
	},
};
