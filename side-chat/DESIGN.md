# side-chat 설계 (초안, 2026-11-14)

참고만 함: QuangThai/pi-btw, pi-btw(dbachelder), pi-side-chat. 설치하지 않음.

## 구성
- **pi 확장** (`side-chat/pi-extension/`): 기능 전부. 메인 세션마다 로드됨.
- **pi-web-ui 플러그인** (`side-chat/` 기존 manifest·index.mjs·client): 같은 기능의 웹 UI. 사이드 패널 탭 kind `side-chat:chat`, `multiple: true`.
- 둘 다 pi-web-ui의 node 프로세스 하나에서 돔.

## 확정된 결정
| 항목 | 결정 |
|---|---|
| 메인→사이드 도구 | 없음. 사용자가 원할 때 사이드를 엶 |
| 사이드→메인 | 사이드 모델이 도구를 불러 메인에 steer로 넣음. 메인이 쉬고 있으면 바로 새 턴 시작 |
| 실행 위치 | 같은 프로세스 자식 세션 (확장이 `createAgentSession` 호출) |
| `/btw` 기본값 | 메인 맥락 포함 + 영구 보관 |
| `/btw:~` 하위 명령 | 목록 보기, 맥락 범위, 도구 권한 |
| 맥락 범위 선택지 | 없음 / 최근 N개 / smart / 전체 (기본: 전체). LLM 요약 방식은 넣지 않음. smart = 도구 실행 결과 제외 + 토큰 한도 안으로 자르기(규칙 기반, LLM 호출 없음). smart 결과는 저장하지 않고 매 호출마다 다시 계산(한도 설정을 바꾸면 결과도 바뀜) |
| 메인 맥락 방식 | 열 때 고정 + 조회 도구. 사이드 파일에 메인 대화를 복사하지 않고, 메인 세션 파일 경로와 열 때의 마지막 entry id만 저장해서 매 턴 그 지점까지 읽어 넣음. 그 뒤 메인 내용은 조회 도구로 읽음 |
| 기본 도구 | 읽기(read, grep, find, ls) + 메인 조회 도구 + 메인에 steer 도구 |
| 수정 도구 | 설정 파일 전역 기본값 + `/btw:~`로 채팅별 변경 |
| 저장 위치 | 별도 폴더 `~/.pi/agent/side-chats/<메인 sessionId>/` (pi-web-ui 목록·/resume에 안 보임) |
| 웹에서 열기 | 메인에 `/btw` 입력 시 사이드 패널 탭 자동 열기 + 사이드 패널에서 새로 만들기 |

## 추가 결정 (2026-11-14)
| 항목 | 결정 |
|---|---|
| 웹 플러그인 ↔ 확장 연결 | globalThis 등록부 (같은 프로세스 전제, 공식 계약 아님) |
| 명령 | `/btw [질문]`, `/btw:list`, `/btw:context`, `/btw:tools` |
| 사이드 모델 도구 | `btw_read_main`, `btw_send_to_main` |
| 사이드 모델 | 열 때 메인의 모델·thinking을 복사해 고정 |
| 화면 | 웹 사이드 패널만. pi TUI에서는 명령은 동작하고 답은 알림으로만 표시 |
| 수정 도구 | 켜면 edit, write, bash 한 묶음 |

## 기술 사항 확인 결과 (코드 확인, 실행 테스트는 안 함)
pi SDK: `@earendil-works/pi-coding-agent` (pwu/node_modules), pi-web-ui 0.120.0.

1. **자식 세션에 이 확장이 다시 로드되는 문제** → 막을 수 있음.
   - `DefaultResourceLoader({ noExtensions: true, extensionFactories: [사이드 전용 인라인 확장] })`.
   - `noExtensions`는 경로로 찾는 확장만 끔(resource-loader.js:424, 520). 인라인 factory는 따로 로드됨(:893).
   - pi-btw도 같은 목적으로 직접 만든 ResourceLoader를 씀(btw.ts `createBtwResourceLoader`).
   - 모델 인증은 pi-btw처럼 메인의 `ctx.modelRegistry`에서 provider를 옮겨 `modelRuntime`으로 넘김(`createBtwModelRuntimeOptions`).
2. **`sendUserMessage`로 시작된 턴이 웹 화면에 보이는지** → 보일 것으로 판단.
   - SDK의 `sendUserMessage`는 `prompt(text, { streamingBehavior: deliverAs, source: "extension" })`를 부름(agent-session.js:2012).
   - pi-web-ui는 세션 이벤트를 구독하고 `agent_start`를 누가 시작했든 `run_start`로 내보냄(agent-service.js:5142).
   - pi-web-ui 자신도 steer·알림에 `session.sendUserMessage`를 여러 곳에서 씀(:1532, :1817, :4575 등).
3. **재시작 후 이어가기** → 가능.
   - `SessionManager.create(cwd, sideDir)`로 별도 폴더에 저장, `SessionManager.open(path, sideDir)`로 다시 열어 `createAgentSession({ sessionManager })`.
   - 사이드 세션 첫 entry로 custom entry(LLM 맥락에 안 들어감)를 남겨 메인 세션 파일 경로, 열 때의 leaf id, 도구 설정을 기록.
