#!/bin/bash
#
# Facilitator Benchmark Script
# Compares latency between NetPay and PayAI facilitators
#
# Usage: ./benchmark-facilitators.sh [iterations]
#

set -e

# Configuration
NETPAY_URL="https://api.netpay.id"
PAYAI_URL="https://facilitator.payai.network"
ITERATIONS=${1:-10}
NETWORK="base-sepolia"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Test addresses (Base Sepolia USDC)
USDC_ADDRESS="0x036CbD53842c5426634e7929541eC2318f3dCF7e"
TEST_PAYER="0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C"
TEST_RECIPIENT="0x209693Bc6afc0C5328bA36FaF03C514EF312287C"
TEST_VALUE="10000"

# Generate random nonce
generate_nonce() {
    echo "0x$(openssl rand -hex 32)"
}

# Get current timestamp
get_timestamp() {
    date +%s
}

# Sample test payload for verification (will fail but tests latency)
# Using a dummy signature that will fail validation but measure response time
create_verify_payload() {
    local nonce=$(generate_nonce)
    local now=$(get_timestamp)
    local valid_after=$((now - 60))
    local valid_before=$((now + 300))
    
    cat <<EOF
{
  "paymentPayload": {
    "x402Version": 1,
    "scheme": "exact",
    "network": "${NETWORK}",
    "payload": {
      "signature": "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      "authorization": {
        "from": "${TEST_PAYER}",
        "to": "${TEST_RECIPIENT}",
        "value": "${TEST_VALUE}",
        "validAfter": "${valid_after}",
        "validBefore": "${valid_before}",
        "nonce": "${nonce}"
      }
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "${NETWORK}",
    "maxAmountRequired": "${TEST_VALUE}",
    "resource": "https://benchmark.test/resource",
    "description": "Benchmark test",
    "mimeType": "application/json",
    "payTo": "${TEST_RECIPIENT}",
    "maxTimeoutSeconds": 60,
    "asset": "${USDC_ADDRESS}",
    "extra": {
      "name": "USDC",
      "version": "2"
    }
  }
}
EOF
}

# Measure single request latency
measure_latency() {
    local url=$1
    local endpoint=$2
    local payload=$3
    
    local start_time=$(date +%s%3N)
    
    local response=$(curl -s -w "\n%{http_code}\n%{time_total}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "${url}${endpoint}" 2>/dev/null || echo -e "\n000\n0")
    
    local end_time=$(date +%s%3N)
    
    # Parse response
    local http_code=$(echo "$response" | tail -2 | head -1)
    local curl_time=$(echo "$response" | tail -1)
    local body=$(echo "$response" | head -n -2)
    
    # Calculate latency in ms
    local latency_ms=$(echo "$curl_time * 1000" | bc 2>/dev/null || echo "0")
    
    echo "${latency_ms}|${http_code}|${body}"
}

# Measure health endpoint
measure_health() {
    local url=$1
    
    local start_time=$(date +%s%3N)
    
    local response=$(curl -s -w "\n%{http_code}\n%{time_total}" \
        "${url}/health" 2>/dev/null || echo -e "\n000\n0")
    
    local http_code=$(echo "$response" | tail -2 | head -1)
    local curl_time=$(echo "$response" | tail -1)
    
    local latency_ms=$(echo "$curl_time * 1000" | bc 2>/dev/null || echo "0")
    
    echo "${latency_ms}|${http_code}"
}

# Calculate statistics
calc_stats() {
    local values=("$@")
    local count=${#values[@]}
    
    if [ $count -eq 0 ]; then
        echo "0|0|0|0"
        return
    fi
    
    # Sort values
    IFS=$'\n' sorted=($(sort -n <<<"${values[*]}")); unset IFS
    
    # Calculate min, max, avg
    local min=${sorted[0]}
    local max=${sorted[$((count-1))]}
    local sum=0
    
    for v in "${values[@]}"; do
        sum=$(echo "$sum + $v" | bc)
    done
    
    local avg=$(echo "scale=2; $sum / $count" | bc)
    
    # Calculate p50 (median)
    local p50_idx=$((count / 2))
    local p50=${sorted[$p50_idx]}
    
    # Calculate p95
    local p95_idx=$((count * 95 / 100))
    if [ $p95_idx -ge $count ]; then
        p95_idx=$((count - 1))
    fi
    local p95=${sorted[$p95_idx]}
    
    echo "${min}|${max}|${avg}|${p50}|${p95}"
}

# Print header
print_header() {
    echo ""
    echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}║          x402 Facilitator Latency Benchmark                      ║${NC}"
    echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BOLD}Configuration:${NC}"
    echo -e "  NetPay URL:  ${GREEN}${NETPAY_URL}${NC}"
    echo -e "  PayAI URL:   ${BLUE}${PAYAI_URL}${NC}"
    echo -e "  Network:     ${NETWORK}"
    echo -e "  Iterations:  ${ITERATIONS}"
    echo ""
}

