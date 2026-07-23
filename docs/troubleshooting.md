# 문제 해결

먼저 `node dist/src/cli.js doctor`를 실행한다. 경고(⚠)와 오류(✗)는 구분된다.

| 증상 | 원인 / 해결 |
| --- | --- |
| `core validation failed` | `doctor`의 `[core]` 항목 확인. 필수 필드 누락·중복 이름·존재하지 않는 스킬 참조 등. 고친 뒤 재실행하거나, 의도적이면 `--force`. |
| `USER_MODIFIED` 로 업데이트가 건너뜀 | 관리 파일을 직접 수정함. 수정을 유지하려면 그대로 두고, 재생성을 원하면 `update --force`(기존 버전은 백업됨). |
| `CONFLICT` (MCP/hook) | 병합 대상의 소유 경로에 다른 값이 이미 존재. 사용자 값을 유지하려면 그대로, 우리 값으로 덮으려면 `--force`. |
| `merge target ... malformed` | 대상 `settings.json`/`config.toml`/`hooks.json`이 깨진 JSON/TOML. 우리는 건드리지 않는다. 파일을 고친 뒤 재설치. |
| 훅이 동작하지 않음 | `core/hooks/*.sh` 실행 권한 확인(`doctor`의 `[hooks]`). 래퍼는 `node`로 JSON을 파싱하므로 PATH에 `node` 필요. |
| MCP 토큰이 안 먹음 | `${NOTION_TOKEN}` 등 환경변수가 실제로 설정됐는지 확인(`doctor`의 `[mcp]`). Codex는 `${VAR}` 확장 여부가 미확정 → `COMPATIBILITY.md` 참고. |
| `generated ... stale` | `core/` 변경 후 `build`를 다시 실행하지 않음. `build`로 갱신. |
| `... managed file(s) missing` | 설치된 관리 파일이 사라짐. `install`/`update`로 복구. |
| 실제 도구가 설정을 못 읽음 | 경로·형식은 `docs/manual-checklist.md`로 실제 로딩을 확인. Codex는 `COMPATIBILITY.md`의 미확정 항목부터 점검. |

## 롤백

`uninstall`은 최초 백업을 복원한다. 강제 업데이트로 생긴 백업은 `<installRoot>/.ai-agent-setup/backups/<타임스탬프>/`에 남아 있으므로 수동 복원 가능.
