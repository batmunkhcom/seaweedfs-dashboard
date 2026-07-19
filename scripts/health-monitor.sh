#!/bin/bash
# SeaweedFS Dashboard — Health Monitor Cron Script
# Checks /api/health every 5 minutes, logs failures, can send webhook alerts
# Place in crontab: */5 * * * * /home/seaweed-dashboard/scripts/health-monitor.sh

LOG_DIR="/home/seaweed-dashboard/backend/logs"
LOG_FILE="$LOG_DIR/health-monitor.log"
BACKEND_URL="http://127.0.0.1:8000"
FRONTEND_URL="http://127.0.0.1:8081"
WEBHOOK_URL="${WEBHOOK_URL:-}"  # Set in .env or export: WEBHOOK_URL=https://hooks.slack.com/...
MAX_LOG_SIZE_MB=10

mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }

rotate_log() {
    SIZE=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
    if [ "$SIZE" -gt $((MAX_LOG_SIZE_MB * 1024 * 1024)) ]; then
        mv "$LOG_FILE" "$LOG_FILE.old"
    fi
}

send_alert() {
    if [ -n "$WEBHOOK_URL" ]; then
        curl -s -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"[seaweed-dashboard] $1\"}" > /dev/null 2>&1
    fi
}

rotate_log

HEALTH=$(curl -s --max-time 10 "$BACKEND_URL/api/health" 2>/dev/null)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BACKEND_URL/api/health" 2>/dev/null)

if [ "$HTTP_CODE" != "200" ]; then
    log "ALERT: Backend health check failed — HTTP $HTTP_CODE"
    send_alert "Backend health check FAILED — HTTP $HTTP_CODE"
    exit 1
fi

STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','unknown'))" 2>/dev/null)
DB_OK=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('database',False))" 2>/dev/null)
COMP_COUNT=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('components',[])))" 2>/dev/null)

if [ "$STATUS" != "healthy" ] || [ "$DB_OK" != "True" ]; then
    log "ALERT: Backend unhealthy — status=$STATUS db=$DB_OK components=$COMP_COUNT"
    send_alert "Backend unhealthy — status=$STATUS db=$DB_OK components=$COMP_COUNT"
    exit 2
fi

STALE=0
echo "$HEALTH" | python3 -c "
import sys, json
from datetime import datetime, timezone
data = json.load(sys.stdin)
for c in data.get('components', []):
    ttl = c.get('ttl_seconds', 300)
    try:
        hb = datetime.strptime(c['last_heartbeat'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - hb).total_seconds()
        if age > ttl:
            print(f'STALE:{c[\"name\"]}:{age:.0f}s/{ttl}s')
    except:
        pass
" 2>/dev/null > /tmp/stale-components.txt

if [ -s /tmp/stale-components.txt ]; then
    while read -r line; do
        log "ALERT: Stale heartbeat — $line"
        send_alert "Stale heartbeat — $line"
    done < /tmp/stale-components.txt
    STALE=1
    rm -f /tmp/stale-components.txt
fi

FE_COUNT=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$FRONTEND_URL" 2>/dev/null)
if [ "$FE_COUNT" != "200" ]; then
    log "ALERT: Frontend unreachable — HTTP $FE_COUNT"
    send_alert "Frontend unreachable — HTTP $FE_COUNT"
    exit 3
fi

if [ "$STALE" -eq 0 ]; then
    log "OK — status=$STATUS db_ok=$DB_OK components=$COMP_COUNT frontend=$FE_COUNT"
fi
