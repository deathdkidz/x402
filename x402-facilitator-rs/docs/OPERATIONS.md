# x402 Facilitator Operations Guide

## Table of Contents

1. [Quick Start](#quick-start)
2. [Server Management](#server-management)
3. [Live Logs & Monitoring](#live-logs--monitoring)
4. [New Server Setup](#new-server-setup)
5. [Health Checks](#health-checks)
6. [Troubleshooting](#troubleshooting)
7. [Performance Analysis](#performance-analysis)
8. [Pre-flight Checks Audit](#pre-flight-checks-audit)
9. [Resource Usage](#resource-usage)
10. [Implemented Optimizations](#implemented-optimizations)

---

## Quick Start

### Start the Server (Production)

```bash
# Using systemd (recommended)
sudo systemctl start x402-facilitator-rs

# Check status
sudo systemctl status x402-facilitator-rs
```

### Development Mode

```bash
cd /srv/x402/x402-facilitator-rs
cargo run
```

---

## Server Management

### Start Server

```bash
sudo systemctl start x402-facilitator-rs
```

### Stop Server

```bash
sudo systemctl stop x402-facilitator-rs

# If there are orphan processes (started manually), kill them:
pkill -f x402-facilitator
```

### Restart Server

```bash
sudo systemctl restart x402-facilitator-rs

# After rebuilding:
cargo build --release && sudo systemctl restart x402-facilitator-rs
```

### Check Server Status

```bash
# Systemd status
sudo systemctl status x402-facilitator-rs

# Health endpoint
curl http://localhost:8080/health

# Check if process is running
ps aux | grep x402-facilitator

# Check port binding
lsof -i :8080
```

### Enable/Disable Auto-start

```bash
# Enable on boot
sudo systemctl enable x402-facilitator-rs

# Disable on boot
sudo systemctl disable x402-facilitator-rs
```

---

## Live Logs & Monitoring

### View Live Logs

```bash
# Via journalctl (recommended)
sudo journalctl -u x402-facilitator-rs -f

# Via log file
tail -f /srv/x402/x402-facilitator-rs/logs/x402-facilitator.log

# Last 100 lines
sudo journalctl -u x402-facilitator-rs -n 100

# With color highlighting
tail -f /srv/x402/x402-facilitator-rs/logs/x402-facilitator.log | grep --color=auto -E '(ERROR|WARN|INFO|✅|❌|⚡)'
```

### Log Filtering

```bash
# Errors only
tail -f logs/x402-facilitator.log | grep -E '(ERROR|❌)'

# Settlement logs
tail -f logs/x402-facilitator.log | grep -E '(SETTLE|Settlement)'

# Verification logs
tail -f logs/x402-facilitator.log | grep -E '(VERIFY|Verification)'

# Transaction monitoring
tail -f logs/x402-facilitator.log | grep -E '(monitor|Monitor|pending)'

# Flashblock confirmations
tail -f logs/x402-facilitator.log | grep -E '(⚡|Flashblock)'
```

### Log Rotation (Systemd)

Systemd handles log rotation via journald. Configure in `/etc/systemd/journald.conf`:

```ini
[Journal]
SystemMaxUse=500M
MaxRetentionSec=7day
```

For file logs, use logrotate:

```bash
# Create /etc/logrotate.d/x402-facilitator
cat > /etc/logrotate.d/x402-facilitator << 'EOF'
/srv/x402/x402-facilitator-rs/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
```

---

## New Server Setup

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install system dependencies (Ubuntu/Debian)
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev
```

### Clone & Build

```bash
# Clone repository
cd /srv
git clone <repo-url> x402
cd x402/x402-facilitator-rs

# Build release binary
cargo build --release
```

### Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

#### Required Environment Variables

```env
# Server
PORT=8080
LOG_LEVEL=info

# Database (MySQL)
DB_HOST=localhost
DB_PORT=3306
DB_USER=x402user
DB_PASSWORD=your_secure_password
DB_DATABASE=x402_facilitator
DB_CONNECTION_LIMIT=50

# Redis
REDIS_URL=redis://localhost:6379

# Networks (comma-separated)
MAINNET_NETWORKS=Base,OP Mainnet,HyperEVM
TESTNET_NETWORKS=Base Sepolia,OP Sepolia,HyperEVM Testnet

# Paymaster keys (comma-separated)
PAYMASTER_PRIVATE_KEYS=0x...,0x...,...

# RPC URLs
BASE_RPC=wss://...
BASE_SEPOLIA_RPC=wss://...
OP_MAINNET_RPC=wss://...
OP_SEPOLIA_RPC=wss://...

# Security
SECURITY_BAN_THRESHOLD=100
SECURITY_BAN_DURATION_MS=3600000
```

### Database Setup

```bash
# Create database
mysql -u root -p <<EOF
CREATE DATABASE x402_facilitator;
CREATE USER 'x402user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON x402_facilitator.* TO 'x402user'@'localhost';
FLUSH PRIVILEGES;
EOF
```

### Redis Setup

```bash
# Install Redis
sudo apt install redis-server

# Start and enable
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Test connection
redis-cli ping
```

### Create Systemd Service

```bash
# Create systemd service file
sudo tee /etc/systemd/system/x402-facilitator-rs.service << 'EOF'
[Unit]
Description=x402 Facilitator (Rust)
Documentation=https://github.com/your-org/x402
After=network.target mysql.service redis.service
Wants=mysql.service redis.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/srv/x402/x402-facilitator-rs
ExecStart=/srv/x402/x402-facilitator-rs/target/release/x402-facilitator
EnvironmentFile=/srv/x402/x402-facilitator-rs/.env
Restart=always
RestartSec=5
StandardOutput=append:/srv/x402/x402-facilitator-rs/logs/x402-facilitator.log
StandardError=append:/srv/x402/x402-facilitator-rs/logs/error.log

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/x402/x402-facilitator-rs/logs

# Resource limits
LimitNOFILE=65535
MemoryMax=2G

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd, enable and start service
sudo systemctl daemon-reload
sudo systemctl enable x402-facilitator-rs
sudo systemctl start x402-facilitator-rs

# Check status
sudo systemctl status x402-facilitator-rs
```

### Nginx Reverse Proxy (Optional)

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }
}
```

---

## Health Checks

### API Health Endpoint

```bash
# Basic health check
curl http://localhost:8080/health

# Expected response:
# {
#   "status": "ok",
#   "service": "x402-facilitator",
#   "timestamp": 1234567890123,
#   "uptime": 3600.5
# }
```

### Component Checks

```bash
# Database connectivity
mysql -u x402user -p -e "SELECT 1" x402_facilitator

# Redis connectivity
redis-cli ping

# Network provider check (via API)
curl http://localhost:8080/networks
```

### Automated Health Monitoring Script

```bash
#!/bin/bash
# /usr/local/bin/x402-health-check.sh

ENDPOINT="http://localhost:8080/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $ENDPOINT)

if [ "$RESPONSE" -eq 200 ]; then
    echo "✅ Facilitator healthy"
    exit 0
else
    echo "❌ Facilitator unhealthy (HTTP $RESPONSE)"
    sudo systemctl restart x402-facilitator-rs
    exit 1
fi
```

---

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Find process using port
lsof -i :8080

# Kill process
kill -9 <PID>

# Or change port in .env
PORT=8081
```

#### Service Won't Stop (Orphan Process)

If `systemctl stop` doesn't kill the process, it may have been started manually:

```bash
# Check for running processes
ps aux | grep x402-facilitator

# Kill all x402-facilitator processes
pkill -f x402-facilitator

# Verify stopped
ps aux | grep x402-facilitator | grep -v grep
```

#### Database Connection Failed

```bash
# Check MySQL status
sudo systemctl status mysql

# Test connection
mysql -u x402user -p x402_facilitator

# Check credentials in .env
cat .env | grep DB_
```

#### Redis Connection Failed

```bash
# Check Redis status
sudo systemctl status redis-server

# Test connection
redis-cli ping

# Check URL in .env
cat .env | grep REDIS
```

#### Memory Issues

```bash
# Check memory usage
ps aux --sort=-%mem | head -10

# Check service memory limit in systemd
systemctl show x402-facilitator-rs | grep Memory
```

#### Permission Errors

```bash
# Fix log directory permissions
mkdir -p /srv/x402/x402-facilitator-rs/logs
chmod 755 /srv/x402/x402-facilitator-rs/logs

# Fix binary permissions
chmod +x /srv/x402/x402-facilitator-rs/target/release/x402-facilitator
```

#### Paymaster Insufficient Gas

**Error:**
```
insufficient funds for gas * price + value: balance 0, tx cost 104924436545, overshot 104924436545
```

**Cause:** The paymaster wallet has 0 ETH balance on that network.

**Fix:**
```bash
# Check paymaster balances
cd /srv/x402/x402-facilitator-rs
node scripts/check-balances.mjs

# Fund the paymaster wallet on the affected network
```

---

## Performance Analysis

### Request Flow Timing

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SETTLE REQUEST FLOW                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. HTTP Request Received                                     ~1-2ms    │
│     ├── Security middleware (rate check)                     ~0.1ms     │
│     ├── General rate limiter                                 ~0.1ms     │
│     ├── API key auth (Redis cache hit)                       ~1-2ms    │
│     │   └── API key auth (DB lookup on cache miss)          ~5-10ms    │
│     ├── Merchant rate limiter                                ~0.1ms     │
│     └── JSON validation                                      ~0.5ms     │
│                                                                          │
│  2. Settlement Pre-flight Checks                            ~50-150ms   │
│     ├── Network validation (in-memory)                       ~0.01ms    │
│     ├── Token validation (in-memory)                         ~0.01ms    │
│     ├── Time window check                                    ~0.01ms    │
│     ├── Amount validation                                    ~0.01ms    │
│     ├── Duplicate check (Redis)                              ~1-2ms    │
│     ├── Credit balance check (DB)                           ~5-10ms    │
│     ├── Balance verification (RPC call)                    ~30-100ms   │
│     └── On-chain nonce check (RPC call)                    ~30-100ms   │
│                                                                          │
│  3. Transaction Execution                                  ~100-500ms   │
│     ├── Build transaction                                    ~1ms       │
│     ├── Sign transaction                                     ~1ms       │
│     └── Send to mempool (RPC call)                        ~100-500ms   │
│                                                                          │
│  4. Confirmation Wait (Flashblock networks)               ~200-1500ms   │
│     ├── Phase 1: 100ms polling for 1.5s                                 │
│     └── Phase 2: 500ms polling for 10s (fallback)                       │
│                                                                          │
│  5. Database Updates                                         ~5-20ms    │
│     ├── Update transaction status                            ~5ms       │
│     ├── Deduct credits                                       ~5ms       │
│     └── Log credit transaction                               ~5ms       │
│                                                                          │
│  TOTAL (Flashblock success): ~350-700ms                                  │
│  TOTAL (Standard network):   ~2-15 seconds                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Verification Flow Timing

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    VERIFY REQUEST FLOW                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. HTTP + Auth                                               ~3-5ms    │
│  2. Network validation                                        ~0.01ms   │
│  3. Token validation                                          ~0.01ms   │
│  4. EIP-712 signature verification                            ~1-2ms    │
│  5. Recipient verification                                    ~0.01ms   │
│  6. Time window verification                                  ~0.01ms   │
│  7. Balance check (RPC call)                                ~30-100ms   │
│  8. Amount verification                                       ~0.01ms   │
│                                                                          │
│  TOTAL: ~35-110ms                                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Pre-flight Checks Audit

### Rust vs Node.js Comparison

| Check | Node.js | Rust | Status |
|-------|---------|------|--------|
| 1. Network validation | ✅ | ✅ | ✓ Identical |
| 2. Token validation | ✅ | ✅ | ✓ Identical |
| 3. Payer extraction | ✅ | ✅ | ✓ Identical |
| 4. Signature verification (EIP-712) | ✅ | ✅ | ✓ Identical |
| 5. Recipient verification | ✅ | ✅ | ✓ Identical |
| 6. Time window validation | ✅ | ✅ | ✓ Identical (no buffer) |
| 7. Amount matching | ✅ | ✅ | ✓ Identical |
| 8. Duplicate check (Redis) | ✅ | ✅ | ✓ Identical |
| 9. Credit balance check | ✅ | ✅ | ✓ Identical |
| 10. Balance verification (RPC) | ✅ | ✅ | ✓ Parallel in Rust ⚡ |
| 11. On-chain nonce check | ✅ | ✅ | ✓ Parallel in Rust ⚡ |
| 12. Gas estimation | ⚠️ | ⚠️ | Implicit in send() |

---

## Resource Usage

### Memory Profile

| Component | Estimated Memory |
|-----------|-----------------|
| Base binary | ~15MB |
| MySQL pool (50 conn) | ~100MB |
| Redis pool (10 conn) | ~10MB |
| Provider pool (6 networks) | ~25MB |
| Request handling | ~2MB per concurrent |
| **Total idle** | **~150MB** |
| **Under load (100 concurrent)** | **~350MB** |

### CPU Profile

| Operation | CPU Usage |
|-----------|-----------|
| Idle | <1% |
| EIP-712 verification | 2-5% spike |
| Transaction signing | 1-2% spike |
| JSON serialization | <1% |

### Connection Pools

```toml
# Current configuration (optimized)
[database]
max_connections = 50
min_connections = 2
acquire_timeout = 10s
idle_timeout = 60s

[redis]
pool_size = 10

[providers]
# One WebSocket client per network
```

### File Descriptors

```bash
# Check current usage
ls /proc/$(pgrep x402-facilitator)/fd | wc -l

# Expected: ~70-150 FDs
```

---

## Implemented Optimizations

### ✅ 1. Parallel RPC Checks
Balance and nonce checks run in parallel using `tokio::join!`.
**Savings**: ~50ms per settlement request

### ✅ 2. Timing Instrumentation
Detailed timing logs added to settlement service.

### ✅ 3. Pre-warm Merchant Cache
On startup, all active merchants are pre-loaded into Redis cache (1 hour TTL).

### ✅ 4. Connection Pool Tuning
Database pool increased to 50 connections.

### ✅ 5. Response Compression
Gzip/Brotli compression enabled via `tower-http CompressionLayer`.

### ✅ 6. Gas Tracking Logging
```
⛽ Gas used: 65000 units @ 0.1 gwei = 6500 gwei (~0.000006 ETH) [Base]
```

### ✅ 7. WebSocket Providers
All RPC providers use WebSocket connections with HTTP fallback.

---

## Quick Reference Commands

```bash
# Start
sudo systemctl start x402-facilitator-rs

# Stop
sudo systemctl stop x402-facilitator-rs

# Restart
sudo systemctl restart x402-facilitator-rs

# Status
sudo systemctl status x402-facilitator-rs

# Logs (live)
sudo journalctl -u x402-facilitator-rs -f

# Logs (last 100 lines)
sudo journalctl -u x402-facilitator-rs -n 100

# Logs (file)
tail -f /srv/x402/x402-facilitator-rs/logs/x402-facilitator.log

# Health check
curl http://localhost:8080/health

# Build release
cargo build --release

# Kill orphan processes
pkill -f x402-facilitator
```

---

## Support

For issues or questions:
1. Check logs: `sudo journalctl -u x402-facilitator-rs -n 100`
2. Verify health: `curl http://localhost:8080/health`
3. Check database: `mysql -u x402user -p x402_facilitator`
4. Check Redis: `redis-cli ping`
5. Check processes: `ps aux | grep x402-facilitator`
