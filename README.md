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

### `core/mcp/`
Claude Code와 Codex에서 사용할 외부 도구(MCP 서버) 연결 정보를 관리한다.

```
mcp/
├── servers.yaml        서버 카탈로그(명령·인자·환경변수 이름·활성화·프로필)
└── profiles/           작업 맥락별 프로필
    ├── default.yaml
    └── frontend.yaml
```

- `servers.yaml`에는 서버 이름·실행 명령·인자·환경변수 이름·활성화 여부·적용 프로필을 둔다.
- **실제 API 키·토큰 값은 저장하지 않는다.** 환경변수 참조(`${GITHUB_TOKEN}`)만 둔다.
- 특정 프로필의 활성 서버 = `enabled: true` 이면서 `profiles`에 해당 프로필 이름을 포함한 서버.

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
`core/`는 도구 비종속 중립 소스다. 추후 `adapters/`의 렌더러가 각 도구 형식으로 변환한다.

| 원본 | Claude Code | Codex |
| --- | --- | --- |
| `instructions/` | `CLAUDE.md` / 메모리 | `AGENTS.md` |
| `agents/` | `agents/*.md` | `agents/*.toml` |
| `skills/` | `SKILL.md` | 스킬 형식(정리 예정) |
| `mcp/` | `.mcp.json` 또는 Claude 설정 | `config.toml` |
| `hooks/` | `settings.json`의 hooks 연결 | 도구별 훅 연결 |

## 사용
로컬 Claude·Codex 설정에서 `core/` 하위 파일을 참조하도록 연결해 사용한다. (연결 방식은 도구별 설정에 따라 정리 예정)
