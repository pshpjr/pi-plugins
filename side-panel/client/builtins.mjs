// Built-in tab kinds: Files (tree / preview / edit / upload), Changes (git), Context (context-lens view).
const baseName = (p) => String(p || "").split(/[\\/]/).filter(Boolean).pop() || p || "";
const join = (a, b) => (a ? `${a}/${b}` : b);

export function registerBuiltins(P, deps) {
	P.registerTabType(filesType(deps));
	P.registerTabType(changesType(deps));
	P.registerTabType(contextType(deps));
}

// ------------------------------------------------------------------ Files
function filesType({ api, esc }) {
	return {
		kind: "side-panel:files",
		title: (p) => (p?.open ? baseName(p.open) : "파일"),
		icon: "📁",
		newTab: { title: "파일", order: 10 },
		multiple: true,
		mount(el, ctx) {
			const st = {
				cache: new Map(), // rel dir -> entries | Promise
				expanded: new Set(ctx.params.expanded || []),
				showHidden: !!ctx.params.showHidden,
				sel: typeof ctx.params.sel === "string" ? ctx.params.sel : "",
				cwd: "",
				file: null, // { path, text, mtime, binary, truncated, size }
				editing: false,
				dirty: false,
				disposed: false,
			};
			el.innerHTML = `
				<div class="sp-view-tree" style="display:flex;flex-direction:column;flex:1;min-height:0">
					<div class="sp-bar">
						<span class="sp-grow sp-dim sp-loc"></span>
						<button class="sp-btn b-refresh" title="새로고침">⟳</button>
						<button class="sp-btn b-upfile" title="파일 업로드 (선택한 폴더로)">⤒</button>
						<button class="sp-btn b-updir" title="폴더 업로드 (선택한 폴더로)"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M1.5 3.5h4l1.5 1.5h7.5v8.5h-13z" fill="none" stroke="currentColor"/><path d="M8 12V7m-2 2 2-2 2 2" fill="none" stroke="currentColor"/></svg></button>
						<button class="sp-btn b-hidden" title="숨김 파일 보기">.*</button>
					</div>
					<div class="sp-scroll sp-treewrap" style="position:relative"><ul class="sp-tree"></ul></div>
					<div class="sp-note sp-status" hidden></div>
					<input type="file" class="in-files" multiple hidden>
					<input type="file" class="in-dir" webkitdirectory multiple hidden>
				</div>
				<div class="sp-view-file" style="display:none;flex-direction:column;flex:1;min-height:0">
					<div class="sp-bar">
						<button class="sp-btn b-back" title="목록으로">←</button>
						<span class="sp-grow f-path"></span>
						<button class="btn b-edit">편집</button>
						<button class="btn primary b-save" hidden>저장</button>
						<button class="btn b-cancel" hidden>취소</button>
					</div>
					<div class="sp-scroll f-body" style="display:flex;flex-direction:column"></div>
				</div>`;
			const $ = (s) => el.querySelector(s);
			const treeEl = $(".sp-tree"), wrap = $(".sp-treewrap"), status = $(".sp-status");
			const saveParams = (extra = {}) => ctx.setParams({ ...ctx.params, expanded: [...st.expanded], showHidden: st.showHidden, sel: st.sel, ...extra });
			const say = (t) => { status.hidden = !t; status.textContent = t || ""; };

			async function loadDir(rel, force) {
				if (!force && st.cache.has(rel)) return st.cache.get(rel);
				const pr = api("/fs/list", { query: { path: rel } }).then((r) => {
					if (!r.ok) throw new Error(r.error || "목록을 읽지 못함");
					if (rel === "") st.cwd = r.cwd || "";
					return r.entries;
				});
				st.cache.set(rel, pr);
				try { const v = await pr; st.cache.set(rel, v); return v; }
				catch (e) { st.cache.set(rel, { error: String(e.message || e) }); return st.cache.get(rel); }
			}
			function rowFor(ent, rel, depth) {
				const li = document.createElement("li");
				const row = document.createElement("div");
				const isDir = ent.type === "dir";
				row.className = "sp-row" + (ent.name.startsWith(".") ? " dot" : "") + (isDir && st.sel === rel ? " sel" : "");
				row.style.paddingLeft = `${6 + depth * 12}px`;
				row.dataset.rel = rel;
				row.dataset.dir = isDir ? "1" : "";
				row.innerHTML = `<span class="tw">${isDir ? (st.expanded.has(rel) ? "▾" : "▸") : ""}</span><span>${isDir ? "📁" : "📄"}</span><span class="nm">${esc(ent.name)}</span>`;
				li.append(row);
				if (isDir && st.expanded.has(rel)) li.append(listFor(rel, depth + 1));
				return li;
			}
			function listFor(rel, depth) {
				const ul = document.createElement("ul");
				const v = st.cache.get(rel);
				if (!v || v instanceof Promise) {
					ul.innerHTML = `<li class="sp-note" style="padding-left:${6 + depth * 12}px">불러오는 중…</li>`;
					loadDir(rel).then(() => !st.disposed && renderTree());
					return ul;
				}
				if (v.error) { ul.innerHTML = `<li class="sp-note sp-err" style="padding-left:${6 + depth * 12}px">${esc(v.error)}</li>`; return ul; }
				const items = v.filter((e) => st.showHidden || !e.name.startsWith("."));
				if (!items.length) ul.innerHTML = `<li class="sp-note" style="padding-left:${6 + depth * 12}px">비어 있음</li>`;
				for (const e of items) ul.append(rowFor(e, join(rel, e.name), depth));
				return ul;
			}
			function renderTree() {
				const top = wrap.scrollTop;
				treeEl.innerHTML = "";
				treeEl.append(...listFor("", 0).childNodes);
				wrap.scrollTop = top;
				$(".sp-loc").textContent = `${baseName(st.cwd) || "/"}${st.sel ? ` / ${st.sel}` : ""}`;
				$(".sp-loc").title = `${st.cwd}${st.sel ? `/${st.sel}` : ""} — 업로드는 여기로`;
				$(".b-hidden").classList.toggle("on", st.showHidden);
			}
			async function refresh() {
				st.cache.clear();
				await loadDir("", true);
				if (!st.disposed) renderTree();
			}

			treeEl.addEventListener("click", (e) => {
				const row = e.target.closest(".sp-row"); if (!row) return;
				const rel = row.dataset.rel;
				if (row.dataset.dir) {
					if (st.expanded.has(rel) && st.sel === rel) st.expanded.delete(rel); else st.expanded.add(rel);
					st.sel = rel;
					saveParams();
					renderTree();
				} else openFile(rel);
			});
			$(".b-refresh").onclick = refresh;
			$(".b-hidden").onclick = () => { st.showHidden = !st.showHidden; saveParams(); renderTree(); };
			$(".b-upfile").onclick = () => $(".in-files").click();
			$(".b-updir").onclick = () => $(".in-dir").click();
			$(".in-files").onchange = (e) => { const fs = [...e.target.files].map((f) => ({ file: f, rel: f.name })); e.target.value = ""; upload(fs, st.sel); };
			$(".in-dir").onchange = (e) => { const fs = [...e.target.files].map((f) => ({ file: f, rel: f.webkitRelativePath || f.name })); e.target.value = ""; upload(fs, st.sel); };

			// drag & drop upload (files and folders) onto the tree / a folder row
			let dropRow = null;
			const dropTarget = (e) => {
				const row = e.target.closest?.(".sp-row");
				if (!row) return { row: null, dir: st.sel };
				if (row.dataset.dir) return { row, dir: row.dataset.rel };
				const rel = row.dataset.rel; const i = rel.lastIndexOf("/");
				return { row: null, dir: i >= 0 ? rel.slice(0, i) : "" };
			};
			wrap.addEventListener("dragover", (e) => {
				if (!e.dataTransfer?.types?.includes("Files")) return;
				e.preventDefault();
				const { row } = dropTarget(e);
				if (dropRow !== row) { dropRow?.classList.remove("drop"); dropRow = row; row?.classList.add("drop"); }
				wrap.classList.add("dragging");
			});
			wrap.addEventListener("dragleave", (e) => { if (!wrap.contains(e.relatedTarget)) { dropRow?.classList.remove("drop"); dropRow = null; } });
			wrap.addEventListener("drop", async (e) => {
				if (!e.dataTransfer?.types?.includes("Files")) return;
				e.preventDefault();
				dropRow?.classList.remove("drop"); dropRow = null;
				const { dir } = dropTarget(e);
				const entries = [...e.dataTransfer.items].map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
				const files = [];
				if (entries.length) for (const en of entries) await walkEntry(en, "", files);
				else for (const f of e.dataTransfer.files) files.push({ file: f, rel: f.name });
				upload(files, dir);
			});

			async function upload(files, dir) {
				if (!files.length) return;
				const known = st.cache.get(dir);
				const names = Array.isArray(known) ? new Set(known.map((x) => x.name)) : new Set();
				const clash = [...new Set(files.map((f) => f.rel.split("/")[0]))].filter((n) => names.has(n));
				if (clash.length && !confirm(`이미 있는 항목을 덮어씁니다:\n${clash.slice(0, 10).join("\n")}${clash.length > 10 ? `\n… 외 ${clash.length - 10}개` : ""}\n\n계속할까요?`)) return;
				let done = 0, fail = 0;
				for (const f of files) {
					say(`업로드 중 ${done + fail + 1}/${files.length}: ${f.rel}`);
					try {
						const r = await api("/fs/upload", { method: "PUT", query: { path: join(dir, f.rel) }, body: f.file });
						if (r.ok) done++; else { fail++; console.error("[side-panel] upload", f.rel, r.error); }
					} catch (e) { fail++; console.error(e); }
				}
				say(`업로드 완료 ${done}개${fail ? ` · 실패 ${fail}개 (콘솔 참고)` : ""} → ${dir || baseName(st.cwd) || "/"}`);
				setTimeout(() => !st.disposed && say(""), 6000);
				if (dir) st.expanded.add(dir);
				saveParams();
				refresh();
			}

			// ---- file view
			const fileView = $(".sp-view-file"), treeView = $(".sp-view-tree"), body = $(".f-body");
			function showFileView(on) { fileView.style.display = on ? "flex" : "none"; treeView.style.display = on ? "none" : "flex"; }
			function setEditing(on) {
				st.editing = on;
				$(".b-edit").hidden = on || !st.file || st.file.binary || st.file.truncated;
				$(".b-save").hidden = !on; $(".b-cancel").hidden = !on;
				body.innerHTML = "";
				if (!st.file) return;
				if (st.file.error) { body.innerHTML = `<div class="sp-note sp-err">${esc(st.file.error)}</div>`; return; }
				if (st.file.binary) { body.innerHTML = `<div class="sp-note">바이너리 파일 (${st.file.size.toLocaleString()} 바이트) — 미리보기 없음</div>`; return; }
				if (on) {
					const ta = document.createElement("textarea");
					ta.className = "sp-edit"; ta.spellcheck = false; ta.value = st.file.text;
					ta.addEventListener("input", () => { st.dirty = true; });
					ta.addEventListener("keydown", (e) => {
						if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
						if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); ta.setRangeText("\t", ta.selectionStart, ta.selectionEnd, "end"); st.dirty = true; }
					});
					body.append(ta); ta.focus();
				} else {
					if (st.file.truncated) body.insertAdjacentHTML("beforeend", `<div class="sp-note">파일이 커서 앞 1MB만 표시합니다 (${st.file.size.toLocaleString()} 바이트). 편집 불가.</div>`);
					const pre = document.createElement("pre"); pre.className = "sp-pre"; pre.textContent = st.file.text;
					body.append(pre);
				}
			}
			async function openFile(rel, { quiet } = {}) {
				if (st.dirty && !confirm("저장하지 않은 변경이 있습니다. 버릴까요?")) return;
				st.dirty = false;
				showFileView(true);
				$(".f-path").textContent = rel; $(".f-path").title = rel;
				if (!quiet) saveParams({ open: rel });
				body.innerHTML = `<div class="sp-note">불러오는 중…</div>`;
				const r = await api("/fs/read", { query: { path: rel } }).catch((e) => ({ ok: false, error: String(e.message || e) }));
				if (st.disposed) return;
				st.file = r.ok ? { path: rel, text: r.text, mtime: r.mtime, binary: r.binary, truncated: r.truncated, size: r.size } : { path: rel, error: r.error || "읽지 못함" };
				setEditing(false);
			}
			async function save(force) {
				const ta = body.querySelector("textarea"); if (!ta || !st.file) return;
				$(".b-save").disabled = true;
				const r = await api("/fs/write", { method: "PUT", json: { path: st.file.path, text: ta.value, expectMtime: force ? undefined : st.file.mtime } }).catch((e) => ({ ok: false, error: String(e.message || e) }));
				$(".b-save").disabled = false;
				if (r.conflict) { if (confirm("그사이 디스크의 파일이 바뀌었습니다. 덮어쓸까요?")) return save(true); return; }
				if (!r.ok) { alert(`저장 실패: ${r.error}`); return; }
				st.file.text = ta.value; st.file.mtime = r.mtime; st.file.size = r.size; st.dirty = false;
				setEditing(false);
			}
			$(".b-edit").onclick = () => setEditing(true);
			$(".b-save").onclick = () => save();
			$(".b-cancel").onclick = () => { if (st.dirty && !confirm("변경을 버릴까요?")) return; st.dirty = false; setEditing(false); };
			$(".b-back").onclick = () => {
				if (st.dirty && !confirm("저장하지 않은 변경이 있습니다. 버릴까요?")) return;
				st.dirty = false; st.file = null; showFileView(false);
				const p = { ...ctx.params }; delete p.open; ctx.setParams({ ...p, expanded: [...st.expanded], showHidden: st.showHidden, sel: st.sel });
				renderTree();
			};

			refresh();
			if (ctx.params.open) openFile(ctx.params.open, { quiet: true });
			return {
				dispose() { st.disposed = true; },
				onActivate() { if (!st.file) refresh(); },
				onMainConversationChange() { refresh(); },
			};
		},
	};
}

