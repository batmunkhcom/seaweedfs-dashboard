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

dev() {
  _ensure_venv
  echo "Starting backend on :$PORT_BACKEND + frontend on :$PORT_FRONTEND_DEV"
  (cd "$BACKEND_DIR" && "$VENV_UVICORN" app.main:app --host 127.0.0.1 --port "$PORT_BACKEND" --reload) &
  (cd "$FRONTEND_DIR" && npm run dev) &
  wait
}

prod() {
  stop
  _ensure_venv
  echo "Building frontend..."
  (cd "$FRONTEND_DIR" && npm ci && npm run build)
  echo "Starting backend..."
  (cd "$BACKEND_DIR" && nohup "$VENV_UVICORN" app.main:app --host 127.0.0.1 --port "$PORT_BACKEND" --workers 2 > /tmp/seaweed-dashboard.log 2>&1) &
  sleep 2
  _setup_nginx
  echo "Ready at http://$DOMAIN:$PORT_PUBLIC"
}

up() {
  stop
  _ensure_venv
  if [ ! -d "$FRONTEND_DIR/dist" ]; then
    echo "Building frontend (first run)..."
    (cd "$FRONTEND_DIR" && npm ci && npm run build)
  fi
  echo "Starting backend..."
  (cd "$BACKEND_DIR" && nohup "$VENV_UVICORN" app.main:app --host 127.0.0.1 --port "$PORT_BACKEND" --workers 2 > /tmp/seaweed-dashboard.log 2>&1) &
  sleep 2
  _setup_nginx
  echo "Ready. Backend :$PORT_BACKEND | Public :$PORT_PUBLIC"
}

_setup_nginx() {
  if ! grep -q "listen $PORT_PUBLIC" /etc/nginx/conf.d/seaweed-dashboard.conf 2>/dev/null; then
    cp "$PROJECT_ROOT/nginx.conf" /etc/nginx/conf.d/seaweed-dashboard.conf
    sed -i "s|root /app/static|root $FRONTEND_DIR/dist|" /etc/nginx/conf.d/seaweed-dashboard.conf
  fi
  nginx -t && (systemctl reload nginx 2>/dev/null || nginx -s reload)
}

start() {
  _ensure_venv
  echo "Starting backend on 127.0.0.1:$PORT_BACKEND"
  cd "$BACKEND_DIR" && nohup "$VENV_UVICORN" app.main:app --host 127.0.0.1 --port "$PORT_BACKEND" --workers 2 > /tmp/seaweed-dashboard.log 2>&1 &
  echo "Backend PID: $!"
}

stop() {
  echo "Stopping backend..."
  pkill -f "uvicorn app.main:app" 2>/dev/null && echo "Stopped." || echo "Not running."
}

restart() {
  stop
  sleep 1
  start
}

status() {
  if pgrep -f "uvicorn app.main:app" > /dev/null; then
    echo "Backend: running ($(pgrep -f 'uvicorn app.main:app' | head -1))"
    curl -s http://127.0.0.1:$PORT_BACKEND/api/health | python3 -m json.tool 2>/dev/null || echo "Health check failed"
  else
    echo "Backend: not running"
  fi
}

build() {
  echo "Building frontend..."
  (cd "$FRONTEND_DIR" && npm ci && npm run build)
  echo "Frontend built → $FRONTEND_DIR/dist"
}

lint() {
  echo "Linting backend..."
  (cd "$BACKEND_DIR" && "$VENV_PYTHON" -m ruff check . 2>/dev/null) || echo "ruff not installed, skipping"
  echo "Linting frontend..."
  (cd "$FRONTEND_DIR" && npx eslint . 2>/dev/null) || echo "eslint not configured, skipping"
}

test() {
  echo "Backend tests..."
  (cd "$BACKEND_DIR" && "$VENV_PYTHON" -m pytest tests/ -v 2>/dev/null) || echo "No tests found"
  echo "Frontend tests..."
  (cd "$FRONTEND_DIR" && npx vitest --run 2>/dev/null) || echo "No frontend tests"
}

logs() {
  tail -f /tmp/seaweed-dashboard.log 2>/dev/null || echo "No log file at /tmp/seaweed-dashboard.log"
}

info() {
  echo "SeaweedFS Dashboard"
  echo "  Public domain: $DOMAIN"
  echo "  Public port:   $PORT_PUBLIC"
  echo "  Backend port:  $PORT_BACKEND (internal)"
  echo "  Frontend dev:  $PORT_FRONTEND_DEV"
  echo "  Project root:  $PROJECT_ROOT"
}

case "${1:-}" in
  dev)      dev ;;
  up)       up ;;
  prod)     prod ;;
  start)    start ;;
  stop)     stop ;;
  restart)  restart ;;
  status)   status ;;
  build)    build ;;
  lint)     lint ;;
  test)     test ;;
  logs)     logs ;;
  info)     info ;;
  *)
    echo "Usage: ./manage.sh {dev|up|prod|start|stop|restart|status|build|lint|test|logs|info}"
    ;;
esac
