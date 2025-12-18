# x402 Facilitator Monitoring Setup

Comprehensive monitoring scripts to track system health, performance, and alert on critical issues.

## Quick Start

```bash
# Setup monitoring (installs cronjobs)
chmod +x scripts/setup-monitoring.sh
./scripts/setup-monitoring.sh

# Manual monitoring check
./scripts/monitor-system.sh

# Manual alert check
./scripts/monitor-alerts.sh
```

---

## Scripts

### 1. `monitor-system.sh`
**Comprehensive system health dashboard**

**What it monitors:**
- Memory usage (total, used, free, percentage)
- CPU usage
- Disk usage
- Node.js/PM2 status (memory, CPU, uptime, restarts)
- MySQL connections, active queries, database size, transaction counts
- Redis memory, keys, clients, cached nonces
- API health endpoint
- Network ports

**Usage:**
```bash
./scripts/monitor-system.sh
```

**Configuration (environment variables):**
```bash
# MySQL
export MYSQL_USER="root"
export MYSQL_PASSWORD="your_password"
export MYSQL_HOST="localhost"
export MYSQL_PORT="3306"
export MYSQL_DB="x402_facilitator"

# Redis
export REDIS_HOST="localhost"
export REDIS_PORT="6379"

# Thresholds
export ALERT_MEMORY_THRESHOLD=80   # Alert if memory > 80%
export ALERT_MYSQL_THRESHOLD=180   # Alert if connections > 180

# Logging
export LOG_FILE="/var/log/x402-monitor.log"
```

**Output:**
```
╔═══════════════════════════════════════════════════════════════════╗
║          x402 FACILITATOR SYSTEM MONITOR                          ║
╚═══════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SYSTEM RESOURCES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Memory:
  Total: 2048 MB
  Used:  1024 MB (50.0%)
  Free:  1024 MB
✓ Memory usage healthy: 50.0%

CPU Usage: 15.2%
✓ CPU usage healthy: 15.2%

Disk (/):
  Used: 5.2G / 59G (9%)
✓ Disk usage healthy: 9%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NODE.JS APPLICATION (PM2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ x402-facilitator: ONLINE
  Memory: 245 MB
  CPU: 2.5%
  Uptime: 48 hours
  Restarts: 0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MYSQL DATABASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ MySQL connection: OK
  Connections: 45 / 200 (22.5%)
  Active queries: 2
  Aborted connects: 0
✓ MySQL connections healthy: 45/200

  Database size (x402_facilitator): 125.45 MB
  Transactions:
    Total: 15234
    Pending: 12
    Completed: 14987
    Failed: 235

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REDIS CACHE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Redis connection: OK
  Memory used: 15.23M
  Keys: 8456
  Connected clients: 5
  Uptime: 7 days
  Cached nonces: 8234
✓ Redis cache active with 8234 nonces

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ System health: GOOD - No critical issues detected
```

---

### 2. `monitor-alerts.sh`
**Alert notification system**

**What it checks:**
- Memory > threshold → Alert
- CPU > threshold → Alert
- Disk > threshold → Alert
- MySQL connections > threshold → Alert
- MySQL connection failure → Alert
- Redis connection failure → Alert
- API health check failure → Alert
- PM2 process not running → Alert
- Pending transactions > threshold → Warning

**Notification channels:**
- Slack
- Discord
- Email
- Custom webhook

**Configuration:**
```bash
# Alert destinations
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR/WEBHOOK"
export ALERT_EMAIL="admin@example.com"
export CUSTOM_WEBHOOK_URL="https://your-api.com/alerts"

# Server identification (for multi-region)
export SERVER_NAME="x402-facilitator-us"
export SERVER_REGION="us-east-1"

# Thresholds
export ALERT_MEMORY_THRESHOLD=80
export ALERT_CPU_THRESHOLD=90
export ALERT_MYSQL_THRESHOLD=180
export ALERT_DISK_THRESHOLD=85
export ALERT_PENDING_TX=100

# MySQL/Redis config (same as monitor-system.sh)
export MYSQL_USER="root"
export MYSQL_PASSWORD="your_password"
export MYSQL_HOST="localhost"
export MYSQL_DB="x402_facilitator"
```

**Slack notification example:**
```
🚨 x402 Facilitator Alert

Server: x402-facilitator-us (us-east-1)
Severity: critical
Message: Memory usage critical: 85.2% (threshold: 80%)
Time: 2025-12-10 14:35:22
```

---

### 3. `setup-monitoring.sh`
**One-command monitoring setup**

