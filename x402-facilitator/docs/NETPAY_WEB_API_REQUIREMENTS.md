# NetPay Web API Requirements for Facilitator

This document outlines the necessary changes and implementations required on the facilitator side to support the NetPay Web dashboard.

## Table of Contents

1. [API Authentication](#api-authentication)
2. [Required API Endpoints](#required-api-endpoints)
3. [Database Schema Changes](#database-schema-changes)
4. [Security Requirements](#security-requirements)
5. [Performance Optimizations](#performance-optimizations)
6. [Response Formats](#response-formats)

---

## API Authentication

### Internal API Key Authentication

All requests from NetPay Web will include an API key in the header:

```
X-API-Key: <FACILITATOR_API_KEY>
```

**Implementation:**
```typescript
// Middleware to validate internal API key
function validateInternalApiKey(req: Request): boolean {
  const apiKey = req.headers.get('X-API-Key');
  return apiKey === process.env.INTERNAL_API_KEY;
}
```

**Security Notes:**
- API key should be at least 64 characters, randomly generated
- Store in environment variable, never in code
- Rotate periodically (every 90 days recommended)
- Rate limit by API key to prevent abuse

---

## Required API Endpoints

### 1. Wallet Authentication

**POST** `/api/auth/wallet`

Authenticates a merchant by wallet signature. Auto-registers new merchants.

**Request Body:**
```json
{
  "address": "0x1234...abcd",      // Required: Ethereum address (checksummed)
  "signature": "0xabc123...",      // Required: Signed message signature
  "message": "Sign in to NetPay...", // Required: The message that was signed
  "timestamp": 1703318400000       // Required: Unix timestamp (ms) when message was created
}
```

**Validation Rules:**
- `address`: Must be valid Ethereum address format (`/^0x[a-fA-F0-9]{40}$/`)
- `signature`: Must be valid signature format (`/^0x[a-fA-F0-9]{130}$/`)
- `message`: Must contain the address and timestamp
- `timestamp`: Must be within 5 minutes of server time

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "merchant": {
      "id": "uuid-string",
      "address": "0x1234...abcd",
      "businessName": "My Business",
      "createdAt": "2024-01-01T00:00:00Z"
    },
    "sessionToken": "jwt-or-random-token",
    "expiresAt": "2024-02-01T00:00:00Z"
  }
}
```

**Response (Error - 401):**
```json
{
  "success": false,
  "error": "Invalid signature"
}
```

---

### 2. Session Validation

**GET** `/api/auth/session`

Validates a session token and returns merchant data.

**Headers:**
```
Authorization: Bearer <session_token>
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-string",
    "address": "0x1234...abcd",
    "businessName": "My Business",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

**Response (Invalid/Expired - 401):**
```json
{
  "success": false,
  "error": "Session expired"
}
```

---

### 3. Dashboard Statistics

**GET** `/api/merchants/:merchantId/stats`

Returns aggregated statistics for the merchant dashboard.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | `30d` | Time period: `7d`, `30d`, `90d`, `1y` |

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "totalRevenue": "12345.67",
    "totalTransactions": 1234,
    "successRate": 98.5,
    "activeResources": 12,
    "revenueChange": 15.2,
    "transactionsChange": 8.5,
    "avgTransactionValue": "10.00",
    "periodStart": "2024-01-01T00:00:00Z",
    "periodEnd": "2024-01-31T23:59:59Z"
  }
}
```

---

### 4. Transaction List

**GET** `/api/merchants/:merchantId/transactions`

Returns paginated list of merchant transactions.

**Query Parameters:**
| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | int | 1 | 1000 | Page number |
| `limit` | int | 20 | 100 | Items per page |
| `status` | string | - | - | Filter: `pending`, `completed`, `failed` |
| `network` | string | - | - | Filter: `base`, `baseSepolia`, `arbitrum`, `optimism` |
| `search` | string | - | 200 chars | Search by txHash, payer address |
| `startDate` | string | - | - | ISO 8601 date |
| `endDate` | string | - | - | ISO 8601 date |

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "uuid-string",
        "txHash": "0xabc123...",
        "status": "completed",
        "amount": "10.00",
        "token": "USDC",
        "network": "base",
        "payerAddress": "0x5678...efgh",
        "resourcePath": "/api/premium/data",
        "createdAt": "2024-01-15T10:30:00Z",
        "completedAt": "2024-01-15T10:30:05Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

---

### 5. Credits/Balance

**GET** `/api/merchants/:merchantId/credits`

Returns merchant's credit balance and history.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | int | 10 | Recent transactions limit |

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "balance": {
      "available": "1234.56",
      "pending": "50.00",
      "total": "1284.56"
    },
    "recentCredits": [
      {
        "id": "uuid-string",
        "type": "payment",
        "amount": "10.00",
        "description": "Payment received",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "withdrawalInfo": {
      "minWithdrawal": "10.00",
      "fee": "0.50",
      "estimatedTime": "1-3 business days"
    }
  }
}
```

---

### 6. Analytics Data

**GET** `/api/merchants/:merchantId/analytics`

Returns detailed analytics for charts and reports.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | `30d` | Time period: `7d`, `30d`, `90d`, `1y` |
| `granularity` | string | `auto` | Data points: `hourly`, `daily`, `weekly` |

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "revenue": {
      "labels": ["Jan 1", "Jan 2", "Jan 3"],
      "data": [100.50, 250.75, 180.25]
    },
    "transactions": {
      "labels": ["Jan 1", "Jan 2", "Jan 3"],
      "data": [10, 25, 18]
    },
    "byNetwork": {
      "base": { "count": 100, "volume": "1000.00" },
      "arbitrum": { "count": 50, "volume": "500.00" }
    },
    "byToken": {
      "USDC": { "count": 120, "volume": "1200.00" },
      "USDT": { "count": 30, "volume": "300.00" }
    },
    "topResources": [
      { "path": "/api/premium", "count": 50, "revenue": "500.00" }
    ]
  }
}
```

---

### 7. Merchant Settings

**GET** `/api/merchants/:merchantId/settings`

Returns merchant configuration and settings.

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "businessName": "My Business",
    "webhookUrl": "https://example.com/webhook",
    "notificationEmail": "admin@example.com",
    "enabledNetworks": {
      "base": true,
      "baseSepolia": false,
      "arbitrum": true,
      "optimism": false
    },
    "apiKey": "pk_live_xxxx", // Masked except last 4 chars
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

---

**PUT** `/api/merchants/:merchantId/settings`

Updates merchant settings.

**Request Body:**
```json
{
  "businessName": "Updated Business Name",
  "webhookUrl": "https://example.com/new-webhook",
  "notificationEmail": "new@example.com",
  "enabledNetworks": {
    "base": true,
    "arbitrum": false
  }
}
```

**Validation Rules:**
- `businessName`: Max 200 characters, sanitized
- `webhookUrl`: Must be valid HTTPS URL
- `notificationEmail`: Must be valid email format
- `enabledNetworks`: Only valid network keys accepted

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "message": "Settings updated successfully"
  }
}
```