async function walkEntry(entry, prefix, out) {
	if (entry.isFile) {
		const file = await new Promise((res, rej) => entry.file(res, rej)).catch(() => null);
		if (file) out.push({ file, rel: prefix + entry.name });
		return;
	}
	if (entry.isDirectory) {
		const reader = entry.createReader();
		for (;;) {
			const batch = await new Promise((res) => reader.readEntries(res, () => res([])));
			if (!batch.length) break;
			for (const e of batch) await walkEntry(e, `${prefix}${entry.name}/`, out);
		}
	}
}

// ------------------------------------------------------------------ Changes (git)
function changesType({ api, esc }) {
	return {
		kind: "side-panel:changes",
		title: "변경사항",
		icon: "±",
		newTab: { title: "변경사항 (git)", order: 20 },
		mount(el, ctx) {
			const st = { open: new Set(), diffs: new Map(), sig: "", disposed: false, data: null };
			el.innerHTML = `
				<div class="sp-bar"><span class="sp-grow sp-dim c-head">불러오는 중…</span><button class="sp-btn c-refresh" title="새로고침">⟳</button></div>
				<div class="sp-scroll c-list"></div>`;
			const list = el.querySelector(".c-list"), head = el.querySelector(".c-head");
			const letter = (f) => (f.untracked ? "U" : f.index !== " " && f.index !== "?" ? f.index : f.worktree);
			function diffHtml(text) {
				return text.split("\n").map((l) => {
					const c = l.startsWith("@@") ? "hunk" : /^(diff |index |--- |\+\+\+ |new file|deleted file|similarity|rename )/.test(l) ? "meta" : l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : "";
					return `<div class="${c}">${esc(l) || " "}</div>`;
				}).join("");
			}
			function render() {
				const d = st.data;
				if (!d) return;
				if (!d.ok) { head.textContent = "오류"; list.innerHTML = `<div class="sp-note sp-err">${esc(d.error)}</div>`; return; }
				if (!d.repo) { head.textContent = "git 저장소 아님"; list.innerHTML = `<div class="sp-note">${esc(d.cwd)} 는 git 저장소가 아닙니다.</div>`; ctx.setBadge(null); return; }
				head.textContent = `⎇ ${d.branch} · 변경 ${d.files.length}개`;
				head.title = d.root;
				ctx.setBadge(d.files.length ? String(d.files.length) : null);
				list.innerHTML = d.files.length ? "" : `<div class="sp-note">변경 없음</div>`;
				for (const f of d.files) {
					const L = letter(f);
					const row = document.createElement("div");
					row.className = "sp-row";
					row.title = `${f.index}${f.worktree} ${f.path}${f.from ? ` ← ${f.from}` : ""}`;
					row.innerHTML = `<span class="sp-st ${esc(L)}">${esc(L)}</span><span class="nm">${esc(baseName(f.path))}</span><span class="sp-dim nm" style="flex:1 1 auto;min-width:0">${esc(f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "")}</span>`;
					row.onclick = () => { if (st.open.has(f.path)) st.open.delete(f.path); else st.open.add(f.path); render(); };
					list.append(row);
					if (st.open.has(f.path)) {
						const box = document.createElement("pre");
						box.className = "sp-pre sp-diff";
						const cached = st.diffs.get(f.path);
						if (cached != null) box.innerHTML = diffHtml(cached);
						else {
							box.textContent = "diff 불러오는 중…";
							api("/git/diff", { query: { path: f.path, untracked: f.untracked ? 1 : 0 } }).then((r) => {
								st.diffs.set(f.path, r.ok ? r.diff || r.error || "(diff 없음)" : `오류: ${r.error}`);
								if (!st.disposed) render();
							});
						}
						list.append(box);
					}
				}
			}
			async function refresh(force) {
				const r = await api("/git/status").catch((e) => ({ ok: false, error: String(e.message || e) }));
				if (st.disposed) return;
				const sig = JSON.stringify(r);
				if (!force && sig === st.sig) return;
				st.sig = sig; st.data = r; st.diffs.clear();
				const top = list.scrollTop; render(); list.scrollTop = top;
			}
			el.querySelector(".c-refresh").onclick = () => refresh(true);
			const timer = setInterval(() => { if (el.offsetParent) refresh(); }, 5000);
			refresh(true);
			return {
				dispose() { st.disposed = true; clearInterval(timer); },
				onActivate() { refresh(); },
				onMainConversationChange() { st.open.clear(); refresh(true); },
			};
		},
	};
}

