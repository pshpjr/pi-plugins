// Context Lens view (right panel tab).
const BASE = (() => {
	const u = String(import.meta.url);
	const i = u.indexOf("/plugins/");
	return `${i >= 0 ? u.slice(0, i) : ""}/plugins-api/context-lens`;
})();
const COLORS = {
	system: "#7c8aa5", skills: "#a78bfa", tools: "#60a5fa", summary: "#f59e0b", user: "#34d399",
	injected: "#2dd4bf", answers: "#f472b6", reasoning: "#c084fc", toolcalls: "#fb923c", toolresults: "#facc15",
};
const fmt = (n) => (n == null ? "-" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sessionFromHash = () => (location.hash.match(/[#&]s=([\w-]+)/) || [])[1] || "";

const CSS = `
.cl{font-size:12px;color:var(--text);padding:10px;overflow:auto;height:100%;box-sizing:border-box}
.cl h3{font-size:12px;margin:14px 0 6px;color:var(--text-dim,var(--text));opacity:.8;text-transform:uppercase;letter-spacing:.04em}
.cl .row{display:flex;justify-content:space-between;gap:8px}
.cl .muted{opacity:.65}
.cl .bar{display:flex;height:14px;border-radius:4px;overflow:hidden;background:var(--bg-elev);border:1px solid var(--border)}
.cl .bar>i{display:block;height:100%}
.cl .legend{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:6px}
.cl .dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:middle}
.cl .stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px}
.cl .stat{background:var(--bg-elev);border:1px solid var(--border);border-radius:6px;padding:6px}
.cl .stat b{display:block;font-size:14px}
.cl details{border-bottom:1px solid var(--border);padding:4px 0}
.cl summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:8px}
.cl summary::-webkit-details-marker{display:none}
.cl .item summary{padding-left:14px;opacity:.9}
.cl pre{white-space:pre-wrap;word-break:break-word;font-size:11px;max-height:300px;overflow:auto;background:var(--bg-elev);border:1px solid var(--border);border-radius:4px;padding:6px;margin:4px 0 4px 14px}
.cl svg{width:100%;height:110px;display:block}
.cl table{width:100%;border-collapse:collapse}
.cl td{padding:2px 4px;border-bottom:1px solid var(--border);vertical-align:top;word-break:break-all}
.cl code{font-size:11px}
.cl .top{display:flex;gap:6px;align-items:center;justify-content:space-between}
`;

function trendSvg(steps, win) {
	if (!steps.length) return '<div class="muted">아직 응답 없음</div>';
	const W = 300, H = 100, max = Math.max(win, ...steps.map((s) => s.context));
	const x = (i) => (steps.length === 1 ? W / 2 : (i / (steps.length - 1)) * W);
	const y = (v) => H - (v / max) * H;
	const pts = steps.map((s, i) => `${x(i).toFixed(1)},${y(s.context).toFixed(1)}`).join(" ");
	const marks = steps.map((s, i) => s.compactedAfter ? `<line x1="${x(i)}" x2="${x(i)}" y1="0" y2="${H}" stroke="#f59e0b" stroke-dasharray="3 2"/>` : "").join("");
	const dots = steps.map((s, i) => `<circle cx="${x(i)}" cy="${y(s.context)}" r="2" fill="var(--accent)"><title>#${i + 1} ${s.ts}\n컨텍스트 ${s.context}\n(Δ ${i ? s.context - steps[i - 1].context : s.context})\n출력 ${s.output}\n$${s.cost.toFixed(4)}</title></circle>`).join("");
	return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
		<line x1="0" x2="${W}" y1="${y(win)}" y2="${y(win)}" stroke="var(--red,#ef4444)" stroke-dasharray="4 3" opacity=".6"/>
		${marks}<polyline fill="none" stroke="var(--accent)" stroke-width="1.5" points="${pts}"/>${dots}</svg>
		<div class="row muted"><span>step 1</span><span>빨간 점선 = 윈도 ${fmt(win)} · 주황 = 압축</span><span>step ${steps.length}</span></div>`;
}

// The host footer knows the real context window ("컨텍스트 사용량: 11.5K / 1M"); prefer it.
function hostWindow() {
	const t = document.querySelector('[data-bar-item="host:ctx"]')?.getAttribute("title") || "";
	const m = t.match(/\/\s*([\d.]+)\s*([KM]?)/i);
	if (!m) return null;
	return Math.round(parseFloat(m[1]) * ({ K: 1e3, M: 1e6 }[m[2].toUpperCase()] || 1));
}

function render(el, d) {
	if (!d.ok) { el.querySelector(".body").innerHTML = `<div class="muted">${esc(d.error || "데이터 없음")}</div>`; return; }
	d.window = hostWindow() || d.window;
	const total = d.actual ?? d.estimated;
	const scale = d.actual && d.estimated ? d.actual / d.estimated : 1;
	const pct = (total / d.window) * 100;
	const segs = d.categories.map((c) => `<i style="width:${(c.tokens * scale / d.window) * 100}%;background:${COLORS[c.key]}" title="${esc(c.label)} ~${fmt(Math.round(c.tokens * scale))}"></i>`).join("");
	const legend = d.categories.map((c) => `<span><span class="dot" style="background:${COLORS[c.key]}"></span>${esc(c.label)} ${fmt(Math.round(c.tokens * scale))}</span>`).join("");
	const t = d.totals;
	const browser = d.categories.map((c) => `
		<details><summary><span><span class="dot" style="background:${COLORS[c.key]}"></span>${esc(c.label)} <span class="muted">(${c.items.length})</span></span><span>${fmt(Math.round(c.tokens * scale))} · ${((c.tokens / d.estimated) * 100).toFixed(1)}%</span></summary>
		${c.items.slice(0, 200).map((it) => `<details class="item"><summary><span>${esc(it.label)}</span><span class="muted">${fmt(Math.round(it.tokens * scale))}</span></summary><pre>${esc(it.preview)}</pre></details>`).join("")}
		</details>`).join("");

	el.querySelector(".body").innerHTML = `
		<div class="row"><b>${esc(d.model || "?")}</b><span class="muted">${esc(d.sessionId?.slice(0, 8))}</span></div>
		<h3>현재 컨텍스트</h3>
		<div class="row"><span><b>${fmt(total)}</b> / ${fmt(d.window)}</span><span>${pct.toFixed(1)}%</span></div>
		<div class="bar">${segs}</div>
		<div class="legend">${legend}</div>
		<div class="muted" style="margin-top:4px">${d.actual ? `실측(마지막 응답 usage) 기준. 항목별 값은 추정치 ${fmt(d.estimated)}를 실측에 맞춰 ×${scale.toFixed(2)} 보정.` : `추정치(문자 수 기반). 아직 응답 usage 없음.`}${d.compacted ? ` · 압축됨(${d.compacted.droppedEntries}개 항목 요약으로 대체)` : ""}</div>
		<h3>누적 토큰</h3>
		<div class="stats">
			<div class="stat"><span class="muted">입력</span><b>${fmt(t.input)}</b></div>
			<div class="stat"><span class="muted">캐시 읽기</span><b>${fmt(t.cacheRead)}</b></div>
			<div class="stat"><span class="muted">캐시 쓰기</span><b>${fmt(t.cacheWrite)}</b></div>
			<div class="stat"><span class="muted">출력</span><b>${fmt(t.output)}</b></div>
			<div class="stat"><span class="muted">캐시 적중률</span><b>${(t.cacheHitRate * 100).toFixed(0)}%</b></div>
			<div class="stat"><span class="muted">비용</span><b>$${t.cost.toFixed(4)}</b></div>
		</div>
		<h3>단계별 추이 (${d.steps.length} 응답)</h3>
		${trendSvg(d.steps, d.window)}
		<h3>컨텍스트 브라우저</h3>
		${browser}
		<h3>이벤트</h3>
		${d.events.length ? `<table>${d.events.map((e) => `<tr><td class="muted">${e.ts}</td><td>${esc(e.text)}</td></tr>`).join("")}</table>` : '<div class="muted">없음</div>'}
		<h3>파일 활동</h3>
		${d.files.length ? `<table><tr class="muted"><td>경로</td><td>R</td><td>E</td><td>W</td></tr>${d.files.map((f) => `<tr><td><code>${esc(f.path)}</code></td><td>${f.read || ""}</td><td>${f.edit || ""}</td><td>${f.write || ""}</td></tr>`).join("")}</table>` : '<div class="muted">없음</div>'}
		<h3>명령 실행 (최근순)</h3>
		${d.commands.length ? `<table>${d.commands.map((c) => `<tr><td class="muted">${c.ts}</td><td><code>${esc(c.command)}</code></td></tr>`).join("")}</table>` : '<div class="muted">없음</div>'}
	`;
}

export default {
	mount(el) {
		el.innerHTML = `<style>${CSS}</style><div class="cl"><div class="top"><span class="muted status"></span><button class="btn refresh">새로고침</button></div><div class="body muted">불러오는 중…</div></div>`;
		const root = el.querySelector(".cl");
		const status = el.querySelector(".status");
		let busy = false, last = "";
		const load = async () => {
			if (busy) return; busy = true;
			try {
				const r = await fetch(`${BASE}/summary?session=${encodeURIComponent(sessionFromHash())}`);
				const d = await r.json();
				const sig = JSON.stringify([d.sessionId, d.steps?.length, d.estimated, d.events?.length]);
				if (sig !== last) {
					// keep open <details> across refreshes
					const open = [...root.querySelectorAll("details[open] > summary")].map((s) => s.textContent);
					render(root, d);
					root.querySelectorAll("details > summary").forEach((s) => { if (open.includes(s.textContent)) s.parentElement.open = true; });
					last = sig;
				}
				status.textContent = new Date().toLocaleTimeString();
			} catch (e) { status.textContent = "오류: " + e.message; }
			busy = false;
		};
		el.querySelector(".refresh").onclick = () => { last = ""; load(); };
		const timer = setInterval(load, 5000);
		window.addEventListener("hashchange", load);
		load();
		return () => { clearInterval(timer); window.removeEventListener("hashchange", load); };
	},
};
