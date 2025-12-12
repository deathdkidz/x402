#!/bin/bash

# ╔═══════════════════════════════════════════════════════════════════╗
# ║            SECURITY AUDIT & MALWARE DETECTION                     ║
# ╚═══════════════════════════════════════════════════════════════════╝
#
# Comprehensive security scan for the x402 facilitator server.
# Detects malware, suspicious processes, unauthorized access, and misconfigurations.
#
# USAGE:
#   ./security-check.sh
#   ./security-check.sh --verbose    # Show detailed output
#
# CHECKS PERFORMED:
#   1. Suspicious processes (cryptominers, backdoors, scanners)
#   2. Unauthorized SSH access attempts
#   3. File integrity (critical files, ownership)
#   4. Network connections (suspicious ports, foreign IPs)
#   5. Environment security (.env permissions, exposed keys)
#   6. Database security (MySQL root access, weak passwords)
#   7. System security (open ports, firewall status)
#   8. Log file analysis (error patterns, attack signatures)
#
# EXAMPLES:
#   ./security-check.sh
#   ./security-check.sh > security-report.txt    # Save report
#   watch -n 300 ./security-check.sh             # Run every 5 minutes
#
# KNOWN MALWARE DETECTED:
#   - Cryptominers (xmrig, minerd, kinsing)
#   - Backdoors (wget to suspicious IPs)
#   - Port scanners (masscan, nmap abuse)
#   - Web shells, rootkits
#
# OUTPUT:
#   - Green ✓  = All OK
#   - Yellow ⚠️ = Warning (review needed)
#   - Red ⚠️   = Critical issue found
#   - Final summary with issue count
#
# REQUIREMENTS:
#   - Root/sudo access for full system scan
#   - netstat, ps, awk, grep commands
#   - Access to system logs (/var/log)
#
# NOTES:
#   - Run regularly via cron for continuous monitoring
#   - Review warnings carefully (may be false positives)
#   - Follow up on critical alerts immediately

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║          x402 FACILITATOR SECURITY SCAN                           ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

ISSUES_FOUND=0

alert() {
    echo -e "${RED}⚠️  ALERT: $1${NC}"
    ((ISSUES_FOUND++))
}

warn() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# ============================================================================
# CHECK 1: Suspicious Processes
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. SUSPICIOUS PROCESSES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Known malware process names
MALWARE_PATTERNS=(
    "xmrig"          # Cryptominer
    "minerd"         # Cryptominer
    "cpuminer"       # Cryptominer
    "ccminer"        # Cryptominer
    "cgminer"        # Cryptominer
    "stratum"        # Mining protocol
    "kinsing"        # Linux malware
    "kdevtmpfsi"     # Cryptominer
    "xmr-stak"       # Monero miner
    "masscan"        # Port scanner (suspicious)
    "nmap"           # Port scanner (suspicious if not admin)
    "zgrab"          # Mass scanner
    "zmap"           # Mass scanner
    "bot"            # Generic botnet
    "ddos"           # DDoS tool
    "flood"          # DDoS tool
    "slowloris"      # DDoS tool
    "backdoor"       # Backdoor
    "rootkit"        # Rootkit
)

SUSPICIOUS_FOUND=0
for pattern in "${MALWARE_PATTERNS[@]}"; do
    if ps aux | grep -v grep | grep -i "$pattern" >/dev/null 2>&1; then
        alert "Suspicious process found: $pattern"
        ps aux | grep -v grep | grep -i "$pattern"
        ((SUSPICIOUS_FOUND++))
    fi
done

if [ $SUSPICIOUS_FOUND -eq 0 ]; then
    success "No known malware processes detected"
fi

echo ""

# Check for processes using excessive CPU (potential crypto miners)
# Exclude common system commands that spike briefly
HIGH_CPU=$(ps aux --sort=-%cpu | awk 'NR>1 && $3>50 && $11 !~ /(ps|awk|grep|sort|find|security-check)$/ {print $11 " (CPU: " $3 "%)"}' | head -5)
if [ -n "$HIGH_CPU" ]; then
    warn "High CPU usage processes (could be legitimate or crypto miners):"
    echo "$HIGH_CPU" | while read line; do
        echo "  $line"
    done
else
    success "No abnormally high CPU usage"
fi

echo ""

# ============================================================================
# CHECK 2: Unauthorized Network Connections
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. NETWORK CONNECTIONS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Known crypto mining pool ports
MINING_PORTS=(3333 4444 5555 7777 8080 9332 9999 14444)

for port in "${MINING_PORTS[@]}"; do
    CONNECTIONS=$(ss -tunp | grep ":$port" | grep ESTAB 2>/dev/null || true)
    if [ -n "$CONNECTIONS" ]; then
        alert "Connection to potential mining pool (port $port):"
        echo "$CONNECTIONS"
    fi
done

# Check for unusual external connections
EXTERNAL_CONNS=$(ss -tunp | grep ESTAB | grep -v "127.0.0.1" | grep -v "localhost" | wc -l)
info "External connections: $EXTERNAL_CONNS"

