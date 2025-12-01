# Rate Limiting

## Overview

Per-merchant rate limiting using Redis to prevent abuse and ensure fair usage. Each merchant API key has independent, tier-based limits.

## Merchant Tiers

| Tier | Verify Limit | Settle Limit | Best For |
|------|--------------|--------------|----------|
| **Free** | 60/min | 20/min | Testing, small projects |
| **Basic** | 120/min | 40/min | Small businesses |
| **Pro** | 300/min | 100/min | Growing businesses |
| **Enterprise** | 1000/min | 500/min | High-volume merchants |
| **Custom** | Custom | Custom | Special cases |

## How It Works

### Per-Merchant Tracking
Each merchant is tracked independently by their API key:
```
Key: ratelimit:merchant:{merchant_address}:{endpoint}
Value: request_count
TTL: 60 seconds
```

### Redis-Based Counting
- Uses Redis INCR for atomic counter increments
- Automatic expiry after window duration
- Distributed rate limiting (works across multiple servers)

### Rate Limit Headers
Every response includes headers showing current usage:
```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 1733029260000
```

## Response When Limited

**Status Code:** `429 Too Many Requests`

**Response Body:**
```json
{
  "error": "Too Many Requests",
  "message": "Merchant rate limit exceeded. Max 20 requests per 60 seconds.",
  "retryAfter": 45
}
```

**Headers:**
```
Retry-After: 45
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1733029260000
```

## Database Schema

```sql
ALTER TABLE merchants
ADD COLUMN tier VARCHAR(20) DEFAULT 'free',
ADD COLUMN verify_limit INT DEFAULT 60,
ADD COLUMN settle_limit INT DEFAULT 20,
ADD COLUMN rate_limit_window INT DEFAULT 60;
```

## Migration

Run the migration:
```bash
mysql -u root -p x402_facilitator < migrations/002_add_merchant_tiers.sql
```

## Managing Merchant Tiers

### Update to Predefined Tier

```bash
# Upgrade merchant to Pro tier
npm run update:tier 0xMERCHANT_ADDRESS pro

# Available tiers: free, basic, pro, enterprise
```

### Set Custom Limits

```sql
UPDATE merchants
SET tier = 'custom',
    verify_limit = 500,
    settle_limit = 200
WHERE address = '0xMERCHANT_ADDRESS';
```

### Check Current Tier

```bash
npm run check:tier 0xMERCHANT_ADDRESS
```

Or via SQL:
```sql
SELECT address, tier, verify_limit, settle_limit, rate_limit_window
FROM merchants
WHERE address = '0xMERCHANT_ADDRESS';
```

## Testing Rate Limits

### Test Script

Create `test-rate-limit.mjs`:
```javascript
const API_URL = 'http://localhost:3000';
const API_KEY = 'your-api-key-here';

async function testRateLimit() {
  console.log('Testing /verify rate limit...');
  
  for (let i = 1; i <= 65; i++) {
    const response = await fetch(`${API_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        validatorAddress: '0x1234567890123456789012345678901234567890',
        nonce: `test-${Date.now()}-${i}`
      })
    });
    
    const headers = {
      limit: response.headers.get('X-RateLimit-Limit'),
      remaining: response.headers.get('X-RateLimit-Remaining'),
      reset: response.headers.get('X-RateLimit-Reset')
    };
    
    console.log(`Request ${i}: ${response.status} | Remaining: ${headers.remaining}/${headers.limit}`);
    
    if (response.status === 429) {
      const body = await response.json();
      console.log(`⛔ Rate limited! Retry after ${body.retryAfter}s`);
      break;
    }
  }
}

testRateLimit();
```

Run:
```bash
node test-rate-limit.mjs
```

### Expected Output

```
Request 1: 200 | Remaining: 59/60
Request 2: 200 | Remaining: 58/60
...
Request 60: 200 | Remaining: 0/60
Request 61: 429 | Remaining: 0/60
⛔ Rate limited! Retry after 45s
```

## Monitoring

### View Rate Limit Usage

```bash
# Via Redis CLI
docker exec x402-redis redis-cli

# Check active rate limit keys
KEYS ratelimit:merchant:*

# Check specific merchant's /verify count
GET ratelimit:merchant:0xMERCHANT_ADDRESS:/verify

# Check TTL (time until reset)
TTL ratelimit:merchant:0xMERCHANT_ADDRESS:/verify
```

### Logs

Facilitator logs show rate limit events:
```
🚦 Rate limit check: merchant 0x123...abc | endpoint /verify | 15/60 remaining
⛔ Rate limit exceeded: merchant 0x123...abc | endpoint /verify | reset in 45s
```

## Best Practices

### For Merchants

1. **Monitor headers**: Check `X-RateLimit-Remaining` to track usage
2. **Implement backoff**: Respect `Retry-After` header when rate limited
3. **Upgrade tier**: Contact facilitator admin if limits are too low
4. **Batch requests**: Combine multiple operations when possible

### For Facilitator Operators

1. **Set appropriate tiers**: Match merchant's expected usage
2. **Monitor Redis**: Ensure Redis is healthy for distributed limiting
3. **Adjust limits**: Update tiers based on merchant feedback
4. **Custom limits**: Use for special cases (partners, high-value merchants)

## Fallback Behavior

If Redis is unavailable:
- Falls back to global rate limits (less precise)
- Logs warning: `⚠️ Rate limiting unavailable - Redis disconnected`
- All merchants share global limits as safety measure

## Configuration

In `src/middleware/rateLimit.ts`:

```typescript
// Default limits (if tier not found)
const DEFAULT_LIMITS = {
  verify: 60,
  settle: 20,
  default: 100
};

// Window duration
const WINDOW_SECONDS = 60;
```

## Common Issues

### Rate Limit Not Working

1. **Check Redis connection**: `docker exec x402-redis redis-cli ping`
2. **Check tier configuration**: Verify merchant has correct tier in database
3. **Check logs**: Look for rate limit middleware errors

### Rate Limit Too Strict

1. **Upgrade tier**: `npm run update:tier ADDRESS pro`
2. **Set custom limits**: Update database directly for special cases
3. **Increase window**: Adjust `rate_limit_window` in database

### Rate Limit Headers Missing

- Middleware may not be applied to endpoint
- Check route configuration in `src/routes/`
