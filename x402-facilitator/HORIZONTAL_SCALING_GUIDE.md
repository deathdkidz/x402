# 🚀 Horizontal Scaling Guide for x402 Facilitator

## Overview

This guide explains how to run **multiple instances** of the x402 Facilitator service to handle high load through horizontal scaling (load balancing).

---

## Architecture Options

### Option 1: Multiple Instances + Load Balancer (Recommended)

```
                          ┌──────────────────┐
                          │  Load Balancer   │
                          │  (Nginx/HAProxy) │
                          └────────┬─────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
         ┌────▼─────┐         ┌────▼─────┐        ┌────▼─────┐
         │Instance 1│         │Instance 2│        │Instance 3│
         │ Port 8081│         │ Port 8082│        │ Port 8083│
         └────┬─────┘         └────┬─────┘        └────┬─────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │
                          ┌────────▼─────────┐
                          │  Shared Services │
                          │  - MySQL         │
                          │  - Redis         │
                          │  - RPC Providers │
                          └──────────────────┘
```

**Pros:**
- Simple to set up
- Can run on single powerful server
- No network latency between instances

**Cons:**
- Single point of failure (server hardware)
- Limited by single server's resources

---

### Option 2: Distributed Instances + Shared Database (Production)

```
┌─────────────────────────────────────────────────────────────┐
│                     Load Balancer (Cloud)                   │
│              AWS ELB / Nginx / Cloudflare LB                │
└────────┬──────────────────────┬──────────────────┬──────────┘
         │                      │                  │
    ┌────▼─────┐          ┌─────▼────┐      ┌─────▼────┐
    │ Server 1 │          │ Server 2 │      │ Server 3 │
    │ 2 vCPU   │          │ 2 vCPU   │      │ 2 vCPU   │
    │ 4GB RAM  │          │ 4GB RAM  │      │ 4GB RAM  │
    └────┬─────┘          └─────┬────┘      └─────┬────┘
         │                      │                  │
         └──────────────────────┼──────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Centralized Services │
                    │  - MySQL (RDS/Aurora) │
                    │  - Redis (ElastiCache)│
                    └───────────────────────┘
```

**Pros:**
- True redundancy (no single point of failure)
- Can scale infinitely by adding servers
- Better fault tolerance

**Cons:**
- More complex setup
- Network latency to shared services
- Higher cost

---

## Implementation Steps

### Step 1: Prepare Configuration

Each instance needs **IDENTICAL** configuration except for:
- Port number (8081, 8082, 8083, etc.)
- Instance identifier (for logging)

**Create instance-specific environment files:**

```bash
# Instance 1
cp .env .env.instance1
sed -i 's/PORT=80/PORT=8081/' .env.instance1

# Instance 2
cp .env .env.instance2
sed -i 's/PORT=80/PORT=8082/' .env.instance2

# Instance 3
cp .env .env.instance3
sed -i 's/PORT=80/PORT=8083/' .env.instance3
```

---

### Step 2: Update PM2 Configuration

Create `ecosystem.config.js` for multiple instances:

```javascript
module.exports = {
  apps: [
    {
      name: 'x402-instance-1',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env.instance1',
      error_file: './logs/instance1-error.log',
      out_file: './logs/instance1-out.log',
      merge_logs: true,
      max_memory_restart: '1G',
    },
    {
      name: 'x402-instance-2',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env.instance2',
      error_file: './logs/instance2-error.log',
      out_file: './logs/instance2-out.log',
      merge_logs: true,
      max_memory_restart: '1G',
    },
    {
      name: 'x402-instance-3',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env.instance3',
      error_file: './logs/instance3-error.log',
      out_file: './logs/instance3-out.log',
      merge_logs: true,
      max_memory_restart: '1G',
    },
  ],
};
```

Start all instances:
```bash
pm2 delete all
pm2 start ecosystem.config.js
pm2 save
```

---

### Step 3: Configure Load Balancer

#### Option A: Nginx Load Balancer

Create `/etc/nginx/sites-available/x402-loadbalancer`:

