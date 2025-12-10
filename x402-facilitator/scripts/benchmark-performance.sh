#!/bin/bash

# Facilitator Performance Benchmark
# Measures latency and throughput of payment settlement

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

FACILITATOR_URL="${FACILITATOR_URL:-http://localhost:3000}"
API_KEY="${TEST_API_KEY:-}"

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║          x402 FACILITATOR PERFORMANCE BENCHMARK                   ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Testing: $FACILITATOR_URL"
echo ""

if [ -z "$API_KEY" ]; then
    echo -e "${YELLOW}WARNING: No TEST_API_KEY set, some tests will be skipped${NC}"
    echo "         Set TEST_API_KEY environment variable to run full benchmark"
    echo ""
fi

# ============================================================================
# TEST 1: Health Check Latency
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: Health Endpoint Latency"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_TIME=0
SUCCESS=0
FAIL=0

for i in {1..10}; do
    START=$(date +%s%N | cut -b1-13)
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$FACILITATOR_URL/health" 2>/dev/null || echo "000")
    END=$(date +%s%N | cut -b1-13)
    LATENCY=$((END - START))
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo "  Request $i: ${LATENCY}ms ✓"
        TOTAL_TIME=$((TOTAL_TIME + LATENCY))
        ((SUCCESS++))
    else
        echo -e "  Request $i: ${RED}FAILED (HTTP $HTTP_CODE)${NC}"
        ((FAIL++))
    fi
done

if [ $SUCCESS -gt 0 ]; then
    AVG=$((TOTAL_TIME / SUCCESS))
    echo ""
    echo -e "${GREEN}Health Check Average: ${AVG}ms${NC}"
    echo "Success rate: $SUCCESS/10"
    
    if [ $AVG -lt 50 ]; then
        echo -e "${GREEN}✓ EXCELLENT${NC} - Very fast response"
    elif [ $AVG -lt 100 ]; then
        echo -e "${GREEN}✓ GOOD${NC} - Fast response"
    elif [ $AVG -lt 200 ]; then
        echo -e "${YELLOW}⚠ MODERATE${NC} - Acceptable latency"
    else
        echo -e "${RED}⚠ SLOW${NC} - High latency detected"
    fi
else
    echo -e "${RED}❌ Health check failed${NC}"
fi

echo ""

# ============================================================================
# TEST 2: Verify Endpoint Latency
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: Verify Endpoint Latency (Payment Requirements)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -n "$API_KEY" ]; then
    TOTAL_TIME=0
    SUCCESS=0
    
    for i in {1..5}; do
        START=$(date +%s%N | cut -b1-13)
        RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$FACILITATOR_URL/verify" \
            -H "Content-Type: application/json" \
            -H "x-api-key: $API_KEY" \
            -d '{
                "resource": "/api/test",
                "contentCost": 10,
                "settlementFeeBasisPoints": 50
            }' 2>/dev/null)
        END=$(date +%s%N | cut -b1-13)
        LATENCY=$((END - START))
        HTTP_CODE=$(echo "$RESPONSE" | tail -1)
        
        if [ "$HTTP_CODE" = "200" ]; then
            echo "  Request $i: ${LATENCY}ms ✓"
            TOTAL_TIME=$((TOTAL_TIME + LATENCY))
            ((SUCCESS++))
        else
            echo -e "  Request $i: ${RED}FAILED (HTTP $HTTP_CODE)${NC}"
        fi
    done
    
    if [ $SUCCESS -gt 0 ]; then
        AVG=$((TOTAL_TIME / SUCCESS))
        echo ""
        echo -e "${GREEN}Verify Average: ${AVG}ms${NC}"
        
        if [ $AVG -lt 100 ]; then
            echo -e "${GREEN}✓ EXCELLENT${NC} - Very fast verification"
        elif [ $AVG -lt 200 ]; then
            echo -e "${GREEN}✓ GOOD${NC} - Fast verification"
        elif [ $AVG -lt 500 ]; then
            echo -e "${YELLOW}⚠ MODERATE${NC} - Acceptable latency"
        else
            echo -e "${RED}⚠ SLOW${NC} - High latency (database or Redis issue?)"
        fi
    fi
else
    echo -e "${YELLOW}SKIPPED - No API key provided${NC}"
fi

echo ""

# ============================================================================
# TEST 3: Database Query Performance
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: Database Performance"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
MYSQL_HOST="${MYSQL_HOST:-localhost}"
MYSQL_DB="${MYSQL_DB:-x402_facilitator}"

