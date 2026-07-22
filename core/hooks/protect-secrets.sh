#!/usr/bin/env bash
#
# protect-secrets.sh
# 시크릿·민감 파일에 대한 접근(읽기/수정)을 차단한다.
#
# 입력: 대상 파일 경로 또는 명령 문자열
#   - 인자($1)로 받거나, 없으면 stdin에서 읽는다.
#   - 어댑터가 도구별 이벤트에서 경로/명령을 뽑아 전달한다.
# 종료 코드: 0=허용, 1=차단
set -euo pipefail

input="${1:-}"
if [[ -z "$input" && ! -t 0 ]]; then
  input="$(cat)"
fi

# 차단 대상 패턴(파일명·경로 기준)
patterns=(
  '(^|/)\.env($|\.)'          # .env, .env.local ...
  '(^|/)\.npmrc$'
  '(^|/)id_rsa'
  '\.pem$'
  '\.key$'
  '\.p12$'
  '\.pfx$'
  '(^|/)credentials?($|[._/])'
  '(^|/)secrets?($|[._/])'
  '(^|/)\.aws/'
)

for p in "${patterns[@]}"; do
  if [[ "$input" =~ $p ]]; then
    echo "차단: 시크릿·민감 파일에 접근할 수 없습니다 ($input)" >&2
    echo "필요한 값은 환경변수 참조로 처리하세요." >&2
    exit 1
  fi
done

exit 0
