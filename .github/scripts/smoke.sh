#!/usr/bin/env bash
# Post-deploy smoke test: smoke.sh https://host
# Fails (non-zero) on any non-200 or missing marker. /r/demo/pt reads D1 (restaurant + i18n rows), so a Worker with a
# broken or unmigrated database cannot pass. Needs the demo venue (packages/shared/seed.sql) in the target D1.
# SMOKE_RETRIES covers DNS/cert propagation on a fresh custom domain.
set -uo pipefail

base="${1:?usage: smoke.sh https://host}"
base="${base%/}"
retries="${SMOKE_RETRIES:-6}"
body="$(mktemp)"
trap 'rm -f "$body"' EXIT
failed=0

check() { # check <path> [marker that must appear in the body]
  local path="$1" marker="${2:-}" code
  code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 20 \
    --retry "$retries" --retry-delay 5 --retry-all-errors "$base$path")" || code="curl-error"
  if [ "$code" != "200" ]; then
    echo "FAIL $path -> HTTP $code"; failed=1
  elif [ -n "$marker" ] && ! grep -q -- "$marker" "$body"; then
    echo "FAIL $path -> 200 but body lacks '$marker'"; failed=1
  else
    echo "ok   $path"
  fi
}

check /                          # landing
check /r/demo/pt "Casa Strega"   # guest menu, DB-backed
check /admin/login               # CMS Worker and its route

exit "$failed"
