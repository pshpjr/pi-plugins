// side-chat client: registers the side-panel tab kind "side-chat:chat" (multiple).
// Talks to /plugins-api/side-chat/* and listens to /plugins-api/side-chat/events (SSE).
const PID = "side-chat";
const KIND = "side-chat:chat";
const ROOT = (() => {
	const u = String(import.meta.url);
	const i = u.indexOf("/plugins/");
	return i >= 0 ? u.slice(0, i) : "";
})();
const BASE = `${ROOT}/plugins-api/${PID}`;
const SCOPE_LABEL = { full: "전체", last: "최근 N턴", smart: "smart", none: "없음" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function call(path, { method = "GET", json } = {}) {
	const r = await fetch(`${BASE}${path}`, {
		method,
		credentials: "same-origin",
		headers: json ? { "content-type": "application/json" } : undefined,
		body: json ? JSON.stringify(json) : undefined,
	});
	let data = {};
	try { data = await r.json(); } catch {}
	if (!r.ok || data.error) {
		const e = new Error(data.error || `HTTP ${r.status}`);
		e.noExtension = !!data.noExtension;
		throw e;
	}
	return data;
}

// ---------------------------------------------------------------- shared event stream
const listeners = new Set();
let es = null;
function ensureEvents() {
	if (es) return;
	try {
		es = new EventSource(`${BASE}/events`, { withCredentials: true });
		es.onmessage = (m) => {
			let ev; try { ev = JSON.parse(m.data); } catch { return; }
			if (ev.type === "open") openFromCommand(ev);
			for (const fn of listeners) { try { fn(ev); } catch (e) { console.error("[side-chat]", e); } }
		};
		es.onerror = () => { /* EventSource reconnects by itself */ };
	} catch (e) { console.error("[side-chat] events", e); }
}
function openFromCommand(ev) {
	const P = window.__piSidePanel;
	const cur = P?.mainConversation?.();
	if (!P || !cur || cur.sessionId !== ev.mainSessionId) return;
	P.openTab(KIND, { sideId: ev.sideId });
}

// ---------------------------------------------------------------- styles
function installStyle() {
	if (document.getElementById("side-chat-style")) return;
	const st = document.createElement("style");
	st.id = "side-chat-style";
	st.textContent = `
.sc-root{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;color:var(--text)}
.sc-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border)}
.sc-bar select,.sc-bar input{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:2px 4px;font-size:12px}
.sc-bar .sc-n{width:44px}
.sc-dim{color:var(--text-dim,#888);font-size:12px}
.sc-msgs{flex:1;min-height:0;overflow:auto;padding:8px;display:flex;flex-direction:column;gap:8px}
.sc-u{align-self:flex-end;max-width:90%;background:var(--bg-elev);border:1px solid var(--border);border-radius:8px;padding:6px 8px;white-space:pre-wrap;word-break:break-word}
.sc-a{max-width:100%;white-space:pre-wrap;word-break:break-word}
.sc-a details{margin:4px 0;border:1px solid var(--border);border-radius:6px;padding:2px 6px;background:var(--bg-elev)}
.sc-a summary{cursor:pointer;font-size:12px;color:var(--text-dim,#888)}
.sc-a pre{margin:4px 0;white-space:pre-wrap;word-break:break-word;font-size:12px;max-height:240px;overflow:auto}
.sc-err{color:#e5534b;font-size:12px;white-space:pre-wrap}
.sc-input{display:flex;gap:6px;padding:8px;border-top:1px solid var(--border)}
.sc-input textarea{flex:1;resize:vertical;min-height:38px;max-height:200px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:6px;font:inherit}
.sc-form{padding:12px;display:flex;flex-direction:column;gap:10px}
.sc-form label{display:flex;gap:6px;align-items:center}
.sc-list{display:flex;flex-direction:column;gap:4px}
.sc-item{display:flex;gap:6px;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:6px;padding:4px 8px}
.sc-item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;
	document.head.append(st);
}

// ---------------------------------------------------------------- tab
function mount(el, ctx) {
	installStyle();
	ensureEvents();
	const root = document.createElement("div");
	root.className = "sc-root";
	el.append(root);
	let disposed = false;
	let data = null;
	let fetching = false, again = false;
	let draft = "";

	const main = () => window.__piSidePanel?.mainConversation?.() || null;

	const onEvent = (ev) => {
		if (disposed) return;
		const id = ctx.params.sideId;
		if (id && ev.sideId === id && (ev.type === "update" || ev.type === "created")) refresh();
		if (!id && (ev.type === "created" || ev.type === "update") && ev.mainSessionId === main()?.sessionId) renderPicker();
	};
	listeners.add(onEvent);

	async function refresh() {
		if (fetching) { again = true; return; }
		fetching = true;
		try {
			const r = await call(`/side?id=${encodeURIComponent(ctx.params.sideId)}`);
			data = r.side;
			if (data.title) ctx.setTitle(`💬 ${data.title.slice(0, 24)}`);
			renderChat();
		} catch (e) {
			renderError(e);
		} finally {
			fetching = false;
			if (again && !disposed) { again = false; refresh(); }
		}
	}

	function renderError(e) {
		root.innerHTML = `<div class="sc-form"><div class="sc-err">${esc(e.message)}</div>${e.noExtension ? "" : `<button class="btn sc-back">목록으로</button>`}</div>`;
		root.querySelector(".sc-back")?.addEventListener("click", () => { ctx.setParams({}); ctx.setTitle(""); start(); });
	}

	// ----- picker / new side form
	async function renderPicker() {
		const m = main();
		if (!m) { root.innerHTML = `<div class="sc-form sc-dim">메인 대화를 먼저 시작하세요. 사이드 채팅은 메인 대화에 붙습니다.</div>`; return; }
		let sides = [];
		let status = null;
		try {
			status = await call(`/status?main=${encodeURIComponent(m.sessionId)}`);
			sides = (await call(`/sides?main=${encodeURIComponent(m.sessionId)}`)).sides || [];
		} catch (e) { renderError(e); return; }
		if (disposed || ctx.params.sideId) return;
		root.innerHTML = `
<div class="sc-form">
	<div><b>새 사이드 채팅</b> ${status.mainLoaded ? "" : `<span class="sc-err">메인 대화가 서버에 열려 있지 않음 (메인에서 한 번 메시지를 보내면 열림)</span>`}</div>
	<label>메인 맥락 <select class="sc-scope">${["full", "last", "smart", "none"].map((s) => `<option value="${s}">${SCOPE_LABEL[s]}</option>`).join("")}</select>
		<input class="sc-n" type="number" min="1" max="200" value="8" title="최근 턴 수" hidden></label>
	<label>도구 <select class="sc-edit"><option value="">설정 기본값</option><option value="read">읽기 전용</option><option value="edit">수정 포함 (edit, write, bash)</option></select></label>
	<textarea class="sc-first" rows="3" placeholder="첫 질문 (비워도 됨)"></textarea>
	<div><button class="btn primary sc-create">만들기</button></div>
	${sides.length ? `<div><b>이 대화의 사이드 채팅</b></div><div class="sc-list">${sides.map((s) => `<div class="sc-item"><span title="${esc(s.title)}">${esc(s.title || "(질문 없음)")} <span class="sc-dim">· ${esc(SCOPE_LABEL[s.scope] || s.scope)}${s.scope === "last" ? ` ${s.lastN}` : ""} · ${s.edit ? "수정" : "읽기"}${s.running ? " · 작업 중" : ""}</span></span><button class="btn sc-open" data-id="${esc(s.id)}">열기</button></div>`).join("")}</div>` : ""}
</div>`;
		const scopeSel = root.querySelector(".sc-scope");
		const nIn = root.querySelector(".sc-n");
		scopeSel.addEventListener("change", () => { nIn.hidden = scopeSel.value !== "last"; });
		root.querySelectorAll(".sc-open").forEach((b) => b.addEventListener("click", () => { ctx.setParams({ sideId: b.dataset.id }); refresh(); }));
		root.querySelector(".sc-create").addEventListener("click", async (ev) => {
			ev.target.disabled = true;
			const editV = root.querySelector(".sc-edit").value;
			try {
				const r = await call("/sides", { method: "POST", json: {
					main: m.sessionId,
					scope: scopeSel.value,
					lastN: Number(nIn.value) || undefined,
					edit: editV === "" ? undefined : editV === "edit",
					prompt: root.querySelector(".sc-first").value.trim() || undefined,
				} });
				ctx.setParams({ sideId: r.side.id });
				refresh();
			} catch (e) { ev.target.disabled = false; alert(`사이드 채팅을 만들지 못함: ${e.message}`); }
		});
	}

	// ----- chat view
	function renderChat() {
		if (!data) return;
		const msgsEl = root.querySelector(".sc-msgs");
		const atBottom = !msgsEl || msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 40;
		const ta = root.querySelector(".sc-input textarea");
		if (ta) draft = ta.value;
		const focused = ta && document.activeElement === ta;
		root.innerHTML = `
<div class="sc-bar">
	<select class="sc-scope" title="메인 맥락 범위">${["full", "last", "smart", "none"].map((s) => `<option value="${s}"${s === data.scope ? " selected" : ""}>맥락: ${SCOPE_LABEL[s]}</option>`).join("")}</select>
	<input class="sc-n" type="number" min="1" max="200" value="${data.lastN ?? 8}" title="최근 턴 수"${data.scope === "last" ? "" : " hidden"}>
	<select class="sc-edit" title="도구 권한"><option value="read"${data.edit ? "" : " selected"}>읽기 전용</option><option value="edit"${data.edit ? " selected" : ""}>수정 포함</option></select>
	<span class="sc-dim">${esc(data.model || "")}${data.mainLoaded ? "" : " · 메인 닫힘"}</span>
	<span style="flex:1"></span>
	${data.running ? `<button class="btn sc-stop">중지</button>` : ""}
	<button class="btn sc-list-btn" title="이 대화의 다른 사이드 채팅">목록</button>
</div>
<div class="sc-msgs">${data.messages.map(renderMsg).join("") || `<div class="sc-dim">메인 대화를 참조하는 사이드 채팅입니다. 메인에 전달하려면 "메인에 전달해줘"처럼 말하세요.</div>`}${data.error ? `<div class="sc-err">${esc(data.error)}</div>` : ""}</div>
<div class="sc-input"><textarea placeholder="사이드에 질문 (Enter 전송, Shift+Enter 줄바꿈)"></textarea><button class="btn primary sc-send">${data.running ? "대기열" : "전송"}</button></div>`;
		const nta = root.querySelector(".sc-input textarea");
		nta.value = draft;
		if (focused) { nta.focus(); nta.setSelectionRange(nta.value.length, nta.value.length); }
		const nm = root.querySelector(".sc-msgs");
		if (atBottom) nm.scrollTop = nm.scrollHeight;
		const scopeSel = root.querySelector(".sc-scope");
		const nIn = root.querySelector(".sc-n");
		const save = async (patch) => {
			try { await call("/side/settings", { method: "POST", json: { id: data.id, ...patch } }); refresh(); }
			catch (e) { alert(e.message); refresh(); }
		};
		scopeSel.addEventListener("change", () => save({ scope: scopeSel.value, lastN: Number(nIn.value) || undefined }));
		nIn.addEventListener("change", () => save({ scope: "last", lastN: Number(nIn.value) || undefined }));
		root.querySelector(".sc-edit").addEventListener("change", (e) => save({ edit: e.target.value === "edit" }));
		root.querySelector(".sc-stop")?.addEventListener("click", () => call("/side/abort", { method: "POST", json: { id: data.id } }).catch((e) => alert(e.message)));
		root.querySelector(".sc-list-btn").addEventListener("click", () => { ctx.setParams({}); ctx.setTitle(""); data = null; renderPicker(); });
		const sendNow = async () => {
			const text = nta.value.trim();
			if (!text) return;
			nta.value = ""; draft = "";
			try { await call("/side/prompt", { method: "POST", json: { id: data.id, text } }); }
			catch (e) { nta.value = text; draft = text; alert(e.message); }
			refresh();
		};
		root.querySelector(".sc-send").addEventListener("click", sendNow);
		nta.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); sendNow(); }
		});
		nta.addEventListener("input", () => { draft = nta.value; });
	}

	function renderMsg(m) {
		if (m.role === "user") return `<div class="sc-u">${esc(m.text)}</div>`;
		const parts = (m.parts || []).map((p) => {
			if (p.type === "text") return `<div>${esc(p.text)}</div>`;
			if (p.type === "thinking") return p.text ? `<details><summary>생각</summary><pre>${esc(p.text)}</pre></details>` : "";
			if (p.type === "tool") return `<details><summary>${p.name === "btw_send_to_main" ? "↪ 메인에 전달" : "🔧 " + esc(p.name)}${p.isError ? " (오류)" : ""}${p.result == null ? " …" : ""}</summary><pre>${esc(p.args)}</pre>${p.result != null ? `<pre>${esc(p.result)}</pre>` : ""}</details>`;
			return "";
		}).join("");
		return `<div class="sc-a">${parts}${m.partial ? `<span class="sc-dim"> ▍</span>` : ""}${m.error ? `<div class="sc-err">${esc(m.error)}</div>` : ""}</div>`;
	}

	function start() {
		if (ctx.params.sideId) { root.innerHTML = `<div class="sc-form sc-dim">불러오는 중…</div>`; refresh(); }
		else renderPicker();
	}
	start();

	return {
		onActivate() { if (ctx.params.sideId) refresh(); else renderPicker(); },
		onMainConversationChange() { if (!ctx.params.sideId) renderPicker(); },
		dispose() { disposed = true; listeners.delete(onEvent); root.remove(); },
	};
}

const def = {
	kind: KIND,
	title: (p) => (p?.title ? String(p.title) : "사이드 채팅"),
	icon: "💬",
	newTab: { title: "사이드 채팅", order: 40 },
	multiple: true,
	mount,
};
(window.__piSidePanelQueue ||= []).push(def);
ensureEvents();

// manifest is view:false + preload:true, so no default export / mount is needed.
// dispose runs when the plugin is disabled, removed or reloaded.
export default {
	dispose() {
		try { es?.close(); } catch {}
		es = null;
		listeners.clear();
	},
};
