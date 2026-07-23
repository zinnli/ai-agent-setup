# 어댑터

각 어댑터는 `Adapter` 인터페이스를 구현한다: `installRoot(home)`, `skillsRoot(home)`, `validateCore(core)`, `render(core) → { files, unsupported }`.

## Claude (`~/.claude`)

| 카테고리 | 출력 | 병합 |
| --- | --- | --- |
| instructions | `CLAUDE.md` | 전체 소유 |
| agents | `agents/<name>.md` (frontmatter name·description + `## 작업 제한` + `## 규칙` + `## 사용할 수 있는 스킬`) | 전체 소유 |
| skills | `skills/<name>/SKILL.md` (+ resources) | 전체 소유 |
| mcp | `~/.claude.json` `mcpServers.<name>` | 구조 병합 (replace-keys, JSON) |
| hooks | `hooks/<id>.sh` + `hooks/<id>.wrapper.sh` + `settings.json` `hooks.<event>` | 구조 병합 (append-array, JSON) |

- 훅 명령: `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/<id>.wrapper.sh"` (공백 안전, 빌드 시점 HOME 미포함).
- 래퍼 브리지: JSON stdin → `tool_input.*` 추출 → 중립 스크립트 → 차단 시 **exit 2**.

## Codex (`~/.codex`, 스킬은 `~/.agents/skills`)

| 카테고리 | 출력 | 병합 |
| --- | --- | --- |
| instructions | `AGENTS.md` | 전체 소유 |
| agents | `agents/<name>.toml` (name·description·developer_instructions) | 전체 소유 |
| skills | `~/.agents/skills/<name>/SKILL.md` (+ resources) | 전체 소유 |
| mcp | `config.toml` `[mcp_servers.<id>]` | 구조 병합 (replace-keys, TOML) |
| hooks | `hooks/<id>.sh` + `hooks/<id>.wrapper.sh` + `hooks.json` (최상위 이벤트 키) | 구조 병합 (append-array, JSON) |

- 훅 명령: `"${CODEX_HOME:-$HOME/.codex}/hooks/<id>.wrapper.sh"`.
- 래퍼 브리지: JSON stdin → 추출 → 중립 스크립트 → 차단 시 **exit 2**(Codex도 exit 2를 차단으로 처리, 스키마는 별도 검증).

## 공유 렌더러 (`src/adapters/shared/`)

- `instructions-doc.ts` — CLAUDE.md/AGENTS.md 공통 조합.
- `skill-render.ts` — SKILL.md(frontmatter + body + `## 실행 정보`) + resource 복사. 두 도구 공통.
- `managed-header.ts` — 생성 파일 상단 배너(주석 가능한 형식만). JSON에는 provenance 키를 넣지 않는다.
- `frontmatter.ts`, `unsupported.ts`.

## Codex 호환성 기록

`read-only`·스킬 메타데이터·훅은 모두 네이티브로 매핑된다. 공식 문서로 확정되지 않은 **개별 항목만** `COMPATIBILITY.md`에 기록한다:
- Codex PreToolUse `tool_input` 필드명 (Claude 호환 형태로 best-effort 추출).
- 훅 매처 생략(정확한 Codex 도구명 미확정 → 모든 이벤트에서 발화, 추출 실패 시 허용).
- MCP `${VAR}` 확장 여부.
- 사용자 레벨 `~/.codex/AGENTS.md` 경로.

카테고리 전체를 미지원으로 표시하지 않는다.
