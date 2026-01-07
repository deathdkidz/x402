# x402 Facilitator Setup Guide

Complete setup instructions for deploying the Rust x402 Facilitator service.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Redis Setup](#redis-setup)
6. [RPC Provider Setup](#rpc-provider-setup)
7. [Paymaster Wallet Setup](#paymaster-wallet-setup)
8. [Building the Application](#building-the-application)
9. [Running the Service](#running-the-service)
10. [Nginx Reverse Proxy](#nginx-reverse-proxy)
11. [SSL Certificate Setup](#ssl-certificate-setup)
12. [Verification](#verification)

---

## Prerequisites

### System Requirements

- **OS**: Linux (Ubuntu 22.04+ recommended)
- **CPU**: 2+ cores
- **RAM**: 2GB minimum, 4GB recommended
- **Storage**: 20GB SSD

### Required Software

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Rust (via rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Verify Rust installation
rustc --version  # Should be 1.75+

# Install build dependencies
sudo apt install -y build-essential pkg-config libssl-dev

# Install MySQL
sudo apt install -y mysql-server
sudo systemctl enable mysql

# Install Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server

# Install Nginx (for reverse proxy)
sudo apt install -y nginx
sudo systemctl enable nginx
```

---

## Quick Start

### Option 1: Auto Install (Recommended for New VPS)

```bash
# Navigate to project directory
cd /srv/x402/x402-facilitator-rs

# Run the auto-install script
sudo ./scripts/install.sh
```

The install script will:
- Install system dependencies (Rust, MySQL, Redis, Nginx)
- Create the database and schema
- Prompt for configuration (paymaster keys, RPC endpoints)
- Build the application
- Set up systemd service
- Configure Nginx reverse proxy with SSL

### Option 2: Manual Setup

```bash
# 1. Clone or navigate to project
cd /srv/x402/x402-facilitator-rs

# 2. Copy and edit environment file
cp .env.example .env
nano .env

# 3. Setup database
sudo mysql < scripts/schema.sql

# 4. Build release binary
cargo build --release

# 5. Run the service
./target/release/x402-facilitator
```

---

## Environment Configuration

Create a `.env` file in the project root:

```bash
# =====================================================
# x402 Facilitator (Rust) - Environment Configuration
# =====================================================

# Server Configuration
PORT=8080
LOG_LEVEL=info

# Database Configuration (MySQL)
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=x402_facilitator
DB_USER=x402_user
DB_PASSWORD=your_secure_password_here
DB_CONNECTION_LIMIT=50

# Redis Configuration
REDIS_URL=redis://localhost:6379

# =====================================================
# Network Configuration
# =====================================================
TESTNET_NETWORKS="Base Sepolia,Ethereum Sepolia,OP Sepolia"
MAINNET_NETWORKS="Base,Ethereum,OP Mainnet"

# =====================================================
# RPC Endpoints (WebSocket preferred for speed)
# =====================================================
# Testnet RPCs
BASE_SEPOLIA_RPC=wss://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY
ETHEREUM_SEPOLIA_RPC=wss://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
OP_SEPOLIA_RPC=wss://opt-sepolia.g.alchemy.com/v2/YOUR_API_KEY

# Mainnet RPCs
BASE_RPC=wss://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ETHEREUM_RPC=wss://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
OP_MAINNET_RPC=wss://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# =====================================================
# Paymaster Configuration (REQUIRED)
# =====================================================
# Comma-separated list of private keys (with or without 0x prefix)
# These wallets pay gas fees for settlements
# IMPORTANT: Fund these wallets with ETH on each network you support!
PAYMASTER_PRIVATE_KEYS=0xYOUR_PRIVATE_KEY_1,0xYOUR_PRIVATE_KEY_2

# =====================================================
# Vault Configuration (for /account endpoint)
# =====================================================
# Vault address to receive credit purchase payments
VAULT_ADDRESS=0xYOUR_VAULT_ADDRESS
# Vault private key (for internal operations)
VAULT_PRIVATE_KEY=0xYOUR_VAULT_PRIVATE_KEY

# =====================================================
# Internal API Security
# =====================================================
# Secret for authenticating internal API calls (like /account)
INTERNAL_API_SECRET=your-internal-api-secret-here

# =====================================================
# Price Feeds
# =====================================================
# CoinMarketCap API key for token price lookups
COINMARKETCAP_API_KEY=your-cmc-api-key

# =====================================================
# External Config Directory (optional)
# =====================================================
# Path to external TOML config files (defaults to ./config)
CONFIG_DIR=/srv/x402/x402-facilitator-rs/config

# =====================================================
# Security Configuration
# =====================================================
SECURITY_BAN_THRESHOLD=100
SECURITY_BAN_DURATION_MS=3600000
SECURITY_CLEANUP_INTERVAL_MS=600000

# =====================================================
# Transaction Monitoring
# =====================================================
TRANSACTION_MONITOR_INTERVAL_MS=20000
```

### Required vs Optional Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PAYMASTER_PRIVATE_KEYS` | ✅ Yes | At least one funded wallet private key |
| `DB_*` | ✅ Yes | MySQL database connection |
| `INTERNAL_API_SECRET` | ✅ Yes | Secret for /account endpoint authentication |
| `VAULT_ADDRESS` | ⚠️ Required for /account | Address to receive credit payments |
| `VAULT_PRIVATE_KEY` | ⚠️ Required for /account | Private key for vault operations |
| `REDIS_URL` | ⚠️ Recommended | Defaults to localhost:6379 |
| `*_RPC` | ⚠️ Recommended | Use your own Alchemy/Infura keys |
| `COINMARKETCAP_API_KEY` | ⚠️ Recommended | For token price lookups |
| `CONFIG_DIR` | ❌ No | Defaults to ./config |
| `PORT` | ❌ No | Defaults to 8080 |
| All others | ❌ No | Have sensible defaults |

---

## Database Setup

Run the complete database setup with a single command:

```bash
sudo mysql < scripts/schema.sql
```

This creates:
- Database: `x402_facilitator`
- User: `x402_user` (update password in schema.sql first!)
- All required tables with proper indexes

### Database Schema Overview

| Table | Description |
|-------|-------------|
| `api_keys` | API key accounts with separate mainnet/testnet balances |
| `merchants` | Merchant accounts (legacy) |
| `transactions` | Settlement transaction records |
| `credit_transactions` | Credit movement history |
| `credit_purchases` | Blockchain credit purchases with network tracking |
| `webhook_logs` | Webhook delivery logs |
| `auth_nonces` | SIWE authentication nonces |
| `merchant_sessions` | Login sessions |
| `gas_tracking` | Gas price analytics |
| `transaction_events` | Transaction status audit log |
| `webhook_deliveries` | Detailed webhook tracking |
| `network_aliases` | Network name mappings (canonical → alias) |

### API Keys Balance Structure

The `api_keys` table has separate balances for testnet and mainnet:

- `mainnet_balance` - Credits available for mainnet settlements
- `testnet_balance` - Credits available for testnet settlements  
- `usd_balance` - Combined balance (auto-calculated via trigger)
- `lifetime_mainnet_purchased` - Total mainnet credits ever purchased
- `lifetime_testnet_purchased` - Total testnet credits ever purchased

Run the migration to add these columns:
```bash
sudo mysql x402_facilitator < scripts/migrations/003_separate_testnet_mainnet_balance.sql
```

### Manual Database Creation

If you need to create the database manually:

```sql
-- Create database
CREATE DATABASE IF NOT EXISTS x402_facilitator 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

-- Create user (change password!)
CREATE USER IF NOT EXISTS 'x402_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON x402_facilitator.* TO 'x402_user'@'localhost';
FLUSH PRIVILEGES;
```

Then run the full schema:
```bash
sudo mysql x402_facilitator < scripts/schema.sql
```

---

## Redis Setup

Redis is used for caching and rate limiting.

### 1. Configure Redis

```bash
sudo nano /etc/redis/redis.conf
```

Key settings:
```conf
# Bind to localhost only
bind 127.0.0.1

# Set max memory
maxmemory 256mb
maxmemory-policy allkeys-lru

# Enable persistence (optional but recommended)
appendonly yes
```

### 2. Restart Redis

```bash
sudo systemctl restart redis-server
sudo systemctl status redis-server
```

### 3. Test Connection

```bash
redis-cli ping
# Should return: PONG
```

---

## RPC Provider Setup

### Recommended Providers

1. **Alchemy** (recommended) - [alchemy.com](https://alchemy.com)
2. **Infura** - [infura.io](https://infura.io)
3. **QuickNode** - [quicknode.com](https://quicknode.com)

### Get API Keys

1. Create account at Alchemy
2. Create apps for each network:
   - Base Mainnet
   - Base Sepolia (testnet)
   - Optimism Mainnet
   - OP Sepolia (testnet)
   - Ethereum Mainnet
   - Ethereum Sepolia (testnet)

### WebSocket vs HTTP

| Feature | WebSocket (wss://) | HTTP (https://) |
|---------|-------------------|-----------------|
| Latency | Lower (~50ms) | Higher (~100ms) |
| Connection | Persistent | Per-request |
| Cost | Same | Same |
| Recommended | ✅ Yes | Fallback |

Use WebSocket URLs when available for best performance.

---

## Paymaster Wallet Setup

Paymaster wallets pay gas fees for settlements.

### 1. Generate Wallets

```bash
# Using cast (from Foundry)
cast wallet new

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Fund Wallets

Fund each paymaster wallet with native tokens on each supported network:

| Network | Native Token | Recommended Amount |
|---------|-------------|-------------------|
| Base | ETH | 0.01 ETH |
| Base Sepolia | ETH | 0.1 ETH (free from faucet) |
| Optimism | ETH | 0.01 ETH |
| OP Sepolia | ETH | 0.1 ETH (free from faucet) |
| Ethereum | ETH | 0.1 ETH |
| Ethereum Sepolia | ETH | 0.5 ETH (free from faucet) |

### 3. Testnet Faucets

- **Base Sepolia**: https://www.alchemy.com/faucets/base-sepolia
- **OP Sepolia**: https://www.alchemy.com/faucets/optimism-sepolia
- **Ethereum Sepolia**: https://www.alchemy.com/faucets/ethereum-sepolia

### 4. Multiple Paymasters

For high throughput, use multiple paymaster wallets:

```bash
PAYMASTER_PRIVATE_KEYS=0xkey1,0xkey2,0xkey3,0xkey4
```

Benefits:
- Parallel transaction processing
- Avoids nonce conflicts
- Higher throughput

---

## Building the Application

### Development Build

```bash
cd /srv/x402/x402-facilitator-rs
cargo build
```

### Release Build (Optimized)

```bash
cargo build --release
```

The binary will be at `./target/release/x402-facilitator`

### Build Time

- First build: ~3-5 minutes (compiling dependencies)
- Subsequent builds: ~30-60 seconds

---

## Running the Service

### Option 1: Direct Execution

```bash
# Foreground
./target/release/x402-facilitator

# Background with nohup
nohup ./target/release/x402-facilitator > logs/server.log 2>&1 &
```

### Option 2: Systemd Service (Recommended)

```bash
# Copy service file
sudo cp x402-facilitator-rs.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable on boot
sudo systemctl enable x402-facilitator-rs

# Start service
sudo systemctl start x402-facilitator-rs

# Check status
sudo systemctl status x402-facilitator-rs
```

### Systemd Commands

```bash
# Start/stop/restart
sudo systemctl start x402-facilitator-rs
sudo systemctl stop x402-facilitator-rs
sudo systemctl restart x402-facilitator-rs

# View logs
sudo journalctl -u x402-facilitator-rs -f

# View recent logs
sudo journalctl -u x402-facilitator-rs --since "1 hour ago"
```

### Option 3: PM2 (Alternative)

Create `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [{
    name: 'x402-facilitator-rs',
    script: './target/release/x402-facilitator',
    cwd: '/srv/x402/x402-facilitator-rs',
    env: {
      NODE_ENV: 'production'
    },
    max_memory_restart: '2G',
    log_file: 'logs/combined.log',
    out_file: 'logs/out.log',
    error_file: 'logs/error.log'
  }]
};
```

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

---

## Nginx Reverse Proxy

### 1. Create Nginx Config

```bash
sudo nano /etc/nginx/sites-available/x402-facilitator
```

```nginx
upstream x402_facilitator {
    server 127.0.0.1:8080;
    keepalive 32;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    location / {
        proxy_pass http://x402_facilitator;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffering
        proxy_buffering off;
    }

    # Block metrics endpoint from public access
    location /metrics {
        deny all;
        return 403;
    }
}
```

### 2. Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/x402-facilitator /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## SSL Certificate Setup

### Using Let's Encrypt (Free)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
# Test renewal
sudo certbot renew --dry-run
```

---

## Verification

### 1. Health Check

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-20T10:00:00Z"
}
```

### 2. Supported Networks Endpoint

```bash
curl http://localhost:8080/supported
```

Should list all configured networks with USDC addresses.

### 3. Check Logs

```bash
# Application logs
tail -f /srv/x402/x402-facilitator-rs/logs/server.log

# Or with systemd
sudo journalctl -u x402-facilitator-rs -f
```

### 4. Verify Database Connection

```bash
# Check for startup message in logs
grep "MySQL connection pool created" logs/server.log
```

### 5. Verify Redis Connection

```bash
# Check for startup message
grep "Redis connection pool created" logs/server.log
```

### 6. Verify RPC Connections

```bash
# Check for WebSocket connections
grep "WebSocket connected" logs/server.log
```

---

## Common Issues

### Issue: "PAYMASTER_PRIVATE_KEYS not set"

**Solution**: Ensure `.env` file exists and contains valid private keys.

### Issue: "MySQL connection failed"

**Solution**:
1. Check MySQL is running: `sudo systemctl status mysql`
2. Verify credentials in `.env`
3. Ensure database exists: `mysql -u root -p -e "SHOW DATABASES;"`

### Issue: "Redis connection refused"

**Solution**:
1. Check Redis is running: `sudo systemctl status redis`
2. Test connection: `redis-cli ping`

### Issue: "RPC connection failed"

**Solution**:
1. Verify API keys are valid
2. Check network connectivity
3. Try HTTP instead of WebSocket URL

### Issue: "Insufficient funds for gas"

**Solution**: Fund paymaster wallets with native tokens (ETH) on each network.

---

## Next Steps

1. **Add Merchants**: Create merchant accounts in the database
2. **Fund Paymasters**: Ensure all paymaster wallets have sufficient gas
3. **Configure Monitoring**: Set up Prometheus metrics scraping
4. **Enable Webhooks**: Configure merchant webhook URLs
5. **Test Settlements**: Run test transactions on testnets first

See [OPERATIONS.md](./OPERATIONS.md) for day-to-day operations and monitoring.
