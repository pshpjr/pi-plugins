# pi-plugins

[pi-web-ui](https://github.com/xing-shuyin/pi-web-ui)용 플러그인 모음. 직접 만든 플러그인과, 공식 플러그인을 포크해 한국어 등을 고친 것을 같이 둔다.

| id | 종류 | 설명 |
|---|---|---|
| `usage-meter` | 직접 만듦 | 현재 모델 제공자(Claude, Codex, Copilot, Z.ai, DeepSeek)의 사용량·잔여 크레딧을 하단 바에 표시 |
| `context-lens` | 직접 만듦 | 현재 대화의 컨텍스트 구성을 오른쪽 패널에서 분석 |
| `notes` | 포크 | 메모·할 일·알림 |
| `webmail` | 포크 | IMAP/SMTP 메일 |
| `pm2-manager` | 포크 | PM2 프로세스 관리 |
| `response-speed` | 포크 | 모델 응답 속도 표시 |
| `browser-use` | 포크 | AI 브라우저 |

## 설치

플러그인 하나:

```bash
pi-web-ui install pshpjr/pi-plugins/<id> --force
```

전부(카탈로그):

```bash
pi-web-ui install --catalog https://raw.githubusercontent.com/pshpjr/pi-plugins/main/catalog.json
```

설치 후 브라우저를 새로고침한다. 서버 코드가 있는 플러그인은 pi-web-ui를 재시작하면 확실하다.

## 포크한 플러그인

- 원본: [xing-shuyin/pi-web-ui](https://github.com/xing-shuyin/pi-web-ui) `plugins/<id>` (MIT, [LICENSE-upstream](LICENSE-upstream)). 가져온 커밋은 [upstream.json](upstream.json).
- 플러그인 id는 원본과 같다. 원본 대신 설치하면 설정·데이터가 그대로 이어진다.
- 원본 변경 확인: `tools/upstream-diff.sh <id>`

## 개발

[AGENTS.md](AGENTS.md) 참고.
