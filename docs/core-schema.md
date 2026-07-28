# Core 스키마와 추가 방법

`core/`는 도구 비종속 원본이다. 도구 전용 형식(CLAUDE.md, AGENTS.md, frontmatter, TOML, settings.json 등)을 여기 넣지 않는다 — 그건 어댑터가 만든다.

## 정규화 모델 (`loader/model.ts`)

- **Instruction** `{ id, order, content, sourceFile }`
- **Agent** `{ name, description, mode, skills[], instructions[], sourceFile }`
- **Skill** `{ name, description, whenToUse[], notFor[], inputs[], outputs[], related[], requires?, body, resources[], dir }`
- **Hook** `{ id, scriptFile, trigger, blocking, targets[], env?, description? }`
- **McpServer** `{ name, enabled, transport, command?, args[], env, url?, sourceFile }`

검증(`loader/validate.ts`)은 필수 필드, `Skill.name === 폴더명`, 에이전트→스킬·스킬→스킬 참조, 훅 매니페스트 ↔ 스크립트 정합성, MCP `env`가 `${VAR}` 형태인지 등을 확인한다.

## 지침 추가
`core/instructions/<topic>.md`를 만들고 `core/instructions/order.yaml`의 `order`에 파일 stem을 추가한다. 뒤에 올수록 우선한다(맨 뒤 = 최우선). 목록에 없으면 뒤에 붙고 경고가 뜬다.

## 에이전트 추가
`core/agents/<name>.yaml`:
```yaml
name: <name>            # 파일 stem과 동일
description: ...
mode: read-only         # read-only 는 명시적 행동 제한으로 렌더됨
skills: [feature-plan]  # 존재하는 스킬 이름
instructions: [ ... ]
```

## 스킬 추가
`core/skills/<name>/` 폴더:
- `skill.yaml` — `name`(폴더명과 동일)·`description`·`when_to_use[]`·`not_for[]`·`inputs[]`·`outputs[]`·`related[]`·(선택)`requires[]`
- `body.md` — `# <name>` → `## 절차` → `## 완료 기준`
- `resources/*.md` — 체크리스트·템플릿(그대로 복사됨)

## 훅 추가
1. `core/hooks/<id>.sh` — 도구 비종속 bash. 입력은 `$1` 또는 stdin, 차단은 exit 1.
2. `core/hooks/manifest.yaml`에 항목 추가:
```yaml
<id>:
  trigger: before-command | before-file-access | after-file-change | before-finish
  blocking: true
  targets: [command, read, edit, write]
  env: { KEY: "default" }   # 선택
```
도구별 이벤트명·매처는 각 어댑터의 `event-map.ts`가 매핑한다(중립 트리거만 core에 둔다).

## MCP 서버 추가
`core/mcp/servers.yaml`:
```yaml
servers:
  <name>:
    enabled: true
    transport: stdio        # stdio | sse | http
    command: npx
    args: ["-y", "..."]
    env:
      SOME_TOKEN: ${SOME_TOKEN}   # 값이 아니라 참조만
```
비활성(`enabled: false`) 서버는 렌더에서 제외된다. 실제 토큰은 넣지 않는다.

`env` 값 규칙:
- `${UPPER_SNAKE}` — *참조*. Claude는 `${VAR}` 문자열 유지(자체 확장), Codex는 `env_vars = ["VAR"]`로 부모 환경변수를 전달한다. **키 이름과 참조 변수명이 같아야** Codex가 그대로 전달할 수 있다(다르면 `COMPATIBILITY.md`에 기록되고 생략).
- `$` 없는 값 — *리터럴*. Codex `env`에 그대로 들어간다. 시크릿이 아닌 값에만 사용(검증에서 "possible literal secret" 경고).
- `$VAR`·`${lower}`·`a-${V}` 같은 잘못된 placeholder — 검증 **오류**. 리터럴 시크릿처럼 저장되지 않는다.