**What it does:**
1. Makes monitoring scripts executable
2. Creates log files
3. Installs cronjobs:
   - System monitor: Every 5 minutes
   - Alert checks: Every 2 minutes
   - Log cleanup: Daily at midnight (keeps 7 days)

**Usage:**
```bash
./scripts/setup-monitoring.sh
```

**Cronjobs installed:**
```cron
# x402 Facilitator Monitoring
*/5 * * * * cd /srv/x402/x402-facilitator && ./scripts/monitor-system.sh >> /var/log/x402-monitor-cron.log 2>&1
*/2 * * * * cd /srv/x402/x402-facilitator && ./scripts/monitor-alerts.sh >> /var/log/x402-alerts-cron.log 2>&1
0 0 * * * find /var/log -name 'x402-*.log' -mtime +7 -delete
```

---

## Log Files

| File | Purpose | Rotation |
|------|---------|----------|
| `/var/log/x402-monitor.log` | System metrics history | 7 days |
| `/var/log/x402-alerts.log` | Alert history | 7 days |
| `/var/log/x402-monitor-cron.log` | Cron output for system monitor | 7 days |
| `/var/log/x402-alerts-cron.log` | Cron output for alerts | 7 days |

**View logs:**
```bash
# Real-time monitoring
tail -f /var/log/x402-monitor.log

# Recent alerts
tail -50 /var/log/x402-alerts.log

# Search for specific issues
grep "CRITICAL" /var/log/x402-alerts.log
grep "MYSQL" /var/log/x402-monitor.log
```

---

## Multi-Region Setup

For domain-based multi-region (us-api.netpay.id, sg-api.netpay.id, etc):

**Each region's configuration:**

```bash
# US region
export SERVER_NAME="x402-us"
export SERVER_REGION="us-east-1"
export MYSQL_HOST="db.us.netpay.internal"
export REDIS_HOST="redis.us.netpay.internal"

# Singapore region
export SERVER_NAME="x402-sg"
export SERVER_REGION="ap-southeast-1"
export MYSQL_HOST="db.sg.netpay.internal"
export REDIS_HOST="redis.sg.netpay.internal"

# UK region
export SERVER_NAME="x402-uk"
export SERVER_REGION="eu-west-2"
export MYSQL_HOST="db.uk.netpay.internal"
export REDIS_HOST="redis.uk.netpay.internal"
```

This tags alerts with server name and region, so you know which instance has issues.

---

## Alert Integration Examples

### Slack Setup
1. Go to https://api.slack.com/messaging/webhooks
2. Create incoming webhook
3. Copy webhook URL
4. Set environment variable:
   ```bash
   export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX"
   ```

### Discord Setup
1. Server Settings → Integrations → Webhooks → New Webhook
2. Copy webhook URL
3. Set environment variable:
   ```bash
   export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/123456789/abcdefg..."
   ```

### Email Setup (requires mailutils)
```bash
# Install mailutils
sudo apt-get install mailutils

# Configure
export ALERT_EMAIL="admin@netpay.id"
```

### Custom Webhook
```bash
export CUSTOM_WEBHOOK_URL="https://api.netpay.id/internal/alerts"
```

**Webhook payload:**
```json
{
  "server": "x402-us",
  "region": "us-east-1",
  "severity": "critical",
  "message": "Memory usage critical: 85.2%",
  "timestamp": "2025-12-10T14:35:22Z"
}
```

---

## Troubleshooting

### Cronjobs not running
```bash
# Check cron service
sudo systemctl status cron

# View cron logs
grep CRON /var/log/syslog

# Test cronjob manually
cd /srv/x402/x402-facilitator && ./scripts/monitor-system.sh
```

### Permissions errors
```bash
# Fix log file permissions
sudo chown $USER:$USER /var/log/x402-*.log
sudo chmod 644 /var/log/x402-*.log

# Fix script permissions
chmod +x scripts/*.sh
```

### MySQL connection issues
```bash
# Test MySQL connection
mysql -h${MYSQL_HOST} -u${MYSQL_USER} -p${MYSQL_PASSWORD} -e "SELECT 1"

# Check MySQL is running
sudo systemctl status mysql
```

### No alerts received
```bash
# Test alert script manually
./scripts/monitor-alerts.sh

# Check alert log
tail -f /var/log/x402-alerts.log

# Verify webhook URLs are set
echo $SLACK_WEBHOOK_URL
echo $DISCORD_WEBHOOK_URL
```

---

## Performance Impact

- **CPU**: < 1% (monitoring runs for ~2-5 seconds every 2-5 minutes)
- **Memory**: < 10 MB
- **Disk**: ~1-5 MB/day for logs
- **Network**: Minimal (only when alerts triggered)

**Total overhead: Negligible** - safe for production use.
