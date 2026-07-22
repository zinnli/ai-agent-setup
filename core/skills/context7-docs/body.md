# context7-docs

`ctx7` CLI로 라이브러리의 **최신 공식 문서**를 가져오는 절차다. 기억에 의존해 API를 추측하지 말고, 최신 문서를 근거로 삼는다.

## 사전 준비
- CLI 실행: 전역 설치 `npm install -g ctx7@latest` 또는 설치 없이 `npx ctx7@latest <명령>`.
- (선택) API 키: `export CONTEXT7_API_KEY=<key>`. 없으면 동작하지만 rate limit이 적용된다.
  - 키 값은 코드·저장소에 넣지 않고 환경변수로만 둔다.

## 절차

### 1. 라이브러리 ID 해석
문서를 가져오기 전에 라이브러리 ID를 먼저 확인한다.
```bash
ctx7 library <name> <query>
```
- 예: `ctx7 library next "app router"` → `/vercel/next.js` 같은 ID를 얻는다.
- ID는 `/owner/name` 형식이며 앞의 `/`가 반드시 필요하다.

### 2. 문서 조회
해석한 ID로 원하는 주제의 문서를 가져온다.
```bash
ctx7 docs <libraryId> <query>
```
- 예: `ctx7 docs /tanstack/query "useQuery 옵션"`.
- 질의는 구체적으로(버전·기능·API 이름) 적을수록 정확한 발췌를 얻는다.

### 3. 활용
- 가져온 문서를 근거로 코드를 작성·수정한다.
- 문서와 실제 프로젝트 버전이 다를 수 있으니, 프로젝트의 설치 버전을 함께 확인한다.
- 인용한 내용은 어떤 라이브러리·주제에서 왔는지 밝힌다.

## 완료 기준
- 필요한 API·사용법을 최신 문서로 확인했다.
- 추측이 아니라 문서 근거로 코드를 작성했다.
- 자주 쓰는 라이브러리 ID는 `resources/common-libraries.md`를 참고·갱신한다.