// ------------------------------------------------------------------ Context (context-lens view)
function contextType({ esc, ROOT }) {
	return {
		kind: "side-panel:context",
		title: "컨텍스트",
		icon: "🔬",
		newTab: { title: "컨텍스트 (context-lens)", order: 30 },
		mount(el) {
			let cleanup = null, disposed = false;
			const inner = document.createElement("div");
			inner.style.cssText = "flex:1 1 auto;min-height:0;display:flex;flex-direction:column";
			inner.innerHTML = `<div class="sp-note">불러오는 중…</div>`;
			el.append(inner);
			import(`${ROOT}/plugins/context-lens/client/entry.mjs`).then((m) => {
				if (disposed) return;
				if (typeof m?.default?.mount !== "function") throw new Error("context-lens 화면을 찾지 못함");
				inner.innerHTML = "";
				cleanup = m.default.mount(inner) || null;
			}).catch((e) => {
				if (disposed) return;
				inner.innerHTML = `<div class="sp-missing"><div class="sp-missing-t">플러그인 없음</div><div class="sp-dim">context-lens 플러그인이 설치되어 있지 않거나 불러오지 못했습니다.</div><div class="sp-dim" style="font-size:11px">${esc(e?.message || e)}</div></div>`;
			});
			return { dispose() { disposed = true; try { typeof cleanup === "function" ? cleanup() : cleanup?.dispose?.(); } catch {} } };
		},
	};
}
