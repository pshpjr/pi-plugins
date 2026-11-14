// Styles for side-panel. Injected once into <head> (plugin has the dom permission).
export const CSS = `
/* host right panel: hide the host tab strip when our tab is the only one (Codex hideTabStripWhenAlone) */
.panel-drawer.drawer-right .slot-tabs-bar:has(> .slot-tab:only-child){display:none}
.sp-host{display:flex;flex-direction:column;height:100%;min-height:0;padding:0!important;overflow:hidden!important}

.sp-root{position:relative;display:flex;flex-direction:column;flex:1 1 auto;height:100%;min-height:0;color:var(--text);font-size:12px;background:var(--bg)}
.sp-root [hidden]{display:none!important}
.sp-pane{display:flex;flex-direction:column;min-height:0;flex:1 1 auto}
.sp-pane[data-pane="bottom"]{flex:1 1 0}
.sp-strip{display:flex;align-items:stretch;height:30px;flex:0 0 30px;border-bottom:1px solid var(--border);background:var(--bg-elev)}
.sp-strip.drop{box-shadow:inset 0 -2px 0 var(--accent)}
.sp-tabs{display:flex;flex:1 1 auto;min-width:0;overflow-x:auto;scrollbar-width:none}
.sp-tabs::-webkit-scrollbar{display:none}
.sp-tab{display:flex;align-items:center;gap:4px;max-width:180px;min-width:0;padding:0 4px 0 10px;border-right:1px solid var(--border);cursor:pointer;color:var(--text-dim);white-space:nowrap;user-select:none;position:relative}
.sp-tab:hover{background:var(--bg-elev2,var(--bg))}
.sp-tab.active{background:var(--bg);color:var(--text)}
.sp-tab.active::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;background:var(--bg)}
.sp-tab.active.focused::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:var(--accent)}
.sp-tab.missing .sp-tab-title{font-style:italic;opacity:.7}
.sp-tab-icon{flex:0 0 auto;font-size:12px}
.sp-tab-title{overflow:hidden;text-overflow:ellipsis}
.sp-badge{flex:0 0 auto;font-size:10px;line-height:14px;padding:0 5px;border-radius:7px;background:var(--accent);color:var(--accent-contrast,#fff)}
.sp-x{flex:0 0 auto;width:18px;height:18px;border:0;background:none;color:inherit;border-radius:4px;cursor:pointer;opacity:0;font-size:14px;line-height:1;padding:0}
.sp-tab:hover .sp-x,.sp-tab.active .sp-x{opacity:.7}
.sp-x:hover{opacity:1!important;background:var(--bg-elev2,var(--border))}
.sp-tools{display:flex;align-items:center;gap:2px;padding:0 4px;flex:0 0 auto}
.sp-btn{width:24px;height:24px;border:0;border-radius:5px;background:none;color:var(--text-dim);cursor:pointer;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0}
.sp-btn:hover{background:var(--bg-elev2,var(--border));color:var(--text)}
.sp-btn.on{color:var(--accent)}
.sp-body{position:relative;flex:1 1 auto;min-height:0}
.sp-tab-body{position:absolute;inset:0;overflow:auto;display:flex;flex-direction:column}
.sp-split{flex:0 0 5px;cursor:row-resize;background:var(--border);opacity:.6}
.sp-split:hover{background:var(--accent);opacity:1}
.sp-empty,.sp-missing{padding:24px 16px;display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.sp-missing-t{font-weight:600;font-size:13px}
.sp-dim{color:var(--text-dim)}
.sp-err{white-space:pre-wrap;font-size:11px;color:var(--red,#ef4444)}
.sp-menu{position:absolute;z-index:50;min-width:170px;padding:4px;background:var(--bg-elev);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
.sp-menu-item{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:0;background:none;color:var(--text);text-align:left;border-radius:5px;cursor:pointer;font-size:12px}
.sp-menu-item:hover{background:var(--accent-soft,var(--bg-elev2))}
.sp-menu-icon{width:16px;text-align:center}
.sp-menu-note{margin-left:auto;font-size:11px}
.sp-menu-empty{padding:8px;color:var(--text-dim)}

/* built-in tabs */
.sp-bar{display:flex;align-items:center;gap:4px;padding:4px 6px;border-bottom:1px solid var(--border);flex:0 0 auto;min-height:28px;background:var(--bg)}
.sp-bar .sp-grow{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-bar .sp-btn{font-size:13px}
.sp-scroll{flex:1 1 auto;overflow:auto;min-height:0}
.sp-tree{list-style:none;margin:0;padding:2px 0}
.sp-tree ul{list-style:none;margin:0;padding:0}
.sp-row{display:flex;align-items:center;gap:4px;padding:2px 6px;cursor:pointer;white-space:nowrap;border-radius:3px}
.sp-row:hover{background:var(--bg-elev)}
.sp-row.sel{background:var(--accent-soft,var(--bg-elev2))}
.sp-row.drop{outline:1px dashed var(--accent)}
.sp-row .tw{width:12px;flex:0 0 12px;text-align:center;color:var(--text-dim);font-size:10px}
.sp-row .nm{overflow:hidden;text-overflow:ellipsis}
.sp-row.dot .nm{opacity:.6}
.sp-drophint{position:absolute;inset:0;border:2px dashed var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent);pointer-events:none;display:flex;align-items:center;justify-content:center;font-weight:600}
.sp-pre{margin:0;padding:8px 10px;font:11.5px/1.5 var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);white-space:pre;tab-size:4}
.sp-pre.wrap{white-space:pre-wrap;word-break:break-word}
.sp-edit{flex:1 1 auto;width:100%;box-sizing:border-box;border:0;outline:0;resize:none;padding:8px 10px;background:var(--bg);color:var(--text);font:11.5px/1.5 var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);tab-size:4}
.sp-note{padding:6px 10px;color:var(--text-dim)}
.sp-st{display:inline-block;min-width:16px;text-align:center;font:600 10px/16px var(--font-mono,monospace);border-radius:3px;flex:0 0 auto}
.sp-st.M{color:#e2a33b}.sp-st.A,.sp-st.U{color:#3fb950}.sp-st.D{color:#f85149}.sp-st.R{color:#58a6ff}
.sp-diff .add{background:color-mix(in srgb,#3fb950 14%,transparent)}
.sp-diff .del{background:color-mix(in srgb,#f85149 14%,transparent)}
.sp-diff .hunk{color:var(--accent)}
.sp-diff .meta{color:var(--text-dim)}
.sp-diff{border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--bg-elev);overflow-x:auto}
`;
