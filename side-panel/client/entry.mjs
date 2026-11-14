// side-panel client: owns the right panel. Draws its own tab strip (+ / ×), lets the
// same kind open several times, splits top/bottom, and stores the layout per pi
// conversation (sessionId from the #s= hash). Other plugins add tab kinds through
// window.__piSidePanel.registerTabType (or the early queue window.__piSidePanelQueue).
import { registerBuiltins } from "./builtins.mjs";
import { CSS } from "./style.mjs";

const PID = "side-panel";
const ROOT = (() => {
	const u = String(import.meta.url);
	const i = u.indexOf("/plugins/");
	return i >= 0 ? u.slice(0, i) : "";
})();
const API_BASE = `${ROOT}/plugins-api/${PID}`;
const DRAFT_KEY = "side-panel:draft-layout";

// ---------------------------------------------------------------- helpers
export function clientId() {
	try { const v = sessionStorage.getItem("pi-web-client-id"); if (v) return v; } catch {}
	try {
		const n = String(window.name || "");
		if (n.startsWith("pi-web-client-id:")) return n.slice(17).trim();
		const i = n.indexOf("__PI_CID__:");
		if (i >= 0) return n.slice(i + 11).trim();
	} catch {}
	return "";
}

export async function api(p, { method = "GET", query = {}, json, body, headers } = {}) {
	const mk = (withCid) => {
		const qs = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) if (v != null) qs.set(k, String(v));
		const cid = withCid ? clientId() : "";
		if (cid) qs.set("clientId", cid);
		const s = qs.toString();
		return `${API_BASE}${p}${s ? `?${s}` : ""}`;
	};
	const init = { method, credentials: "same-origin", headers: { ...(headers || {}) } };
	if (json !== undefined) { init.body = JSON.stringify(json); init.headers["content-type"] = "application/json"; }
	else if (body !== undefined) { init.body = body; init.headers["content-type"] ||= "application/octet-stream"; }
	let r = await fetch(mk(true), init);
	if (r.status === 400) {
		const t = await r.clone().text();
		if (/Unknown client workspace/.test(t)) r = await fetch(mk(false), init);
	}
	let j;
	try { j = await r.json(); } catch { j = { ok: false, error: `HTTP ${r.status}` }; }
	if (!r.ok && j.ok !== false) j = { ...j, ok: false, error: j.error || `HTTP ${r.status}` };
	j.status = r.status;
	return j;
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const newId = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const sessionFromHash = () => (location.hash.match(/[#&]s=([\w-]+)/) || [])[1] || "";
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ---------------------------------------------------------------- reload handover
const prev = window.__piSidePanel;
const carriedTypes = (() => { try { return prev?.__internal?.types?.() || []; } catch { return []; } })();
try { prev?.__internal?.destroy?.(); } catch {}

// ---------------------------------------------------------------- state
const S = {
	types: new Map(), // kind -> def
	sid: null, // null = not resolved yet, "" = draft (no sessionId yet)
	conv: null, // { sessionId, cwd } | null
	layout: null,
	inst: new Map(), // tabId -> { box, handle, def, title, badge, mounted, failed }
	convListeners: new Set(),
	root: null,
	attached: false,
	bottomOpen: false,
	seq: 0,
	saveTimer: null,
	pollTimer: null,
	destroyed: false,
	menu: null,
};

const emptyLayout = () => ({ routes: [], panes: { top: { tabs: [], active: null }, bottom: { tabs: [], active: null }, ratio: 0.55 }, active: null });
function defaultLayout() {
	const L = emptyLayout();
	const tabId = newId();
	L.routes.push({ tabId, kind: "side-panel:files", params: {} });
	L.panes.top.tabs.push(tabId);
	L.panes.top.active = tabId;
	L.active = tabId;
	return L;
}
function normalize(L) {
	const out = emptyLayout();
	if (!L || typeof L !== "object") return out;
	const routes = Array.isArray(L.routes) ? L.routes.filter((r) => r && typeof r.tabId === "string" && typeof r.kind === "string") : [];
	const seen = new Set();
	for (const r of routes) { if (seen.has(r.tabId)) continue; seen.add(r.tabId); out.routes.push({ tabId: r.tabId, kind: r.kind, params: r.params && typeof r.params === "object" ? r.params : {}, ...(typeof r.title === "string" ? { title: r.title } : {}) }); }
	const placed = new Set();
	for (const name of ["top", "bottom"]) {
		const p = L.panes?.[name] || {};
		const tabs = (Array.isArray(p.tabs) ? p.tabs : []).filter((id) => seen.has(id) && !placed.has(id));
		tabs.forEach((id) => placed.add(id));
		out.panes[name] = { tabs, active: tabs.includes(p.active) ? p.active : tabs[0] ?? null };
	}
	for (const r of out.routes) if (!placed.has(r.tabId)) { out.panes.top.tabs.push(r.tabId); out.panes.top.active ||= r.tabId; }
	const ratio = Number(L.panes?.ratio);
	out.panes.ratio = ratio > 0.1 && ratio < 0.9 ? ratio : 0.55;
	out.active = seen.has(L.active) ? L.active : out.panes.top.active || out.panes.bottom.active;
	return out;
}

const route = (tabId) => S.layout?.routes.find((r) => r.tabId === tabId);
const paneOf = (tabId) => (S.layout.panes.top.tabs.includes(tabId) ? "top" : S.layout.panes.bottom.tabs.includes(tabId) ? "bottom" : null);
function titleOf(r) {
	const i = S.inst.get(r.tabId);
	if (i?.title) return i.title;
	if (r.title) return r.title;
	const def = S.types.get(r.kind);
	if (!def) return r.kind.split(":").pop();
	try { return typeof def.title === "function" ? String(def.title(r.params || {}) ?? def.kind) : String(def.title ?? def.kind); } catch { return def.kind; }
}

// ---------------------------------------------------------------- persistence
function scheduleSave() {
	clearTimeout(S.saveTimer);
	const sid = S.sid, layout = S.layout;
	S.saveTimer = setTimeout(() => { S.saveTimer = null; saveNow(sid, layout); }, 300);
	S.pendingSave = { sid, layout };
}
function flushSave() {
	if (!S.saveTimer) return;
	clearTimeout(S.saveTimer); S.saveTimer = null;
	const { sid, layout } = S.pendingSave || {};
	saveNow(sid, layout);
}
function serial(layout) {
	return { routes: layout.routes.map((r) => ({ tabId: r.tabId, kind: r.kind, params: r.params || {}, ...(r.title ? { title: r.title } : {}) })), panes: layout.panes, active: layout.active };
}
function saveNow(sid, layout) {
	if (!layout) return;
	if (!sid) { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(serial(layout))); } catch {} return; }
	api("/layout", { method: "PUT", json: { sid, layout: serial(layout) } }).catch(() => {});
}

// ---------------------------------------------------------------- conversation tracking
async function fetchConv(sid) {
	if (!sid) return null;
	try {
		const r = await api("/conv", { query: { session: sid } });
		return { sessionId: sid, cwd: r.cwd || "" };
	} catch { return { sessionId: sid, cwd: "" }; }
}
function notifyConv() {
	const c = S.conv;
	for (const fn of [...S.convListeners]) try { fn(c); } catch (e) { console.error("[side-panel] conv listener", e); }
	for (const i of S.inst.values()) if (i.mounted) try { i.handle?.onMainConversationChange?.(c); } catch (e) { console.error("[side-panel] onMainConversationChange", e); }
}

async function switchConversation(sid) {
	const seq = ++S.seq;
	const prevSid = S.sid;
	flushSave();
	// draft -> first sessionId: keep the draft tabs alive and adopt them unless a stored layout exists
	if (prevSid === "" && sid && S.layout) {
		const [r, conv] = await Promise.all([api("/layout", { query: { sid } }).catch(() => ({})), fetchConv(sid)]);
		if (seq !== S.seq) return;
		if (!r.layout) {
			S.sid = sid; S.conv = conv;
			try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
			saveNow(sid, S.layout);
			render(); notifyConv();
			return;
		}
		return applyLayout(seq, sid, normalize(r.layout), conv);
	}
	let layout, conv = null;
	if (sid) {
		const [r, c] = await Promise.all([api("/layout", { query: { sid } }).catch(() => ({})), fetchConv(sid)]);
		if (seq !== S.seq) return;
		layout = r.layout ? normalize(r.layout) : defaultLayout();
		conv = c;
	} else {
		let draft = null;
		if (prevSid === null) { try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch {} }
		layout = draft ? normalize(draft) : defaultLayout();
	}
	applyLayout(seq, sid, layout, conv);
}
function applyLayout(seq, sid, layout, conv) {
	if (seq !== S.seq) return;
	for (const id of [...S.inst.keys()]) unmountTab(id);
	S.sid = sid; S.conv = conv; S.layout = layout; S.bottomOpen = false;
	render();
	notifyConv();
}
function pollConversation() {
	if (S.destroyed) return;
	const sid = sessionFromHash();
	if (sid === S.sid) { if (S.switching !== undefined) { S.seq++; S.switching = undefined; } return; }
	if (S.switching !== sid) {
		S.switching = sid;
		switchConversation(sid).finally(() => { if (S.switching === sid) S.switching = undefined; });
	}
}

// ---------------------------------------------------------------- tab instances
function makeCtx(tabId) {
	return {
		tabId,
		get params() { return route(tabId)?.params || {}; },
		setParams(p) { const r = route(tabId); if (!r) return; r.params = { ...(p || {}) }; scheduleSave(); renderStrips(); },
		setTitle(t) { const r = route(tabId); if (!r) return; const i = S.inst.get(tabId); if (i) i.title = t ? String(t) : ""; if (t) r.title = String(t); else delete r.title; scheduleSave(); renderStrips(); },
		setBadge(b) { const i = S.inst.get(tabId); if (i) { i.badge = b == null ? null : String(b); renderStrips(); } },
		close() { closeTab(tabId); },
	};
}
function ensureInst(tabId) {
	let i = S.inst.get(tabId);
	if (!i) { i = { box: h("div", "sp-tab-body"), handle: null, def: null, title: "", badge: null, mounted: false }; i.box.dataset.tabId = tabId; S.inst.set(tabId, i); }
	return i;
}
function mountTab(tabId) {
	const r = route(tabId); if (!r) return;
	const i = ensureInst(tabId);
	if (i.mounted) return;
	const def = S.types.get(r.kind);
	i.box.innerHTML = "";
	i.def = def || null;
	i.mounted = true;
	if (!def) {
		i.box.append(h("div", "sp-missing", `<div class="sp-missing-t">플러그인 없음</div><div class="sp-dim">이 탭(<code>${esc(r.kind)}</code>)을 만든 플러그인이 설치되어 있지 않거나 아직 불러오지 않았습니다. 플러그인이 다시 등록되면 그대로 복원됩니다.</div><button class="btn sp-missing-close">탭 닫기</button>`));
		i.box.querySelector(".sp-missing-close").onclick = () => closeTab(tabId);
		return;
	}
	try {
		i.handle = def.mount(i.box, makeCtx(tabId)) || null;
	} catch (e) {
		console.error(`[side-panel] mount ${r.kind} failed`, e);
		i.box.append(h("div", "sp-missing", `<div class="sp-missing-t">탭을 열지 못했습니다</div><pre class="sp-err">${esc(e?.stack || e)}</pre>`));
	}
}
function unmountTab(tabId, keepBox = false) {
	const i = S.inst.get(tabId); if (!i) return;
	if (i.mounted) try { i.handle?.dispose?.(); } catch (e) { console.error("[side-panel] dispose", e); }
	i.handle = null; i.mounted = false; i.def = null;
	if (!keepBox) { i.box.remove(); S.inst.delete(tabId); } else i.box.innerHTML = "";
}
function remountKind(kind) {
	if (!S.layout) return;
	for (const r of S.layout.routes) {
		if (r.kind !== kind) continue;
		const i = S.inst.get(r.tabId);
		if (i?.mounted) { unmountTab(r.tabId, true); }
	}
	render();
}

// ---------------------------------------------------------------- public operations
function openTab(kind, params = {}, opts = {}) {
	if (!S.layout) S.layout = defaultLayout();
	const def = S.types.get(kind);
	if (def && def.multiple !== true) {
		const ex = S.layout.routes.find((r) => r.kind === kind);
		if (ex) {
			if (params && Object.keys(params).length) { ex.params = { ...params }; const i = S.inst.get(ex.tabId); if (i?.mounted) unmountTab(ex.tabId, true); }
			if (opts.activate !== false) activateTab(ex.tabId); else render();
			scheduleSave();
			return ex.tabId;
		}
	}
	const tabId = newId();
	S.layout.routes.push({ tabId, kind: String(kind), params: params && typeof params === "object" ? { ...params } : {} });
	const pane = opts.pane === "bottom" || opts.pane === "top" ? opts.pane : (S.layout.active && paneOf(S.layout.active)) || "top";
	const P = S.layout.panes[pane];
	const at = P.active ? P.tabs.indexOf(P.active) + 1 : P.tabs.length;
	P.tabs.splice(at, 0, tabId);
	if (opts.activate !== false || !P.active) { P.active = tabId; S.layout.active = tabId; }
	scheduleSave();
	render();
	return tabId;
}
function closeTab(tabId) {
	if (!S.layout || !route(tabId)) return;
	const pane = paneOf(tabId);
	unmountTab(tabId);
	S.layout.routes = S.layout.routes.filter((r) => r.tabId !== tabId);
	if (pane) {
		const P = S.layout.panes[pane];
		const idx = P.tabs.indexOf(tabId);
		P.tabs.splice(idx, 1);
		if (P.active === tabId) P.active = P.tabs[Math.min(idx, P.tabs.length - 1)] ?? null;
		if (pane === "bottom" && !P.tabs.length) S.bottomOpen = false;
	}
	if (S.layout.active === tabId) S.layout.active = S.layout.panes.top.active || S.layout.panes.bottom.active;
	scheduleSave();
	render();
}
function activateTab(tabId) {
	if (!S.layout) return;
	const pane = paneOf(tabId); if (!pane) return;
	S.layout.panes[pane].active = tabId;
	S.layout.active = tabId;
	scheduleSave();
	render();
	const i = S.inst.get(tabId);
	if (i?.mounted) try { i.handle?.onActivate?.(); } catch (e) { console.error(e); }
}
function moveTab(tabId, toPane, beforeId) {
	const from = paneOf(tabId); if (!from) return;
	const F = S.layout.panes[from], T = S.layout.panes[toPane];
	F.tabs.splice(F.tabs.indexOf(tabId), 1);
	if (F.active === tabId) F.active = F.tabs[0] ?? null;
	const at = beforeId && T.tabs.includes(beforeId) ? T.tabs.indexOf(beforeId) : T.tabs.length;
	T.tabs.splice(at, 0, tabId);
	T.active = tabId; S.layout.active = tabId;
	if (from === "bottom" && !F.tabs.length && toPane !== "bottom") S.bottomOpen = false;
	scheduleSave();
	render();
	const i = S.inst.get(tabId);
	if (i?.mounted) try { i.handle?.onActivate?.(); } catch {}
}

function registerTabType(def) {
	if (!def || typeof def.kind !== "string" || !def.kind || typeof def.mount !== "function") throw new Error("side-panel: registerTabType needs { kind, title, mount }");
	const had = S.types.has(def.kind);
	S.types.set(def.kind, def);
	if (S.layout && S.layout.routes.some((r) => r.kind === def.kind)) remountKind(def.kind);
	else if (!had) renderStrips();
	return () => unregisterDef(def);
}
function unregisterDef(def) {
	if (S.types.get(def.kind) !== def) return;
	S.types.delete(def.kind);
	if (S.layout && S.layout.routes.some((r) => r.kind === def.kind)) remountKind(def.kind);
	closeMenu();
}

// ---------------------------------------------------------------- rendering
function buildRoot() {
	const root = h("div", "sp-root");
	root.innerHTML = `
		<div class="sp-pane" data-pane="top"><div class="sp-strip"></div><div class="sp-body"></div></div>
		<div class="sp-split" title="드래그해서 크기 조절"></div>
		<div class="sp-pane" data-pane="bottom"><div class="sp-strip"></div><div class="sp-body"></div></div>`;
	const split = root.querySelector(".sp-split");
	split.addEventListener("pointerdown", (ev) => {
		ev.preventDefault();
		split.setPointerCapture(ev.pointerId);
		const rect = root.getBoundingClientRect();
		const move = (e) => {
			const r = Math.min(0.85, Math.max(0.15, (e.clientY - rect.top) / rect.height));
			S.layout.panes.ratio = r;
			applyRatio();
		};
		const up = () => { split.removeEventListener("pointermove", move); split.removeEventListener("pointerup", up); scheduleSave(); };
		split.addEventListener("pointermove", move);
		split.addEventListener("pointerup", up);
	});
	for (const pane of root.querySelectorAll(".sp-pane")) {
		const strip = pane.querySelector(".sp-strip");
		strip.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("text/x-sp-tab")) { e.preventDefault(); strip.classList.add("drop"); } });
		strip.addEventListener("dragleave", () => strip.classList.remove("drop"));
		strip.addEventListener("drop", (e) => {
			strip.classList.remove("drop");
			const id = e.dataTransfer.getData("text/x-sp-tab");
			if (!id || !route(id)) return;
			e.preventDefault();
			const before = e.target.closest?.(".sp-tab")?.dataset.tabId;
			moveTab(id, pane.dataset.pane, before === id ? undefined : before);
		});
	}
	return root;
}
function applyRatio() {
	if (!S.root || !S.layout) return;
	const top = S.root.querySelector('[data-pane="top"]');
	const showBottom = S.layout.panes.bottom.tabs.length > 0 || S.bottomOpen;
	top.style.flex = showBottom ? `0 0 ${(S.layout.panes.ratio * 100).toFixed(2)}%` : "1 1 auto";
}
function render() {
	if (!S.root || !S.layout) return;
	renderStrips();
	const showBottom = S.layout.panes.bottom.tabs.length > 0 || S.bottomOpen;
	S.root.querySelector('[data-pane="bottom"]').hidden = !showBottom;
	S.root.querySelector(".sp-split").hidden = !showBottom;
	applyRatio();
	for (const name of ["top", "bottom"]) {
		const P = S.layout.panes[name];
		const body = S.root.querySelector(`[data-pane="${name}"] .sp-body`);
		for (const id of P.tabs) {
			const i = ensureInst(id);
			if (i.box.parentElement !== body) body.append(i.box);
			const on = id === P.active;
			i.box.hidden = !on;
			if (on && !i.mounted) mountTab(id);
		}
		let empty = body.querySelector(":scope > .sp-empty");
		if (!P.tabs.length) {
			if (!empty) { empty = h("div", "sp-empty"); body.append(empty); }
			empty.innerHTML = `<div class="sp-dim">열린 탭이 없습니다.</div><button class="btn sp-empty-add">+ 탭 열기</button>`;
			empty.querySelector(".sp-empty-add").onclick = (e) => openMenu(e.currentTarget, name);
		} else empty?.remove();
	}
	// drop boxes of tabs that no longer exist
	for (const [id, i] of S.inst) if (!route(id)) { unmountTab(id); }
}
function renderStrips() {
	if (!S.root || !S.layout) return;
	const showBottom = S.layout.panes.bottom.tabs.length > 0 || S.bottomOpen;
	for (const name of ["top", "bottom"]) {
		const P = S.layout.panes[name];
		const strip = S.root.querySelector(`[data-pane="${name}"] .sp-strip`);
		strip.innerHTML = "";
		const tabsWrap = h("div", "sp-tabs");
		for (const id of P.tabs) {
			const r = route(id); if (!r) continue;
			const def = S.types.get(r.kind);
			const i = S.inst.get(id);
			const t = h("div", "sp-tab" + (id === P.active ? " active" : "") + (id === S.layout.active ? " focused" : "") + (def ? "" : " missing"));
			t.dataset.tabId = id;
			t.draggable = true;
			t.title = `${titleOf(r)} (${r.kind})`;
			t.innerHTML = `${def?.icon ? `<span class="sp-tab-icon">${esc(def.icon)}</span>` : ""}<span class="sp-tab-title">${esc(titleOf(r))}</span>${i?.badge ? `<span class="sp-badge">${esc(i.badge)}</span>` : ""}<button class="sp-x" title="닫기">×</button>`;
			t.addEventListener("click", (e) => { if (e.target.closest(".sp-x")) { e.stopPropagation(); closeTab(id); return; } activateTab(id); });
			t.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); closeTab(id); } });
			t.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/x-sp-tab", id); e.dataTransfer.effectAllowed = "move"; });
			tabsWrap.append(t);
		}
		strip.append(tabsWrap);
		const tools = h("div", "sp-tools");
		const add = h("button", "sp-btn sp-add", "+"); add.title = "새 탭";
		add.onclick = (e) => openMenu(e.currentTarget, name);
		tools.append(add);
		if (name === "top") {
			const sp = h("button", "sp-btn sp-splitbtn" + (showBottom ? " on" : ""), `<svg viewBox="0 0 16 16" width="13" height="13"><rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor"/><line x1="1.5" y1="8" x2="14.5" y2="8" stroke="currentColor"/></svg>`);
			sp.title = showBottom ? "아래 창 닫기 (탭은 위로 옮김)" : "위/아래로 나누기";
			sp.onclick = () => toggleSplit();
			tools.append(sp);
		} else {
			const x = h("button", "sp-btn", "×"); x.title = "아래 창 닫기 (탭은 위로 옮김)";
			x.onclick = () => toggleSplit(false);
			tools.append(x);
		}
		strip.append(tools);
	}
}
function toggleSplit(force) {
	const showBottom = S.layout.panes.bottom.tabs.length > 0 || S.bottomOpen;
	const want = force ?? !showBottom;
	if (want) { S.bottomOpen = true; render(); return; }
	const B = S.layout.panes.bottom, T = S.layout.panes.top;
	for (const id of B.tabs) T.tabs.push(id);
	if (!T.active) T.active = B.active || T.tabs[0] || null;
	B.tabs = []; B.active = null; S.bottomOpen = false;
	if (S.layout.active && !paneOf(S.layout.active)) S.layout.active = T.active;
	scheduleSave();
	render();
	for (const id of T.tabs) { const i = S.inst.get(id); if (i?.mounted && id === T.active) try { i.handle?.onActivate?.(); } catch {} }
}

