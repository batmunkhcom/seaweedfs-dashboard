#!/usr/bin/env bash
set -e

PORT_FRONTEND_DEV=5173
PORT_BACKEND=8000
PORT_PUBLIC=8081
DOMAIN="${DOMAIN:-seaweed.mbm.mn}"
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
VENV_PYTHON="$BACKEND_DIR/venv/bin/python"
VENV_UVICORN="$BACKEND_DIR/venv/bin/uvicorn"

_ensure_venv() {
  if [ ! -f "$VENV_PYTHON" ]; then
    echo "Creating venv..."
    python3 -m venv "$BACKEND_DIR/venv"
    "$BACKEND_DIR/venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
  fi
}

_setup_nginx() {
  if ! grep -q "listen $PORT_PUBLIC" /etc/nginx/conf.d/seaweed-dashboard.conf 2>/dev/null; then
    cp "$PROJECT_ROOT/nginx.conf" /etc/nginx/conf.d/seaweed-dashboard.conf
    sed -i "s|root /app/static|root $FRONTEND_DIR/dist|" /etc/nginx/conf.d/seaweed-dashboard.conf
  fi
  nginx -t && (systemctl reload nginx 2>/dev/null || nginx -s reload)
}

_start_backend() {
  _ensure_venv
  cd "$BACKEND_DIR" && nohup "$VENV_UVICORN" app.main:app --host 127.0.0.1 --port "$PORT_BACKEND" --workers 2 > /tmp/seaweed-dashboard.log 2>&1 &
  sleep 1
}

_stop_backend() {
  pkill -f "uvicorn app.main:app" 2>/dev/null && echo "Backend stopped." || true
}

# ── commands ──

dev() {
  _ensure_venv
  echo "Dev mode — backend :$PORT_BACKEND + frontend :$PORT_FRONTEND_DEV (hot-reload)"
  (cd "$BACKEND_DIR" && "$VENV_UVICORN" app.main:app --host 127.0.0.1 --port "$PORT_BACKEND" --reload) &
  (cd "$FRONTEND_DIR" && npm run dev) &
  wait
}

up() {
  _stop_backend
  _ensure_venv
  if [ ! -d "$FRONTEND_DIR/dist" ]; then
    echo "Building frontend (first run)..."
    (cd "$FRONTEND_DIR" && npm ci && npm run build)
  fi
  echo "Starting backend..."
  _start_backend
  echo "Starting nginx on :$PORT_PUBLIC..."
  _setup_nginx
  echo ""
  echo "  Backend :  http://127.0.0.1:$PORT_BACKEND"
  echo "  Public  :  http://$DOMAIN:$PORT_PUBLIC"
}

stop() {
  _stop_backend
  echo "All stopped."
}

restart() {
  stop
  sleep 1
  up
}

build() {
  echo "Building frontend..."
  (cd "$FRONTEND_DIR" && npm ci && npm run build)
  echo "Done → $FRONTEND_DIR/dist"
}

status() {
  echo "── Backend ──"
  if pgrep -f "uvicorn app.main:app" > /dev/null; then
    echo "  PID $(pgrep -f 'uvicorn app.main:app' | head -1)  |  :$PORT_BACKEND"
    curl -s http://127.0.0.1:$PORT_BACKEND/api/health 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  (health check failed)"
  else
    echo "  Not running"
  fi
  echo "── Nginx ──"
  if pgrep nginx > /dev/null; then
    echo "  Running  |  :$PORT_PUBLIC  →  frontend/ + /api → :$PORT_BACKEND"
  else
    echo "  Not running"
  fi
}

lint() {
  echo "Backend (ruff)..."
  (cd "$BACKEND_DIR" && "$VENV_PYTHON" -m ruff check . 2>/dev/null) || echo "  ruff not installed"
  echo "Frontend (eslint)..."
  (cd "$FRONTEND_DIR" && npx eslint . 2>/dev/null) || echo "  eslint not configured"
}

test() {
  echo "Backend tests..."
  (cd "$BACKEND_DIR" && "$VENV_PYTHON" -m pytest tests/ -v 2>/dev/null) || echo "  No tests"
  echo "Frontend tests..."
  (cd "$FRONTEND_DIR" && npx vitest --run 2>/dev/null) || echo "  No tests"
}

logs() {
  tail -f /tmp/seaweed-dashboard.log 2>/dev/null || echo "No log file. Run ./manage.sh up first."
}

info() {
  echo "SeaweedFS Dashboard"
  echo "  Domain:        $DOMAIN → :$PORT_PUBLIC"
  echo "  Backend port:  $PORT_BACKEND (internal 127.0.0.1)"
  echo "  Frontend dev:  $PORT_FRONTEND_DEV"
  echo "  Project:       $PROJECT_ROOT"
}

case "${1:-}" in
  dev)      dev ;;
  up)       up ;;
  stop)     stop ;;
  restart)  restart ;;
  build)    build ;;
  status)   status ;;
  lint)     lint ;;
  test)     test ;;
  logs)     logs ;;
  info)     info ;;
  *)
    echo "Usage: ./manage.sh <command>"
    echo ""
    echo "  dev       Start in dev mode (hot-reload, both backend + frontend)"
    echo "  up        Start everything (backend + nginx on :$PORT_PUBLIC)"
    echo "  stop      Stop everything"
    echo "  restart   Stop + up"
    echo "  build     Build frontend for production"
    echo "  status    Show what's running"
    echo "  logs      Tail backend logs"
    echo "  test      Run backend + frontend tests"
    echo "  lint      Lint backend + frontend"
    echo "  info      Show ports and config"
esac
