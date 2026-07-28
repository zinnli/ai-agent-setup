# 어댑터

`core/`는 도구 비종속 중립 소스다. `adapters/<tool>/`의 렌더러가 이 소스를 각 도구가 실제로 읽는 형식으로 변환한다. **내용은 `core/`에 한 번만 쓰고, 도구별 차이(파일명·경로·문법)는 어댑터 코드가 기계적으로 처리**한다.

각 어댑터는 `Adapter` 인터페이스를 구현한다: `installRoot(home)`, `skillsRoot(home)`, `validateCore(core)`, `render(core) → { files, unsupported }`.

## 도구별 상세

- [Claude 어댑터](./claude.md) — `~/.claude`
- [Codex 어댑터](./codex.md) — `~/.codex`, 스킬은 `~/.agents/skills`

두 문서를 나눈 이유는 각 어댑터가 담당하는 경로·스키마·병합 전략이 도구마다 독립적으로 검증되기 때문이다. 한 파일에 섞으면 어느 규칙이 어느 도구의 것인지 읽기 어렵다.

## 공유 렌더러 (`adapters/shared/`)

두 도구가 공통으로 쓰는 조합 로직만 모은다.

- `instructions-doc.ts` — CLAUDE.md/AGENTS.md 공통 조합.
- `skill-render.ts` — SKILL.md(frontmatter + body + `## 실행 정보`) + resource 복사. 두 도구 공통.
- `managed-header.ts` — 생성 파일 상단 배너(주석 가능한 형식만). JSON에는 provenance 키를 넣지 않는다.
- `frontmatter.ts`, `unsupported.ts`.