if command -v mysql >/dev/null 2>&1; then
    MYSQL_CMD="mysql -h${MYSQL_HOST} -u${MYSQL_USER} -D${MYSQL_DB}"
    [ -n "$MYSQL_PASSWORD" ] && MYSQL_CMD="$MYSQL_CMD -p${MYSQL_PASSWORD}"
    
    # Test simple query
    START=$(date +%s%N | cut -b1-13)
    RESULT=$($MYSQL_CMD -sN -e "SELECT COUNT(*) FROM transactions" 2>/dev/null || echo "0")
    END=$(date +%s%N | cut -b1-13)
    LATENCY=$((END - START))
    
    echo "  Simple query (COUNT): ${LATENCY}ms"
    echo "  Total transactions: $RESULT"
    
    # Test complex query (recent transactions)
    START=$(date +%s%N | cut -b1-13)
    RECENT=$($MYSQL_CMD -sN -e "SELECT COUNT(*) FROM transactions WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)" 2>/dev/null || echo "0")
    END=$(date +%s%N | cut -b1-13)
    LATENCY=$((END - START))
    
    echo "  Complex query (24h filter): ${LATENCY}ms"
    echo "  Transactions (24h): $RECENT"
    
    # Check slow query log
    SLOW_QUERIES=$($MYSQL_CMD -sN -e "SHOW GLOBAL STATUS LIKE 'Slow_queries'" 2>/dev/null | awk '{print $2}' || echo "0")
    echo "  Slow queries logged: $SLOW_QUERIES"
    
    if [ "$SLOW_QUERIES" -gt 100 ]; then
        echo -e "${YELLOW}⚠ WARNING: High number of slow queries${NC}"
    fi
else
    echo -e "${YELLOW}SKIPPED - MySQL client not available${NC}"
fi

echo ""

# ============================================================================
# TEST 4: Redis Performance
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 4: Redis Cache Performance"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

if command -v redis-cli >/dev/null 2>&1; then
    # Test PING latency
    TOTAL_TIME=0
    for i in {1..10}; do
        START=$(date +%s%N | cut -b1-13)
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PING >/dev/null 2>&1
        END=$(date +%s%N | cut -b1-13)
        LATENCY=$((END - START))
        TOTAL_TIME=$((TOTAL_TIME + LATENCY))
    done
    AVG=$((TOTAL_TIME / 10))
    
    echo "  PING average: ${AVG}ms"
    
    # Test GET latency
    START=$(date +%s%N | cut -b1-13)
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "test_key" >/dev/null 2>&1
    END=$(date +%s%N | cut -b1-13)
    GET_LATENCY=$((END - START))
    
    echo "  GET latency: ${GET_LATENCY}ms"
    
    # Cache hit rate
    INFO=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO stats 2>/dev/null)
    HITS=$(echo "$INFO" | grep "keyspace_hits:" | cut -d: -f2 | tr -d '\r')
    MISSES=$(echo "$INFO" | grep "keyspace_misses:" | cut -d: -f2 | tr -d '\r')
    
    if [ -n "$HITS" ] && [ -n "$MISSES" ] && [ "$((HITS + MISSES))" -gt 0 ]; then
        HIT_RATE=$(echo "scale=2; $HITS * 100 / ($HITS + $MISSES)" | bc)
        echo "  Cache hit rate: ${HIT_RATE}%"
        
        if (( $(echo "$HIT_RATE > 80" | bc -l) )); then
            echo -e "${GREEN}✓ EXCELLENT${NC} - High cache efficiency"
        elif (( $(echo "$HIT_RATE > 50" | bc -l) )); then
            echo -e "${GREEN}✓ GOOD${NC} - Moderate cache efficiency"
        else
            echo -e "${YELLOW}⚠ LOW${NC} - Consider cache warming or longer TTL"
        fi
    fi
    
    if [ $AVG -lt 5 ]; then
        echo -e "${GREEN}✓ EXCELLENT${NC} - Sub-millisecond Redis latency"
    elif [ $AVG -lt 20 ]; then
        echo -e "${GREEN}✓ GOOD${NC} - Fast Redis performance"
    else
        echo -e "${YELLOW}⚠ SLOW${NC} - Redis latency higher than expected"
    fi
else
    echo -e "${YELLOW}SKIPPED - redis-cli not available${NC}"
fi

echo ""