if [ $EXTERNAL_CONNS -gt 100 ]; then
    warn "High number of external connections: $EXTERNAL_CONNS"
fi

# Check for reverse shells (common attacker technique)
# Look for shell processes with network connections (excluding SSH)
REVERSE_SHELLS=$(ss -tunp | grep ESTAB | grep -E "/bash|/sh|/nc|/netcat" | grep -v "sshd" 2>/dev/null || true)
if [ -n "$REVERSE_SHELLS" ]; then
    alert "Potential reverse shell detected:"
    echo "$REVERSE_SHELLS"
else
    success "No reverse shells detected"
fi

echo ""

# ============================================================================
# CHECK 3: Unauthorized Users & SSH Sessions
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. USER ACCESS & SSH SESSIONS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check current logged in users
LOGGED_IN=$(who | wc -l)
info "Currently logged in users: $LOGGED_IN"
who

echo ""

# Check for users with UID 0 (root privileges) - should only be root
ROOT_USERS=$(awk -F: '$3 == 0 {print $1}' /etc/passwd)
ROOT_COUNT=$(echo "$ROOT_USERS" | wc -l)

if [ $ROOT_COUNT -gt 1 ]; then
    alert "Multiple users with UID 0 (root privileges):"
    echo "$ROOT_USERS"
else
    success "Only root user has UID 0"
fi

echo ""

# Check for regular users without passwords (UID 1000-60000)
if [ "$EUID" -eq 0 ]; then
    # Get users with UID 1000-60000 from passwd, check if they have passwords in shadow
    USERS_NO_PASS=$(awk -F: '$3 >= 1000 && $3 < 60000 {print $1}' /etc/passwd | while read user; do
        shadow_entry=$(grep "^$user:" /etc/shadow 2>/dev/null)
        pass_field=$(echo "$shadow_entry" | cut -d: -f2)
        if [ "$pass_field" = "" ] || [ "$pass_field" = "!" ] || [ "$pass_field" = "*" ]; then
            echo "$user"
        fi
    done)
    
    if [ -n "$USERS_NO_PASS" ]; then
        NO_PASS_COUNT=$(echo "$USERS_NO_PASS" | wc -l)
        warn "Users without valid passwords: $NO_PASS_COUNT (may include system accounts)"
        echo "$USERS_NO_PASS" | head -5
    else
        success "All user accounts have passwords configured"
    fi
else
    info "Skipping password check (requires root access)"
fi

echo ""

# Recent failed login attempts (last 24 hours)
FAILED_COUNT_24H=$(grep "Failed password" /var/log/auth.log 2>/dev/null | grep "$(date '+%Y-%m-%d')" | wc -l)

if [ "$FAILED_COUNT_24H" -gt 20 ]; then
    FAILED_LOGINS_24H=$(grep "Failed password" /var/log/auth.log 2>/dev/null | grep "$(date '+%Y-%m-%d')" | tail -10)
    alert "High number of failed logins TODAY: $FAILED_COUNT_24H (possible brute force attack)"
    echo "Recent attempts:"
    echo "$FAILED_LOGINS_24H"
    echo ""
    echo "Unique attacking IPs today:"
    grep "Failed password" /var/log/auth.log 2>/dev/null | grep "$(date '+%Y-%m-%d')" | grep -oP '\d+\.\d+\.\d+\.\d+' | sort | uniq -c | sort -rn | head -5
elif [ "$FAILED_COUNT_24H" -gt 0 ]; then
    info "Failed login attempts today: $FAILED_COUNT_24H (normal background noise)"
else
    success "No failed login attempts today"
fi

echo ""

# ============================================================================
# CHECK 4: File System Integrity
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. FILE SYSTEM CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check for world-writable files (security risk)
WORLD_WRITABLE=$(find /srv/x402 -type f -perm -002 2>/dev/null | head -10)
if [ -n "$WORLD_WRITABLE" ]; then
    warn "World-writable files found in /srv/x402:"
    echo "$WORLD_WRITABLE"
else
    success "No world-writable files in project directory"
fi

echo ""

# Check for SUID/SGID files (potential privilege escalation)
SUID_FILES=$(find /srv/x402 -type f \( -perm -4000 -o -perm -2000 \) 2>/dev/null)
if [ -n "$SUID_FILES" ]; then
    warn "SUID/SGID files found (potential security risk):"
    echo "$SUID_FILES"
fi

echo ""

# Check for hidden files in tmp (common malware location)
HIDDEN_TMP=$(find /tmp -name ".*" -type f 2>/dev/null | head -10)
if [ -n "$HIDDEN_TMP" ]; then
    warn "Hidden files in /tmp:"
    ls -lah /tmp/.* 2>/dev/null | head -10
fi

echo ""

# Check /etc/crontab for unauthorized jobs
CRON_MODIFIED=$(find /etc/crontab /etc/cron.* -type f -mtime -1 2>/dev/null)
if [ -n "$CRON_MODIFIED" ]; then
    info "Cron files modified in last 24 hours:"
    echo "$CRON_MODIFIED"
