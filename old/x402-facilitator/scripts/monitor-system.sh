#!/bin/bash

# ╔═══════════════════════════════════════════════════════════════════╗
# ║           SYSTEM HEALTH MONITORING DASHBOARD                      ║
# ╚═══════════════════════════════════════════════════════════════════╝
#
# Comprehensive system health check for the x402 facilitator.
# Displays real-time metrics for all critical components.
#
# USAGE:
#   ./monitor-system.sh
#
# ENVIRONMENT VARIABLES:
#   MYSQL_USER                 - MySQL username (default: root)
#   MYSQL_PASSWORD             - MySQL password
#   MYSQL_HOST                 - MySQL host (default: localhost)
#   MYSQL_PORT                 - MySQL port (default: 3306)
#   MYSQL_DB                   - Database name (default: x402_facilitator)
#   REDIS_HOST                 - Redis host (default: localhost)
#   REDIS_PORT                 - Redis port (default: 6379)
#   LOG_FILE                   - Log file path
#   ALERT_MEMORY_THRESHOLD     - Alert if memory > % (default: 80)
#   ALERT_MYSQL_THRESHOLD      - Alert if connections > N (default: 180)
#
# EXAMPLES:
#   ./monitor-system.sh
#   watch -n 30 ./monitor-system.sh    # Auto-refresh every 30s
#
# MONITORED COMPONENTS:
#   1. System Resources (CPU, Memory, Disk)
#   2. MySQL Database (connections, queries, slow queries)
#   3. Redis Cache (memory, hit rate, operations)
#   4. PM2 Processes (status, memory, restarts)
#   5. Network Connections
#   6. Transaction Queue Status
#
# OUTPUT:
#   - Colored status indicators (Green=OK, Yellow=Warning, Red=Critical)
#   - Real-time metrics dashboard
#   - Alert messages for threshold violations
#   - Logged to file for historical analysis
#
# REQUIREMENTS:
#   - mysql client installed
#   - redis-cli installed
#   - pm2 for process management
#   - jq for JSON parsing

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-setanMERAH@00}"
MYSQL_HOST="${MYSQL_HOST:-localhost}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_DB="${MYSQL_DB:-x402_facilitator}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
LOG_FILE="${LOG_FILE:-/var/log/x402-monitor.log}"
ALERT_MEMORY_THRESHOLD="${ALERT_MEMORY_THRESHOLD:-80}" # Alert if memory > 80%
ALERT_MYSQL_THRESHOLD="${ALERT_MYSQL_THRESHOLD:-180}"  # Alert if connections > 180 (out of 200)

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║          x402 FACILITATOR SYSTEM MONITOR                          ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to log to file
log_metric() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Function to show alert
alert() {
    echo -e "${RED}⚠️  ALERT: $1${NC}"
    log_metric "ALERT: $1"
}

# Function to show warning
warn() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
    log_metric "WARNING: $1"
}

# Function to show success
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to show info
info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# ============================================================================
# SYSTEM RESOURCES
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SYSTEM RESOURCES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Memory usage
MEMORY_TOTAL=$(free -m | awk 'NR==2{print $2}')
MEMORY_USED=$(free -m | awk 'NR==2{print $3}')
MEMORY_FREE=$(free -m | awk 'NR==2{print $4}')
MEMORY_PERCENT=$(awk "BEGIN {printf \"%.1f\", ($MEMORY_USED/$MEMORY_TOTAL)*100}")

echo "Memory:"
echo "  Total: ${MEMORY_TOTAL} MB"
echo "  Used:  ${MEMORY_USED} MB (${MEMORY_PERCENT}%)"
echo "  Free:  ${MEMORY_FREE} MB"

log_metric "MEMORY: ${MEMORY_USED}MB / ${MEMORY_TOTAL}MB (${MEMORY_PERCENT}%)"

if (( $(echo "$MEMORY_PERCENT > $ALERT_MEMORY_THRESHOLD" | bc -l) )); then
    alert "Memory usage critical: ${MEMORY_PERCENT}% (threshold: ${ALERT_MEMORY_THRESHOLD}%)"