# Print results table
print_results() {
    local test_name=$1
    local netpay_stats=$2
    local payai_stats=$3
    
    IFS='|' read -r np_min np_max np_avg np_p50 np_p95 <<< "$netpay_stats"
    IFS='|' read -r pa_min pa_max pa_avg pa_p50 pa_p95 <<< "$payai_stats"
    
    echo -e "${BOLD}${test_name}${NC}"
    echo "┌─────────────┬────────────────────┬────────────────────┐"
    echo "│ Metric      │ NetPay (ms)        │ PayAI (ms)         │"
    echo "├─────────────┼────────────────────┼────────────────────┤"
    printf "│ Min         │ %18.2f │ %18.2f │\n" "$np_min" "$pa_min"
    printf "│ Max         │ %18.2f │ %18.2f │\n" "$np_max" "$pa_max"
    printf "│ Avg         │ %18.2f │ %18.2f │\n" "$np_avg" "$pa_avg"
    printf "│ P50         │ %18.2f │ %18.2f │\n" "$np_p50" "$pa_p50"
    printf "│ P95         │ %18.2f │ %18.2f │\n" "$np_p95" "$pa_p95"
    echo "└─────────────┴────────────────────┴────────────────────┘"
    
    # Determine winner
    local diff=$(echo "$pa_avg - $np_avg" | bc)
    local abs_diff=$(echo "$diff" | tr -d '-')
    local pct=$(echo "scale=1; ($abs_diff / $pa_avg) * 100" | bc 2>/dev/null || echo "0")
    
    if (( $(echo "$np_avg < $pa_avg" | bc -l) )); then
        echo -e "  ${GREEN}✓ NetPay is ${pct}% faster (${abs_diff}ms)${NC}"
    elif (( $(echo "$np_avg > $pa_avg" | bc -l) )); then
        echo -e "  ${BLUE}✓ PayAI is ${pct}% faster (${abs_diff}ms)${NC}"
    else
        echo -e "  ${YELLOW}≈ Both are equal${NC}"
    fi
    echo ""
}

