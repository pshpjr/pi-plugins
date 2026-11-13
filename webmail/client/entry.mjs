import { esc } from "@pi-web-ui/plugin-sdk/client";

const IS_KO = /^ko/i.test(String(globalThis.document?.documentElement?.lang || globalThis.navigator?.language || ""));
const KO = {
	"{subject}（译：{translated}）": "{subject} (번역: {translated})",
	"📬 邮件 #{uid}：{subject}": "📬 메일 #{uid}: {subject}",
	"发件人：{from}": "보낸 사람: {from}",
	"链接": "링크",
	"…（内容过长已截断）": "…(내용이 길어 잘렸습니다)",
	"👈 从左侧选择一封邮件查看内容": "👈 왼쪽에서 메일을 선택하면 내용이 표시됩니다",
	"📬 网页邮箱": "📬 웹메일",
	"写邮件": "메일 쓰기",
	"✉ 写信": "✉ 메일 쓰기",
	"邮箱设置": "메일함 설정",
	"⚙ 设置": "⚙ 설정",
	"刷新列表": "목록 새로고침",
	"刷新": "새로고침",
	"缺少运行依赖（imapflow / mailparser / nodemailer），正在后台自动安装；也可手动": "실행에 필요한 의존성(imapflow / mailparser / nodemailer)이 없어 백그라운드에서 자동 설치 중입니다. 직접 설치하려면",
	"立即安装": "지금 설치",
	"搜索主题 / 发件人…": "제목 / 보낸 사람 검색…",
	"搜索": "검색",
	"未读": "읽지 않음",
	"⚙ 邮箱设置": "⚙ 메일함 설정",
	"关闭": "닫기",
	"收信 IMAP": "수신 IMAP",
	"服务器": "서버",
	"端口": "포트",
	"用户名": "사용자 이름",
	"密码 / 授权码": "비밀번호 / 인증 코드",
	"使用 SSL/TLS（端口通常 993；关闭则 143）": "SSL/TLS 사용(포트는 보통 993, 끄면 143)",
	"发信 SMTP": "발신 SMTP",
	"显示发件人": "보낸 사람 표시",
	"使用 SSL/TLS（端口通常 465）": "SSL/TLS 사용(포트는 보통 465)",
	"行为": "동작",
	"轮询间隔(秒)": "폴링 간격(초)",
	"翻译引擎": "번역 엔진",
	"⚡ 快速公共引擎（免 Token · 速度快）": "⚡ 빠른 공용 엔진(토큰 불필요 · 속도 빠름)",
	"🤖 跟随主会话当前模型": "🤖 메인 세션의 현재 모델 사용",
	"新邮件桌面通知条": "새 메일 데스크톱 알림",
	"插件更新": "플러그인 업데이트",
	"从 GitHub 拉取最新版本覆盖安装（保留配置；依赖会自动重装）": "GitHub에서 최신 버전을 가져와 덮어 설치합니다(설정 유지, 의존성 자동 재설치)",
	"更新到最新版": "최신 버전으로 업데이트",
	"更新在可见终端执行，完成后刷新页面加载新版本。": "업데이트는 보이는 터미널에서 실행되며, 완료 후 페이지를 새로고침하면 새 버전이 로드됩니다.",
	"凭据明文保存在本机 &lt;dataDir&gt;/plugins/webmail/config.json，不上传、重装插件不丢失。保存后立即生效。": "자격 증명은 이 PC의 &lt;dataDir&gt;/plugins/webmail/config.json에 평문으로 저장되며, 외부로 전송되지 않고 플러그인을 다시 설치해도 유지됩니다. 저장 즉시 적용됩니다.",
	"保存并应用": "저장 후 적용",
	"✉ 写邮件": "✉ 메일 쓰기",
	"收件人 to@example.com": "받는 사람 to@example.com",
	"主题": "제목",
	"正文…": "본문…",
	"HTML 正文（自动生成纯文本降级）": "HTML 본문(일반 텍스트 대체본 자동 생성)",
	"取消": "취소",
	"发送": "보내기",
	"⚡ 快速引擎": "⚡ 빠른 엔진",
	"🤖 当前会话模型": "🤖 현재 세션 모델",
	"未知": "알 수 없음",
	"未配置": "미설정",
	"尚未配置 IMAP 账号": "IMAP 계정이 설정되지 않았습니다",
	"已连接": "연결됨",
	"已保存（输入可覆盖）": "저장됨(입력하면 덮어씁니다)",
	"密码": "비밀번호",
	"安装中…": "설치 중…",
	"{n} 封未读": "{n}통 읽지 않음",
	"没有匹配的邮件": "일치하는 메일이 없습니다",
	"🌐 翻译中…": "🌐 번역 중…",
	"🌐 显示原文": "🌐 원문 보기",
	"🌐 显示译文": "🌐 번역문 보기",
	"🌐 翻译": "🌐 번역",
	"英文": "영어",
	"中文": "중국어",
	"AI 大模型": "AI 모델",
	" · ⚡ 快速引擎": " · ⚡ 빠른 엔진",
	"🌐 译文（已译为{lang}{engine}）": "🌐 번역문({lang} 번역{engine})",
	"切换模型并重新翻译": "모델을 전환해 다시 번역",
	"复制译文": "번역문 복사",
	"收起原文": "원문 접기",
	"对照原文": "원문 함께 보기",
	"【原文】": "【원문】",
	"译：{s}": "번역: {s}",
	" · 📎 含附件（正文下方不展示）": " · 📎 첨부 파일 있음(본문 아래에는 표시되지 않음)",
	"标为未读": "읽지 않음으로 표시",
	"标为已读": "읽음으로 표시",
	"选择翻译使用的 AI 模型或引擎": "번역에 사용할 AI 모델 또는 엔진 선택",
	"调起统一模型选择器点选模型": "통합 모델 선택기 열기",
	"将此邮件引用到主对话输入框": "이 메일을 메인 대화 입력창에 인용",
	"💬 引用到对话": "💬 대화에 인용",
	"回复": "답장",
	"删除": "삭제",
	"✓ 已复制引用": "✓ 인용 복사됨",
	"已复制！": "복사되었습니다!",
	"webmail 更新": "webmail 업데이트",
};
function tr(s, vars) {
	let out = (IS_KO && KO[s]) || s;
	if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
	return out;
}

