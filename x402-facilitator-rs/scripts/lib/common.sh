#!/bin/bash
#
# Common functions for x402 Facilitator scripts
#

# Colors
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export MAGENTA='\033[0;35m'
export WHITE='\033[1;37m'
export NC='\033[0m' # No Color

# Database config
export DB_NAME="x402_facilitator"
export DB_USER="root"
export DB_PASS="setanMERAH@00"

# MySQL commands
export MYSQL_CMD="mysql -u $DB_USER -p$DB_PASS $DB_NAME -N -B"
export MYSQL_TABLE="mysql -u $DB_USER -p$DB_PASS $DB_NAME"

# Helper functions
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

press_enter() {
    echo ""
    read -p "Press Enter to continue..."
}

# Run MySQL query quietly (no warnings)
mysql_query() {
    $MYSQL_CMD 2>/dev/null "$@"
}

mysql_table() {
    $MYSQL_TABLE 2>/dev/null "$@"
}

# Check if API key exists, returns id
get_api_key_id() {
    local input="$1"
    if [[ "$input" =~ ^[0-9]+$ ]]; then
        # Input is an ID
        $MYSQL_CMD -e "SELECT id FROM api_keys WHERE id = $input LIMIT 1;" 2>/dev/null
    else
        # Input is an API key (full or partial)
        $MYSQL_CMD -e "SELECT id FROM api_keys WHERE api_key = '$input' OR api_key LIKE '%$input%' LIMIT 1;" 2>/dev/null
    fi
}

# Get full API key from ID or partial
get_full_api_key() {
    local input="$1"
    if [[ "$input" =~ ^[0-9]+$ ]]; then
        $MYSQL_CMD -e "SELECT api_key FROM api_keys WHERE id = $input LIMIT 1;" 2>/dev/null
    else
        $MYSQL_CMD -e "SELECT api_key FROM api_keys WHERE api_key = '$input' OR api_key LIKE '%$input%' LIMIT 1;" 2>/dev/null
    fi
}

# Generate random API key
generate_api_key() {
    local env_type=$1
    local random_part=$(openssl rand -hex 24)
    if [ "$env_type" = "live" ]; then
        echo "x402_live_${random_part}"
    else
        echo "x402_test_${random_part}"
    fi
}

# Check system status
check_service_status() {
    if systemctl is-active --quiet x402-facilitator-rs 2>/dev/null; then
        echo "running"
    else
        echo "stopped"
    fi
}

check_api_health() {
    curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health 2>/dev/null
}

check_database() {
    mysql -u $DB_USER -p$DB_PASS -e "SELECT 1" $DB_NAME > /dev/null 2>&1 && echo "ok" || echo "fail"
}

check_redis() {
    redis-cli ping > /dev/null 2>&1 && echo "ok" || echo "fail"
}

# Invalidate API key cache in Redis
# This is needed after any balance updates so facilitator sees fresh data
invalidate_api_key_cache() {
    local api_key="$1"
    if [ -n "$api_key" ]; then
        redis-cli DEL "apikey:$api_key" > /dev/null 2>&1
    fi
}
