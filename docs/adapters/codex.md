# Codex 어댑터 (`~/.codex`, 스킬은 `~/.agents/skills`)

`core/`를 Codex가 읽는 형식으로 렌더한다. 공통 개요·인터페이스·공유 렌더러는 [어댑터 개요](./README.md) 참고.

모든 경로·스키마는 설치된 `codex-cli 0.142.5`와 공식 매뉴얼(learn.chatgpt.com)로 검증했다.

| 카테고리 | 출력 | 병합 |
| --- | --- | --- |
| instructions | `AGENTS.md` (사용자 전역, 확인됨) | 전체 소유 |
| agents | `agents/<name>.toml` (name·description·developer_instructions) | 전체 소유 |
| skills | `~/.agents/skills/<name>/SKILL.md` (+ resources) — USER 스킬 범위 | 전체 소유 |
| mcp | `config.toml` `[mcp_servers.<id>]` | 구조 병합 (replace-keys, TOML) |
| hooks | `hooks/<id>.sh` + `hooks/<id>.wrapper.sh` + `hooks.json` (`{ "hooks": { "<Event>": [...] } }`) | 구조 병합 (append-array, JSON) |

- **MCP env**: core의 `${VAR}` 참조는 `env_vars = ["VAR"]`(부모 프로세스 환경변수 전달)로 렌더된다. 리터럴 값만 `env`에 들어간다. `codex mcp get`으로 확인 시 CLI가 `env_vars`를 읽어 해당 변수를 필수 환경변수로 처리한다 — 실제 시크릿 값은 어디에도 기록되지 않는다. HTTP MCP는 `bearer_token_env_var`·`env_http_headers`를 쓴다.
- **hooks.json 구조**: 이벤트는 최상위 `"hooks"` 객체 아래에 중첩된다(검증된 형식). 매처는 도구명 정규식: 셸=`Bash`, 파일 편집=`apply_patch|Edit|Write`. `Stop`은 매처를 무시한다.
- 훅 명령: `"${CODEX_HOME:-$HOME/.codex}/hooks/<id>.wrapper.sh"`.
- 래퍼 브리지: JSON stdin → `tool_input.command` 추출 → 중립 스크립트 → 차단 시 **exit 2**(공식 hooks 문서 확인: exit 2 + stderr 사유가 PreToolUse 차단으로 처리됨). Bash와 apply_patch 모두 `tool_input.command`로 전달된다.

## Codex 호환성 기록

`read-only`·스킬 메타데이터·MCP·훅은 모두 네이티브로 매핑된다. 검증 후 남은 **개별 항목만** `COMPATIBILITY.md`에 기록한다.

**검증되어 제거된 경고** (더 이상 기록하지 않음):
- 사용자 레벨 `~/.codex/AGENTS.md` 경로 → 매뉴얼로 확인됨.
- `hooks.json` 구조 → `{ "hooks": { … } }` 형식으로 확인, 매처·`tool_input.command` 확인됨.
- MCP `${VAR}` 처리 → `env_vars` 네이티브 전달로 확인됨.

**남아 있는 유일한 경고**: `apply_patch`/`Edit`/`Write`는 편집 대상 경로를 별도 필드가 아니라 `tool_input.command`(패치 텍스트) 안에 담는다. 따라서 파일 접근 훅은 깔끔한 `file_path`가 아니라 그 텍스트를 대상으로 검사한다. (`protect-secrets`는 패치 텍스트의 `.env` 등을 그대로 잡아낸다.)

카테고리 전체를 미지원으로 표시하지 않는다.