4. **메인 맥락을 복사하지 않고 넣는 방법** → 가능.
   - 사이드 전용 인라인 확장의 `context` 이벤트(매 LLM 호출 전, `messages` 교체 가능)에서 메인 세션 파일을 읽어 `buildSessionContext(entries, leafId)`로 열 때 지점까지의 메시지를 앞에 붙임.
   - 메인 세션 파일은 append-only라 leaf id 기준 내용은 바뀌지 않음.
   - `/btw:context`로 고른 범위(없음 / 최근 N개 / smart / 전체)는 이때 읽어 온 메시지에 적용함. 범위 선택과 참조 방식은 서로 독립.

## 새로 생긴 질문
- ~~메인 미로드 시 `btw_send_to_main`~~ → 결정: 전달하지 않고 도구 결과로 오류("메인 대화가 열려 있지 않음")를 사이드 모델에 돌려줌. 저장 후 재전달 없음.
- 확장 설치는 `~/.pi/agent` 변경 + 서버 재시작 필요 → 사용자 승인 후 진행.

## 구현 (v0.1.0, 미설치·미실행)

- `pi-extension/` — pi 확장 (index.js, package.json `pi.extensions`). 사이드 세션 생성·저장·실행, `/btw` 명령, `globalThis.__piSideChat.api`.
- `index.mjs` — 웹 플러그인 서버. `/plugins-api/side-chat/{status,sides,side,side/prompt,side/abort,side/settings}` JSON, `/events` SSE. 확장이 없으면 503 `{noExtension:true}`.
- `client/entry.mjs` — 사이드 패널 탭 `side-chat:chat` (multiple). 탭 안에서 새로 만들기 폼/목록, 채팅 화면(맥락·도구 선택, 중지, 전송). `/btw` 실행 시 SSE `open` 이벤트로 탭 자동 열기.

### 확인 없이 정한 세부 (바꿀 수 있음)
- 메인에 전달할 때 앞에 `[사이드 채팅에서 전달]` 붙임.
- 사이드가 답하는 중에 새 질문 → followUp(대기열)로 넣음.
- 전역 설정 파일: `~/.pi/agent/side-chat.json` (`editTools`, `lastN`=8, `smartBudgetTokens`=8000).
- 수정 도구 on/off는 답변 중에는 못 바꿈(세션 재시작 필요). 맥락 범위는 언제든 바뀜.

### 아직 실행으로 확인 안 된 것
- `noExtensions:true`일 때 인라인 확장 팩토리가 실제로 로드되는지.
- `ctx.modelRegistry.runtime` 재사용(인증 공유)이 되는지.
- side-panel `mainConversation().sessionId` == pi sessionId 인지.

### 실행 확인 (2026-11-14)
- 위 "확인 안 된 것" 3개 모두 동작 확인: 인라인 확장 로드, 인증 공유(github-copilot/gpt-6.1-sol), mainConversation().sessionId == pi sessionId.
- `/btw 질문` → 사이드 생성·저장, 메인 맥락(full) 반영한 답 확인.
- 사이드 탭에서 "메인에 전달" → `btw_send_to_main` 호출, 메인이 대기 중이라 새 턴 시작 확인.
- manifest는 `view:false` + `preload:true` 여야 함 (`view:true`는 자기 뷰 탭이 열릴 때만 번들 로드).
- dom 권한 허용 후에는 플러그인 "다시 스캔"(또는 재시작) 해야 반영됨 — 활성화 시점 정보가 캐시됨.
- 아직 안 해 본 것: 클라이언트 로드된 상태에서 `/btw` 입력 시 탭 자동 열기, 사이드 패널 + 버튼으로 새로 만들기, 맥락/도구 선택 변경, /btw:context·/btw:tools·/btw:list.
- 2차 테스트 (같은 날): `/btw` 탭 자동 열기, `/btw:context last:1`·`none`, `/btw:tools edit`, `/btw:list`, 패널 + 버튼(smart), 탭에서 맥락·도구 변경 — 모두 동작. 수정 도구는 실제로 호출되지 않음.
- 남은 다듬을 점: (1) 대화 중 맥락을 "없음"으로 줄이면 모델이 앞 답을 "근거 없음"이라 사과함 — 줄일 때 안내 문구 필요할 수 있음. (2) `/btw:list` 알림이 웹에서 한 줄로 붙어 보임. (3) client `export default {mount}` 안내 화면이 숨은 뷰 영역에 3번 마운트됨(보이지 않음) — 빼도 됨.
- 위 다듬을 점 3개 수정 (같은 날): (1) 맥락 범위 변경 시 meta.scopeNotes 기록 → 다음 사용자 메시지 앞에 "[사이드 채팅 안내: 범위가 바뀜, 이전 답을 틀렸다고 판단 말 것]" 붙여 모델에 보냄(화면·파일엔 안 남음). (2) `/btw:list` 웹(rpc)에선 ` / `로 이어 한 줄, TUI는 줄바꿈. (3) client는 default export에 dispose만(mount 제거). 안내 문구가 실제 모델 답에 주는 효과는 아직 모델 호출로 확인 안 함.