function fmtDate(iso) {
	if (!iso) return "";
	const d = new Date(iso);
	const today = new Date();
	return d.toDateString() === today.toDateString()
		? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
		: d.toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function shortDomain(rawUrl) {
	try {
		const u = new URL(rawUrl);
		const parts = u.hostname.replace(/^www\./i, "").split(".");
		if (parts.length > 2) {
			const tail2 = parts.slice(-2).join(".");
			if (/^(com|co|org|net|edu|gov)\.[a-z]{2}$/i.test(tail2) && parts.length >= 3) {
				return parts.slice(-3).join(".");
			}
			return tail2;
		}
		return parts.join(".");
	} catch {
		return tr("链接");
	}
}

function renderInlineLinks(line) {
	const cleaned = String(line ?? "").replace(
		/\[https?:\/\/[^\s\]]+\.(?:png|jpe?g|gif|svg|webp|ico)(?:\?[^\s\]]*)?\]/gi,
		"",
	);

	const urlRegex = /\[(https?:\/\/[^\s\]]+)\]|(https?:\/\/[^\s<>")\]]+)/gi;
	let out = "";
	let lastIdx = 0;
	let m;
	while ((m = urlRegex.exec(cleaned)) !== null) {
		out += esc(cleaned.slice(lastIdx, m.index));
		const rawUrl = m[1] || m[2];
		const domain = shortDomain(rawUrl);
		out += `<a class="mail-link-chip" href="${esc(rawUrl)}" target="_blank" rel="noopener noreferrer" title="${esc(rawUrl)}">🔗 ${esc(domain)} ↗</a>`;
		lastIdx = urlRegex.lastIndex;
	}
	out += esc(cleaned.slice(lastIdx));
	return out;
}

function cleanMailPlainText(raw) {
	return String(raw ?? "")
		.replace(/\r\n/g, "\n")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&copy;/gi, "©")
		.replace(/&ndash;/gi, "–")
		.replace(/&mdash;/gi, "—")
		.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
		.replace(/@media[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, "\n")
		.replace(/(?:^|\n)[ \t]*(?:[a-z0-9_.*#\-:>+, \t]+\n)*[ \t]*[a-z0-9_.*#\-:>+, \t]+\{[^{}]*\}/gi, "\n")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function formatMailBody(text, truncated = false) {
	const raw = cleanMailPlainText(text);
	const lines = raw.split("\n");
	const blocks = [];
	let inList = false;
	let inFooter = false;
	let paraLines = [];

	const flushPara = () => {
		if (!paraLines.length) return;
		const content = paraLines.map(renderInlineLinks).join("<br/>");
		if (content.trim()) blocks.push(`<p>${content}</p>`);
		paraLines = [];
	};
	const closeList = () => {
		if (inList) {
			blocks.push("</ul>");
			inList = false;
		}
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (/^\[https?:\/\/[^\s\]]+\.(?:png|jpe?g|gif|svg|webp|ico)(?:\?[^\s\]]*)?\]$/i.test(trimmed)) {
			continue;
		}
		if (/^(--+|___+|\*{3,})$/.test(trimmed)) {
			flushPara();
			closeList();
			if (!inFooter) {
				blocks.push('<hr class="mail-hr"/><div class="mail-footer">');
				inFooter = true;
			} else {
				blocks.push('<hr class="mail-hr"/>');
			}
			continue;
		}
		if (!trimmed) {
			flushPara();
			closeList();
			continue;
		}
		const listMatch = trimmed.match(/^([*\-•])\s+(.*)$/);
		if (listMatch) {
			flushPara();
			if (!inList) {
				blocks.push("<ul>");
				inList = true;
			}
			blocks.push(`<li>${renderInlineLinks(listMatch[2])}</li>`);
			continue;
		}
		if (trimmed.startsWith(">")) {
			flushPara();
			closeList();
			blocks.push(`<blockquote>${renderInlineLinks(trimmed.replace(/^>+\s*/, ""))}</blockquote>`);
			continue;
		}
		closeList();
		paraLines.push(line);
	}
	flushPara();
	closeList();
	if (inFooter) blocks.push("</div>");
	if (truncated) blocks.push('<p style="opacity:.55;font-size:12px">' + tr("…（内容过长已截断）") + '</p>');
	return blocks.join("");
}

const EMPTY_READER = `<div class="empty-reader">${tr("👈 从左侧选择一封邮件查看内容")}</div>`;

export default {
	mount(container, ctx) {
		container.innerHTML = `
<div class="wmx">
	<style>
		.wmx { max-width: 1100px; margin: 0 auto; font-size: 13px; display: grid; gap: 10px; }
		.wmx-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
		.wmx h2 { margin: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
		.wmx .chip {
			font-size: 11px; padding: 1px 8px; border-radius: 99px;
			border: 1px solid var(--border, #333); opacity: .85; font-weight: normal;
		}
		.wmx .chip.ok { color: var(--green, #4ade80); border-color: color-mix(in srgb, var(--green, #4ade80) 40%, transparent); }
		.wmx .chip.err { color: var(--red, #f87171); border-color: color-mix(in srgb, var(--red, #f87171) 40%, transparent); }
		.wmx .chip.badge { color: var(--amber, #fbbf24); }
		.wmx .head-actions { margin-left: auto; display: flex; gap: 6px; align-items: center; }
		.wmx button {
			background: var(--bg-elev, #16161d); color: inherit;
			border: 1px solid var(--border, #333); border-radius: 6px;
			padding: 3px 10px; cursor: pointer; font: inherit; font-size: 12px;
		}
		.wmx .head-actions button { padding: 2px 9px; opacity: .85; }
		.wmx .head-actions button:hover { opacity: 1; border-color: var(--accent, #7c5cff); }
		.wmx .btn-compose { color: var(--accent, #7c5cff); border-color: color-mix(in srgb, var(--accent, #7c5cff) 45%, transparent); background: transparent; opacity: 1; }
		.wmx button.primary { background: var(--accent, #7c5cff); color: var(--accent-contrast, #fff); border-color: transparent; }
		.wmx button.danger:hover { color: var(--red, #f87171); border-color: var(--red, #f87171); }
		.wmx input, .wmx select, .wmx textarea {
			background: var(--bg-elev, #16161d); color: inherit;
			border: 1px solid var(--border, #333); border-radius: 6px;
			padding: 5px 8px; font: inherit; font-size: 12px; resize: vertical;
		}
		.wmx .hint { opacity: .55; font-size: 11px; margin: -4px 0 0; }
		.wmx .hint button { padding: 1px 8px; }

		/* 左右结构 */
		.wmx-body { display: grid; grid-template-columns: minmax(300px, 42%) 1fr; gap: 12px; align-items: start; }
		@media (max-width: 760px) { .wmx-body { grid-template-columns: 1fr; } }
		.pane-list { display: grid; gap: 8px; min-width: 0; }
		.wmx .toolbar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
		.wmx .toolbar input[type="search"] { flex: 1; min-width: 120px; }
		.wmx ul.maillist {
			list-style: none; margin: 0; padding: 0; display: grid; gap: 5px;
			max-height: calc(100vh - 260px); max-height: calc(100dvh - 260px); overflow: auto;
		}
		.wmx ul.maillist li {
			border: 1px solid var(--border, #333); border-radius: 7px;
			padding: 6px 10px; cursor: pointer; display: grid;
			grid-template-columns: 1fr auto; gap: 2px 10px; align-items: baseline;
		}
		.wmx ul.maillist li:hover { border-color: var(--accent, #7c5cff); }
		.wmx ul.maillist li.active { border-color: var(--accent, #7c5cff); background: color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent); }
		.wmx ul.maillist li.unread { border-left: 3px solid var(--amber, #fbbf24); }
		.wmx ul.maillist .from {
			font-size: 12px; opacity: .8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
		}
		.wmx ul.maillist .subj {
			grid-column: 1 / -1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
		}
		.wmx ul.maillist .date { opacity: .5; font-size: 11px; white-space: nowrap; }
		.wmx .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--amber, #fbbf24); margin-right: 5px; }

		/* 右侧阅读区 */
		.wmx .reader {
			border: 1px solid var(--border, #333); border-radius: 8px;
			padding: 12px 14px; display: grid; gap: 8px; align-self: stretch;
			min-height: 320px; align-content: start;
		}
		.wmx .empty-reader { display: grid; place-content: center; height: 100%; min-height: 300px; opacity: .4; }
		.wmx .reader .body {
			margin: 0; word-break: break-word; overflow-wrap: anywhere;
			font-size: 13.5px; line-height: 1.7;
			max-height: calc(100vh - 320px); max-height: calc(100dvh - 320px); overflow: auto;
			background: var(--bg-elev, #16161d); border-radius: 8px; padding: 14px 16px;
		}
		.wmx .reader .body p { margin: 0 0 10px; }
		.wmx .reader .body p:last-child { margin-bottom: 0; }
		.wmx .reader .body ul { margin: 0 0 10px; padding-left: 20px; }
		.wmx .reader .body li { margin: 4px 0; }
		.wmx .reader .body blockquote {
			margin: 6px 0; padding: 4px 10px;
			border-left: 3px solid color-mix(in srgb, var(--accent, #7c5cff) 55%, var(--border, #333));
			opacity: .85;
		}
		.wmx .mail-hr { border: 0; border-top: 1px dashed var(--border, #333); margin: 12px 0; opacity: .6; }
		.wmx .mail-footer { font-size: 12px; opacity: .65; line-height: 1.55; }
		.wmx .mail-link-chip {
			display: inline-flex; align-items: center; gap: 3px;
			padding: 1px 8px; margin: 0 2px; border-radius: 99px;
			font-size: 11.5px; line-height: 1.5; text-decoration: none;
			color: var(--accent, #7c5cff);
			background: color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent);
			border: 1px solid color-mix(in srgb, var(--accent, #7c5cff) 30%, transparent);
			vertical-align: baseline; white-space: nowrap;
		}
		.wmx .mail-link-chip:hover {
			background: color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent);
			text-decoration: none;
		}
		.wmx .reader .actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
		.wmx .reader .actions .act-translate {
			color: var(--accent, #7c5cff);
			border-color: color-mix(in srgb, var(--accent, #7c5cff) 45%, var(--border, #333));
		}
		.wmx .reader .actions .act-translate:hover {
			background: color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent);
		}

		/* 译文卡片与主题 */
		.wmx .trans-box {
			margin-top: 8px; border: 1px solid color-mix(in srgb, var(--accent, #7c5cff) 35%, var(--border, #333));
			border-radius: 8px; background: color-mix(in srgb, var(--accent, #7c5cff) 5%, var(--bg-elev, #16161d));
			overflow: hidden;
		}
		.wmx .trans-head {
			display: flex; align-items: center; justify-content: space-between; gap: 8px;
			padding: 6px 12px; font-size: 11.5px;
			background: color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent);
			border-bottom: 1px solid color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent);
			color: var(--accent, #7c5cff); font-weight: 600;
		}
		.wmx .trans-head button { padding: 2px 8px; font-size: 11px; white-space: nowrap; flex-shrink: 0; }
		.wmx .trans-body {
			margin: 0; padding: 14px 16px;
			font-size: 13.5px; line-height: 1.7;
			max-height: calc(100vh - 340px); max-height: calc(100dvh - 340px); overflow: auto;
			background: transparent;
		}
		.wmx .trans-subj {
			font-size: 13px; font-weight: 500; margin-top: 3px;
			color: var(--accent, #7c5cff); opacity: .95;
		}

		/* 弹窗（设置 / 写信） */
		.wmx .modal-backdrop {
			position: fixed; inset: 0; z-index: 1000;
			background: rgba(0, 0, 0, .5);
			display: flex; align-items: center; justify-content: center;
		}
		/* hidden 属性的 UA 样式是 display:none，会被上面的 display:flex 覆盖——必须显式压回 */
		.wmx .modal-backdrop[hidden] { display: none; }
		.wmx .modal {
			width: min(600px, 94vw); max-height: 88vh;
			background: var(--bg, #101016); border: 1px solid var(--border, #333);
			border-radius: 12px; padding: 0; box-shadow: 0 18px 48px rgba(0,0,0,.45);
			display: flex; flex-direction: column; overflow: hidden;
		}
		.wmx .modal-head {
			flex-shrink: 0;
			padding: 12px 16px;
			border-bottom: 1px solid var(--border, #333);
			display: flex; align-items: center; justify-content: space-between; gap: 10px;
		}
		.wmx .modal-head b { font-size: 14px; }
		.wmx .modal-head .modal-close { flex-shrink: 0; width: 28px; height: 28px; padding: 0; line-height: 1; font-size: 13px; }
		.wmx .modal-body { overflow: auto; min-height: 0; padding: 12px 16px 16px; }
		.wmx .cfg fieldset {
			border: 1px solid var(--border, #333); border-radius: 8px;
			display: grid; grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr); gap: 6px 10px;
			padding: 8px 10px; align-items: center; margin: 8px 0 0;
		}
		.wmx .cfg fieldset legend { font-size: 11px; opacity: .6; padding: 0 6px; }
		.wmx .cfg label { font-size: 12px; opacity: .7; }
		.wmx .cfg .full { grid-column: 1 / -1; display: flex; gap: 6px; align-items: center; }
		.wmx form.compose input, .wmx form.compose textarea { width: 100%; box-sizing: border-box; }
		.wmx form.compose .row { display: flex; gap: 8px; justify-content: flex-end; }

		/* 手机竖屏（360~430px）：单列 + 大字号防 iOS 聚焦缩放 + 大点击区 + 底部弹层。桌面端零变化。 */
		@media (max-width: 640px) {
			.wmx input, .wmx select, .wmx textarea { font-size: 16px; }
			.wmx button { min-height: 36px; }
			/* 设置弹窗：label/input 上下排；占位空元素不占行 */
			.wmx .cfg fieldset { grid-template-columns: 1fr; }
			.wmx .cfg fieldset label:empty, .wmx .cfg fieldset span:empty { display: none; }
			/* 弹窗变底部弹层，底部留 safe-area */
			.wmx .modal-backdrop { align-items: flex-end; }
			.wmx .modal {
				width: 100%; max-height: 92vh; max-height: 92dvh;
				border-radius: 14px 14px 0 0;
			}
			.wmx .modal-body { padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
		}
	</style>

	<header class="wmx-head">
		<h2>${tr("📬 网页邮箱")}
			<span class="chip st">…</span>
			<span class="chip unseen badge" hidden></span>
		</h2>
		<div class="head-actions">
			<button class="btn-compose" title="${tr("写邮件")}">${tr("✉ 写信")}</button>
			<button class="btn-gear" title="${tr("邮箱设置")}">${tr("⚙ 设置")}</button>
			<button class="btn-refresh" title="${tr("刷新列表")}">${tr("刷新")}</button>
		</div>
	</header>
	<p class="hint deps" hidden>${tr("缺少运行依赖（imapflow / mailparser / nodemailer），正在后台自动安装；也可手动")}
		<button class="btn-deps">${tr("立即安装")}</button></p>

	<div class="wmx-body">
		<section class="pane-list">
			<div class="toolbar">
				<select class="folder"><option value="INBOX">INBOX</option></select>
				<input type="search" class="q" placeholder="${tr("搜索主题 / 发件人…")}" />
				<button class="btn-search">${tr("搜索")}</button>
				<label style="opacity:.7;font-size:12px"><input type="checkbox" class="unseen-only" /> ${tr("未读")}</label>
			</div>
			<ul class="maillist"></ul>
		</section>
		<section class="reader">${EMPTY_READER}</section>
	</div>

	<div class="modal-backdrop cfg-modal" hidden>
		<div class="modal" role="dialog" aria-label="${tr("邮箱设置")}">
			<div class="modal-head"><b>${tr("⚙ 邮箱设置")}</b><button class="modal-close" title="${tr("关闭")}">✕</button></div>
			<div class="modal-body">
			<form class="cfg">
				<fieldset>
					<legend>${tr("收信 IMAP")}</legend>
					<label>${tr("服务器")}</label><input name="imapHost" placeholder="imap.example.com" />
					<label>${tr("端口")}</label><input name="imapPort" type="number" placeholder="993" />
					<label>${tr("用户名")}</label><input name="imapUser" autocomplete="off" />
					<label>${tr("密码 / 授权码")}</label><input name="imapPass" type="password" autocomplete="new-password" />
					<label class="full"><input type="checkbox" name="imapTls" /> ${tr("使用 SSL/TLS（端口通常 993；关闭则 143）")}</label>
				</fieldset>
				<fieldset>
					<legend>${tr("发信 SMTP")}</legend>
					<label>${tr("服务器")}</label><input name="smtpHost" placeholder="smtp.example.com" />
					<label>${tr("端口")}</label><input name="smtpPort" type="number" placeholder="465" />
					<label>${tr("用户名")}</label><input name="smtpUser" autocomplete="off" />
					<label>${tr("密码 / 授权码")}</label><input name="smtpPass" type="password" autocomplete="new-password" />
					<label>${tr("显示发件人")}</label><input name="smtpFrom" placeholder="Me &lt;me@example.com&gt;" />
					<label class="full"><input type="checkbox" name="smtpTls" /> ${tr("使用 SSL/TLS（端口通常 465）")}</label>
				</fieldset>
				<fieldset>
					<legend>${tr("行为")}</legend>
					<label>${tr("轮询间隔(秒)")}</label><input name="pollSec" type="number" min="15" />
					<label>${tr("翻译引擎")}</label>
					<select name="transModel">
						<option value="">${tr("⚡ 快速公共引擎（免 Token · 速度快）")}</option>
						<option value="current">${tr("🤖 跟随主会话当前模型")}</option>
					</select>
					<label class="full"><input type="checkbox" name="notifyEnabled" /> ${tr("新邮件桌面通知条")}</label>
				</fieldset>
				<fieldset>
					<legend>${tr("插件更新")}</legend>
					<label class="full" style="justify-content:space-between">
						<span style="opacity:.75">${tr("从 GitHub 拉取最新版本覆盖安装（保留配置；依赖会自动重装）")}</span>
						<button type="button" class="btn-update">${tr("更新到最新版")}</button>
					</label>
					<p class="hint full">${tr("更新在可见终端执行，完成后刷新页面加载新版本。")}</p>
				</fieldset>
				<p class="hint">${tr("凭据明文保存在本机 &lt;dataDir&gt;/plugins/webmail/config.json，不上传、重装插件不丢失。保存后立即生效。")}</p>
				<div class="row" style="display:flex;justify-content:flex-end"><button type="submit" class="primary">${tr("保存并应用")}</button></div>
			</form>
			</div>
		</div>
	</div>

	<div class="modal-backdrop compose-modal" hidden>
		<div class="modal" role="dialog" aria-label="${tr("写邮件")}">
			<div class="modal-head"><b>${tr("✉ 写邮件")}</b><button class="modal-close" title="${tr("关闭")}">✕</button></div>
			<div class="modal-body">
			<form class="compose">
				<input name="to" placeholder="${tr("收件人 to@example.com")}" required />
				<input name="subject" placeholder="${tr("主题")}" />
				<textarea name="body" rows="8" placeholder="${tr("正文…")}"></textarea>
				<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
					<label style="font-size:12px;opacity:.75;display:inline-flex;align-items:center;gap:5px;cursor:pointer">
						<input type="checkbox" name="isHtml" /> ${tr("HTML 正文（自动生成纯文本降级）")}
					</label>
					<div class="row" style="margin:0">
						<button type="button" class="btn-cancel">${tr("取消")}</button>
						<button type="submit" class="primary">${tr("发送")}</button>
					</div>
				</div>
			</form>
			</div>
		</div>
	</div>
</div>`;

		const root = container.querySelector(".wmx");
		const $ = (sel) => root.querySelector(sel);
		const st = { mails: [], activeUid: null, activeMail: null, availableModels: [], transModel: "" };

		function shortModelLabel(id) {
			const s = String(id ?? "");
			const slash = s.indexOf("/");
			return slash >= 0 ? s.slice(slash + 1) : s;
		}

		function getModelOptionsHtml(selectedVal) {
			const seen = new Set(["", "current"]);
			const opts = [
				{ val: "", text: tr("⚡ 快速引擎") },
				{ val: "current", text: tr("🤖 当前会话模型") },
			];
			let hostModels = [];
			try {
				const hostBridge = ctx?.host || window.__piWebUiHost || window.__piPluginHost;
				hostModels = hostBridge?.models?.list?.() || [];
			} catch {}
			for (const m of [...hostModels, ...(st.availableModels || [])]) {
				const id =
					typeof m === "string"
						? m
						: m?.provider && m?.id && !String(m.id).includes("/")
							? `${m.provider}/${m.id}`
							: m?.id;
				if (id && !seen.has(id)) {
					seen.add(id);
					opts.push({ val: id, text: `🤖 ${shortModelLabel(id)}` });
				}
			}
			const presets = [
				"deepseek/deepseek-chat",
				"anthropic/claude-3-7-sonnet",
				"openai/gpt-4o",
				"openai/gpt-4o-mini",
				"google/gemini-2.5-pro",
			];
			for (const id of presets) {
				if (!seen.has(id)) {
					seen.add(id);
					opts.push({ val: id, text: `🤖 ${shortModelLabel(id)}` });
				}
			}
			if (selectedVal && !seen.has(selectedVal)) {
				opts.push({ val: selectedVal, text: `🤖 ${shortModelLabel(selectedVal)}` });
			}
			return opts
				.map(
					(o) =>
						`<option value="${esc(o.val)}" title="${esc(o.val || o.text)}"${o.val === selectedVal ? " selected" : ""}>${esc(o.text)}</option>`,
				)
				.join("");
		}

		function openModal(sel) {
			$(sel).hidden = false;
			const first = $(sel).querySelector("input, textarea");
			if (first) first.focus();
		}
		function closeModal(sel) {
			$(sel).hidden = true;
		}

		function setStateChips(state) {
			const chip = $(".st");
			chip.textContent =
				(IS_KO && state.status?.startsWith("连接失败") ? "연결 실패" + state.status.slice(4).replace(/^：/, ": ") : tr(state.status)) ||
				tr("未知");
			chip.className = `chip st ${state.configured ? (state.status.startsWith("连接失败") ? "err" : "ok") : ""}`;
			const badge = $(".unseen");
			badge.hidden = !state.unseen;
			badge.textContent = tr("{n} 封未读", { n: state.unseen });
			$(".deps").hidden = state.depsOk || state.depsInstalling;
			$(".btn-deps").disabled = Boolean(state.depsInstalling);
			$(".btn-deps").textContent = state.depsInstalling ? tr("安装中…") : tr("立即安装");
		}

		function fillSettings(cfg) {
			cfg = cfg?.config ?? cfg;
			if (!cfg) return;
			const f = $(".cfg");
			f.imapHost.value = cfg.imap?.host ?? "";
			f.imapPort.value = cfg.imap?.port ?? 993;
			f.imapUser.value = cfg.imap?.user ?? "";
			f.imapPass.placeholder = cfg.imap?.hasPass ? tr("已保存（输入可覆盖）") : tr("密码");
			f.imapTls.checked = cfg.imap?.tls !== false;
			f.smtpHost.value = cfg.smtp?.host ?? "";
			f.smtpPort.value = cfg.smtp?.port ?? 465;
			f.smtpUser.value = cfg.smtp?.user ?? "";
			f.smtpPass.placeholder = cfg.smtp?.hasPass ? tr("已保存（输入可覆盖）") : tr("密码");
			f.smtpFrom.value = cfg.smtp?.from ?? "";
			f.smtpTls.checked = cfg.smtp?.tls !== false;
			f.pollSec.value = cfg.pollSec ?? 60;
			f.notifyEnabled.checked = cfg.notifyEnabled !== false;

			const sel = f.transModel;
			if (sel) {
				const currentVal = cfg.transModel ?? "";
				st.transModel = currentVal;
				sel.innerHTML = getModelOptionsHtml(currentVal);
				sel.value = currentVal;
			}
		}

		function renderList() {
			const ul = $(".maillist");
			if (!st.mails.length) {
				ul.innerHTML = `<li class="empty" style="list-style:none;border:0;cursor:default;display:block;text-align:center;opacity:.45;padding:24px 0">${tr("没有匹配的邮件")}</li>`;
				return;
			}
			ul.innerHTML = st.mails
				.map(
					(m) => `
<li data-uid="${m.uid}" class="${m.seen ? "" : "unread"}${m.uid === st.activeUid ? " active" : ""}">
	<span class="from">${m.seen ? "" : '<span class="dot"></span>'}${esc(m.fromName || m.from)}</span>
	<span class="date">${esc(fmtDate(m.date))}</span>
	<span class="subj">${esc(m.subject)}</span>
</li>`,
				)
				.join("");
		}

		function getTranslateBtnLabel(mail) {
			if (mail._translating) return tr("🌐 翻译中…");
			if (mail._translation) {
				return mail._showTranslation ? tr("🌐 显示原文") : tr("🌐 显示译文");
			}
			return tr("🌐 翻译");
		}

		function renderReader(mail) {
			st.activeMail = mail;
			const r = $(".reader");
			const hasTrans = Boolean(mail._translation);
			const showTrans = hasTrans && mail._showTranslation !== false;
			const curModel = mail._translation?.model || st.transModel || "";

			let transHtml = "";
			if (showTrans) {
				const langLabel = mail._translation.targetLang === "en" ? tr("英文") : tr("中文");
				const engineLabel =
					mail._translation.engine === "llm"
						? ` · 🤖 ${shortModelLabel(mail._translation.model || tr("AI 大模型"))}`
						: mail._translation.model
							? ` · ⚡ ${shortModelLabel(mail._translation.model)}`
							: tr(" · ⚡ 快速引擎");
				transHtml = `
<div class="trans-box">
	<div class="trans-head">
		<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0">
			<span>${tr("🌐 译文（已译为{lang}{engine}）", { lang: langLabel, engine: esc(engineLabel) })}</span>
			<select class="sel-card-model" title="${tr("切换模型并重新翻译")}" style="padding:1px 5px;font-size:11px;height:22px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--bg,#101016);color:inherit;border:1px solid color-mix(in srgb,var(--accent,#7c5cff) 40%,var(--border,#333));border-radius:4px;cursor:pointer">
				${getModelOptionsHtml(curModel)}
			</select>
		</div>
		<div style="display:flex;gap:6px;flex-shrink:0">
			<button type="button" class="act-copy-trans">${tr("复制译文")}</button>
			<button type="button" class="act-toggle-orig">${mail._showOrig ? tr("收起原文") : tr("对照原文")}</button>
		</div>
	</div>
	<div class="body md trans-body">${formatMailBody(mail._translation.translatedText)}</div>
</div>`;
			}

			const hideOrigBody = showTrans && !mail._showOrig;
			const origHtml = hideOrigBody
				? ""
				: `${showTrans ? '<div style="font-size:11px;opacity:.55;margin-top:6px">' + tr("【原文】") + '</div>' : ""}<div class="body md">${formatMailBody(mail.text, mail.truncated)}</div>`;

			r.innerHTML = `
<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">
	<b style="font-size:14px">${esc(mail.subject)}</b>
	<span style="opacity:.55;font-size:11px">${esc(fmtDate(mail.date))}</span>
</div>
${showTrans && mail._translation.translatedSubject ? `<div class="trans-subj">${tr("译：{s}", { s: esc(mail._translation.translatedSubject) })}</div>` : ""}
<div style="opacity:.7;font-size:12px">${esc(mail.fromName)} &lt;${esc(mail.from)}&gt; → ${esc(mail.to)}
	${mail.hasAttachments ? tr(" · 📎 含附件（正文下方不展示）") : ""}</div>
${transHtml}
${origHtml}
<div class="actions">
	<button class="act-toggle-seen">${mail.seen ? tr("标为未读") : tr("标为已读")}</button>
	<div style="display:inline-flex;align-items:center;gap:4px;min-width:0">
		<button class="act-translate"${mail._translating ? " disabled" : ""}>${getTranslateBtnLabel(mail)}</button>
		<select class="sel-reader-model" title="${tr("选择翻译使用的 AI 模型或引擎")}" style="padding:2px 6px;font-size:12px;height:28px;max-width:155px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--bg-elev,#16161d);color:inherit;border:1px solid var(--border,#333);border-radius:6px;cursor:pointer">
			${getModelOptionsHtml(curModel)}
		</select>
		<button class="act-browse-model" title="${tr("调起统一模型选择器点选模型")}" style="padding:2px 7px;font-size:11px;height:28px;background:var(--bg-elev2);border:1px solid var(--border,#333);border-radius:6px;cursor:pointer">✨</button>
	</div>
	<button class="act-quote-chat" title="${tr("将此邮件引用到主对话输入框")}">${tr("💬 引用到对话")}</button>
	<button class="act-reply">${tr("回复")}</button>
	<button class="act-delete danger">${tr("删除")}</button>
</div>`;
			$(".act-toggle-seen").onclick = () => ctx.send({ action: "mark", uids: [mail.uid], seen: !mail.seen });
			$(".act-delete").onclick = () => ctx.send({ action: "delete", uids: [mail.uid] });
			$(".act-reply").onclick = () => openCompose({ to: mail.from, subject: `Re: ${mail.subject}` });

			const quoteBtn = $(".act-quote-chat");
			if (quoteBtn) {
				quoteBtn.onclick = () => {
					const rawContent =
						showTrans && mail._translation?.translatedText ? mail._translation.translatedText : mail.text;
					const cleanBody = cleanMailPlainText(rawContent)
						.replace(/\[https?:\/\/[^\s\]]+\.(?:png|jpe?g|gif|svg|webp|ico)(?:\?[^\s\]]*)?\]/gi, "")
						.replace(/\[(https?:\/\/[^\s\]]+)\]/gi, (_, u) => `[${shortDomain(u)}](${u})`)
						.trim();
					const subjLine =
						showTrans && mail._translation?.translatedSubject && mail._translation.translatedSubject !== mail.subject
							? tr("{subject}（译：{translated}）", { subject: mail.subject, translated: mail._translation.translatedSubject })
							: mail.subject;
					const fromStr = mail.fromName ? `${mail.fromName} <${mail.from}>` : mail.from;
					const quoteText = [
						tr("📬 邮件 #{uid}：{subject}", { uid: mail.uid, subject: subjLine }),
						tr("发件人：{from}", { from: fromStr }) + (mail.date ? ` · ${fmtDate(mail.date)}` : ""),
						"",
						cleanBody,
					].join("\n");

					const hostBridge = ctx?.host || window.__piWebUiHost;
					if (hostBridge?.compose) {
						hostBridge.compose({
							attachments: [
								{
									path: "",
									name: `📬 ${mail.subject}`,
									mode: "quote",
									quote: {
										text: quoteText,
										messageId: `📬 #${mail.uid} ${mail.subject}`,
										role: "attachment",
									},
									key: `mail-quote-${mail.uid}`,
								},
							],
						});
						hostBridge.setView?.("chat");
					} else {
						navigator.clipboard?.writeText?.(quoteText);
						quoteBtn.textContent = tr("✓ 已复制引用");
						setTimeout(() => {
							if (quoteBtn) quoteBtn.textContent = tr("💬 引用到对话");
						}, 1500);
					}
				};
			}

			const triggerTranslate = (modelToUse) => {
				mail._translating = true;
				renderReader(mail);
				ctx.send({
					action: "translate",
					uid: mail.uid,
					subject: mail.subject,
					text: mail.text,
					model: modelToUse !== undefined ? modelToUse : st.transModel,
				});
			};

			const transBtn = $(".act-translate");
			if (transBtn) {
				transBtn.onclick = () => {
					if (mail._translating) return;
					if (mail._translation) {
						mail._showTranslation = !mail._showTranslation;
						renderReader(mail);
						return;
					}
					triggerTranslate(st.transModel);
				};
			}

			const readerModelSel = $(".sel-reader-model");
			if (readerModelSel) {
				readerModelSel.onchange = (e) => {
					const chosen = e.target.value;
					st.transModel = chosen;
					if (mail._translation) {
						triggerTranslate(chosen);
					}
				};
			}

			const browseModelBtn = $(".act-browse-model");
			if (browseModelBtn) {
				browseModelBtn.onclick = async () => {
					const host = globalThis.window?.__piWebUiHost;
					if (typeof host?.pickModel !== "function") return;
					const res = await host.pickModel({
						currentModelId: st.transModel === "current" ? undefined : st.transModel,
					});
					if (res?.ok && res.modelId) {
						st.transModel = res.modelId;
						renderReader(mail);
						if (mail._translation) {
							triggerTranslate(res.modelId);
						}
					}
				};
			}

			const cardModelSel = $(".sel-card-model");
			if (cardModelSel) {
				cardModelSel.onchange = (e) => {
					const chosen = e.target.value;
					st.transModel = chosen;
					triggerTranslate(chosen);
				};
			}

			const copyBtn = $(".act-copy-trans");
			if (copyBtn) {
				copyBtn.onclick = async () => {
					try {
						await navigator.clipboard.writeText(mail._translation.translatedText || "");
						copyBtn.textContent = tr("已复制！");
						setTimeout(() => {
							if (copyBtn) copyBtn.textContent = tr("复制译文");
						}, 1500);
					} catch {}
				};
			}

			const toggleOrigBtn = $(".act-toggle-orig");
			if (toggleOrigBtn) {
				toggleOrigBtn.onclick = () => {
					mail._showOrig = !mail._showOrig;
					renderReader(mail);
				};
			}

			if (window.matchMedia("(max-width: 640px)").matches) r.scrollIntoView({ behavior: "smooth", block: "nearest" });
		}

		function clearReader() {
			st.activeUid = null;
			st.activeMail = null;
			$(".reader").innerHTML = EMPTY_READER;
		}

		function openCompose(prefill = {}) {
			const f = $("form.compose");
			f.to.value = prefill.to ?? "";
			f.subject.value = prefill.subject ?? "";
			openModal(".compose-modal");
			(prefill.to ? f.body : f.to).focus();
		}

		async function refreshList() {
			ctx.send({
				action: "list",
				folder: $(".folder").value,
				unseenOnly: $(".unseen-only").checked,
			});
		}

		root.addEventListener("click", async (e) => {
			const li = e.target.closest("ul.maillist li[data-uid]");
			if (li) {
				st.activeUid = Number(li.dataset.uid);
				renderList();
				ctx.send({ action: "read", folder: $(".folder").value, uid: st.activeUid });
				return;
			}
			if (e.target.closest(".btn-refresh")) refreshList();
			if (e.target.closest(".btn-compose")) openCompose();
			if (e.target.closest(".btn-gear")) {
				ctx.send({ action: "get_state" });
				openModal(".cfg-modal");
			}
			if (e.target.closest(".btn-update")) {
				window.dispatchEvent(
					new CustomEvent("pi-web-ui:plugin-run-command", {
						detail: {
							title: tr("webmail 更新"),
							command: "pi-web-ui install xing-shuyin/pi-web-ui/tree/main/plugins/webmail --force",
						},
					}),
				);
				closeModal(".cfg-modal");
			}
			if (e.target.closest(".btn-deps")) ctx.send({ action: "install_deps" });
			if (e.target.closest(".btn-search")) {
				const q = $(".q").value.trim();
				if (q) ctx.send({ action: "search", query: q, folder: $(".folder").value });
				else refreshList();
			}
			for (const sel of [".cfg-modal", ".compose-modal"]) {
				const backdrop = $(sel);
				if (e.target === backdrop || e.target.closest(".modal-close")) closeModal(sel);
			}
		});
		root.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				closeModal(".compose-modal");
				closeModal(".cfg-modal");
			}
			if (e.key === "Enter" && e.target.classList.contains("q")) $(".btn-search").click();
		});
		$(".unseen-only").addEventListener("change", refreshList);

		$(".cfg").addEventListener("submit", (e) => {
			e.preventDefault();
			const f = e.target;
			const cfg = {
				imap: {
					host: f.imapHost.value.trim(),
					port: Number(f.imapPort.value) || 993,
					tls: f.imapTls.checked,
					user: f.imapUser.value.trim(),
					pass: f.imapPass.value || undefined,
				},
				smtp: {
					host: f.smtpHost.value.trim(),
					port: Number(f.smtpPort.value) || 465,
					tls: f.smtpTls.checked,
					user: f.smtpUser.value.trim(),
					pass: f.smtpPass.value || undefined,
					from: f.smtpFrom.value.trim(),
				},
				pollSec: Math.max(15, Number(f.pollSec.value) || 60),
				notifyEnabled: f.notifyEnabled.checked,
				transModel: f.transModel?.value ?? "",
			};
			for (const box of ["imap", "smtp"]) {
				for (const k of Object.keys(cfg[box])) {
					if (cfg[box][k] === undefined) delete cfg[box][k];
				}
			}
			ctx.send({ action: "save_config", config: cfg });
			closeModal(".cfg-modal");
		});

		$("form.compose").addEventListener("submit", (e) => {
			e.preventDefault();
			const f = e.target;
			const isHtml = f.isHtml?.checked;
			ctx.send({
				action: "send",
				to: f.to.value.trim(),
				subject: f.subject.value,
				body: isHtml ? undefined : f.body.value,
				html: isHtml ? f.body.value : undefined,
			});
			f.reset();
			closeModal(".compose-modal");
		});
		$("form.compose .btn-cancel").addEventListener("click", () => {
			$("form.compose").reset();
			closeModal(".compose-modal");
		});

		const off = ctx.onData((payload) => {
			const msg = payload ?? {};
			switch (msg.kind) {
				case "state":
					if (Array.isArray(msg.state?.models)) st.availableModels = msg.state.models;
					setStateChips(msg.state);
					fillSettings(msg.state ?? msg.config);
					break;
				case "mails":
					st.mails = msg.mails ?? [];
					renderList();
					break;
				case "mail":
					st.activeMail = msg.mail;
					renderReader(msg.mail);
					break;
				case "translated": {
					if (st.activeMail && st.activeMail.uid === msg.uid) {
						st.activeMail._translating = false;
						if (msg.ok) {
							st.activeMail._translation = {
								translatedSubject: msg.translatedSubject,
								translatedText: msg.translatedText,
								targetLang: msg.targetLang,
							};
							st.activeMail._showTranslation = true;
						}
						renderReader(st.activeMail);
					}
					break;
				}
				case "new-mail":
					refreshList();
					break;
				case "result":
					if (msg.action === "mark") renderList();
					if (msg.action === "delete") {
						clearReader();
						refreshList();
					}
					break;
			}
		});

		ctx.send({ action: "get_state" });
		refreshList();

		return () => {
			off();
			root.remove();
		};
	},
};
