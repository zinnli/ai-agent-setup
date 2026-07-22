#!/usr/bin/env bash
#
# format-changed-files.sh
# 변경된 파일에 formatter를 실행한다. (파일 수정 후 실행하는 post 훅)
#
# 동작: git 기준 변경 파일 중 지원 확장자만 골라 prettier(있으면)로 정리한다.
# 이 훅은 작업을 막지 않는다. 항상 0으로 종료한다.
set -uo pipefail

# git 저장소가 아니면 조용히 종료
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# 변경/스테이징된 파일 수집 (추가·수정된 것)
mapfile -t files < <(
  { git diff --name-only --diff-filter=ACM
    git diff --cached --name-only --diff-filter=ACM
  } | sort -u
)

[[ ${#files[@]} -eq 0 ]] && exit 0

# 포맷 대상 확장자만 필터
targets=()
for f in "${files[@]}"; do
  [[ -f "$f" ]] || continue
  case "$f" in
    *.js|*.jsx|*.ts|*.tsx|*.json|*.css|*.scss|*.md|*.mdx|*.html|*.yml|*.yaml)
      targets+=("$f") ;;
  esac
done

[[ ${#targets[@]} -eq 0 ]] && exit 0

if command -v npx >/dev/null 2>&1; then
  npx --no-install prettier --write "${targets[@]}" 2>/dev/null \
    && echo "formatted: ${#targets[@]} file(s)" \
    || echo "prettier 미설치 또는 실패 — 포맷을 건너뜁니다." >&2
fi

exit 0
