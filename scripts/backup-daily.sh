#!/bin/bash
# SeaweedFS Dashboard — Daily Backup Cron Script
# Place in crontab: 0 3 * * * /home/seaweed-dashboard/scripts/backup-daily.sh

LOG_DIR="/home/seaweed-dashboard/backend/logs"
LOG_FILE="$LOG_DIR/backup-cron-$(date +%Y%m%d).log"
BACKEND_URL="http://127.0.0.1:8000"
ADMIN_USER="admin"
ADMIN_PASS="REDACTED"
RETENTION_DAYS=30

mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }

log "Starting daily backup..."

CSRF_TOKEN=$(curl -s -c /tmp/backup-cookies.txt "$BACKEND_URL/api/auth/csrf-token" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('csrfToken',''))" 2>/dev/null)

if [ -z "$CSRF_TOKEN" ]; then
    CSRF_TOKEN=$(curl -s -c /tmp/backup-cookies.txt "$BACKEND_URL/api/auth/csrf-token" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('csrf_token',''))" 2>/dev/null)
fi

log "CSRF token: ${CSRF_TOKEN:0:8}..."

LOGIN_RESP=$(curl -s -b /tmp/backup-cookies.txt -c /tmp/backup-cookies.txt \
    -X POST "$BACKEND_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $CSRF_TOKEN" \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" 2>/dev/null)

if echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('user') else 1)" 2>/dev/null; then
    log "Login successful"
else
    log "ERROR: Login failed — $LOGIN_RESP"
    exit 1
fi

CSRF_TOKEN2=$(curl -s -b /tmp/backup-cookies.txt "$BACKEND_URL/api/auth/csrf-token" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('csrfToken', d.get('csrf_token','')))" 2>/dev/null)

SYNC_RESP=$(curl -s -b /tmp/backup-cookies.txt \
    -X POST "$BACKEND_URL/api/backup/sync" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $CSRF_TOKEN2" \
    -d '{}' 2>/dev/null)

if echo "$SYNC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('ok') else 1)" 2>/dev/null; then
    BYTES=$(echo "$SYNC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('bytesSynced',0))" 2>/dev/null)
    log "Backup OK — $BYTES bytes synced"
else
    log "ERROR: Backup failed — $SYNC_RESP"
    exit 2
fi

CLEANUP_RESP=$(curl -s -b /tmp/backup-cookies.txt \
    "$BACKEND_URL/api/dashboard/alerts?status=resolved" 2>/dev/null)

rm -f /tmp/backup-cookies.txt
log "Daily backup complete"

find "$LOG_DIR" -name "backup-cron-*.log" -mtime +$RETENTION_DAYS -delete 2>/dev/null
