// side-chat server: thin HTTP/SSE bridge between the browser side-panel tab and the
// side-chat pi extension (pi-extension/), which owns the side sessions and is reached
// through globalThis.__piSideChat (same node process as pi-web-ui).

function send(res, obj, status = 200) {
	if (typeof res.status === "function") res.status(status);
	else res.statusCode = status;
	res.setHeader?.("content-type", "application/json; charset=utf-8");
	res.end(JSON.stringify(obj));
}
const q = (req) => new URL(req.url, "http://x").searchParams;
function body(req) {
	if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
	return new Promise((ok, fail) => {
		let s = "";
		req.on("data", (c) => { s += c; if (s.length > 256 * 1024) { fail(new Error("too large")); req.destroy?.(); } });
		req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch { ok({}); } });
		req.on("error", fail);
	});
}
const api = () => globalThis.__piSideChat?.api || null;
const NO_EXT = "side-chat pi 확장이 로드되지 않았습니다 (pi-extension 설치 후 대화를 다시 열어야 함)";

export default {
	activate(host) {
		const offs = [];
		const sse = new Set();
		let unsub = null;
		let subscribedApi = null;
		const ensureSub = () => {
			const a = api();
			if (!a || a === subscribedApi) return;
			unsub?.();
			subscribedApi = a;
			unsub = a.subscribe((ev) => {
				const line = `data: ${JSON.stringify(ev)}\n\n`;
				for (const res of sse) { try { res.write(line); res.flush?.(); } catch {} }
			});
		};
		// the extension may load after this plugin; re-check periodically
		const subTimer = setInterval(ensureSub, 2000);
		ensureSub();

		const route = (method, p, fn) => offs.push(host.route(method, p, async (req, res) => {
			try {
				ensureSub();
				const a = api();
				if (!a) return send(res, { error: NO_EXT, noExtension: true }, 503);
				send(res, await fn(a, req));
			} catch (e) {
				send(res, { error: String(e?.message || e) }, 400);
			}
		}));

		route("GET", "/status", async (a, req) => ({ ok: true, mainLoaded: a.isMainLoaded(q(req).get("main") || ""), scopes: a.scopes }));
		route("GET", "/sides", async (a, req) => ({ sides: a.listSides(q(req).get("main") || "") }));
		route("POST", "/sides", async (a, req) => {
			const b = await body(req);
			const side = await a.createSide({ mainSessionId: String(b.main || ""), scope: b.scope, lastN: b.lastN, edit: b.edit });
			if (b.prompt) await a.promptSide(side.id, b.prompt);
			return { side };
		});
		route("GET", "/side", async (a, req) => ({ side: await a.getSide(q(req).get("id") || "") }));
		route("POST", "/side/prompt", async (a, req) => { const b = await body(req); return a.promptSide(String(b.id || ""), b.text); });
		route("POST", "/side/abort", async (a, req) => { const b = await body(req); return a.abortSide(String(b.id || "")); });
		route("POST", "/side/settings", async (a, req) => {
			const b = await body(req);
			return { side: await a.updateSide(String(b.id || ""), { scope: b.scope, lastN: b.lastN, edit: b.edit }) };
		});

		offs.push(host.route("GET", "/events", (req, res) => {
			ensureSub();
			res.statusCode = 200;
			res.setHeader("content-type", "text/event-stream; charset=utf-8");
			// no-transform keeps the compression middleware from buffering the stream
			res.setHeader("cache-control", "no-cache, no-transform");
			res.setHeader("connection", "keep-alive");
			res.setHeader("x-accel-buffering", "no");
			res.flushHeaders?.();
			res.write(`data: ${JSON.stringify({ type: "hello", extension: !!api() })}\n\n`);
			res.flush?.();
			sse.add(res);
			const ping = setInterval(() => { try { res.write(": ping\n\n"); res.flush?.(); } catch {} }, 20000);
			req.on("close", () => { clearInterval(ping); sse.delete(res); });
		}));

		return () => {
			clearInterval(subTimer);
			unsub?.();
			for (const res of sse) { try { res.end(); } catch {} }
			sse.clear();
			offs.forEach((f) => f?.());
		};
	},
};