elif (( $(echo "$MEMORY_PERCENT > 70" | bc -l) )); then
    warn "Memory usage high: ${MEMORY_PERCENT}%"
else
    success "Memory usage healthy: ${MEMORY_PERCENT}%"
fi

echo ""

# CPU usage
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
echo "CPU Usage: ${CPU_USAGE}%"
log_metric "CPU: ${CPU_USAGE}%"

if (( $(echo "$CPU_USAGE > 90" | bc -l) )); then
    alert "CPU usage critical: ${CPU_USAGE}%"
elif (( $(echo "$CPU_USAGE > 70" | bc -l) )); then
    warn "CPU usage high: ${CPU_USAGE}%"
else
    success "CPU usage healthy: ${CPU_USAGE}%"
fi

echo ""

# Disk usage
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
DISK_USED=$(df -h / | awk 'NR==2 {print $3}')
DISK_TOTAL=$(df -h / | awk 'NR==2 {print $2}')

echo "Disk (/):"
echo "  Used: ${DISK_USED} / ${DISK_TOTAL} (${DISK_USAGE}%)"
log_metric "DISK: ${DISK_USED}/${DISK_TOTAL} (${DISK_USAGE}%)"

if [ "$DISK_USAGE" -gt 90 ]; then
    alert "Disk usage critical: ${DISK_USAGE}%"
elif [ "$DISK_USAGE" -gt 80 ]; then
    warn "Disk usage high: ${DISK_USAGE}%"
else
    success "Disk usage healthy: ${DISK_USAGE}%"
fi

echo ""

# ============================================================================
# NODE.JS / PM2
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "NODE.JS APPLICATION (PM2)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command_exists pm2; then
    PM2_STATUS=$(pm2 jlist 2>/dev/null)
    
    if [ "$PM2_STATUS" = "[]" ]; then
        warn "No PM2 processes running"
    else
        # Get facilitator process info
        FACILITATOR_STATUS=$(echo "$PM2_STATUS" | jq -r '.[] | select(.name=="x402-facilitator") | .pm2_env.status' 2>/dev/null || echo "not_found")
        FACILITATOR_MEMORY=$(echo "$PM2_STATUS" | jq -r '.[] | select(.name=="x402-facilitator") | .monit.memory' 2>/dev/null || echo "0")
        FACILITATOR_CPU=$(echo "$PM2_STATUS" | jq -r '.[] | select(.name=="x402-facilitator") | .monit.cpu' 2>/dev/null || echo "0")
        FACILITATOR_UPTIME=$(echo "$PM2_STATUS" | jq -r '.[] | select(.name=="x402-facilitator") | .pm2_env.pm_uptime' 2>/dev/null || echo "0")
        FACILITATOR_RESTARTS=$(echo "$PM2_STATUS" | jq -r '.[] | select(.name=="x402-facilitator") | .pm2_env.restart_time' 2>/dev/null || echo "0")
        
        if [ "$FACILITATOR_STATUS" = "online" ]; then
            MEMORY_MB=$((FACILITATOR_MEMORY / 1024 / 1024))
            UPTIME_HOURS=$(( ($(date +%s) - FACILITATOR_UPTIME / 1000) / 3600 ))
            
            success "x402-facilitator: ONLINE"
            echo "  Memory: ${MEMORY_MB} MB"
            echo "  CPU: ${FACILITATOR_CPU}%"
            echo "  Uptime: ${UPTIME_HOURS} hours"
            echo "  Restarts: ${FACILITATOR_RESTARTS}"
            
            log_metric "PM2: online, ${MEMORY_MB}MB, ${FACILITATOR_CPU}% CPU, ${FACILITATOR_RESTARTS} restarts"
            
            if [ "$FACILITATOR_RESTARTS" -gt 5 ]; then
                warn "High restart count: ${FACILITATOR_RESTARTS} (possible stability issues)"
            fi
            
            if [ "$MEMORY_MB" -gt 800 ]; then
                warn "High Node.js memory usage: ${MEMORY_MB} MB"
            fi
        else
            alert "x402-facilitator: ${FACILITATOR_STATUS}"
            log_metric "PM2: ${FACILITATOR_STATUS}"
        fi
        
        echo ""
        echo "All PM2 Processes:"
        pm2 list
    fi
