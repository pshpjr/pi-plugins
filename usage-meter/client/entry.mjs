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
	clearTimeout(timer);
	window.removeEventListener("focus", onFocus);
	host()?.setFooterStatus?.(FOOTER_KEY, null);
}

globalThis[KEY] = { destroy, refresh };
window.addEventListener("focus", onFocus);
refresh(false);
loop();
watchStudio();

export default { dispose: destroy };
