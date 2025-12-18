#!/bin/bash

# ╔═══════════════════════════════════════════════════════════════════╗
# ║              FACILITATOR ALERTING SYSTEM                          ║
# ╚═══════════════════════════════════════════════════════════════════╝
#
# Monitors critical metrics and sends alerts when thresholds are exceeded.
# Integrates with Slack, Discord, Email, and custom webhooks.
#
# USAGE:
#   ./monitor-alerts.sh
#   ./monitor-alerts.sh --once    # Run once without loop
#
# ENVIRONMENT VARIABLES:
#   SLACK_WEBHOOK_URL          - Slack webhook for notifications
#   DISCORD_WEBHOOK_URL        - Discord webhook for notifications
#   ALERT_EMAIL                - Email address for alerts
#   CUSTOM_WEBHOOK_URL         - Custom webhook endpoint
#   ALERT_MEMORY_THRESHOLD     - Memory % (default: 80)
#   ALERT_CPU_THRESHOLD        - CPU % (default: 90)
#   ALERT_MYSQL_THRESHOLD      - MySQL connections (default: 180)
#   ALERT_DISK_THRESHOLD       - Disk % (default: 85)
#   ALERT_PENDING_TX           - Pending transactions (default: 100)
#   SERVER_NAME                - Server identifier (default: x402-facilitator)
#
# EXAMPLES:
#   ./monitor-alerts.sh
#   SLACK_WEBHOOK_URL=https://hooks.slack.com/... ./monitor-alerts.sh
#
# SETUP AS CRON:
#   */2 * * * * /srv/x402/x402-facilitator/scripts/monitor-alerts.sh
#
# MONITORED METRICS:
#   - System memory usage
#   - CPU usage
#   - MySQL connection count
#   - Disk space
#   - Pending transactions
#   - Process health (PM2)
#
# REQUIREMENTS:
#   - curl for webhook notifications
#   - mail command for email alerts
#   - MySQL credentials in environment

set -e

# Configuration from environment or defaults
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
DISCORD_WEBHOOK="${DISCORD_WEBHOOK_URL:-}"
EMAIL_TO="${ALERT_EMAIL:-}"
CUSTOM_WEBHOOK="${CUSTOM_WEBHOOK_URL:-}"
ALERT_LOG="/var/log/x402-alerts.log"

# Thresholds
MEMORY_THRESHOLD="${ALERT_MEMORY_THRESHOLD:-80}"
CPU_THRESHOLD="${ALERT_CPU_THRESHOLD:-90}"
MYSQL_THRESHOLD="${ALERT_MYSQL_THRESHOLD:-180}"
DISK_THRESHOLD="${ALERT_DISK_THRESHOLD:-85}"
PENDING_TX_THRESHOLD="${ALERT_PENDING_TX:-100}"

# MySQL config
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
MYSQL_HOST="${MYSQL_HOST:-localhost}"
MYSQL_DB="${MYSQL_DB:-x402_facilitator}"

# Server identifier (useful for multi-region)
SERVER_NAME="${SERVER_NAME:-x402-facilitator}"
SERVER_REGION="${SERVER_REGION:-unknown}"

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# Function to log alerts
log_alert() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${SERVER_NAME}] $1" | tee -a "$ALERT_LOG"
}

# Function to send to Slack
send_slack() {
    local severity=$1
    local message=$2
    
    if [ -z "$SLACK_WEBHOOK" ]; then
        return
    fi
    
    local color="danger"
    if [ "$severity" = "warning" ]; then
        color="warning"
    elif [ "$severity" = "info" ]; then
        color="good"
    fi
    
    local payload=$(cat <<EOF
{
  "attachments": [{
    "color": "$color",
    "title": "🚨 x402 Facilitator Alert",
    "fields": [
      {
        "title": "Server",
        "value": "${SERVER_NAME} (${SERVER_REGION})",
        "short": true
      },
      {
        "title": "Severity",
        "value": "${severity}",
        "short": true
      },
      {
        "title": "Message",
        "value": "${message}",
        "short": false
      },
      {
        "title": "Time",
        "value": "$(date '+%Y-%m-%d %H:%M:%S')",
        "short": true
      }
    ]
  }]
}
EOF
)
    
    curl -s -X POST -H 'Content-type: application/json' --data "$payload" "$SLACK_WEBHOOK" >/dev/null 2>&1
}

# Function to send to Discord
send_discord() {
    local severity=$1
    local message=$2
    
    if [ -z "$DISCORD_WEBHOOK" ]; then
        return
    fi
    
    local color=15158332  # Red
    if [ "$severity" = "warning" ]; then
        color=16776960  # Yellow
    elif [ "$severity" = "info" ]; then
        color=3066993  # Green
    fi
    
    local payload=$(cat <<EOF
{
  "embeds": [{
    "title": "🚨 x402 Facilitator Alert",
    "color": $color,
    "fields": [
      {"name": "Server", "value": "${SERVER_NAME} (${SERVER_REGION})", "inline": true},
      {"name": "Severity", "value": "${severity}", "inline": true},
      {"name": "Message", "value": "${message}", "inline": false},
      {"name": "Time", "value": "$(date '+%Y-%m-%d %H:%M:%S')", "inline": true}
    ]
  }]
}
EOF
)
    
    curl -s -X POST -H 'Content-type: application/json' --data "$payload" "$DISCORD_WEBHOOK" >/dev/null 2>&1
}

