#!/usr/bin/env bash
# chassis-delegation selfcheck for a new machine: validate the plugin, run its
# tests, and print the line that loads it. Run from anywhere:
#   bash scripts/selfcheck.sh
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
status=0

if ! command -v claude >/dev/null 2>&1; then
  echo "selfcheck: the claude CLI is not on PATH; install Claude Code first" >&2
  exit 2
fi

echo "== claude plugin validate $DIR"
if ! claude plugin validate "$DIR"; then
  echo "selfcheck: validate FAILED" >&2
  status=1
fi

echo
echo "== claude plugin test $DIR"
out="$(claude plugin test "$DIR" 2>&1)"
code=$?
printf '%s\n' "$out" | tail -n 40
if printf '%s' "$out" | grep -q 'rollout switch'; then
  echo
  echo "selfcheck: plugin tests are switched off in this Claude Code build (the hooks rollout switch serves off)."
  echo "           The mod itself loads only where that switch is on. The pure tests run without it:"
  if command -v node >/dev/null 2>&1; then
    echo "== node tests/node/run.mjs"
    (cd "$DIR" && node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs | tail -n 4) || status=1
  else
    echo "           (node is not on PATH; skipped)"
  fi
elif [ "$code" -ne 0 ]; then
  echo "selfcheck: tests FAILED" >&2
  status=1
fi

echo
echo "Load it in Claude Code with either of:"
echo "  claude --plugin-dir $DIR"
echo "  export CLAUDE_CODE_PLUGIN_DIRS=$DIR"
echo "Then, inside Claude Code in the repo you work on: /delegation init"
exit $status
