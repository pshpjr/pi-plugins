// Sidebar Cleanup (client) — tidies the left conversation list, Claude-app style:
//  1. hides conversation timestamps and the "현재" (current) badge — the active row is
//     already highlighted;
//  2. hides the "그룹" (groups) view tab;
//  3. replaces the per-row hover icons (rename / delete …) with a single "…" button
//     that opens a small menu; menu items forward to the host's own (hidden) buttons,
//     so rename / delete keep the host's behaviour and confirmations;
//  4. nests subagent conversations directly under their parent conversation, with a
//     tree line and a short "<template> · <task>" title.
//
// The list is rendered by React, so this never moves or edits React-owned nodes:
// layout changes are pure CSS (flex `order`, keyed by each row's data-session-key),
// and the "…" button / menu live in their own nodes under <body>.
const KEY = "__piSidebarCleanup";
globalThis[KEY]?.destroy?.();

const API = "/plugins-api/sidebar-cleanup";
const ROW = ".panel-drawer.drawer-left .lp-row[data-session-key]";
const TITLE_FONT = "12.5px";

const STATIC_CSS = `
.panel-drawer.drawer-left .conv-time { display: none !important; }
.panel-drawer.drawer-left .conv-current-badge { display: none !important; }
.panel-drawer.drawer-left .category-badge-pill.fork { display: none !important; }
.psc-fork {
	flex: 0 0 auto; display: flex; align-items: center; gap: 6px;
	margin: 6px auto 0; padding: 4px 12px; max-width: min(720px, calc(100% - 32px));
	border: 1px solid var(--border, rgba(255,255,255,.12)); border-radius: 999px;
	background: var(--bg-elev, #1b1b1b); color: var(--text-dim, #aaa);
	font-size: 12.5px; cursor: pointer; white-space: nowrap; overflow: hidden;
}
.psc-fork:hover { color: var(--text, #eee); border-color: var(--accent, #14b8a6); }
.psc-fork b { font-weight: 600; color: var(--text, #eee); overflow: hidden; text-overflow: ellipsis; }
.panel-drawer.drawer-left .lp-conv-tab[title="그룹"],
.panel-drawer.drawer-left .lp-conv-tab[title="Groups"],
.panel-drawer.drawer-left .lp-conv-tab[title="Group"] { display: none !important; }
${ROW} > .lp-del { display: none !important; }
${ROW}:hover > .session-item { padding-right: 30px; }

.psc-more {
	position: fixed; z-index: 9000; display: none;
	width: 24px; height: 22px; padding: 0; border: 0; border-radius: 6px;
	background: transparent; color: var(--text-dim, #aaa); cursor: pointer;
	font: 600 14px/22px system-ui, sans-serif; letter-spacing: 1px; text-align: center;
}
.psc-more:hover, .psc-more.open { background: var(--bg-elev2, #222); color: var(--text, #fff); }
.psc-menu {
	position: fixed; z-index: 9001; min-width: 150px; padding: 5px;
	background: var(--bg-elev, #1b1b1b); color: var(--text, #eee);
	border: 1px solid var(--border, rgba(255,255,255,.12)); border-radius: 10px;
	box-shadow: 0 8px 28px rgba(0,0,0,.45); font-size: 13px;
}
.psc-menu button {
	display: block; width: 100%; padding: 7px 10px; border: 0; border-radius: 6px;
	background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.psc-menu button:hover { background: var(--bg-elev2, #2a2a2a); }
.psc-menu button.danger { color: #f87171; }
.psc-menu hr { border: 0; border-top: 1px solid var(--border, rgba(255,255,255,.12)); margin: 4px 2px; }
`;

const staticStyle = document.createElement("style");
staticStyle.id = "pi-sidebar-cleanup-style";
staticStyle.textContent = STATIC_CSS;
const dynStyle = document.createElement("style");
dynStyle.id = "pi-sidebar-cleanup-dyn";
document.getElementById(staticStyle.id)?.remove();
document.getElementById(dynStyle.id)?.remove();
document.head.append(staticStyle, dynStyle);

// ---------- groups tab: make sure the projects view is the active one ----------
function leaveGroupsView() {
	const tabs = document.querySelectorAll(".panel-drawer.drawer-left .lp-conv-tab");
	const groups = [...tabs].find((t) => /^(그룹|Groups?)$/.test(t.title));
	if (groups?.classList.contains("active")) {
		[...tabs].find((t) => t !== groups)?.click();
	}
}

