// usage-meter client: polls the server summary and hands the text to the host's built-in
// footer status slot (next to the cost cell). Clicking it opens a host popover that renders
// the card below. Only the provider of the current conversation's model is shown.
// No polling: the footer refreshes when the conversation changes (#s= hash), when the server
// pushes a model change over SSE (/events), and on window focus.
const PLUGIN_ID = "usage-meter";
const FOOTER_KEY = "usage-meter";
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
let es = null;
let seq = 0;
let disposed = false;
const byProvider = new Map(); // provider id -> last summary, shown at once when switching back
const listeners = new Set();

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const sessionId = () => (location.hash.match(/[#&]s=([\w-]+)/) || [])[1] || "";

async function refresh(force = false) {
	const my = ++seq;
	const q = new URLSearchParams();
	const sid = sessionId();
	if (sid) q.set("s", sid);
	if (force) q.set("force", "1");
	try {
		const r = await fetch(`${base}/summary${q.size ? `?${q}` : ""}`, { credentials: "same-origin" });
		const j = await r.json();
		if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
		if (my !== seq) return; // a newer request (another conversation/model) superseded this one
		data = j;
		if (j.active) byProvider.set(j.active, j);
	} catch (e) {
		if (my !== seq) return;
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

function onFocus() { refresh(false); }
function onHash() { refresh(false); }

// Server pushes model changes. Show the new provider's last known value (or "…") at once,
// then fetch the fresh one.
function connectEvents() {
	if (disposed || es) return;
	try {
		es = new EventSource(`${base}/events`, { withCredentials: true });
		es.onmessage = (m) => {
			let ev; try { ev = JSON.parse(m.data); } catch { return; }
			if (ev.type === "hello") return refresh(false); // (re)connected: resync
			if (ev.type !== "model") return;
			const mine = sessionId();
			if (ev.sid && mine && ev.sid !== mine) return; // another conversation
			if (ev.active !== data?.active) {
				const cached = ev.active ? byProvider.get(ev.active) : null;
				data = cached ?? (ev.active ? { ok: true, active: ev.active, model: ev.model, footer: { text: "…", tip: "" }, lines: [] } : { ok: true, active: "", model: ev.model, footer: null });
				for (const fn of [...listeners]) try { fn(data); } catch {}
				push();
			}
			refresh(false);
		};
		// EventSource reconnects by itself; "hello" resyncs afterwards
	} catch {}
}

// ---- Model Studio injection (needs the "dom" permission) ----
// The host's "모델 관리" modal has no plugin slot, so we watch for it and add a usage card
// under the selected provider's header. Keyed by the provider's display name in the sidebar.
const STUDIO_PROVIDERS = { Anthropic: "claude", "OpenAI Codex": "codex", "GitHub Copilot": "copilot", "Z.AI": "zai", DeepSeek: "deepseek" };
const CARD_ATTR = "data-usage-meter-card";
let observer = null;
let scheduled = false;

async function fetchProvider(id, force) {
	const r = await fetch(`${base}/provider?id=${encodeURIComponent(id)}${force ? "&force=1" : ""}`, { credentials: "same-origin" });
	const j = await r.json();
	if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
	return j;
}

function drawStudioCard(card, id, force) {
	card.innerHTML = `<div style="opacity:.6">사용량 불러오는 중…</div>`;
	fetchProvider(id, force)
		.then((d) => {
			if (card.getAttribute(CARD_ATTR) !== id) return;
			const time = new Date(d.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
			card.innerHTML =
				`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px">` +
				`<span style="font-weight:600">📊 사용량</span>` +
				`<button type="button" class="btn sm" data-r>새로고침</button></div>` +
				`<div style="font-weight:600;${d.error ? "color:var(--danger,#e5484d)" : ""}">${esc(d.label)}</div>` +
				d.lines.map((l) => `<div style="opacity:.85">${esc(l)}</div>`).join("") +
				`<div style="opacity:.55;margin-top:4px">${esc(time)} 기준 · usage-meter</div>`;
			card.querySelector("[data-r]")?.addEventListener("click", () => drawStudioCard(card, id, true));
		})
		.catch((e) => {
			if (card.getAttribute(CARD_ATTR) === id) card.innerHTML = `<div style="opacity:.7">사용량 조회 실패: ${esc(e.message || e)}</div>`;
		});
}

function syncStudio() {
	scheduled = false;
	const modal = document.querySelector(".model-studio-modal");
	if (!modal) return;
	const name = modal.querySelector(".studio-nav-item.active .studio-nav-label")?.textContent.trim() ?? "";
	const id = STUDIO_PROVIDERS[name] ?? "";
	const main = modal.querySelector(".model-studio-main .studio-card");
	const existing = modal.querySelector(`[${CARD_ATTR}]`);
	if (!id || !main) return existing?.remove();
	if (existing?.getAttribute(CARD_ATTR) === id && main.contains(existing)) return;
	existing?.remove();
	const card = document.createElement("div");
	card.setAttribute(CARD_ATTR, id);
	card.style.cssText =
		"margin:8px 0 12px;padding:10px 12px;border:1px solid var(--border,rgba(127,127,127,.3));border-radius:8px;font-size:12px;line-height:1.6";
	const head = main.querySelector(".studio-card-head");
	head ? head.after(card) : main.prepend(card);
	drawStudioCard(card, id, false);
}

function watchStudio() {
	if (typeof MutationObserver === "undefined") return;
	observer = new MutationObserver(() => {
		if (scheduled) return;
		scheduled = true;
		setTimeout(syncStudio, 30);
	});
	observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
	syncStudio();
}

function destroy() {
	disposed = true;
	observer?.disconnect();
	document.querySelectorAll(`[${CARD_ATTR}]`).forEach((e) => e.remove());
	es?.close();
	es = null;
	window.removeEventListener("focus", onFocus);
	window.removeEventListener("hashchange", onHash);
	host()?.setFooterStatus?.(FOOTER_KEY, null);
}

globalThis[KEY] = { destroy, refresh };
window.addEventListener("focus", onFocus);
window.addEventListener("hashchange", onHash);
refresh(false);
connectEvents();
watchStudio();

export default { dispose: destroy };
