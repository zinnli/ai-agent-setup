# 자주 쓰는 라이브러리 ID

`ctx7 docs <libraryId> <query>`에 바로 쓸 수 있는 ID 모음. ID는 `ctx7 library <name> <query>`로 확인하며, 아래는 참고용이므로 실제 값은 해석 결과로 검증한다.

| 라이브러리 | libraryId(예상) | 확인 명령 |
| --- | --- | --- |
| React | `/facebook/react` | `ctx7 library react "..."` |
| Next.js | `/vercel/next.js` | `ctx7 library next "..."` |
| TanStack Query | `/tanstack/query` | `ctx7 library "tanstack query" "..."` |
| TypeScript | `/microsoft/typescript` | `ctx7 library typescript "..."` |

> ID는 라이브러리 측 변경으로 달라질 수 있다. 조회가 실패하면 `ctx7 library`로 다시 해석한다.
