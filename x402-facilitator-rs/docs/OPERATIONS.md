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
9. [Bottleneck Analysis](#bottleneck-analysis)
10. [Resource Usage](#resource-usage)
11. [Optimization Recommendations](#optimization-recommendations)

---

## Quick Start

### Start the Server

```bash
# Development mode (with cargo watch for auto-reload)
cd /srv/x402/x402-facilitator-rs
cargo run

# Production mode (optimized release build)
cargo build --release
./target/release/x402-facilitator-rs
```

### With PM2 (Recommended for Production)

```bash
# Start with PM2
cd /srv/x402/x402-facilitator-rs
pm2 start ecosystem.config.cjs

# Quick commands
pm2 restart x402-facilitator-rs
pm2 stop x402-facilitator-rs
pm2 delete x402-facilitator-rs
```

---

## Server Management

### Start Server

```bash
# Option 1: Direct cargo (development)
cargo run

# Option 2: PM2 process manager (production)
pm2 start ecosystem.config.cjs

# Option 3: Run release binary directly
./target/release/x402-facilitator-rs

# Option 4: Systemd service (if configured)
sudo systemctl start x402-facilitator-rs
```

### Stop Server

```bash
# PM2
pm2 stop x402-facilitator-rs

# Direct process (find and kill)
pkill -f x402-facilitator-rs

# Graceful shutdown (sends SIGTERM)
kill -15 $(pgrep -f x402-facilitator-rs)

# Systemd
sudo systemctl stop x402-facilitator-rs
```

### Restart Server

```bash
# PM2 (zero-downtime restart)
pm2 restart x402-facilitator-rs

# Full rebuild and restart
cargo build --release && pm2 restart x402-facilitator-rs

# Systemd
sudo systemctl restart x402-facilitator-rs
```

### Check Server Status

```bash
# PM2 status
pm2 status

# Health endpoint
curl http://localhost:8080/health

# Check process
ps aux | grep x402-facilitator

# Check port binding
lsof -i :8080
netstat -tlnp | grep 8080
```

---

## Live Logs & Monitoring

### View Live Logs

```bash
# PM2 logs (real-time)
pm2 logs x402-facilitator-rs

# PM2 logs with timestamp
pm2 logs x402-facilitator-rs --timestamp

# Last 100 lines
pm2 logs x402-facilitator-rs --lines 100

# Follow log file directly
tail -f /srv/x402/x402-facilitator-rs/logs/x402-facilitator.log

# With color highlighting
tail -f logs/x402-facilitator.log | grep --color=auto -E '(ERROR|WARN|INFO|✅|❌|⚡)'
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

### PM2 Monitoring Dashboard

```bash
# Real-time dashboard
pm2 monit

# Web-based dashboard (requires pm2-web)
pm2 web
```

### Log Rotation

```bash
# Install log rotation
pm2 install pm2-logrotate

# Configure (keep 7 days, 10MB max)
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
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

# Install Node.js + PM2 (for process management)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
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
NODE_ENV=production
LOG_LEVEL=info

# Database (MySQL)
DB_HOST=localhost
DB_PORT=3306
DB_USER=x402user
DB_PASSWORD=your_secure_password
DB_DATABASE=x402_facilitator
DB_CONNECTION_LIMIT=20

# Redis
REDIS_URL=redis://localhost:6379

# Networks (comma-separated)
MAINNET_NETWORKS=base,ethereum,optimism
TESTNET_NETWORKS=base-sepolia

# Paymaster (one per network)
BASE_SEPOLIA_PAYMASTER_KEY=0x...

# RPC URLs
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_RPC_URL=https://mainnet.base.org

# Security
SECURITY_BAN_THRESHOLD=100
SECURITY_BAN_DURATION_MS=3600000

# Transaction Monitor
TRANSACTION_MONITOR_INTERVAL_MS=20000
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

# Run migrations (from Node.js version or SQL files)
mysql -u x402user -p x402_facilitator < schema.sql
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

### Start Service

```bash
# Create PM2 ecosystem config
cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'x402-facilitator-rs',
    script: './target/release/x402-facilitator-rs',
    cwd: '/srv/x402/x402-facilitator-rs',
    env: {
      NODE_ENV: 'production',
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.cjs

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
```

### Nginx Reverse Proxy (Optional)

```nginx
server {
    listen 443 ssl http2;
    server_name facilitator.yourdomain.com;

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
# health-check.sh

ENDPOINT="http://localhost:8080/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $ENDPOINT)

if [ "$RESPONSE" -eq 200 ]; then
    echo "✅ Facilitator healthy"
    exit 0
else
    echo "❌ Facilitator unhealthy (HTTP $RESPONSE)"
    pm2 restart x402-facilitator-rs
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
pm2 monit

# Increase limits
pm2 restart x402-facilitator-rs --max-memory-restart 2G
```

#### Permission Errors

```bash
# Fix log directory permissions
mkdir -p logs
chmod 755 logs

# Fix binary permissions
chmod +x target/release/x402-facilitator-rs
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

## Implemented Optimizations

### ✅ 1. Parallel RPC Checks
Balance and nonce checks run in parallel using `tokio::join!`.
**Savings**: ~50ms per settlement request

### ✅ 2. Timing Instrumentation
Detailed timing logs added to settlement service with `Instant::now()`.

### ✅ 3. Pre-warm Merchant Cache
On startup, all active merchants are pre-loaded into Redis cache (1 hour TTL).
**Benefit**: First request from each merchant is fast (no DB lookup).

### ✅ 4. Connection Pool Tuning
Database pool increased to 50 connections in `.env`.

### ✅ 5. Response Compression
Gzip/Brotli compression enabled via `tower-http CompressionLayer`.
**Benefit**: Smaller response sizes for `/networks` endpoint.

### ✅ 6. Gas Tracking Logging
Gas usage logged on transaction confirmation:
```
⛽ Gas used: 65000 units @ 0.1 gwei = 6500 gwei (~0.000006 ETH) [Base Sepolia]
```

### ✅ 7. Environment Cleanup
Removed unused/redundant variables from `.env`:
- Removed `PRIVATE_KEY` (unused)
- Removed `DB_NAME` (duplicate of `DB_DATABASE`)
- Removed rate limit vars (using governor crate)
- Removed webhook/settlement/gas configs (using defaults)
- Simplified to essential vars only

### ✅ 8. Time Window Check (Simplified)
Removed safety buffers - client is responsible for proper timing.

### ✅ 9. Prometheus Metrics
Metrics collection for monitoring (localhost only at `/metrics`):
- Request latency histograms
- Settlement/verification counters
- RPC call durations
- Gas usage tracking

Access: `curl http://localhost:8080/metrics`

### ✅ 10. WebSocket Providers
All RPC providers now use WebSocket connections with HTTP fallback:
- **Benefit**: Instant block notifications (no polling delay)
- **Benefit**: Lower latency for transaction confirmations
- **Benefit**: Reduced RPC call volume

Startup log shows:
```
🔌 Base: WebSocket connected (chain_id: 8453, 164ms)
🔌 Ethereum: WebSocket connected (chain_id: 1, 113ms)
```

---

## Resource Usage

### Memory Profile

| Component | Estimated Memory |
|-----------|-----------------|
| Base binary | ~15MB |
| MySQL pool (20 conn) | ~40MB |
| Redis pool (10 conn) | ~10MB |
| Provider pool (5 networks) | ~20MB |
| Request handling | ~2MB per concurrent |
| **Total idle** | **~85MB** |
| **Under load (100 concurrent)** | **~285MB** |

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
pool_size = 10  # deadpool default

[providers]
# One HTTP client per network
```

### File Descriptors

```bash
# Check current usage
ls /proc/$(pgrep x402-facilitator)/fd | wc -l

# Expected: ~70-150 FDs
# - 50 MySQL connections
# - 10 Redis connections
# - 8 HTTP providers (4 mainnet + 4 testnet)
# - stdin/stdout/stderr
# - Log files
```

---

## Environment Variables Reference

### Required Variables

```env
PORT=8080                          # Server port
LOG_LEVEL=info                     # Logging level
DB_HOST=localhost                  # MySQL host
DB_PORT=3306                       # MySQL port
DB_DATABASE=x402_facilitator       # Database name
DB_USER=root                       # Database user
DB_PASSWORD=xxx                    # Database password
DB_CONNECTION_LIMIT=50             # Connection pool size
REDIS_URL=redis://localhost:6379   # Redis connection
PAYMASTER_PRIVATE_KEYS=0x...,0x... # Comma-separated keys
MAINNET_NETWORKS=Base,Ethereum,... # Mainnet networks
TESTNET_NETWORKS=Base Sepolia,...  # Testnet networks
```

### RPC URLs (per network)

```env
BASE_SEPOLIA_RPC=wss://...
ETHEREUM_SEPOLIA_RPC=wss://...
OP_SEPOLIA_RPC=wss://...
BASE_RPC=wss://...
ETHEREUM_RPC=wss://...
OP_MAINNET_RPC=wss://...
```

### Security & Monitoring

```env
SECURITY_BAN_THRESHOLD=100             # Suspicious requests before ban
SECURITY_BAN_DURATION_MS=3600000       # Ban duration (1 hour)
SECURITY_CLEANUP_INTERVAL_MS=600000    # Cleanup interval (10 min)
TRANSACTION_MONITOR_INTERVAL_MS=20000  # Pending tx check interval
```

---

## Quick Reference Commands

```bash
# Start
pm2 start ecosystem.config.cjs

# Stop
pm2 stop x402-facilitator-rs

# Restart
pm2 restart x402-facilitator-rs

# Logs
pm2 logs x402-facilitator-rs --lines 100

# Monitor
pm2 monit

# Health check
curl http://localhost:8080/health

# Metrics (localhost only)
curl http://localhost:8080/metrics

# Build release
cargo build --release

# Check status
pm2 status
```

---

## Support

For issues or questions:
1. Check logs: `pm2 logs x402-facilitator-rs`
2. Verify health: `curl http://localhost:8080/health`
3. Check metrics: `curl http://localhost:8080/metrics`
4. Check database: `mysql -u x402user -p x402_facilitator`
5. Check Redis: `redis-cli ping`