```nginx
upstream x402_backend {
    # Load balancing method: least_conn (send to least busy server)
    least_conn;
    
    # Backend instances
    server 127.0.0.1:8081 weight=1 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:8082 weight=1 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:8083 weight=1 max_fails=3 fail_timeout=30s;
    
    # Health check
    keepalive 32;
}

server {
    listen 80;
    listen 443 ssl http2;
    server_name api.netpay.id;
    
    ssl_certificate /etc/letsencrypt/live/api.netpay.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.netpay.id/privkey.pem;
    
    # Request timeout (important for settlement operations)
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    
    # Preserve client IP
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host $host;
    
    location / {
        proxy_pass http://x402_backend;
        
        # WebSocket support (if needed)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://x402_backend/health;
        access_log off;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/x402-loadbalancer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### Option B: HAProxy Load Balancer

Install HAProxy:
```bash
sudo apt install haproxy -y
```

Configure `/etc/haproxy/haproxy.cfg`:

```haproxy
global
    log /dev/log local0
    log /dev/log local1 notice
    maxconn 4096
    user haproxy
    group haproxy
    daemon

defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    timeout connect 10s
    timeout client  60s
    timeout server  60s
    errorfile 400 /etc/haproxy/errors/400.http
    errorfile 403 /etc/haproxy/errors/403.http
    errorfile 408 /etc/haproxy/errors/408.http
    errorfile 500 /etc/haproxy/errors/500.http
    errorfile 502 /etc/haproxy/errors/502.http
    errorfile 503 /etc/haproxy/errors/503.http
    errorfile 504 /etc/haproxy/errors/504.http

frontend x402_frontend
    bind *:80
    bind *:443 ssl crt /etc/ssl/certs/api.netpay.id.pem
    mode http
    default_backend x402_backend

backend x402_backend
    mode http
    balance leastconn
    option httpchk GET /health
    
    server instance1 127.0.0.1:8081 check inter 5s rise 2 fall 3
    server instance2 127.0.0.1:8082 check inter 5s rise 2 fall 3
    server instance3 127.0.0.1:8083 check inter 5s rise 2 fall 3
```

Start HAProxy:
```bash
sudo systemctl restart haproxy
sudo systemctl enable haproxy
```

---

## Important Considerations

### ⚠️ Shared State Management

**Critical:** All instances share:
1. **MySQL Database** - Transaction records, merchant data
2. **Redis Cache** - Nonce cache, rate limiting
3. **RPC Providers** - WebSocket connections

**What's NOT shared (per instance):**
- WebSocket provider pool (each instance maintains its own 4 connections)
- Paymaster wallet pool (each instance has all 16 wallets)
- Transaction monitor (each instance monitors independently)

### 🔄 Transaction Monitor Coordination

**Problem:** Multiple instances will check the same pending transactions.

**Solution 1: Database-level locking (Current)**
```sql
-- Each instance tries to update, only one succeeds
UPDATE transactions SET status = 'processing' 
WHERE id = ? AND status = 'pending';
```

**Solution 2: Redis distributed lock**
```typescript
// Acquire lock before processing
const lock = await redis.set(`tx:lock:${txId}`, instanceId, 'NX', 'EX', 30);
if (lock) {
  // Process transaction
  await checkTransaction(tx);
  await redis.del(`tx:lock:${txId}`);
}
```

### 💰 Paymaster Wallet Management

**Current:** Each instance has access to all 16 wallets (round-robin).

**Potential issue:** Multiple instances might use same wallet simultaneously.

**Solution:** Transaction queue prevents nonce conflicts:
```typescript
// Already implemented in transactionQueue.ts
await transactionQueue.execute(walletAddress, async () => {
  // Submit transaction
});
```

This ensures sequential transactions per wallet across all instances.

---

## Monitoring & Debugging

### Check Instance Status

```bash
# View all instances
pm2 list

# View logs for specific instance
pm2 logs x402-instance-1
pm2 logs x402-instance-2
pm2 logs x402-instance-3