else
    warn "PM2 not installed or not in PATH"
fi

echo ""

# ============================================================================
# MYSQL
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "MYSQL DATABASE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command_exists mysql; then
    MYSQL_CMD="mysql -h${MYSQL_HOST} -P${MYSQL_PORT} -u${MYSQL_USER}"
    if [ -n "$MYSQL_PASSWORD" ]; then
        MYSQL_CMD="$MYSQL_CMD -p${MYSQL_PASSWORD}"
    fi
    
    # Check if MySQL is accessible
    if $MYSQL_CMD -e "SELECT 1" >/dev/null 2>&1; then
        success "MySQL connection: OK"
        
        # Get connection stats
        THREADS_CONNECTED=$($MYSQL_CMD -sN -e "SHOW STATUS LIKE 'Threads_connected'" | awk '{print $2}')
        MAX_CONNECTIONS=$($MYSQL_CMD -sN -e "SHOW VARIABLES LIKE 'max_connections'" | awk '{print $2}')
        THREADS_RUNNING=$($MYSQL_CMD -sN -e "SHOW STATUS LIKE 'Threads_running'" | awk '{print $2}')
        ABORTED_CONNECTS=$($MYSQL_CMD -sN -e "SHOW STATUS LIKE 'Aborted_connects'" | awk '{print $2}')
        
        CONNECTION_PERCENT=$(awk "BEGIN {printf \"%.1f\", ($THREADS_CONNECTED/$MAX_CONNECTIONS)*100}")
        
        echo "  Connections: ${THREADS_CONNECTED} / ${MAX_CONNECTIONS} (${CONNECTION_PERCENT}%)"
        echo "  Active queries: ${THREADS_RUNNING}"
        echo "  Aborted connects: ${ABORTED_CONNECTS}"
        
        log_metric "MYSQL: ${THREADS_CONNECTED}/${MAX_CONNECTIONS} connections (${CONNECTION_PERCENT}%), ${THREADS_RUNNING} active"
        
        if [ "$THREADS_CONNECTED" -gt "$ALERT_MYSQL_THRESHOLD" ]; then
            alert "MySQL connections critical: ${THREADS_CONNECTED}/${MAX_CONNECTIONS}"
        elif [ "$THREADS_CONNECTED" -gt 150 ]; then
            warn "MySQL connections high: ${THREADS_CONNECTED}/${MAX_CONNECTIONS}"
        else
            success "MySQL connections healthy: ${THREADS_CONNECTED}/${MAX_CONNECTIONS}"
        fi
        
        echo ""
        
        # Database size
        DB_SIZE=$($MYSQL_CMD -sN -e "SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) FROM information_schema.tables WHERE table_schema = '${MYSQL_DB}'" 2>/dev/null || echo "0")
        echo "  Database size (${MYSQL_DB}): ${DB_SIZE} MB"
        
        # Transaction counts
        TOTAL_TXS=$($MYSQL_CMD -D"${MYSQL_DB}" -sN -e "SELECT COUNT(*) FROM transactions" 2>/dev/null || echo "0")
        PENDING_TXS=$($MYSQL_CMD -D"${MYSQL_DB}" -sN -e "SELECT COUNT(*) FROM transactions WHERE status='pending'" 2>/dev/null || echo "0")
        COMPLETED_TXS=$($MYSQL_CMD -D"${MYSQL_DB}" -sN -e "SELECT COUNT(*) FROM transactions WHERE status='completed'" 2>/dev/null || echo "0")
        FAILED_TXS=$($MYSQL_CMD -D"${MYSQL_DB}" -sN -e "SELECT COUNT(*) FROM transactions WHERE status='failed'" 2>/dev/null || echo "0")
        
        echo "  Transactions:"
        echo "    Total: ${TOTAL_TXS}"
        echo "    Pending: ${PENDING_TXS}"
        echo "    Completed: ${COMPLETED_TXS}"
        echo "    Failed: ${FAILED_TXS}"
        
        log_metric "MYSQL_TXS: total=${TOTAL_TXS}, pending=${PENDING_TXS}, completed=${COMPLETED_TXS}, failed=${FAILED_TXS}"
        
        if [ "$PENDING_TXS" -gt 100 ]; then
            warn "High number of pending transactions: ${PENDING_TXS}"
        fi
        
    else
        alert "Cannot connect to MySQL at ${MYSQL_HOST}:${MYSQL_PORT}"
        log_metric "MYSQL: connection failed"
    fi
