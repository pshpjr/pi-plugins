# pi-web-ui 플러그인 모음 (github.com/pshpjr/pi-plugins)

이 레포는 pi-web-ui 플러그인의 **원본**이다. 직접 만든 것과, 업스트림 플러그인을 포크해 고친 것(주로 한국어 추가)이 같이 있다. 설치본(`<data-dir>/plugins/<id>`)은 복사본이니 직접 고치지 말 것.

서버별 정보(주소·경로·서비스 이름·설치 명령)는 커밋하지 않는 `LOCAL.md`에 있다. **먼저 `LOCAL.md`를 읽을 것.** 공개 레포라 내부 주소·계정·키는 커밋 금지.

## 현재 플러그인
| id | 종류 | 하는 일 | 붙는 곳 |
|---|---|---|---|
| `usage-meter` | 직접 만듦 | 현재 모델 제공자의 사용량·잔여 크레딧 | 하단 바 비용 칸(`setFooterStatus`) + 클릭 팝오버 |
| `context-lens` | 직접 만듦 | 현재 대화 컨텍스트 분석(dsh-context 방식) | 오른쪽 패널 탭 "Context" |
| `obsidian-vault` | 직접 만듦 | obsidian-web MCP 도구를 `vault_*` 에이전트 도구로 붙임(시작 때 `tools/list`를 받아 등록, 호출은 `/mcp`로 전달). pi-web-ui MCP 연결은 접두사 없이 늘 실려서 대신 씀 | 설정 → 도구(도구별 상시/필요할 때/끄기) |
| `notes` | 포크 | 메모·할 일·알림 | |
| `webmail` | 포크 | IMAP/SMTP 메일 | |
| `pm2-manager` | 포크 | PM2 프로세스 관리 | |
| `response-speed` | 포크 | 응답 속도 표시 | |
| `browser-use` | 포크 | AI 브라우저 | |

## 포크 규칙
- 원본: `xing-shuyin/pi-web-ui`의 `plugins/<id>` (MIT, `LICENSE-upstream`). 가져온 커밋은 `upstream.json`.
- 플러그인 `id`는 바꾸지 않는다(설치된 데이터가 id 기준으로 유지됨). 버전은 `<원본버전>-ko.N` 식으로 올린다.
- 업스트림 변경 확인: `tools/upstream-diff.sh <id>` → 원본 최신본과 지금 사본의 차이. 병합 후 `upstream.json`의 커밋을 갱신.
- 한국어 추가는 각 플러그인의 i18n 사전에 `ko` 표를 넣고 언어 감지가 `ko`를 돌려주게 한다. 고친 내용을 업스트림에 PR로 보내면 포크를 줄일 수 있다.

## 카탈로그
`catalog.json`은 pi-web-ui 플러그인 카탈로그 형식(배열, 항목마다 `id`, `name`, `version`, `icon`, `description`, `source`, `homepage`). 플러그인을 추가하거나 버전을 올리면 같이 고친다.
설치: `pi-web-ui install pshpjr/pi-plugins/<id> --force` 또는 `pi-web-ui install --catalog https://raw.githubusercontent.com/pshpjr/pi-plugins/main/catalog.json`.

## 플러그인 구조
```
<id>/manifest.json
<id>/index.mjs          서버: export default { activate(host) { ... return deactivate? } }
<id>/client/entry.mjs   브라우저: view:true 이면 export default { mount(el, ctx) → cleanup }
```
- 클라이언트 import는 `client/` 밖으로 나가면 안 됨(밖으로 나가면 번들 전체가 조용히 안 뜸).
- manifest 핵심 필드: `id`, `apiVersion: 2`, `server`, `client`, `view`, `preload`, `permissions`, `netAllowlist`, `ui`.
- permissions: `http`(host.route), `net`(host.net.fetch, `netAllowlist` 도메인만), `ui`(ui 슬롯), `fs:read` 등.

## 자주 쓰는 패턴
- **HTTP 라우트**: `host.route("GET", "/summary", (req, res) => res.json(obj))` → 브라우저에서 `/plugins-api/<id>/summary`.
  클라이언트의 base URL은 `import.meta.url`에서 `/plugins/` 앞부분을 잘라 만든다(usage-meter 참고).
- **외부 HTTP**: `await host.net.fetch(url, { method, headers })` → `{ ok, status, text, error }`. 도메인은 `netAllowlist`에 넣어야 함.
- **현재 대화**: `await host.getActiveConversation()` → `{ sessionFile, model:"provider/id", messages, stats, ... }`.
  여러 탭을 구분하려면 브라우저 URL 해시 `#s=<sessionId>`를 서버로 넘겨 `~/.pi/agent/sessions/*/*_<id>.jsonl`을 찾는다(context-lens 참고).
- **모델 변경 감지**: `host.onClientModelChanged`, `host.onConversationChanged`.
- **하단 바 텍스트 + 클릭 팝오버**: 클라이언트에서
  `window.__piWebUiHost.setFooterStatus(key, { text, tip, pluginId, content: { render(container) {...} } })`.
  주의: `ui.bottombar`의 kind `badge`는 클릭 시 플러그인 *뷰*를 열려고 해서 `view:false` 플러그인에선 빈 화면이 된다.
- **오른쪽 패널 탭**: manifest `"ui": { "rightpanel.tabs": [{ "id", "label", "icon", "kind": "view", "view": "plugin:<id>" }] }` + `view: true`.
- **모달**: `ui.modal`에 kind view 항목 → `__piWebUiHost.openModal("<id>:<itemId>")`.
- 브라우저 호스트 브리지 `window.__piWebUiHost`: setView, openModal/closeModal, setFooterStatus, onUiAction, onTheme, onLocale, models, sessions 등.
  `host.models.list()`엔 컨텍스트 윈도 크기가 없다. 필요하면 하단 바 `[data-bar-item="host:ctx"]`의 title("… / 1M")을 읽는다.

## pi 세션 JSONL 요약 (context-lens가 읽는 것)
`~/.pi/agent/sessions/<cwd>/<ts>_<sessionId>.jsonl`, version 3. 항목은 `id`/`parentId` 트리 → 마지막 항목에서 루트까지가 현재 브랜치.
- `message`: role `system`(`sections`{preamble,tools,rules,docs,addendum,project_context,skills,cwd} + `toolsAdded`), `user`, `assistant`(content: text/thinking/toolCall, `usage`{input,output,cacheRead,cacheWrite,cost.total}), `toolResult`
- `compaction`(summary, firstKeptEntryId, tokensBefore), `context_edit`(targetId, replacement), `model_change`, `thinking_level_change`, `branch_summary`, `custom_message`, `session_info`

## 테마
호스트 CSS 변수(`--bg`, `--bg-elev`, `--border`, `--text`, `--accent`, `--accent-contrast`)를 쓴다. `background: var(--accent)`면 글자는 반드시 `var(--accent-contrast)`. 버튼은 호스트 `.btn`/`.btn.primary` 재사용.

## 새 플러그인 만들 때 체크리스트
1. 이 폴더에 `<id>/` 생성(기존 플러그인 복사해 시작하는 게 빠름)
2. install → 브라우저(https://ai.pshpjr.org 또는 192.168.1.3:25808) 새로고침 → 동작 확인
3. 이 파일의 "현재 플러그인" 표와 `catalog.json`에 추가, 서버 README 체크리스트(LOCAL.md 참고)에 한 줄 추가