---

## Database Schema Changes

### New Tables Required

#### 1. merchants

```sql
CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address VARCHAR(42) NOT NULL UNIQUE,
  business_name VARCHAR(200),
  webhook_url VARCHAR(500),
  notification_email VARCHAR(254),
  api_key VARCHAR(64) NOT NULL UNIQUE,
  api_key_hash VARCHAR(128) NOT NULL, -- For secure lookup
  enabled_networks JSONB DEFAULT '{"base": true, "baseSepolia": true}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX idx_merchants_address (address),
  INDEX idx_merchants_api_key_hash (api_key_hash)
);
```

#### 2. merchant_sessions

```sql
CREATE TABLE merchant_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE, -- Store hash, not plain token
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address INET,
  user_agent VARCHAR(500),
  
  INDEX idx_sessions_token_hash (token_hash),
  INDEX idx_sessions_merchant_id (merchant_id),
  INDEX idx_sessions_expires_at (expires_at)
);

-- Cleanup job for expired sessions
CREATE INDEX idx_sessions_cleanup ON merchant_sessions(expires_at) 
  WHERE expires_at < NOW();
```

#### 3. merchant_credits

```sql
CREATE TABLE merchant_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  type VARCHAR(20) NOT NULL, -- 'payment', 'withdrawal', 'refund', 'fee'
  amount DECIMAL(18, 6) NOT NULL,
  balance_after DECIMAL(18, 6) NOT NULL,
  reference_id UUID, -- Link to transaction or withdrawal
  description VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX idx_credits_merchant_id (merchant_id),
  INDEX idx_credits_created_at (created_at DESC)
);
```

