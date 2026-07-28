# 아키텍처

```
core/  ──►  loaders  ──►  CoreModel  ──►  adapters  ──►  GeneratedFile[]  ──►  install
(중립 소스)   (파싱)       (정규화 모델)    (도구별 렌더)     (설치 위치 무관)      (temp/실제 HOME)
```

## 계층

- **`core/`** — 도구 비종속 원본(YAML·Markdown·bash). 특정 도구 규격을 넣지 않는다.
- **`loader/`** — 로더(`load-*.ts`)가 `core/`를 `CoreModel`로 파싱하고 `validate.ts`가 스키마·교차참조를 검사한다. 로더는 순수(디렉터리 입력 → 배열 출력), 검증은 전체 모델을 한 번에 본다.
- **`adapters/<tool>/`** — `CoreModel`을 읽어 각 도구 형식의 `GeneratedFile[]`로 렌더한다. HOME을 직접 만지지 않는다.
- **`fs/`** — 설치 인프라: 원자적 쓰기, 매니페스트, 백업, 구조 병합(JSON/TOML), 경로 해석.
- **`commands/`** — `build`/`install`/`update`/`diff`/`uninstall`/`doctor`/`init`.

## 핵심 타입

- `CoreModel` = `{ instructions, agents, skills, hooks, mcpServers }` (`loader/model.ts`).
- `GeneratedFile` = `{ relativePath, content, sourceFiles, mode?, managed, root?, mergeTarget?, managedPaths?, mergeStrategy?, format? }` (`adapters/types.ts`).
  - `managed:true` = 전체 소유 파일. `managed:false` = 구조 병합 대상.
  - `root` = `install` | `skills` | `home` — 파일이 어느 루트 기준인지.

## 결정론

동일 입력 → 동일 출력을 보장한다. 정렬(지침 order.yaml, 에이전트·스킬·훅·MCP 이름순), 안정적 JSON 키 순서, 소스 경로는 repo 상대 표기, 타임스탬프는 결정적 산출물에 넣지 않는다. `build`를 두 번 실행해도 diff가 없어야 한다.