else
    warn "MySQL client not installed"
fi

echo ""

# ============================================================================
# REDIS
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "REDIS CACHE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command_exists redis-cli; then
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1; then
        success "Redis connection: OK"
        
        # Get Redis info
        REDIS_INFO=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO 2>/dev/null)
        
        REDIS_MEMORY=$(echo "$REDIS_INFO" | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r')
        REDIS_KEYS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DBSIZE 2>/dev/null | awk '{print $2}')
        REDIS_CONNECTED_CLIENTS=$(echo "$REDIS_INFO" | grep "connected_clients:" | cut -d: -f2 | tr -d '\r')
        REDIS_UPTIME=$(echo "$REDIS_INFO" | grep "uptime_in_days:" | cut -d: -f2 | tr -d '\r')
        
        echo "  Memory used: ${REDIS_MEMORY}"
        echo "  Keys: ${REDIS_KEYS}"
        echo "  Connected clients: ${REDIS_CONNECTED_CLIENTS}"
        echo "  Uptime: ${REDIS_UPTIME} days"
        
        log_metric "REDIS: ${REDIS_MEMORY} memory, ${REDIS_KEYS} keys, ${REDIS_CONNECTED_CLIENTS} clients"
        
        # Check for used nonces (should have many)
        NONCE_KEYS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "nonce:*" 2>/dev/null | wc -l)
        echo "  Cached nonces: ${NONCE_KEYS}"
        
        if [ "$NONCE_KEYS" -eq 0 ]; then
            warn "No nonces in Redis cache (cold start or cache cleared)"
        else
            success "Redis cache active with ${NONCE_KEYS} nonces"
        fi
        
    else
        alert "Cannot connect to Redis at ${REDIS_HOST}:${REDIS_PORT}"
        log_metric "REDIS: connection failed"
    fi
else
    warn "redis-cli not installed"
fi

echo ""

# ============================================================================
# NETWORK & PORTS
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "NETWORK & SERVICES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if facilitator API is responding
if command_exists curl; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        success "Facilitator API (port 3000): RESPONDING"
        log_metric "API: healthy (HTTP 200)"
    elif [ "$HTTP_CODE" = "000" ]; then
        alert "Facilitator API (port 3000): NOT RESPONDING"
        log_metric "API: down (connection failed)"
    else
        warn "Facilitator API (port 3000): HTTP ${HTTP_CODE}"
        log_metric "API: HTTP ${HTTP_CODE}"
    fi
else
    warn "curl not installed, cannot check API health"
fi

echo ""

# Check open ports
if command_exists ss; then
    echo "Listening ports:"
    ss -tlnp | grep LISTEN | awk '{print "  " $4 " -> " $7}' | head -10
else
    warn "ss command not available"
fi

echo ""

# ============================================================================
# SUMMARY
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Overall health check
HEALTH_ISSUES=0

if (( $(echo "$MEMORY_PERCENT > $ALERT_MEMORY_THRESHOLD" | bc -l) )); then
    ((HEALTH_ISSUES++))
fi

if [ "$THREADS_CONNECTED" -gt "$ALERT_MYSQL_THRESHOLD" ] 2>/dev/null; then
    ((HEALTH_ISSUES++))
fi

if [ "$HTTP_CODE" != "200" ]; then
    ((HEALTH_ISSUES++))
fi

if [ "$HEALTH_ISSUES" -eq 0 ]; then
    success "System health: GOOD - No critical issues detected"
    log_metric "HEALTH: GOOD (0 issues)"
else
    alert "System health: ${HEALTH_ISSUES} critical issue(s) detected"
    log_metric "HEALTH: CRITICAL (${HEALTH_ISSUES} issues)"
fi

echo ""
echo "Log file: ${LOG_FILE}"
echo "Monitoring completed at $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
