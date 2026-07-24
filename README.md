# ai-agent-setup

개인 용도의 AI 에이전트 공용 설정 저장소다. 로컬에서 **Claude Code**와 **Codex** 양쪽에서 동일하게 사용할 수 있는 지침·에이전트·스킬·MCP·훅을 한곳에서 관리하는 것을 목표로 한다.

## 목표
- 도구(Claude Code, Codex)에 상관없이 일관된 행동 규칙과 작업 방식을 적용한다.
- 지침·에이전트·스킬·MCP·훅을 재사용 가능한 단위로 분리해 관리한다.
- 프로젝트마다 반복되는 설정을 공용화한다.

## 폴더 구조

```
core/
├── instructions/   공통 행동 규칙
├── agents/         작업별 에이전트 정의
├── skills/         반복 작업 워크플로우(스킬)
├── mcp/            외부 도구(MCP 서버) 연결 정보
└── hooks/          행동 전후 자동 검사·안전장치(스크립트)
```

### `core/instructions/`
AI가 모든 작업에서 기본적으로 따라야 하는 공통 행동 규칙을 관리한다.

| 파일 | 역할 |
| --- | --- |
| `base.md` | 작업 방식, 응답 형식, 검증, 불확실한 정보 처리 등 공통 기본 규칙 |
| `frontend.md` | React·TypeScript, 상태 관리, UI 상태, 테스트 관련 규칙 |
| `git.md` | 커밋·푸시·브랜치 작업 및 기존 변경 사항 보호 규칙 |
| `safety.md` | 시크릿 파일, 삭제·파괴적 명령 등 위험 작업 제한 |

우선순위: 기본적으로 더 구체적인 지침을 따르되, `safety.md`는 다른 지침과 충돌할 때 최우선한다.

### `core/agents/`
역할이 분리된 전문 에이전트 정의를 관리한다. 각 에이전트는 `name`·`description`·`mode`(read-only 등)·사용할 `skills`·`instructions`를 정의한다.

| 파일 | 역할 |
| --- | --- |
| `explorer.yaml` | 프로젝트 구조와 관련 코드 탐색 |
| `planner.yaml` | 구현 범위와 순서 설계 |
| `reviewer.yaml` | 코드 변경의 버그·회귀 검토 |
| `test-runner.yaml` | 테스트 실행과 실패 원인 분석 |

**Skill과 Agent의 차이** — Skill은 "작업 방법", Agent는 "작업을 담당하는 역할"이다. 에이전트는 자신의 역할에 맞는 스킬을 사용한다. 예: `reviewer` 에이전트가 `review-diff` 스킬을 사용.

### `core/skills/`
반복해서 사용하는 작업 절차(플레이북)를 관리한다. 하나의 스킬은 특정 목적을 수행하기 위한 단계적 지침이며, 아래 구조를 따른다.

```
skills/review-diff/
├── skill.yaml    이름·설명·호출 조건 등 메타데이터
├── body.md       실제 작업 절차
└── resources/    체크리스트·템플릿·참고 문서
```

| 스킬 | 역할 |
| --- | --- |
| `feature-plan` | 기능 구현 전 요구사항 정리·계획 수립 |
| `implement-verify` | 계획대로 구현하고 검증까지 마무리 |
| `review-diff` | 변경 diff 리뷰 및 개선점 정리 |
| `debug-error` | 에러·버그 원인 추적 및 근본 수정 |
| `context7-docs` | `ctx7` CLI로 라이브러리 최신 문서 조회 |

### `core/mcp/`
Claude Code와 Codex에서 사용할 외부 도구(MCP 서버) 연결 정보를 관리한다. 현재는 Notion MCP만 사용한다.

```
mcp/
└── servers.yaml        서버 카탈로그(명령·인자·환경변수 이름·활성화)
```

- `servers.yaml`에는 서버 이름·실행 명령·인자·환경변수 이름·활성화 여부를 둔다.
- **실제 API 키·토큰 값은 저장하지 않는다.** 환경변수 참조(`${NOTION_TOKEN}`)만 둔다.

**환경변수 참조 vs 리터럴** — `env`의 값이 정확히 `${VAR}`(대문자·숫자·`_`) 형태면 *참조*로 취급한다. 참조는 도구별로 부모 프로세스 환경변수를 상속하도록 렌더된다: Claude는 `~/.claude.json`에 `${VAR}` 문자열을 유지(자체 확장), Codex는 `env_vars = ["VAR"]`로 변환(부모 환경변수 전달). `$` 없는 값은 *리터럴*로 보고 Codex `env`에 그대로 들어간다(시크릿이 아닌 값에만 사용). `$VAR`처럼 잘못된 placeholder는 검증 오류이며 리터럴로 저장되지 않는다.