function closeMenu() { S.menu?.remove(); S.menu = null; }
function openMenu(anchor, pane) {
	if (S.menu) { const same = S.menu.__anchor === anchor; closeMenu(); if (same) return; }
	const items = [...S.types.values()]
		.filter((d) => d.newTab !== false)
		.map((d) => ({ d, title: d.newTab?.title || (typeof d.title === "string" ? d.title : d.kind), order: d.newTab?.order ?? 100 }))
		.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
	const m = h("div", "sp-menu");
	m.__anchor = anchor;
	if (!items.length) m.append(h("div", "sp-menu-empty", "등록된 탭 종류가 없습니다"));
	for (const it of items) {
		const exists = it.d.multiple !== true && S.layout.routes.some((r) => r.kind === it.d.kind);
		const b = h("button", "sp-menu-item", `<span class="sp-menu-icon">${esc(it.d.icon || "")}</span><span>${esc(it.title)}</span>${exists ? '<span class="sp-dim sp-menu-note">열림</span>' : ""}`);
		b.onclick = () => { closeMenu(); openTab(it.d.kind, {}, { pane }); };
		m.append(b);
	}
	S.root.append(m);
	const rr = S.root.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
	m.style.top = `${ar.bottom - rr.top + 2}px`;
	m.style.right = `${Math.max(4, rr.right - ar.right)}px`;
	S.menu = m;
}
function onDocDown(e) { if (S.menu && !S.menu.contains(e.target) && !e.target.closest?.(".sp-add,.sp-empty-add")) closeMenu(); }
function onKey(e) { if (e.key === "Escape") closeMenu(); }

