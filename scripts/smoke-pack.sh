#!/usr/bin/env bash
#
# smoke-pack.sh — build, pack, install the tarball into a throwaway dir, and run
# the CLI from an UNRELATED cwd to prove the package is self-contained (bundled
# dist + core, package-relative core resolution). Never touches the real HOME.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> build"
npm run build >/dev/null

echo "==> guard: tarball must not ship tests / source maps / local config"
listing="$(npm pack --dry-run 2>&1)"
if echo "$listing" | grep -Eq '\.map|/tests/|settings\.local|/generated/'; then
  echo "FAIL: tarball contains excluded files:" >&2
  echo "$listing" | grep -E '\.map|/tests/|settings\.local|/generated/' >&2
  exit 1
fi

echo "==> pack"
TARBALL="$ROOT/$(npm pack 2>/dev/null | tail -1)"
trap 'rm -f "$TARBALL"' EXIT
echo "    $TARBALL"

WORK="$(mktemp -d)"
trap 'rm -f "$TARBALL"; rm -rf "$WORK"' EXIT
cd "$WORK"
npm init -y >/dev/null 2>&1
npm install "$TARBALL" >/dev/null 2>&1
BIN="$WORK/node_modules/.bin/ai-agent-setup"

echo "==> run CLI from $WORK"
test "$("$BIN" --version)" = "$(node -p "require('$ROOT/package.json').version")"
"$BIN" --help  >/dev/null
"$BIN" build --target=claude >/dev/null
"$BIN" build --target=codex  >/dev/null
"$BIN" list  --target=all    >/dev/null
test -f "$WORK/node_modules/ai-agent-setup/core/mcp/servers.yaml"  # core shipped

echo "PASS: packaged CLI runs from an unrelated cwd with bundled core"