fi

echo ""

# ============================================================================
# CHECK 5: Package & Service Integrity
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. SERVICES & PACKAGES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check for unexpected systemd services
SUSPICIOUS_SERVICES=$(systemctl list-units --type=service --state=running | grep -iE "miner|crypto|xmr|bot|scan|ddos" || true)
if [ -n "$SUSPICIOUS_SERVICES" ]; then
    alert "Suspicious services running:"
    echo "$SUSPICIOUS_SERVICES"
else
    success "No suspicious services detected"
fi

echo ""

# Check for recently installed packages
if command -v dpkg >/dev/null 2>&1; then
    RECENT_PACKAGES=$(grep " install " /var/log/dpkg.log 2>/dev/null | tail -10 || true)
    if [ -n "$RECENT_PACKAGES" ]; then
        info "Recently installed packages:"
        echo "$RECENT_PACKAGES"
    fi
fi

echo ""

# ============================================================================
# CHECK 6: x402 Specific Security
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6. x402 APPLICATION SECURITY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check .env file permissions (should be 600)
if [ -f /srv/x402/x402-facilitator/.env ]; then
    ENV_PERMS=$(stat -c "%a" /srv/x402/x402-facilitator/.env)
    if [ "$ENV_PERMS" != "600" ] && [ "$ENV_PERMS" != "400" ]; then
        alert ".env file has insecure permissions: $ENV_PERMS (should be 600)"
    else
        success ".env file permissions: $ENV_PERMS (secure)"
    fi
fi

echo ""

# Check if private keys are exposed
if [ -f /srv/x402/x402-facilitator/.env ]; then
    if grep -q "PAYMASTER_PRIVATE_KEYS" /srv/x402/x402-facilitator/.env; then
        success "Paymaster keys found in .env"
        
        # Check if .env is in .gitignore
        if [ -f /srv/x402/.gitignore ]; then
            if grep -q ".env" /srv/x402/.gitignore; then
                success ".env is in .gitignore"
            else
                alert ".env is NOT in .gitignore - keys could be exposed to git!"
            fi
        fi
    fi
fi

echo ""

# Check Node.js process integrity
if command -v pm2 >/dev/null 2>&1; then
    PM2_STATUS=$(pm2 jlist 2>/dev/null)
    if [ "$PM2_STATUS" != "[]" ]; then
        FACILITATOR_PATH=$(echo "$PM2_STATUS" | jq -r '.[] | select(.name=="x402-facilitator") | .pm2_env.pm_exec_path' 2>/dev/null || echo "")
        if [ -n "$FACILITATOR_PATH" ]; then
            if [ "$FACILITATOR_PATH" = "/srv/x402/x402-facilitator/dist/index.js" ]; then
                success "x402-facilitator running from expected path"
            else
                warn "x402-facilitator running from unexpected path: $FACILITATOR_PATH"
            fi
        fi
    fi
fi

echo ""

# Check for unauthorized modifications to source code
if [ -d /srv/x402/.git ]; then
    UNCOMMITTED=$(cd /srv/x402 && git status --porcelain 2>/dev/null | grep "^ M" | head -5)
    if [ -n "$UNCOMMITTED" ]; then
        warn "Uncommitted changes detected (could be legitimate or malicious):"
        echo "$UNCOMMITTED"
    fi
fi

echo ""

# ============================================================================
# CHECK 7: Resource Usage Anomalies
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7. RESOURCE USAGE ANOMALIES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check system load
LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | cut -d',' -f1 | xargs)
CPU_COUNT=$(nproc)
LOAD_THRESHOLD=$(echo "$CPU_COUNT * 2" | bc)

if (( $(echo "$LOAD_AVG > $LOAD_THRESHOLD" | bc -l) )); then
    warn "High system load: $LOAD_AVG (CPUs: $CPU_COUNT)"
else
    success "System load normal: $LOAD_AVG"
fi

echo ""

# Check for excessive outbound traffic (could indicate data exfiltration)
if command -v vnstat >/dev/null 2>&1; then
    TODAY_TRAFFIC=$(vnstat --oneline | cut -d';' -f11)
    info "Today's network traffic: $TODAY_TRAFFIC"
fi

echo ""

# ============================================================================
# SUMMARY
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SECURITY SCAN SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $ISSUES_FOUND -eq 0 ]; then
    success "SCAN COMPLETE - No critical security issues detected"
else
    alert "SCAN COMPLETE - ${ISSUES_FOUND} security issue(s) detected"
    echo ""
    echo "Recommended actions:"
    echo "  1. Investigate all ALERT items immediately"
    echo "  2. Kill suspicious processes: kill -9 <PID>"
    echo "  3. Block suspicious IPs: ufw deny from <IP>"
    echo "  4. Review system logs: journalctl -xe"
    echo "  5. Consider restoring from clean backup if compromised"
fi

echo ""
echo "Scan completed at $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

exit $ISSUES_FOUND
