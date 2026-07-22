#!/usr/bin/env bash
#
# validate-before-finish.sh
# 작업 종료 전에 프로젝트 검증(타입·린트·테스트)을 실행해 통과 여부를 확인한다.
#
# 동작: package.json에 있는 스크립트만 골라 실행한다.
#   - typecheck / lint : 있으면 실행
#   - test             : HOOK_RUN_TESTS=1 일 때만 실행(느릴 수 있으므로 기본 제외)
# 종료 코드: 0=통과/검증할 것 없음, 1=검증 실패(종료 차단)
set -uo pipefail

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
[[ -f package.json ]] || { echo "package.json 없음 — 검증을 건너뜁니다."; exit 0; }
command -v npm >/dev/null 2>&1 || exit 0

# package.json에 해당 npm 스크립트가 정의돼 있는지 확인
has_script() {
  npm run 2>/dev/null | grep -qE "^[[:space:]]+$1$"
}

run_check() {
  local name="$1"
  echo "▶ $name 실행..."
  if npm run "$name" --silent; then
    echo "  ✓ $name 통과"
  else
    echo "  ✗ $name 실패 — 작업 종료 전 수정이 필요합니다." >&2
    failed=1
  fi
}

failed=0
has_script typecheck && run_check typecheck
has_script lint      && run_check lint
if [[ "${HOOK_RUN_TESTS:-0}" == "1" ]]; then
  has_script test && run_check test
fi

if [[ "$failed" == "1" ]]; then
  exit 1
fi

echo "검증 통과."
exit 0