# Monitor resources
pm2 monit
```

### Load Balancer Health Checks

```bash
# Nginx status
curl http://localhost/health

# HAProxy stats (if configured)
curl http://localhost:8404/stats
```

### Database Connection Monitoring

```sql
-- Check active connections per instance
SHOW PROCESSLIST;

-- Check connection count
SHOW STATUS LIKE 'Threads_connected';
SHOW STATUS LIKE 'Max_used_connections';

-- Current config
SHOW VARIABLES LIKE 'max_connections';
```

**Recommendation:** Set MySQL `max_connections`:
```sql
SET GLOBAL max_connections = 600;
-- 3 instances × 200 connections/instance = 600 total
```

---

## Performance Optimization

### 1. Database Connection Distribution

With 3 instances and 200 connections each:
- **Total connections needed:** 600
- **MySQL default max:** 151 ⚠️ **NOT ENOUGH**
- **Recommended:** 600-800

Update MySQL config `/etc/mysql/mysql.conf.d/mysqld.cnf`:
```ini
[mysqld]
max_connections = 800
```

### 2. Redis Connection Pooling

Each instance creates 1 Redis connection (lightweight).
- **Total connections:** 3 instances × 1 = 3
- **Redis default max:** 10,000 ✅ No issues

### 3. RPC Provider Limits

Each instance maintains 4 WebSocket connections:
- **Total RPC connections:** 3 instances × 4 networks = 12 WebSockets

**Alchemy limits:**
- Free tier: 100 req/sec (shared across all connections) ⚠️
- Growth tier: 1000 req/sec ✅
- Enterprise: Unlimited ✅

**Recommendation:** Upgrade to Growth tier ($49/month) for production.

---

## Cost-Benefit Analysis

### Single Instance (Current)
- **Capacity:** ~100 settlements/minute
- **Server cost:** $20-40/month (8GB VPS)
- **Total cost:** $20-40/month

### 3 Instances on Same Server
- **Capacity:** ~300 settlements/minute
- **Server cost:** $80-120/month (16GB+ VPS)
- **Total cost:** $80-120/month

### 3 Distributed Servers + RDS + Redis
- **Capacity:** ~300+ settlements/minute (fault-tolerant)
- **Server cost:** 3 × $40 = $120/month
- **RDS MySQL:** $50-100/month
- **ElastiCache Redis:** $50/month
- **Load balancer:** $20/month
- **Total cost:** $240-290/month

---

## Quick Start: Single Server, 3 Instances

```bash
# 1. Create environment files
cd /srv/x402/x402-facilitator
cp .env .env.instance1
cp .env .env.instance2
cp .env .env.instance3

sed -i 's/PORT=80/PORT=8081/' .env.instance1
sed -i 's/PORT=80/PORT=8082/' .env.instance2
sed -i 's/PORT=80/PORT=8083/' .env.instance3

# 2. Update MySQL max connections
sudo mysql -u root -p
SET GLOBAL max_connections = 800;
EXIT;

# 3. Stop current instance
pm2 stop x402-facilitator

# 4. Create new PM2 config (use ecosystem.config.js above)

# 5. Start all instances
pm2 start ecosystem.config.js
pm2 save

# 6. Configure Nginx load balancer (see above)
# Then restart Nginx

# 7. Test
curl https://api.netpay.id/health
```

---

## Rollback Plan

If issues occur:

```bash
# Stop all instances
pm2 stop all

# Restart single instance
pm2 start x402-facilitator

# Remove load balancer config
sudo rm /etc/nginx/sites-enabled/x402-loadbalancer
sudo systemctl restart nginx
```

---

## Summary

✅ **When to use horizontal scaling:**
- Handling >100 settlements/minute
- Need redundancy/fault tolerance
- Want zero-downtime deployments

⚠️ **Considerations:**
- Shared database must handle increased connections
- Redis required for proper coordination
- Load balancer adds complexity
- Monitor resource usage carefully

📊 **Expected Performance:**
- 3 instances: 3x throughput (300+ settlements/min)
- Better fault tolerance
- Slightly higher latency (+10-20ms due to load balancer)
