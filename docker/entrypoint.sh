#!/bin/sh
set -eu

API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${API_PORT:-8000}"
WEB_HOST="${WEB_HOST:-0.0.0.0}"
WEB_PORT="${WEB_PORT:-3000}"

# Ensure frontend server-side requests hit the in-container backend by default.
export INTERNAL_API_BASE_URL="${INTERNAL_API_BASE_URL:-http://127.0.0.1:${API_PORT}}"

shutdown() {
  kill "${api_pid:-}" "${web_pid:-}" 2>/dev/null || true
  wait "${api_pid:-}" 2>/dev/null || true
  wait "${web_pid:-}" 2>/dev/null || true
}

trap 'shutdown; exit 0' INT TERM

cd /app
uvicorn app.main:app --host "$API_HOST" --port "$API_PORT" &
api_pid=$!

export HOSTNAME="$WEB_HOST"
export PORT="$WEB_PORT"
node /app/frontend/frontend/server.js &
web_pid=$!

while :; do
  if ! kill -0 "$api_pid" 2>/dev/null; then
    if wait "$api_pid"; then
      status=0
    else
      status=$?
    fi
    shutdown
    exit "$status"
  fi

  if ! kill -0 "$web_pid" 2>/dev/null; then
    if wait "$web_pid"; then
      status=0
    else
      status=$?
    fi
    shutdown
    exit "$status"
  fi

  sleep 1
done