// ---------- "…" button + menu ----------
const more = document.createElement("button");
more.type = "button";
more.className = "psc-more";
more.title = "더보기";
more.textContent = "···";
document.body.appendChild(more);

let hoverRow = null;
let menu = null;
let menuRow = null;

function placeMore(row) {
	const r = row.getBoundingClientRect();
	more.style.left = `${Math.round(r.right - 28)}px`;
	more.style.top = `${Math.round(r.top + (r.height - 22) / 2)}px`;
	more.style.display = "block";
}
function hideMore() {
	if (menu) return; // keep it while its menu is open
	more.style.display = "none";
	hoverRow = null;
}

function menuItems(row) {
	const items = [];
	for (const b of row.querySelectorAll(":scope > .lp-del")) {
		if (b.classList.contains("lp-elsewhere-act")) continue;
		if (b.classList.contains("lp-rename")) items.push({ label: "이름 변경", btn: b, order: 0 });
		else if (/영구|permanent/i.test(b.title)) items.push({ label: "삭제", btn: b, order: 2, danger: true });
		else items.push({ label: "목록에서 제거", btn: b, order: 1, danger: true });
	}
	return items.sort((a, b) => a.order - b.order);
}

function closeMenu() {
	menu?.remove();
	menu = null;
	menuRow = null;
	more.classList.remove("open");
	if (!hoverRow) more.style.display = "none";
}

function openMenu(row) {
	closeMenu();
	const items = menuItems(row);
	if (!items.length) return;
	menu = document.createElement("div");
	menu.className = "psc-menu";
	menuRow = row;
	items.forEach((it, i) => {
		if (i && it.danger && !items[i - 1].danger) menu.appendChild(document.createElement("hr"));
		const b = document.createElement("button");
		b.type = "button";
		b.textContent = it.label;
		if (it.danger) b.className = "danger";
		b.addEventListener("click", (e) => {
			e.stopPropagation();
			const target = it.btn;
			closeMenu();
			more.style.display = "none";
			target.click(); // host's own rename / delete (with its own confirm)
		});
		menu.appendChild(b);
	});
	document.body.appendChild(menu);
	more.classList.add("open");
	const r = more.getBoundingClientRect();
	const mw = menu.offsetWidth, mh = menu.offsetHeight;
	let left = r.left;
	if (left + mw > innerWidth - 8) left = innerWidth - mw - 8;
	let top = r.bottom + 4;
	if (top + mh > innerHeight - 8) top = r.top - mh - 4;
	menu.style.left = `${Math.max(8, left)}px`;
	menu.style.top = `${Math.max(8, top)}px`;
}

more.addEventListener("click", (e) => {
	e.stopPropagation();
	if (menu) return closeMenu();
	if (hoverRow) openMenu(hoverRow);
});
more.addEventListener("mouseleave", (e) => {
	if (!e.relatedTarget?.closest?.(ROW)) hideMore();
});

function onOver(e) {
	if (e.target === more || menu?.contains(e.target)) return;
	const row = e.target.closest?.(ROW);
	if (row) {
		if (menuItems(row).length === 0) return hideMore();
		hoverRow = row;
		if (!menu) placeMore(row);
	} else if (!menu) {
		hideMore();
	}
}
function onDocDown(e) {
	if (menu && !menu.contains(e.target) && e.target !== more) closeMenu();
}
function onKey(e) {
	if (e.key === "Escape" && menu) closeMenu();
}
function onScroll() {
	if (menu) closeMenu();
	more.style.display = "none";
	hoverRow = null;
}
document.addEventListener("mouseover", onOver, true);
document.addEventListener("mousedown", onDocDown, true);
document.addEventListener("keydown", onKey, true);
document.addEventListener("scroll", onScroll, true);
addEventListener("resize", onScroll);

// ---------- subagent nesting ----------
let parentOf = new Map(); // child sessionFile -> { parent, label }
const norm = (p) => String(p || "").toLowerCase(); // host lowercases keys in some rows

const cssStr = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;