# ============================================================================
# TEST 5: RPC Provider Latency
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 5: RPC Provider Latency (Blockchain)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test Base Sepolia RPC (most commonly used testnet)
BASE_SEPOLIA_RPC="${BASE_SEPOLIA_RPC:-}"

if [ -n "$BASE_SEPOLIA_RPC" ]; then
    # Extract HTTP URL from WebSocket URL if needed
    if [[ "$BASE_SEPOLIA_RPC" == wss://* ]]; then
        RPC_URL=$(echo "$BASE_SEPOLIA_RPC" | sed 's/wss:/https:/')
    else
        RPC_URL="$BASE_SEPOLIA_RPC"
    fi
    
    TOTAL_TIME=0
    SUCCESS=0
    
    for i in {1..3}; do
        START=$(date +%s%N | cut -b1-13)
        RESPONSE=$(curl -s -X POST "$RPC_URL" \
            -H "Content-Type: application/json" \
            -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
            2>/dev/null || echo "")
        END=$(date +%s%N | cut -b1-13)
        LATENCY=$((END - START))
        
        if [ -n "$RESPONSE" ] && echo "$RESPONSE" | grep -q "result"; then
            echo "  Request $i: ${LATENCY}ms ✓"
            TOTAL_TIME=$((TOTAL_TIME + LATENCY))
            ((SUCCESS++))
        else
            echo -e "  Request $i: ${RED}FAILED${NC}"
        fi
    done
    
    if [ $SUCCESS -gt 0 ]; then
        AVG=$((TOTAL_TIME / SUCCESS))
        echo ""
        echo -e "${BLUE}RPC Average: ${AVG}ms${NC}"
        
        if [ $AVG -lt 200 ]; then
            echo -e "${GREEN}✓ EXCELLENT${NC} - Fast RPC response"
        elif [ $AVG -lt 500 ]; then
            echo -e "${GREEN}✓ GOOD${NC} - Acceptable RPC latency"
        elif [ $AVG -lt 1000 ]; then
            echo -e "${YELLOW}⚠ MODERATE${NC} - RPC is a bit slow"
        else
            echo -e "${RED}⚠ SLOW${NC} - RPC is bottleneck (consider regional endpoint)"
        fi
    fi
else
    echo -e "${YELLOW}SKIPPED - BASE_SEPOLIA_RPC not configured${NC}"
fi

echo ""

# ============================================================================
# SUMMARY & BOTTLENECK ANALYSIS
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PERFORMANCE SUMMARY & BOTTLENECK ANALYSIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Typical Settlement Flow Latency Breakdown:"
echo ""
echo "  1. API Request Processing:      10-50ms      (Node.js)"
echo "  2. Database Lookups (2-3x):     20-100ms     (MySQL)"
echo "  3. Redis Nonce Check:           5-20ms       (Redis)"
echo "  4. Signature Verification:      10-30ms      (Crypto)"
echo "  5. RPC Balance Check:           100-500ms    (Blockchain)"
echo "  6. Transaction Submission:      100-500ms    (Blockchain)"
echo "  7. Wait for Confirmation:       5-30 seconds (Blockchain)"
echo "  ─────────────────────────────────────────────────────────"
echo "  Total (no wait):                ~250-1200ms"
echo "  Total (with 30s timeout):       ~30 seconds"
echo ""
echo -e "${BLUE}ℹ Current Configuration:${NC}"
echo "  • Settlement timeout: 30 seconds"
echo "  • Rate limit (settle): 10 requests per 5 seconds"
echo "  • Paymaster wallets: 16 (parallel capacity)"
echo "  • MySQL pool: 200 connections"
echo "  • Redis: Local cache"
echo ""
echo -e "${BLUE}ℹ Expected Performance:${NC}"
echo "  • Merchant API → Facilitator: 100-300ms (verification)"
echo "  • Facilitator → Blockchain: 100-1000ms (submission)"
echo "  • Blockchain confirmation: 5-30 seconds (network dependent)"
echo "  • Total merchant wait: ~30 seconds typical"
echo ""
echo -e "${YELLOW}⚠ Main Bottlenecks:${NC}"
echo "  1. Blockchain confirmation time (5-30s) - UNAVOIDABLE"
echo "  2. RPC provider latency (100-500ms) - Use regional endpoints"
echo "  3. Database queries (20-100ms) - Add indexes if slow"
echo "  4. Transaction queue waiting - Mitigated by 16 wallets"
echo ""
echo "Scan completed at $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
