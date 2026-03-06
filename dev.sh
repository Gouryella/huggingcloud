#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$ROOT_DIR/.dev"

BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PID_FILE="$RUNTIME_DIR/backend.pid"
FRONTEND_PID_FILE="$RUNTIME_DIR/frontend.pid"

BACKEND_LOG_FILE="$RUNTIME_DIR/backend.log"
FRONTEND_LOG_FILE="$RUNTIME_DIR/frontend.log"

BACKEND_URL="http://localhost:8000"
FRONTEND_URL="http://localhost:3000"

ensure_runtime_dir() {
  mkdir -p "$RUNTIME_DIR"
}

ensure_frontend_env() {
  local env_file="$FRONTEND_DIR/.env.local"
  if [[ ! -f "$env_file" ]]; then
    cat > "$env_file" <<'EOC'
INTERNAL_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
EOC
    echo "[frontend] Created default .env.local"
  fi
}

check_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
}

bootstrap_deps_if_needed() {
  if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
    echo "[backend] .venv not found, running: uv sync --group dev"
    (cd "$BACKEND_DIR" && uv sync --group dev)
  fi

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "[frontend] node_modules not found, running: pnpm install"
    (cd "$FRONTEND_DIR" && pnpm install)
  fi
}

is_pid_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

service_pid() {
  local pid_file="$1"
  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" || ! "$pid" =~ ^[0-9]+$ ]]; then
    rm -f "$pid_file"
    return 1
  fi

  if ! is_pid_running "$pid"; then
    rm -f "$pid_file"
    return 1
  fi

  echo "$pid"
}

start_service() {
  local name="$1"
  local workdir="$2"
  local pid_file="$3"
  local log_file="$4"
  local command="$5"

  local pid
  if pid="$(service_pid "$pid_file")"; then
    echo "[$name] already running (pid=$pid)"
    return 0
  fi

  echo "[$name] starting..."
  (
    cd "$workdir"
    nohup bash -lc "exec $command" >>"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )

  sleep 1

  if pid="$(service_pid "$pid_file")"; then
    echo "[$name] started (pid=$pid), log: $log_file"
    return 0
  fi

  echo "[$name] failed to start. Last log lines:"
  if [[ -f "$log_file" ]]; then
    tail -n 40 "$log_file"
  else
    echo "(no log file)"
  fi
  return 1
}

stop_service() {
  local name="$1"
  local pid_file="$2"

  local pid
  if ! pid="$(service_pid "$pid_file")"; then
    echo "[$name] already stopped"
    return 0
  fi

  echo "[$name] stopping (pid=$pid)..."
  pkill -TERM -P "$pid" >/dev/null 2>&1 || true
  kill -TERM "$pid" >/dev/null 2>&1 || true

  local i
  for i in {1..20}; do
    if ! is_pid_running "$pid"; then
      rm -f "$pid_file"
      echo "[$name] stopped"
      return 0
    fi
    sleep 0.25
  done

  echo "[$name] force killing (pid=$pid)..."
  pkill -KILL -P "$pid" >/dev/null 2>&1 || true
  kill -KILL "$pid" >/dev/null 2>&1 || true
  rm -f "$pid_file"
  echo "[$name] stopped"
}

status_service() {
  local name="$1"
  local pid_file="$2"
  local log_file="$3"
  local url="$4"

  local pid
  if pid="$(service_pid "$pid_file")"; then
    echo "[$name] running (pid=$pid)"
    echo "[$name] url: $url"
    echo "[$name] log: $log_file"
    return 0
  fi

  echo "[$name] stopped"
  echo "[$name] log: $log_file"
  return 1
}

print_cookie_host_tip() {
  echo "Tip: use the same host for frontend and backend to keep login cookies valid."
  echo "Recommended: open $FRONTEND_URL and keep NEXT_PUBLIC_API_BASE_URL as http://localhost:8000."
}

start_all() {
  ensure_runtime_dir
  check_command uv
  check_command pnpm
  bootstrap_deps_if_needed
  ensure_frontend_env

  start_service "backend" "$BACKEND_DIR" "$BACKEND_PID_FILE" "$BACKEND_LOG_FILE" "uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
  start_service "frontend" "$FRONTEND_DIR" "$FRONTEND_PID_FILE" "$FRONTEND_LOG_FILE" "pnpm dev"

  echo "All services started."
  status_all || true
}

stop_all() {
  stop_service "frontend" "$FRONTEND_PID_FILE"
  stop_service "backend" "$BACKEND_PID_FILE"
}

status_all() {
  local rc=0
  print_cookie_host_tip
  status_service "backend" "$BACKEND_PID_FILE" "$BACKEND_LOG_FILE" "$BACKEND_URL" || rc=1
  status_service "frontend" "$FRONTEND_PID_FILE" "$FRONTEND_LOG_FILE" "$FRONTEND_URL" || rc=1
  return "$rc"
}

usage() {
  cat <<'EOT'
Usage: ./dev.sh {start|stop|restart|status}

Commands:
  start    Start backend and frontend in dev mode
  stop     Stop backend and frontend
  restart  Restart backend and frontend
  status   Show backend and frontend status
EOT
}

main() {
  local action="${1:-}"

  case "$action" in
    start)
      start_all
      ;;
    stop)
      stop_all
      ;;
    restart)
      stop_all
      start_all
      ;;
    status)
      status_all
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
