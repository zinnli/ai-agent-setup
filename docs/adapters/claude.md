# Claude 어댑터 (`~/.claude`)

`core/`를 Claude Code가 읽는 형식으로 렌더한다. 공통 개요·인터페이스·공유 렌더러는 [어댑터 개요](./README.md) 참고.

| 카테고리 | 출력 | 병합 |
| --- | --- | --- |
| instructions | `CLAUDE.md` | 전체 소유 |
| agents | `agents/<name>.md` (frontmatter name·description + `## 작업 제한` + `## 규칙` + `## 사용할 수 있는 스킬`) | 전체 소유 |
| skills | `skills/<name>/SKILL.md` (+ resources) | 전체 소유 |
| mcp | `~/.claude.json` `mcpServers.<name>` | 구조 병합 (replace-keys, JSON) |
| hooks | `hooks/<id>.sh` + `hooks/<id>.wrapper.sh` + `settings.json` `hooks.<event>` | 구조 병합 (append-array, JSON) |

- 훅 명령: `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/<id>.wrapper.sh"` (공백 안전, 빌드 시점 HOME 미포함).
- 래퍼 브리지: JSON stdin → `tool_input.*` 추출 → 중립 스크립트 → 차단 시 **exit 2**.
