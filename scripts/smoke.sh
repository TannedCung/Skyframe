#!/usr/bin/env bash
# Usage: ./scripts/smoke.sh <session_cookie_value> [base_url]
# Example:
#   ./scripts/smoke.sh "eyJhbGci..." https://skyframe-eta.vercel.app
#
# Runs lightweight curl checks against the deployed app.
# Exit code 0 = all passed, non-zero = at least one failure.

set -euo pipefail

SESSION_VALUE="${1:-}"
BASE="${2:-https://skyframe-eta.vercel.app}"
COOKIE="__Secure-next-auth.session-token=$SESSION_VALUE"

PASS=0
FAIL=0

check() {
  local label="$1" expected="$2" method="$3" path="$4"
  shift 4
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "$BASE$path" "$@")
  if [ "$status" = "$expected" ]; then
    echo "  ✓  $label ($status)"
    ((PASS++)) || true
  else
    echo "  ✗  $label — expected $expected, got $status"
    ((FAIL++)) || true
  fi
}

echo ""
echo "Smoke test → $BASE"
echo "─────────────────────────────────────────────────────"

echo ""
echo "[1] Unauthenticated API → 401"
check "GET  /api/trips"              401 GET    /api/trips
check "POST /api/trips"              401 POST   /api/trips   -H 'content-type: application/json' --data '{}'
check "GET  /api/trips/:id"          401 GET    /api/trips/fake-id
check "POST /api/trips/:id/sg1"      401 POST   /api/trips/fake-id/generate-sg1
check "POST /api/trips/:id/sg2"      401 POST   /api/trips/fake-id/generate-sg2 -H 'content-type: application/json' --data '{}'
check "GET  /api/settings"           401 GET    /api/settings

if [ -z "$SESSION_VALUE" ]; then
  echo ""
  echo "No session cookie provided — skipping authenticated checks."
else
  echo ""
  echo "[2] Authenticated CRUD"
  AUTH=(-b "$COOKIE" -H 'content-type: application/json')

  check "GET  /api/trips → 200"      200 GET    /api/trips    "${AUTH[@]}"
  check "GET  /api/settings → 200"   200 GET    /api/settings "${AUTH[@]}"

  # Create a smoke-test trip
  RESPONSE=$(curl -s -X POST "$BASE/api/trips" "${AUTH[@]}" \
    --data-raw '{"title":"__smoke__","originAirport":"HAN","destinationCity":"Test","startDate":"2027-06-01","endDate":"2027-06-10","tripType":"round_trip"}')
  TRIP_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ -n "$TRIP_ID" ]; then
    echo "  ✓  POST /api/trips → created $TRIP_ID"
    ((PASS++)) || true

    check "GET  /api/trips/:id → 200"   200 GET    /api/trips/$TRIP_ID  "${AUTH[@]}"

    # Clean up
    DEL_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/trips/$TRIP_ID" "${AUTH[@]}")
    if [ "$DEL_STATUS" = "200" ]; then
      echo "  ✓  DELETE /api/trips/:id ($DEL_STATUS) — cleaned up"
      ((PASS++)) || true
    else
      echo "  ✗  DELETE /api/trips/:id — expected 200, got $DEL_STATUS"
      ((FAIL++)) || true
    fi
  else
    echo "  ✗  POST /api/trips — no trip id in response"
    ((FAIL++)) || true
  fi
fi

echo ""
echo "─────────────────────────────────────────────────────"
echo "  Passed: $PASS   Failed: $FAIL"
echo ""

[ "$FAIL" -eq 0 ]
