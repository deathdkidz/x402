# Rate Limiting Configuration - x402 Facilitator

## Current Setup Summary

Your system has **multi-layer rate limiting**:

### Layer 1: Nginx (DDoS Protection)
**Purpose**: Block obvious attacks before they reach your application

**Updated Configuration**:
```nginx
# DDoS protection only
limit_req_zone $binary_remote_addr zone=ddos_protection:10m rate=1000r/s;
limit_conn_zone $binary_remote_addr zone=addr:10m;

# Applied to endpoints:
limit_req zone=ddos_protection burst=100 nodelay;  # 1000 req/s with 100 burst
limit_conn addr 100;                                # 100 concurrent connections
```

**What this means**:
- ⚡ **1,000 requests per second** per IP (DDoS protection only)
- 🎯 **100 burst capacity** for traffic spikes
- 🔌 **100 max concurrent connections** per IP
- ✅ **Health endpoint exempt** from rate limiting

### Layer 2: Application Global Limits
**Purpose**: General API protection

**Configuration** (from `.env`):
```env
# General endpoints
RATE_LIMIT_WINDOW_MS=5000              # 5 second window
RATE_LIMIT_MAX_REQUESTS=50             # 50 requests per 5 seconds
# = 10 requests/second = 600 requests/minute

# Verify endpoint (stricter)
VERIFY_RATE_LIMIT_WINDOW_MS=5000       # 5 second window
VERIFY_RATE_LIMIT_MAX=30               # 30 requests per 5 seconds
# = 6 requests/second = 360 requests/minute

# Settle endpoint (strictest)
SETTLE_RATE_LIMIT_WINDOW_MS=5000       # 5 second window
SETTLE_RATE_LIMIT_MAX=10               # 10 requests per 5 seconds
# = 2 requests/second = 120 requests/minute
```

### Layer 3: Per-Merchant Limits (Redis-backed)
**Purpose**: Tiered access control for merchants

**Default Tiers**:

#### 🆓 Free Tier
```typescript
verifyLimit: 60   // 60 verify requests per minute
settleLimit: 20   // 20 settle requests per minute
window: 60        // 60 second window
```

#### 💎 Pro Tier
```typescript
verifyLimit: 300   // 300 verify requests per minute
settleLimit: 100   // 100 settle requests per minute
window: 60         // 60 second window
```

#### 🏢 Enterprise Tier
```typescript
verifyLimit: 1000   // 1000 verify requests per minute
settleLimit: 500    // 500 settle requests per minute
window: 60          // 60 second window
```

## Rate Limiting Flow

```
Request from IP: 180.252.54.40
    ↓
┌─────────────────────────────────────┐
│ Nginx: DDoS Check                   │
│ - Is IP making >1000 req/s?         │
│ - Has >100 concurrent connections?  │
│ ❌ If yes → 503 (blocked by Nginx)  │
│ ✅ If no → Forward to app           │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ App: Global Rate Limit              │
│ - Check IP rate (50 req/5s)         │
│ - Check endpoint-specific limits    │
│ ❌ If exceeded → 429 (Too Many)     │
│ ✅ If ok → Continue                 │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ App: API Key Authentication         │
│ - Valid API key?                    │
│ - Get merchant from database        │
│ ❌ If invalid → 401 (Unauthorized)  │
│ ✅ If valid → Continue              │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ App: Merchant Rate Limit (Redis)    │
│ - Check merchant tier               │
│ - Check merchant's request count    │
│ ❌ If exceeded → 429 with tier info │
│ ✅ If ok → Process request          │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ App: Process Request                │
│ - Verify payment / Settle payment   │
│ - Return response                   │
└─────────────────────────────────────┘
```

## Response Headers

Clients receive these rate limit headers:

### For General Limits (Express-rate-limit)
```http
RateLimit-Limit: 50
RateLimit-Remaining: 47
RateLimit-Reset: 1734096845
```

### For Merchant-Specific Limits
```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1734096860123
X-RateLimit-Tier: free
```

## Why This Setup?

### ✅ Advantages
1. **DDoS Protection**: Nginx blocks attacks before consuming app resources
2. **Flexible Merchant Limits**: Each merchant has custom limits based on tier
3. **Granular Control**: Different limits for verify vs settle
4. **Cached Limits**: Redis caches merchant limits (1 hour) for performance
5. **Fail Open**: If Redis fails, requests still go through
6. **Health Monitoring**: `/health` endpoint exempt from limits

### 🎯 Performance Impact
- **Nginx layer**: ~0.1ms overhead (minimal)
- **App layer**: ~1-2ms overhead (Redis lookup cached)
- **Total overhead**: ~1-3ms per request

## Configuration Files

### Nginx Config
```bash
/etc/nginx/sites-available/x402-facilitator
```

### Application Config
```bash
/srv/x402/x402-facilitator/.env
/srv/x402/x402-facilitator/src/middleware/rateLimit.ts
```

### Database Schema
```sql
-- Merchants table includes rate limit configuration
CREATE TABLE merchants (
    auth_address VARCHAR(42) PRIMARY KEY,
    tier ENUM('free', 'pro', 'enterprise') DEFAULT 'free',
    verify_limit_per_minute INT DEFAULT 60,
    settle_limit_per_minute INT DEFAULT 20,
    ...
);
```