### Existing Table Modifications

#### transactions table

Add merchant association:

```sql
ALTER TABLE transactions 
  ADD COLUMN merchant_id UUID REFERENCES merchants(id),
  ADD INDEX idx_transactions_merchant_id (merchant_id);

-- For stats queries
CREATE INDEX idx_transactions_merchant_status_date 
  ON transactions(merchant_id, status, created_at DESC);
```

---

## Security Requirements

### 1. API Key Management

```typescript
// Generate secure API key
import { randomBytes, createHash } from 'crypto';

function generateApiKey(): { key: string; hash: string } {
  const key = `pk_live_${randomBytes(32).toString('hex')}`;
  const hash = createHash('sha256').update(key).digest('hex');
  return { key, hash };
}

// Validate API key
function validateApiKey(providedKey: string, storedHash: string): boolean {
  const providedHash = createHash('sha256').update(providedKey).digest('hex');
  return timingSafeEqual(Buffer.from(providedHash), Buffer.from(storedHash));
}
```

### 2. Session Token Security

```typescript
// Generate session token
function generateSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

// Session expiry: 30 days
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
```

### 3. Signature Verification

```typescript
import { verifyMessage } from 'ethers';

async function verifyWalletSignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    const recoveredAddress = verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

// Message format validation
function validateSignMessage(message: string, address: string, timestamp: number): boolean {
  const expectedPrefix = `Sign in to NetPay\n\nWallet: ${address}\nTimestamp: ${timestamp}`;
  if (!message.startsWith(expectedPrefix)) return false;
  
  // Check timestamp is within 5 minutes
  const now = Date.now();
  if (Math.abs(now - timestamp) > 5 * 60 * 1000) return false;
  
  return true;
}
```

### 4. Rate Limiting

```typescript
// Rate limit configuration per endpoint
const RATE_LIMITS = {
  'POST /api/auth/wallet': { windowMs: 60000, max: 5 },      // 5/min
  'GET /api/auth/session': { windowMs: 60000, max: 30 },     // 30/min
  'GET /api/merchants/:id/*': { windowMs: 60000, max: 60 },  // 60/min
  'PUT /api/merchants/:id/*': { windowMs: 60000, max: 10 },  // 10/min
};
```

### 5. Input Sanitization

All string inputs must be sanitized:

```typescript
function sanitizeInput(input: string, maxLength: number): string {
  return input
    .slice(0, maxLength)
    .replace(/[<>\"\']/g, '') // Remove potential XSS vectors
    .trim();
}

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
```

---

## Performance Optimizations

### 1. Database Connection Pooling

```typescript
// PostgreSQL with connection pool
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  
  // Pool configuration
  min: 5,                    // Minimum connections
  max: 20,                   // Maximum connections
  idleTimeoutMillis: 30000,  // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Timeout for new connections
  
  // Statement timeout
  statement_timeout: 10000,  // 10 second query timeout
});

// Health check
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});
```

### 2. Redis Caching

```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Cache strategies
const CACHE_CONFIG = {
  session: { ttl: 3600 },           // 1 hour (validate DB on miss)
  merchantStats: { ttl: 60 },       // 1 minute
  merchantSettings: { ttl: 300 },   // 5 minutes
  analytics: { ttl: 300 },          // 5 minutes
};

// Session caching
async function getCachedSession(tokenHash: string): Promise<MerchantData | null> {
  const cached = await redis.get(`session:${tokenHash}`);
  if (cached) return JSON.parse(cached);
  
  // Fetch from DB
  const session = await db.query('SELECT ... WHERE token_hash = $1', [tokenHash]);
  if (session) {
    await redis.setex(`session:${tokenHash}`, CACHE_CONFIG.session.ttl, JSON.stringify(session));
  }
  return session;
}

// Stats caching with stale-while-revalidate
async function getMerchantStats(merchantId: string): Promise<Stats> {
  const cacheKey = `stats:${merchantId}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    // Return cached, refresh in background if stale
    const data = JSON.parse(cached);
    if (data.timestamp < Date.now() - 30000) {
      refreshStatsInBackground(merchantId); // Non-blocking
    }
    return data.stats;
  }
  
  return await computeAndCacheStats(merchantId);
}
```

### 3. Query Optimization

```sql
-- Use materialized view for stats (refresh periodically)
CREATE MATERIALIZED VIEW merchant_daily_stats AS
SELECT 
  merchant_id,
  DATE(created_at) as date,
  COUNT(*) as transaction_count,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_count,
  SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
  network,
  token