// ---------------------------------------------------------------- global style (dom permission)
function installStyle() {
	let st = document.getElementById("side-panel-style");
	if (!st) { st = document.createElement("style"); st.id = "side-panel-style"; document.head.append(st); }
	st.textContent = CSS;
}

// ---------------------------------------------------------------- public API
const publicApi = {
	version: 1,
	registerTabType,
	openTab,
	closeTab,
	activateTab,
	listTabs() {
		if (!S.layout) return [];
		return S.layout.routes.map((r) => ({ tabId: r.tabId, kind: r.kind, title: titleOf(r), pane: paneOf(r.tabId) || "top" }));
	},
	mainConversation() { return S.conv ? { ...S.conv } : null; },
	onMainConversationChange(cb) { S.convListeners.add(cb); return () => S.convListeners.delete(cb); },
};
Object.defineProperty(publicApi, "__internal", {
	enumerable: false,
	value: {
		types: () => [...S.types.values()],
		destroy,
		state: S,
	},
});

function destroy() {
	if (S.destroyed) return;
	flushSave();
	S.destroyed = true;
	clearInterval(S.pollTimer);
	window.removeEventListener("hashchange", pollConversation);
	document.removeEventListener("pointerdown", onDocDown, true);
	document.removeEventListener("keydown", onKey);
	for (const id of [...S.inst.keys()]) unmountTab(id);
	S.root?.remove();
	document.getElementById("side-panel-style")?.remove();
	if (window.__piSidePanel === publicApi) delete window.__piSidePanel;
}

