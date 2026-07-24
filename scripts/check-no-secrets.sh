#!/usr/bin/env bash
#
# check-no-secrets.sh — fail if anything that looks like a real credential slipped
# into tracked source, fixtures, or snapshots. Secrets must only ever appear as
# ${VAR} placeholders (references), never literal values.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Scan tracked, human-authored surfaces (not dist/ or node_modules/).
targets=(core tests README.md docs)
present=()
for t in "${targets[@]}"; do [ -e "$t" ] && present+=("$t"); done

# Common real-credential shapes. ${VAR} placeholders never match these.
patterns=(
  'sk-[A-Za-z0-9]{16,}'                 # OpenAI-style keys
  'ghp_[A-Za-z0-9]{20,}'                # GitHub PAT
  'github_pat_[A-Za-z0-9_]{20,}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'        # Slack
  'AKIA[0-9A-Z]{16}'                    # AWS access key id
  'secret_[A-Za-z0-9]{32,}'             # Notion internal integration secret
  'ntn_[A-Za-z0-9]{20,}'                # Notion token
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'  # private keys
)

fail=0
for p in "${patterns[@]}"; do
  if grep -REn --binary-files=without-match "$p" "${present[@]}" 2>/dev/null; then
    echo "FAIL: possible real secret matching /$p/ above" >&2
    fail=1
  fi
done

# Every MCP env value in core must be a ${VAR} reference, not a literal.
if [ -f core/mcp/servers.yaml ]; then
  # crude: lines under env: of the form KEY: value — value must be ${...}
  bad="$(grep -nE '^[[:space:]]+[A-Z0-9_]+:[[:space:]]*' core/mcp/servers.yaml | grep -vE ':[[:space:]]*\$\{[A-Z0-9_]+\}[[:space:]]*$' | grep -vE '(enabled|transport|command|args|url):' || true)"
  if [ -n "$bad" ]; then
    echo "FAIL: core/mcp/servers.yaml has a non-\${VAR} env value:" >&2
    echo "$bad" >&2
    fail=1
  fi
fi

if [ "$fail" -ne 0 ]; then exit 1; fi
echo "PASS: no literal secrets in tracked sources; MCP env uses \${VAR} references"