## Adjusting Rate Limits

### For All Merchants (Global)
Edit `.env`:
```bash
nano /srv/x402/x402-facilitator/.env

# Update values:
RATE_LIMIT_MAX_REQUESTS=100        # Increase general limit
VERIFY_RATE_LIMIT_MAX=60           # Increase verify limit
SETTLE_RATE_LIMIT_MAX=20           # Increase settle limit

# Restart
pm2 restart x402-facilitator
```

### For Specific Merchant
Update database:
```sql
-- Increase limits for specific merchant
UPDATE merchants 
SET verify_limit_per_minute = 500,
    settle_limit_per_minute = 200,
    tier = 'pro'
WHERE auth_address = '0x123...';

-- Clear Redis cache (or wait 1 hour)
-- Redis key: ratelimit:limits:{merchant_address}
```

### For Nginx (DDoS Protection)
Edit Nginx config:
```bash
sudo nano /etc/nginx/sites-available/x402-facilitator

# Change:
limit_req_zone ... rate=2000r/s;  # Increase to 2000 req/s

# Reload:
sudo nginx -t && sudo systemctl reload nginx
```

## Monitoring Rate Limits

### View Current Merchant Limits
```bash
# Connect to MySQL
mysql -u root -p x402_facilitator

# Check merchant tiers
SELECT auth_address, tier, verify_limit_per_minute, settle_limit_per_minute 
FROM merchants;
```

### Check Redis Rate Limit Keys
```bash
# Connect to Redis
redis-cli

# View all rate limit keys
KEYS ratelimit:*

# Check specific merchant
GET ratelimit:limits:0x123...
TTL ratelimit:merchant:0x123.../verify
```

### View Nginx Access Log (Rate Limited Requests)
```bash
# See rejected requests (429 status)
grep " 429 " /var/log/nginx/x402-facilitator.access.log | tail -20

# See rate limit warnings
grep "limiting requests" /var/log/nginx/x402-facilitator.error.log
```

### View Application Logs
```bash
# PM2 logs
pm2 logs x402-facilitator | grep "rate limit"

# Or directly
tail -f /srv/x402/x402-facilitator/logs/pm2-out.log | grep "rate"
```

## Testing Rate Limits

### Test DDoS Protection (Nginx)
```bash
# Send rapid requests (should be blocked at 1000 req/s)
ab -n 10000 -c 100 https://api.netpay.id/health
```

### Test Application Limits
```bash
# Test general endpoint (50 req/5s)
for i in {1..60}; do curl -s https://api.netpay.id/ > /dev/null & done

# Test verify endpoint (requires API key)
for i in {1..40}; do 
    curl -X POST https://api.netpay.id/verify \
         -H "x-api-key: YOUR_KEY" \
         -H "Content-Type: application/json" \
         -d '{}' & 
done
```

### Test Merchant Limits
```bash
# Send requests with merchant API key
# Free tier should limit at 60 verify/minute
for i in {1..70}; do
    curl -X POST https://api.netpay.id/verify \
         -H "x-api-key: sk_test_..." \
         -d '{"x402Version":1,...}' &
done
```

## Troubleshooting

### Rate limit not working
```bash
# Check Nginx config
sudo nginx -t

# Check if Redis is running
redis-cli ping

# Check PM2 logs
pm2 logs x402-facilitator

# Verify middleware is loaded
curl -I https://api.netpay.id/
# Look for RateLimit-* headers
```

### Too aggressive rate limiting
```bash
# Increase limits in .env
nano /srv/x402/x402-facilitator/.env

# Or update merchant tier
mysql -u root -p -e "UPDATE x402_facilitator.merchants SET tier='pro' WHERE auth_address='0x...';"

# Restart
pm2 restart x402-facilitator
```

### Rate limit bypass
```bash
# Check if IP is whitelisted
# Add to Nginx if needed:
geo $limit {
    default 1;
    10.0.0.0/8 0;     # Internal network
    1.2.3.4 0;        # Trusted IP
}

map $limit $limit_key {
    0 "";
    1 $binary_remote_addr;
}

limit_req_zone $limit_key zone=...
```

## Recommended Settings

### For Production (High Traffic)
```env
# General
RATE_LIMIT_MAX_REQUESTS=100        # 100 req/5s = 1200/min

# Verify (critical endpoint)
VERIFY_RATE_LIMIT_MAX=50           # 50 req/5s = 600/min

# Settle (very critical)
SETTLE_RATE_LIMIT_MAX=20           # 20 req/5s = 240/min
```

### For Development
```env
# General
RATE_LIMIT_MAX_REQUESTS=1000       # Very high for testing

# Verify
VERIFY_RATE_LIMIT_MAX=500

# Settle
SETTLE_RATE_LIMIT_MAX=100
```

## Summary

✅ **Your configuration is now optimized**:
- Nginx: DDoS protection (1000 req/s)
- App: Business logic rate limits
- Merchant: Tiered custom limits

This provides excellent protection while maintaining flexibility for legitimate users.