# Main benchmark
main() {
    print_header
    
    # Arrays to store latencies
    declare -a netpay_health_latencies
    declare -a payai_health_latencies
    declare -a netpay_verify_latencies
    declare -a payai_verify_latencies
    
    # ============================================
    # Health Endpoint Benchmark
    # ============================================
    echo -e "${BOLD}[1/2] Benchmarking /health endpoint...${NC}"
    
    for i in $(seq 1 $ITERATIONS); do
        printf "\r  Progress: %d/%d" $i $ITERATIONS
        
        # NetPay health
        result=$(measure_health "$NETPAY_URL")
        latency=$(echo "$result" | cut -d'|' -f1)
        netpay_health_latencies+=("$latency")
        
        # PayAI health
        result=$(measure_health "$PAYAI_URL")
        latency=$(echo "$result" | cut -d'|' -f1)
        payai_health_latencies+=("$latency")
        
        # Small delay between iterations
        sleep 0.1
    done
    echo -e "\r  Progress: ${ITERATIONS}/${ITERATIONS} ${GREEN}✓${NC}"
    
    # ============================================
    # Verify Endpoint Benchmark
    # ============================================
    echo -e "${BOLD}[2/2] Benchmarking /verify endpoint...${NC}"
    
    for i in $(seq 1 $ITERATIONS); do
        printf "\r  Progress: %d/%d" $i $ITERATIONS
        
        # Generate fresh payload for each request
        payload=$(create_verify_payload)
        
        # NetPay verify
        result=$(measure_latency "$NETPAY_URL" "/verify" "$payload")
        latency=$(echo "$result" | cut -d'|' -f1)
        netpay_verify_latencies+=("$latency")
        
        # PayAI verify
        result=$(measure_latency "$PAYAI_URL" "/verify" "$payload")
        latency=$(echo "$result" | cut -d'|' -f1)
        payai_verify_latencies+=("$latency")
        
        # Small delay between iterations
        sleep 0.1
    done
    echo -e "\r  Progress: ${ITERATIONS}/${ITERATIONS} ${GREEN}✓${NC}"
    
    # ============================================
    # Calculate and Display Results
    # ============================================
    echo ""
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${CYAN}                           RESULTS                                 ${NC}"
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Health stats
    netpay_health_stats=$(calc_stats "${netpay_health_latencies[@]}")
    payai_health_stats=$(calc_stats "${payai_health_latencies[@]}")
    print_results "GET /health" "$netpay_health_stats" "$payai_health_stats"
    
    # Verify stats
    netpay_verify_stats=$(calc_stats "${netpay_verify_latencies[@]}")
    payai_verify_stats=$(calc_stats "${payai_verify_latencies[@]}")
    print_results "POST /verify" "$netpay_verify_stats" "$payai_verify_stats"
    
    # ============================================
    # Summary
    # ============================================
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${CYAN}                          SUMMARY                                  ${NC}"
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    IFS='|' read -r _ _ np_health_avg _ _ <<< "$netpay_health_stats"
    IFS='|' read -r _ _ pa_health_avg _ _ <<< "$payai_health_stats"
    IFS='|' read -r _ _ np_verify_avg _ _ <<< "$netpay_verify_stats"
    IFS='|' read -r _ _ pa_verify_avg _ _ <<< "$payai_verify_stats"
    
    echo "Average Latencies (ms):"
    echo ""
    echo "                    NetPay          PayAI           Winner"
    echo "  ─────────────────────────────────────────────────────────"
    
    # Health winner
    if (( $(echo "$np_health_avg < $pa_health_avg" | bc -l) )); then
        health_winner="${GREEN}NetPay${NC}"
    else
        health_winner="${BLUE}PayAI${NC}"
    fi
    printf "  /health           %-15.2f %-15.2f %b\n" "$np_health_avg" "$pa_health_avg" "$health_winner"
    
    # Verify winner
    if (( $(echo "$np_verify_avg < $pa_verify_avg" | bc -l) )); then
        verify_winner="${GREEN}NetPay${NC}"
    else
        verify_winner="${BLUE}PayAI${NC}"
    fi
    printf "  /verify           %-15.2f %-15.2f %b\n" "$np_verify_avg" "$pa_verify_avg" "$verify_winner"
    
    echo ""
    echo -e "${YELLOW}Note: /verify uses dummy signatures so both will return isValid=false.${NC}"
    echo -e "${YELLOW}      This test measures network + processing latency only.${NC}"
    echo ""
    
    # Overall
    np_total=$(echo "$np_health_avg + $np_verify_avg" | bc)
    pa_total=$(echo "$pa_health_avg + $pa_verify_avg" | bc)
    
    if (( $(echo "$np_total < $pa_total" | bc -l) )); then
        echo -e "${BOLD}Overall Winner: ${GREEN}NetPay (api.netpay.id)${NC}"
    else
        echo -e "${BOLD}Overall Winner: ${BLUE}PayAI (facilitator.payai.network)${NC}"
    fi
    
    echo ""
    echo "Benchmark completed at $(date)"
    echo ""
}

# Run benchmark
main