// ---------------------------------------------------------------- boot
installStyle();
S.root = buildRoot();
window.__piSidePanel = publicApi;
registerBuiltins(publicApi, { api, esc, clientId, ROOT });
for (const def of carriedTypes) { if (!S.types.has(def.kind)) try { registerTabType(def); } catch (e) { console.error(e); } }
// early registrations: drain the queue, then make later pushes register directly
{
	const q = Array.isArray(window.__piSidePanelQueue) ? window.__piSidePanelQueue : [];
	for (const def of q.splice(0)) try { registerTabType(def); } catch (e) { console.error("[side-panel] queued registerTabType failed", e); }
	window.__piSidePanelQueue = { push(...defs) { for (const d of defs) try { registerTabType(d); } catch (e) { console.error("[side-panel] registerTabType failed", e); } return 0; } };
}
document.addEventListener("pointerdown", onDocDown, true);
document.addEventListener("keydown", onKey);
window.addEventListener("hashchange", pollConversation);
S.pollTimer = setInterval(pollConversation, 700);
pollConversation();

export default {
	mount(el) {
		if (!el.closest(".panel-right")) {
			el.innerHTML = `<div style="padding:16px;color:var(--text-dim)">사이드 패널은 오른쪽 패널에서 열립니다.</div>`;
			return () => {};
		}
		el.classList.add("sp-host");
		el.append(S.root);
		S.attached = true;
		render();
		if (S.layout) for (const name of ["top", "bottom"]) {
			const id = S.layout.panes[name].active; const i = id && S.inst.get(id);
			if (i?.mounted) try { i.handle?.onActivate?.(); } catch {}
		}
		return () => { closeMenu(); if (S.root.parentElement === el) S.root.remove(); el.classList.remove("sp-host"); S.attached = false; };
	},
	dispose: destroy,
};