function shortTitle(template, text) {
	let t = String(text || "").split("\n").find((l) => l.trim()) || "";
	const m = /^#\s*([\w-]+)\s*:\s*(.*)$/.exec(t.trim());
	if (m) { template = template || m[1]; t = m[2]; }
	t = t.replace(/^#+\s*/, "").trim();
	if (t.length > 60) t = `${t.slice(0, 60)}…`;
	return template ? `${template} · ${t}` : t;
}

async function loadSubagents() {
	try {
		const r = await fetch(`${API}/subagents`, { credentials: "same-origin" });
		const j = await r.json();
		const next = new Map();
		for (const it of j.items || []) {
			next.set(norm(it.sessionFile), { parent: norm(it.parentSessionFile), label: shortTitle(it.template, it.title) });
		}
		parentOf = next;
		schedule();
	} catch { /* server part missing: nesting just stays off */ }
}

function buildCss() {
	const rules = [];
	const rowSel = (key) => ROW.replace("[data-session-key]", `[data-session-key=${cssStr(key)}]`);
	// Each project's list is a column flex (.lp-project-tree-children). Its items are
	// either a row itself (running conversations) or a wrapper holding exactly one row
	// (history entries), plus non-row items such as "더 보기". Every item gets an
	// explicit `order` (by :nth-child, recomputed on every list mutation), so children
	// can be slotted right after their parent while everything else keeps its place.
	for (const box of document.querySelectorAll(".panel-drawer.drawer-left .lp-project-tree-children")) {
		const items = [...box.children];
		const rowOf = new Map(items.map((it) => [it, it.matches?.(ROW) ? it : it.querySelector?.(ROW) || null]));
		const keyOf = (it) => rowOf.get(it)?.getAttribute("data-session-key") || null;
		const present = new Set(items.map((it) => norm(keyOf(it))).filter(Boolean));
		const kids = new Map(); // parentKey -> [item]
		const isChild = new Set();
		for (const it of items) {
			const k = keyOf(it);
			const info = k && parentOf.get(norm(k));
			if (info && present.has(info.parent) && info.parent !== norm(k)) {
				isChild.add(it);
				if (!kids.has(info.parent)) kids.set(info.parent, []);
				kids.get(info.parent).push(it);
			}
		}
		if (!isChild.size) continue;
		const anchor = keyOf([...isChild][0]);
		const boxSel = `.panel-drawer.drawer-left .lp-project-tree-children:has(${rowSel(anchor).replace(".panel-drawer.drawer-left ", "")})`;
		const orderOf = new Map();
		let n = 0;
		for (const it of items) {
			if (isChild.has(it)) continue;
			n += 1000;
			orderOf.set(it, n);
			const list = kids.get(norm(keyOf(it))) || [];
			list.forEach((c, i) => {
				orderOf.set(c, n + i + 1);
				const sel = rowSel(keyOf(c));
				const last = i === list.length - 1;
				rules.push(`${sel}{margin-left:16px}`);
				rules.push(`${sel}::before{content:"";position:absolute;left:-7px;top:0;${last ? "height:50%;border-bottom:1px solid var(--border,rgba(255,255,255,.18));border-bottom-left-radius:6px;width:6px;" : "bottom:0;"}border-left:1px solid var(--border,rgba(255,255,255,.18));pointer-events:none}`);
			});
		}
		items.forEach((it, i) => rules.push(`${boxSel} > :nth-child(${i + 1}){order:${orderOf.get(it)}}`));
	}
	// Short titles for every known subagent row, plus any "# template: …" title.
	for (const r of document.querySelectorAll(ROW)) {
		const key = r.getAttribute("data-session-key");
		const t = r.querySelector(".conv-title-text");
		if (!t) continue;
		const info = parentOf.get(norm(key));
		// Subagents run in their own delegate client, so the host tags them "다른 곳";
		// that is noise for a nested child row.
		if (info) rules.push(`${ROW.replace("[data-session-key]", `[data-session-key=${cssStr(key)}]`)} .category-badge-pill.elsewhere{display:none!important}`);
		const raw = t.textContent || "";
		const label = info?.label || (/^#\s*[\w-]+\s*:/.test(raw) ? shortTitle("", raw) : null);
		if (!label) continue;
		const sel = `${ROW.replace("[data-session-key]", `[data-session-key=${cssStr(key)}]`)} .conv-title-text`;
		rules.push(`${sel}{font-size:0}`);
		rules.push(`${sel}::before{content:${cssStr(label)};font-size:${TITLE_FONT}}`);
	}
	return rules.join("\n");
}

let timer = 0;
let lastUnknown = "";
function schedule() {
	clearTimeout(timer);
	timer = setTimeout(() => {
		leaveGroupsView();
		const css = buildCss();
		if (dynStyle.textContent !== css) dynStyle.textContent = css;
		// A row we have never seen might be a fresh subagent: refresh the map.
		const unknown = [...document.querySelectorAll(ROW)].map((r) => norm(r.getAttribute("data-session-key"))).filter((k) => !parentOf.has(k)).sort().join("|");
		if (unknown !== lastUnknown) { lastUnknown = unknown; loadSubagents(); }
		if (hoverRow && !hoverRow.isConnected) hideMore();
	}, 120);
}

// ---------- fork banner: "⑂ "<parent>"에서 분기됨" above the conversation ----------
const banner = document.createElement("div");
banner.className = "psc-fork";
banner.setAttribute("role", "button");
banner.title = "부모 대화 열기";
let forkFor = null; // sessionId the banner/info belongs to
let forkInfo = null; // { sessionFile, id, title } | null
let forkReq = 0;

const currentSessionId = () => /(?:^|[#&])s=([\w-]+)/.exec(location.hash)?.[1] || null;

async function refreshFork() {
	const id = currentSessionId();
	if (id === forkFor) return placeBanner();
	forkFor = id;
	forkInfo = null;
	placeBanner();
	if (!id) return;
	const my = ++forkReq;
	try {
		const j = await (await fetch(`${API}/fork-info?id=${encodeURIComponent(id)}`, { credentials: "same-origin" })).json();
		if (my !== forkReq) return;
		forkInfo = j?.parent || null;
	} catch { forkInfo = null; }
	placeBanner();
}

function placeBanner() {
	const wrap = document.querySelector(".native-cli-chat-content > .messages-wrap");
	if (!forkInfo || !wrap) {
		banner.remove();
		return;
	}
	const title = forkInfo.title || "부모 대화";
	if (banner.dataset.title !== title) {
		banner.dataset.title = title;
		banner.replaceChildren("⑂ ", Object.assign(document.createElement("b"), { textContent: `"${title}"` }), "에서 분기됨");
	}
	if (banner.nextElementSibling !== wrap) wrap.before(banner);
}

banner.addEventListener("click", async () => {
	const file = forkInfo?.sessionFile;
	if (!file) return;
	// Prefer the host's own row (works for running and history conversations alike).
	const row = [...document.querySelectorAll(ROW)].find((r) => norm(r.getAttribute("data-session-key")) === norm(file));
	const item = row?.querySelector(".session-item");
	if (item) return item.click();
	const r = await window.__piWebUiHost?.sessions?.open?.(file);
	if (r && r.ok === false) window.__piWebUiHost?.dialogs?.alert?.(`부모 대화를 열 수 없습니다: ${r.error || ""}`);
});
addEventListener("hashchange", refreshFork);

// The host updates #s= with history.replaceState (no hashchange event), so also
// re-check the current conversation on every DOM change.
const mo = new MutationObserver(() => {
	schedule();
	if (currentSessionId() !== forkFor) refreshFork();
	else if (forkInfo && !banner.isConnected) placeBanner();
});
mo.observe(document.body, { childList: true, subtree: true, characterData: true });
const poll = setInterval(loadSubagents, 30000);
loadSubagents();
schedule();
refreshFork();

function destroy() {
	mo.disconnect();
	clearInterval(poll);
	clearTimeout(timer);
	document.removeEventListener("mouseover", onOver, true);
	document.removeEventListener("mousedown", onDocDown, true);
	document.removeEventListener("keydown", onKey, true);
	document.removeEventListener("scroll", onScroll, true);
	removeEventListener("resize", onScroll);
	removeEventListener("hashchange", refreshFork);
	banner.remove();
	closeMenu();
	more.remove();
	staticStyle.remove();
	dynStyle.remove();
	if (globalThis[KEY]?.destroy === destroy) delete globalThis[KEY];
}
globalThis[KEY] = { destroy };

export default { dispose: destroy };