FROM transactions
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY merchant_id, DATE(created_at), network, token;

CREATE UNIQUE INDEX ON merchant_daily_stats(merchant_id, date, network, token);

-- Refresh every 5 minutes
SELECT cron.schedule('refresh_merchant_stats', '*/5 * * * *', 
  'REFRESH MATERIALIZED VIEW CONCURRENTLY merchant_daily_stats');
```

### 4. Prepared Statements

```typescript
// Prepare frequently used queries
const PREPARED_QUERIES = {
  getSessionByToken: {
    name: 'get_session',
    text: `
      SELECT m.id, m.address, m.business_name, m.created_at
      FROM merchant_sessions s
      JOIN merchants m ON m.id = s.merchant_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW()
    `,
  },
  getTransactions: {
    name: 'get_transactions',
    text: `
      SELECT id, tx_hash, status, amount, token, network, payer_address, 
             resource_path, created_at, completed_at
      FROM transactions
      WHERE merchant_id = $1
        AND ($2::text IS NULL OR status = $2)
        AND ($3::text IS NULL OR network = $3)
        AND created_at > $4
      ORDER BY created_at DESC
      LIMIT $5 OFFSET $6
    `,
  },
};
```

### 5. Background Jobs

```typescript
// Use a job queue for heavy operations
import { Queue, Worker } from 'bullmq';

const analyticsQueue = new Queue('analytics', { connection: redis });

// Schedule daily analytics computation
analyticsQueue.add('compute-daily-stats', {}, {
  repeat: { cron: '0 1 * * *' }, // 1 AM daily
});

// Worker to process
new Worker('analytics', async (job) => {
  if (job.name === 'compute-daily-stats') {
    await computeAllMerchantStats();
  }
}, { connection: redis });
```

---

## Response Formats

### Standard Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Standard Error Response

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE"  // Optional, for programmatic handling
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_API_KEY` | 401 | Invalid or missing API key |
| `INVALID_SESSION` | 401 | Session expired or invalid |
| `INVALID_SIGNATURE` | 401 | Wallet signature verification failed |
| `RATE_LIMITED` | 429 | Too many requests |
| `VALIDATION_ERROR` | 400 | Invalid input parameters |
| `NOT_FOUND` | 404 | Resource not found |
| `FORBIDDEN` | 403 | Not authorized to access resource |
| `INTERNAL_ERROR` | 500 | Server error (log details, don't expose) |

### HTTP Headers

All responses should include:

```
Content-Type: application/json
X-Content-Type-Options: nosniff
X-Request-Id: <uuid>  // For debugging/tracing
X-RateLimit-Remaining: <number>
X-RateLimit-Reset: <timestamp>
```

---

## Implementation Checklist

- [ ] Create `merchants` table with proper indexes
- [ ] Create `merchant_sessions` table
- [ ] Create `merchant_credits` table
- [ ] Add `merchant_id` to transactions table
- [ ] Implement wallet authentication endpoint
- [ ] Implement session validation endpoint
- [ ] Implement stats endpoint with caching
- [ ] Implement transactions endpoint with pagination
- [ ] Implement credits endpoint
- [ ] Implement analytics endpoint
- [ ] Implement settings GET/PUT endpoints
- [ ] Set up Redis connection pool
- [ ] Configure database connection pool
- [ ] Implement rate limiting middleware
- [ ] Add request logging/tracing
- [ ] Set up session cleanup cron job
- [ ] Create materialized view for stats
- [ ] Add monitoring/alerting for API errors
- [ ] Write API tests

---

## Environment Variables Required

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=facilitator
DB_USER=facilitator
DB_PASSWORD=<secure-password>
DB_POOL_MIN=5
DB_POOL_MAX=20

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<secure-password>

# Security
INTERNAL_API_KEY=<64-char-random-string>
SESSION_SECRET=<32-char-random-string>

# Rate Limiting
RATE_LIMIT_ENABLED=true
```

---

*Last Updated: December 23, 2025*
