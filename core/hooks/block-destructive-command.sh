#!/usr/bin/env bash
#
# block-destructive-command.sh
# 되돌리기 어려운 파괴적 명령을 차단한다.
#
# 입력: 실행하려는 명령 문자열
#   - 인자($1)로 받거나, 없으면 stdin에서 읽는다.
# 종료 코드: 0=허용, 1=차단
set -euo pipefail

command="${1:-}"
if [[ -z "$command" && ! -t 0 ]]; then
  command="$(cat)"
fi

# 차단 대상 패턴(정규식)
patterns=(
  'git[[:space:]]+reset[[:space:]]+--hard'
  'git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f'
  'git[[:space:]]+checkout[[:space:]]+--?[[:space:]]*\.'
  'git[[:space:]]+push[[:space:]].*(--force([^-]|$)|-f([^a-zA-Z]|$))'
  'rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*f'
  'rm[[:space:]]+-[a-zA-Z]*f[a-zA-Z]*r'
)

for p in "${patterns[@]}"; do
  if [[ "$command" =~ $p ]]; then
    echo "차단: 파괴적인 명령은 실행할 수 없습니다." >&2
    echo "  → $command" >&2
    echo "필요하면 사용자에게 명시적으로 승인을 받으세요." >&2
    exit 1
  fi
done

exit 0