# Function to send email (requires mailutils)
send_email() {
    local severity=$1
    local message=$2
    
    if [ -z "$EMAIL_TO" ] || ! command -v mail >/dev/null 2>&1; then
        return
    fi
    
    local subject="[${severity^^}] x402 Alert: ${SERVER_NAME}"
    local body="Server: ${SERVER_NAME} (${SERVER_REGION})
Severity: ${severity}
Time: $(date '+%Y-%m-%d %H:%M:%S')

Message:
${message}

---
x402 Facilitator Monitoring System"
    
    echo "$body" | mail -s "$subject" "$EMAIL_TO"
}

# Function to send to custom webhook
send_webhook() {
    local severity=$1
    local message=$2
    
    if [ -z "$CUSTOM_WEBHOOK" ]; then
        return
    fi
    
    local payload=$(cat <<EOF
{
  "server": "${SERVER_NAME}",
  "region": "${SERVER_REGION}",
  "severity": "${severity}",
  "message": "${message}",
  "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
EOF
)
    
    curl -s -X POST -H 'Content-type: application/json' --data "$payload" "$CUSTOM_WEBHOOK" >/dev/null 2>&1
}

# Main notification function
notify() {
    local severity=$1
    local message=$2
    
    log_alert "[${severity^^}] ${message}"
    
    # Send to all configured channels
    send_slack "$severity" "$message"
    send_discord "$severity" "$message"
    send_email "$severity" "$message"
    send_webhook "$severity" "$message"
}

# ============================================================================
# CHECKS
# ============================================================================

echo "Running x402 Facilitator health checks..."
echo "Server: ${SERVER_NAME} (${SERVER_REGION})"
echo ""

ALERTS_TRIGGERED=0

# Check memory
MEMORY_PERCENT=$(free | awk 'NR==2{printf "%.1f", $3*100/$2}')
if (( $(echo "$MEMORY_PERCENT > $MEMORY_THRESHOLD" | bc -l) )); then
    notify "critical" "Memory usage critical: ${MEMORY_PERCENT}% (threshold: ${MEMORY_THRESHOLD}%)"
    ((ALERTS_TRIGGERED++))
fi

# Check CPU
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
if (( $(echo "$CPU_USAGE > $CPU_THRESHOLD" | bc -l) )); then
    notify "critical" "CPU usage critical: ${CPU_USAGE}% (threshold: ${CPU_THRESHOLD}%)"
    ((ALERTS_TRIGGERED++))
fi

# Check disk
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt "$DISK_THRESHOLD" ]; then
    notify "critical" "Disk usage critical: ${DISK_USAGE}% (threshold: ${DISK_THRESHOLD}%)"
    ((ALERTS_TRIGGERED++))
fi

# Check MySQL connections
if command -v mysql >/dev/null 2>&1; then
    MYSQL_CMD="mysql -h${MYSQL_HOST} -u${MYSQL_USER}"
    [ -n "$MYSQL_PASSWORD" ] && MYSQL_CMD="$MYSQL_CMD -p${MYSQL_PASSWORD}"
    
    if THREADS_CONNECTED=$($MYSQL_CMD -sN -e "SHOW STATUS LIKE 'Threads_connected'" 2>/dev/null | awk '{print $2}'); then
        if [ "$THREADS_CONNECTED" -gt "$MYSQL_THRESHOLD" ]; then
            notify "critical" "MySQL connections critical: ${THREADS_CONNECTED} (threshold: ${MYSQL_THRESHOLD})"
            ((ALERTS_TRIGGERED++))
        fi
    else
        notify "critical" "MySQL connection failed at ${MYSQL_HOST}"
        ((ALERTS_TRIGGERED++))
    fi
fi

# Check Redis
if command -v redis-cli >/dev/null 2>&1; then
    if ! redis-cli -h "${REDIS_HOST:-localhost}" ping >/dev/null 2>&1; then
        notify "critical" "Redis connection failed"
        ((ALERTS_TRIGGERED++))
    fi
fi

# Check API health
if command -v curl >/dev/null 2>&1; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" != "200" ]; then
        notify "critical" "API health check failed: HTTP ${HTTP_CODE}"
        ((ALERTS_TRIGGERED++))
    fi
fi

# Check PM2 status
if command -v pm2 >/dev/null 2>&1; then
    if ! pm2 describe x402-facilitator >/dev/null 2>&1; then
        notify "critical" "PM2 process 'x402-facilitator' not running"
        ((ALERTS_TRIGGERED++))
    else
        STATUS=$(pm2 jlist | jq -r '.[] | select(.name=="x402-facilitator") | .pm2_env.status' 2>/dev/null || echo "unknown")
        if [ "$STATUS" != "online" ]; then
            notify "critical" "PM2 process status: ${STATUS}"
            ((ALERTS_TRIGGERED++))
        fi
    fi
fi

# Check pending transactions
if command -v mysql >/dev/null 2>&1; then
    if PENDING_TXS=$($MYSQL_CMD -D"${MYSQL_DB}" -sN -e "SELECT COUNT(*) FROM transactions WHERE status='pending'" 2>/dev/null); then
        if [ "$PENDING_TXS" -gt "$PENDING_TX_THRESHOLD" ]; then
            notify "warning" "High number of pending transactions: ${PENDING_TXS} (threshold: ${PENDING_TX_THRESHOLD})"
            ((ALERTS_TRIGGERED++))
        fi
    fi
fi

# Summary
echo ""
if [ "$ALERTS_TRIGGERED" -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed - no alerts triggered${NC}"
else
    echo -e "${RED}⚠️  ${ALERTS_TRIGGERED} alert(s) triggered${NC}"
fi

echo ""
echo "Alert log: ${ALERT_LOG}"
echo "Monitoring completed at $(date '+%Y-%m-%d %H:%M:%S')"
