// usage-meter client: polls the server summary and hands the text to the host's built-in
// footer status slot (next to the cost cell). Clicking it opens a host popover that renders
// the card below. Only the provider of the current session's model is shown.
const PLUGIN_ID = "usage-meter";
const FOOTER_KEY = "usage-meter";
const POLL_MS = 60_000;
const KEY = "__piUsageMeter";

globalThis[KEY]?.destroy?.();

const host = () => window.__piWebUiHost;
const base = (() => {
	const u = String(import.meta.url);
	const i = u.indexOf("/plugins/");
	return `${i >= 0 ? u.slice(0, i) : ""}/plugins-api/${PLUGIN_ID}`;
})();

let data = null;
let last = "";
let timer = null;
let disposed = false;
const listeners = new Set();

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function refresh(force = false) {
	try {
		const r = await fetch(`${base}/summary${force ? "?force=1" : ""}`, { credentials: "same-origin" });
		const j = await r.json();
		if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
		data = j;
	} catch (e) {
		data = { ...(data || {}), error: String(e.message || e) };
	}
	for (const fn of [...listeners]) try { fn(data); } catch {}
	push();
}

function render(container) {
	const el = document.createElement("div");
	el.style.cssText = "min-width:260px;max-width:360px;padding:10px 12px;font-size:12px;line-height:1.6";
	const draw = (d) => {
		if (!d?.active) {
			el.innerHTML = `<div style="opacity:.7">현재 모델(${esc(d?.model || "없음")})은 사용량 표시를 지원하지 않습니다.</div>`;
			return;
		}
		const time = d.updatedAt ? new Date(d.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "";
		el.innerHTML =
			`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">` +
			`<b>${esc(d.name)} 사용량</b>` +
			`<button type="button" data-r style="cursor:pointer;background:none;border:1px solid currentColor;border-radius:4px;padding:0 6px;color:inherit;opacity:.8">새로고침</button></div>` +
			`<div style="font-weight:600;margin-bottom:4px">${esc(d.footer?.text)}</div>` +
			(d.lines || []).map((l) => `<div>${esc(l)}</div>`).join("") +
			`<div style="opacity:.6;margin-top:6px">${esc(d.model)} · ${esc(time)} 기준${d.error ? ` · 오류: ${esc(d.error)}` : ""}</div>`;
		el.querySelector("[data-r]")?.addEventListener("click", (ev) => {
			ev.stopPropagation();
			ev.currentTarget.textContent = "…";
			refresh(true);
		});
	};
	draw(data);
	listeners.add(draw);
	container.appendChild(el);
	refresh(false);
	return () => {
		listeners.delete(draw);
		el.remove();
	};
}

function push() {
	if (disposed) return;
	const f = data?.active ? data.footer : null;
	const key = f ? `${f.text}\0${f.tip}` : "";
	if (key === last) return;
	last = key;
	host()?.setFooterStatus?.(FOOTER_KEY, f ? { text: f.text, tip: f.tip, pluginId: PLUGIN_ID, content: { render } } : null);
}

function loop() {
	if (disposed) return;
	timer = setTimeout(async () => {
		if (document.visibilityState !== "hidden") await refresh(false);
		loop();
	}, POLL_MS);
}

function onFocus() { refresh(false); }

function destroy() {
	disposed = true;
	clearTimeout(timer);
	window.removeEventListener("focus", onFocus);
	host()?.setFooterStatus?.(FOOTER_KEY, null);
}

globalThis[KEY] = { destroy, refresh };
window.addEventListener("focus", onFocus);
refresh(false);
loop();

export default { dispose: destroy };