### `core/hooks/`
AI의 특정 행동 전후에 실행되는 자동 검사·안전장치 스크립트를 관리한다. instructions가 규칙을 "설명"한다면, hooks는 실행 단계에서 규칙을 "검사·차단"하는 더 강한 제어 수단이다.

| 스크립트 | 역할 |
| --- | --- |
| `protect-secrets.sh` | 시크릿·민감 파일(.env 등) 접근 차단 |
| `block-destructive-command.sh` | `git reset --hard`, `rm -rf` 등 파괴적 명령 차단 |
| `format-changed-files.sh` | 변경 파일에 formatter 실행(비차단) |
| `validate-before-finish.sh` | 종료 전 타입·린트·테스트 검증 |

- 각 스크립트는 도구에 독립적으로 **인자 또는 stdin**으로 입력을 받는다.
- 차단 훅은 종료 코드 `1`로 행동을 막고, `0`이면 통과시킨다.
- Claude Code와 Codex의 훅 지원 방식이 다르므로, `core/hooks/`에는 공통 스크립트만 두고 연결은 `adapters/`가 처리한다.

## 변환(adapters)
`core/`는 도구 비종속 중립 소스다. `src/adapters/`의 렌더러가 각 도구 형식으로 변환한다.

| 원본 | Claude Code | Codex |
| --- | --- | --- |
| `instructions/` | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` |
| `agents/` | `~/.claude/agents/*.md` (frontmatter) | `~/.codex/agents/*.toml` |
| `skills/` | `~/.claude/skills/<name>/SKILL.md` | `~/.agents/skills/<name>/SKILL.md` |
| `mcp/` | `~/.claude.json` `mcpServers` (구조 병합) | `~/.codex/config.toml` `[mcp_servers]` (구조 병합) |
| `hooks/` | `~/.claude/hooks/*` + `settings.json` (구조 병합) | `~/.codex/hooks/*` + `hooks.json` (구조 병합) |

`read-only` 모드는 각 도구에서 강제되는 네이티브 권한이 아니라 **명시적 행동 규칙**("파일을 수정하지 않는다" 등)으로 렌더링된다.

## 설치와 실행

TypeScript로 작성되어 있으며 `tsc`로 빌드한다.

```bash
npm install
npm run build          # src/ → dist/
node dist/src/cli.js <command> [options]
```

### 명령어

| 명령 | 설명 |
| --- | --- |
| `build` | `core/`를 렌더링해 `generated/<tool>/`에 미리보기를 만든다. HOME을 건드리지 않는다. |
| `install` | 렌더 결과를 실제 설정 위치에 설치한다(백업·구조 병합). |
| `update` | 다시 렌더링해 기존 설치와 조정한다(사용자 수정 파일은 보존). |
| `status` | 설치 상태·드리프트·도구별 요약을 보여준다(읽기 전용). |
| `list` | core의 instructions·agents·skills·hooks·MCP와 도구별 지원 여부를 나열한다. |
| `diff` | 설치/업데이트가 무엇을 바꿀지 미리 본다(쓰기 없음). |
| `uninstall` | 관리 파일 제거·백업 복원, 병합 항목만 정리한다. |
| `doctor` | 환경·`core/`·생성물·설치 상태를 점검한다(읽기 전용). |
| `init` | 감지한 프로젝트 정보로 프로젝트용 `CLAUDE.md`·`AGENTS.md`를 만든다. |

조회 명령(`status`·`list`·`diff`·`doctor`)은 하나의 내부 결과 모델을 텍스트와 JSON 두 포매터로 렌더한다. 사람용 출력과 `--json` 출력은 같은 계산을 공유한다.

### 공통 옵션

| 옵션 | 설명 |
| --- | --- |
| `--target=claude\|codex\|all` | 대상 도구 (기본 `all`) |
| `--json` | 기계용 JSON 출력 (`status`·`list`·`diff`·`doctor`) |
| `--home=<dir>` | 실제 HOME 대신 이 디렉터리에 작업 (테스트·미리보기용) |
| `--dry-run` | 아무것도 쓰지 않고 계획만 표시 |
| `--force` | 검증 오류·충돌·사용자 수정 파일을 무릅쓰고 진행 |
| `--verbose` | 상세 로그 (`doctor --verbose`는 예상/실제 해시·stale 파일·소스 위치 등 추가) |
| `--dir=<dir>` | `init` 대상 프로젝트 디렉터리 |
| `-v, --version` | 버전 출력 |

### 예시

```bash
node dist/src/cli.js build --target=all
node dist/src/cli.js install                       # 실제 ~/.claude, ~/.codex, ~/.agents 에 설치
node dist/src/cli.js diff --target=claude
node dist/src/cli.js uninstall
node dist/src/cli.js doctor
node dist/src/cli.js init                           # 현재 프로젝트에 CLAUDE.md/AGENTS.md 생성
```

## 안전장치와 병합 정책

- **전용 생성 파일**(CLAUDE.md, AGENTS.md, agents/\*, skills/\*\*)은 전체 소유(full-file)로 관리하며, 기존 파일이 있으면 먼저 백업한다.
- **공유 설정 파일**(settings.json, ~/.claude.json, config.toml, hooks.json)은 **구조 병합**한다. ai-agent-setup이 소유한 키·항목만 넣고, 사용자 설정은 보존한다.
- 재설치는 멱등하다(중복 훅·MCP 서버가 생기지 않음).
- 사용자가 수정한 관리 파일은 감지해 보존하고, `--force`로만 덮어쓴다(덮어쓰기 전 백업).
- `uninstall`은 백업을 복원하고 병합 항목 중 우리 것만 제거하며, 사용자 항목은 남긴다.
- 설치 상태는 도구별 매니페스트(`<installRoot>/.ai-agent-setup/manifest.json`)로 추적한다.

## 민감 정보

- API 키·토큰은 저장소·생성물·매니페스트에 저장하지 않는다.
- MCP 설정은 환경변수 참조(`${NOTION_TOKEN}`)만 두며, 값은 런타임 환경변수로 주입한다.
- `doctor`는 활성 MCP 서버가 참조하는 환경변수가 비어 있으면 경고한다.

## Claude와 Codex 차이

두 도구가 동일하다고 가정하지 않는다. 각 어댑터의 이벤트·매처·필드 매핑은 독립적으로 검증한다(설치된 `codex-cli`와 공식 매뉴얼 기준). 현재 지원 상태:

- **동등하게 지원**: instructions, agents, skills, MCP 서버, 훅 4종 — 양쪽 모두 네이티브.
- **Codex 검증 완료**: `~/.codex/AGENTS.md`(사용자 전역), `~/.agents/skills/<name>/`(USER 스킬), `config.toml` MCP(`env`=리터럴, `env_vars`=참조 전달), `hooks.json`(`{ "hooks": { … } }` 구조 + 도구명 매처 + `tool_input.command`).
- **남은 개별 경고 1건**: Codex `apply_patch`/`Edit`/`Write`는 편집 경로를 `tool_input.command`(패치 텍스트) 안에 담아, 파일 접근 훅이 깔끔한 `file_path` 대신 그 텍스트를 검사한다.

확인되지 않은 개별 필드·매핑만 `generated/<tool>/COMPATIBILITY.md`에 기록하고 `doctor`가 경고로 노출한다(카테고리 전체를 미지원으로 처리하지 않음).

## 로컬 CLI 패키지

`npm pack`으로 만든 tarball은 `dist/`와 기본 `core/`만 담는다(테스트·소스맵·로컬 설정 제외).

```bash
npm run build
npm pack                       # ai-agent-setup-<ver>.tgz 생성
npm i -g ./ai-agent-setup-*.tgz   # 또는 임시 디렉터리에 설치
ai-agent-setup --version
ai-agent-setup build --target=all
```

`npm run smoke:pack`은 pack → 임시 디렉터리 설치 → 무관한 cwd에서 CLI 실행까지 자동 검증한다(실제 HOME 미변경). CI(`.github/workflows/ci.yml`)는 typecheck·build·전체 테스트(임시 HOME)·결정적 이중 빌드·스냅샷 드리프트·시크릿 형식 검사·tarball 스모크를 Node 20/22에서 실행한다.

## 개발

```bash
npm test               # 빌드 후 unit·snapshot·integration 테스트 (temp HOME 사용)
UPDATE_SNAPSHOTS=1 npm test   # 스냅샷 갱신
```

자동 테스트는 실제 HOME을 절대 수정하지 않는다(항상 임시 HOME). 실제 Claude/Codex 로딩 확인은 수동 체크리스트로 남긴다 — `docs/manual-checklist.md` 참고.

문서: [`docs/architecture.md`](docs/architecture.md), [`docs/core-schema.md`](docs/core-schema.md) (Core 추가 방법), [`docs/adapters.md`](docs/adapters.md), [`docs/installation.md`](docs/installation.md), [`docs/troubleshooting.md`](docs/troubleshooting.md), [`docs/manual-checklist.md`](docs/manual-checklist.md).
