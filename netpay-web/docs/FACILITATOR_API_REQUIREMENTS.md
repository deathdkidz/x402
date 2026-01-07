# Facilitator API Endpoints for NetPay Dashboard

## Overview

The NetPay web dashboard uses the x402-facilitator-rs API for merchant authentication, session management, and dashboard data retrieval.

All endpoints should:
- Return JSON responses with `{ success: true, data: ... }` or `{ success: false, error: "..." }` format
- Use proper authentication headers

---

## Base URL

```
Production: https://api.netpay.id
Development: http://localhost:8080
```

---

## 1. Public Endpoints

### GET `/`

Returns service information and available endpoints.

**Response:**
```json
{
  "name": "x402 Facilitator",
  "description": "Payment facilitator service for x402 protocol",
  "endpoints": {
    "health": "GET /health",
    "supported": "GET /supported",
    "verify": "POST /verify",
    "settle": "POST /settle"
  },
  "mainnetNetworks": ["base", "ethereum", "optimism"],
  "testnetNetworks": ["base-sepolia", "sepolia"]
}
```

---

### GET `/health`

Health check endpoint for load balancers and monitoring.

**Response:**
```json
{
  "status": "ok",
  "service": "x402-facilitator",
  "timestamp": 1767355984545,
  "uptime": 672595.523348902
}
```

---

### GET `/supported`

Returns list of supported networks and their token configurations.

**Response:**
```json
{
  "success": true,
  "mainnet": [
    {
      "network": "base",
      "chainId": 8453,
      "tokens": [
        {
          "symbol": "USDC",
          "name": "USD Coin",
          "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          "decimals": 6,
          "eip712": {
            "name": "USD Coin",
            "version": "2",
            "verifyingContract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
          }
        }
      ]
    }
  ],
  "testnet": [
    {
      "network": "base-sepolia",
      "chainId": 84532,
      "tokens": [
        {
          "symbol": "USDC",
          "name": "USD Coin",
          "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          "decimals": 6,
          "eip712": {
            "name": "USD Coin",
            "version": "2",
            "verifyingContract": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
          }
        }
      ]
    }
  ]
}
```

---

### GET `/metrics`

Prometheus-compatible metrics endpoint.

**Response:** `text/plain; version=0.0.4; charset=utf-8`

---

## 2. Payment Endpoints

### POST `/verify`

Verify a payment authorization without executing it.

**Headers:**
| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Content-Type` | string | Yes | Must be `application/json` |
| `Authorization` | string | Yes | Merchant API key: `Bearer <api_key>` |

**Request Body:**
```json
{
  "x402Version": 1,
  "paymentPayload": {
    "authorization": {
      "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
      "to": "0x8ba1f109551bD432803012645Ac136ddd64DBa72",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1735776000",
      "nonce": "0x0000000000000000000000000000000000000000000000000000000000000001"
    },
    "signature": "0x..."
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0x8ba1f109551bD432803012645Ac136ddd64DBa72",
    "maxAmountRequired": "1000000",
    "resource": "https://api.example.com/premium/data",
    "description": "Premium API access",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 60
  }
}
```

**Success Response:**
```json
{
  "isValid": true,
  "is_valid": true,
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21"
}
```

**Invalid Response:**
```json
{
  "isValid": false,
  "is_valid": false,
  "invalidReason": "Insufficient balance: has 500000, needs 1000000",
  "invalid_reason": "Insufficient balance: has 500000, needs 1000000"
}
```

---

### POST `/settle`

Execute a payment settlement on the blockchain.

**Headers:**
| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Content-Type` | string | Yes | Must be `application/json` |
| `Authorization` | string | Yes | Merchant API key: `Bearer <api_key>` |

**Request Body:** Same structure as `/verify`

**Success Response:**
```json
{
  "success": true,
  "transaction": "0xabcdef1234567890...",
  "transactionHash": "0xabcdef1234567890...",
  "transactionStatus": "completed",
  "network": "base",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
  "status": "completed"
}
```

**Preconfirmed Response (Flashblock Networks):**
```json
{
  "success": true,
  "transaction": "0xabcdef1234567890...",
  "transactionHash": "0xabcdef1234567890...",
  "transactionStatus": "preconfirmed",
  "network": "base",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
  "status": "preconfirmed",
  "message": "Transaction preconfirmed via flashblock"
}
```

**Failure Response:**
```json
{
  "success": false,
  "network": "base",
  "errorReason": "Insufficient credits",
  "status": "failed"
}
```

**Settlement Statuses:**
| Status | Description |
|--------|-------------|
| `pending` | Transaction submitted, awaiting confirmation |
| `preconfirmed` | Transaction preconfirmed via flashblock (fast) |
| `completed` | Transaction confirmed on-chain |
| `failed` | Transaction failed |

---

## 3. Merchant Authentication Endpoints

### GET `/merchant/siwe/nonce`

Generate a SIWE (Sign-In with Ethereum) nonce for authentication.

**Response:**
```json
{
  "success": true,
  "data": {
    "nonce": "a1b2c3d4e5f6789012345678901234567890123456789012345678901234"
  }
}
```

---

### POST `/merchant/siwe/verify`

Verify SIWE message and authenticate merchant.

**Request Body:**
```json
{
  "message": "example.com wants you to sign in with your Ethereum account:\n0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21\n\nSign in to x402 Facilitator\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: a1b2c3d4e5f6...\nIssued At: 2026-01-02T12:00:00.000Z",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "merchant": {
      "id": 1,
      "authAddress": "0x742d35cc6634c0532925a3b844bc9e7595f1de21",
      "businessName": "Merchant 0x742d35",
      "apiKey": "pk_live_abc123...",
      "creditBalance": 100,
      "mainnetCreditBalance": 100,
      "testnetCreditsRemaining": 1000,
      "testnetCreditsUsed": 0,
      "status": "active",
      "createdAt": "2026-01-02T12:00:00Z"
    },
    "sessionToken": "uuid-session-token-here",
    "isNewUser": false,
    "isAdmin": true,
    "adminRole": "superadmin"
  }
}
```

---

### POST `/merchant/session`

Validate an existing session token.

**Request Body:**
```json
{
  "sessionToken": "uuid-session-token"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "merchant": {
      "id": 1,
      "authAddress": "0x742d35cc6634c0532925a3b844bc9e7595f1de21",
      "businessName": "My Business",
      "apiKey": "pk_live_abc123...",
      "creditBalance": 100,
      "mainnetCreditBalance": 100,
      "testnetCreditsRemaining": 1000,
      "testnetCreditsUsed": 0,
      "status": "active",
      "createdAt": "2026-01-02T12:00:00Z"
    }
  }
}
```

---

### POST `/merchant/logout`

Logout and invalidate session.

**Request Body:**
```json
{
  "sessionToken": "uuid-session-token"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true
  }
}
```

---

## 4. Dashboard Data Endpoints

All merchant endpoints require authentication via:
- `X-Session-Token` header with a valid session token from SIWE authentication
- `X-Internal-Secret` header for internal service calls

### GET `/merchant/:merchant_id/dashboard/stats`

Get dashboard overview statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "creditBalance": 100,
    "mainnetCreditBalance": 100,
    "testnetCreditsRemaining": 1000,
    "testnetCreditsUsed": 50,
    "testnetCreditsAllocated": 1000,
    "currentPeriod": "2026-01",
    "totalTransactions": 150,
    "totalVolume": 5000.50,
    "successRate": 98.5,
    "recentTransactions": [
      {
        "id": 123,
        "payerAddress": "0x...",
        "recipientAddress": "0x...",
        "amount": 10.5,
        "asset": "USDC",
        "network": "base",
        "status": "completed",
        "txHash": "0x...",
        "resource": "https://api.example.com/data",
        "creditCost": 1,
        "errorMessage": null,
        "createdAt": "2026-01-02T12:00:00Z",
        "updatedAt": "2026-01-02T12:00:05Z"
      }
    ],
    "volumeByDay": [
      {"date": "2026-01-01", "volume": 1000.0},
      {"date": "2026-01-02", "volume": 1500.0}
    ]
  }
}
```

---

### GET `/merchant/:merchant_id/transactions`

Get paginated transaction list.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (min: 1) |
| `limit` | integer | 20 | Items per page (max: 100) |
| `status` | string | - | Filter: `pending`, `completed`, `failed` |
| `network` | string | - | Filter by network |
| `search` | string | - | Search by payer address or tx hash |

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": 123,
        "payerAddress": "0x...",
        "recipientAddress": "0x...",
        "amount": 10.5,
        "asset": "USDC",
        "network": "base",
        "status": "completed",
        "txHash": "0x...",
        "resource": "https://api.example.com/data",
        "creditCost": 1,
        "errorMessage": null,
        "createdAt": "2026-01-02T12:00:00Z",
        "updatedAt": "2026-01-02T12:00:05Z"
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

### GET `/merchant/:merchant_id/credits`

Get merchant credit balance and history.

**Response:**
```json
{
  "success": true,
  "data": {
    "balance": 100,
    "mainnetBalance": 100,
    "testnetRemaining": 1000,
    "testnetUsed": 50,
    "testnetAllocated": 1000,
    "currentPeriod": "2026-01",
    "lifetimePurchased": 500,
    "lifetimeUsed": 400,
    "usedLast30Days": 50,
    "transactions": [
      {
        "id": 1,
        "type": "debit",
        "amount": 1.0,
        "balanceBefore": 101.0,
        "balanceAfter": 100.0,
        "description": "Settlement on base",
        "createdAt": "2026-01-02T12:00:00Z"
      }
    ],
    "purchases": [
      {
        "id": 1,
        "network": "base",
        "txHash": "0x...",
        "tokenAmount": 100.0,
        "creditAmount": 100,
        "status": "completed",
        "createdAt": "2026-01-01T10:00:00Z"
      }
    ]
  }
}
```

---

### GET `/merchant/:merchant_id/credits/packages`

Get available credit top-up packages.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Starter",
      "description": "Get started with x402",
      "creditAmount": 100,
      "priceUsdc": 10.0,
      "bonusCredits": 0,
      "totalCredits": 100,
      "isPopular": false
    },
    {
      "id": 2,
      "name": "Growth",
      "description": "Best for growing businesses",
      "creditAmount": 500,
      "priceUsdc": 45.0,
      "bonusCredits": 50,
      "totalCredits": 550,
      "isPopular": true
    }
  ]
}
```

---

### POST `/merchant/:merchant_id/credits/topup`

Create a credit top-up order.

**Request Body:**
```json
{
  "packageId": 1,
  "network": "base"
}
```

Or for custom amount:
```json
{
  "creditAmount": 200,
  "network": "base"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "uuid-order-id",
    "merchantId": 1,
    "creditAmount": 100,
    "bonusCredits": 0,
    "totalCredits": 100,
    "priceUsdc": 10.0,
    "network": "base",
    "status": "pending",
    "paymentAddress": "0x...",
    "expiresAt": "2026-01-02T13:00:00Z",
    "createdAt": "2026-01-02T12:00:00Z"
  }
}
```

---

### GET `/merchant/:merchant_id/analytics`

Get merchant analytics data.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | `"30d"` | Time period: `"7d"`, `"30d"`, `"90d"`, `"all"` |

**Response:**
```json
{
  "success": true,
  "data": {
    "totalVolume": 50000.0,
    "totalCount": 1500,
    "avgTransaction": 33.33,
    "successRate": 98.5,
    "volumeByNetwork": [
      {"name": "base", "value": 40000.0, "percentage": 80.0},
      {"name": "ethereum", "value": 10000.0, "percentage": 20.0}
    ],
    "volumeByAsset": [
      {"name": "USDC", "value": 50000.0, "percentage": 100.0}
    ],
    "dailyVolume": [
      {"date": "2026-01-01", "volume": 1000.0, "count": 50, "successRate": 98.0},
      {"date": "2026-01-02", "volume": 1500.0, "count": 75, "successRate": 99.0}
    ],
    "hourlyDistribution": [
      {"hour": 0, "count": 10},
      {"hour": 1, "count": 5}
    ]
  }
}
```

---

### GET `/merchant/:merchant_id/settings`

Get merchant settings.

**Response:**
```json
{
  "success": true,
  "data": {
    "merchant": {
      "id": 1,
      "businessName": "My Business",
      "businessEmail": "contact@mybusiness.com",
      "website": "https://mybusiness.com",
      "walletAddress": "0x...",
      "supportEmail": "support@mybusiness.com",
      "description": "We provide premium APIs",
      "apiKey": "pk_live_abc123...",
      "createdAt": "2026-01-01T00:00:00Z"
    },
    "notifications": {
      "emailSettlements": true,
      "emailFailures": true,
      "emailCredits": true,
      "emailWeekly": false,
      "emailMarketing": false
    }
  }
}
```

---

### PUT `/merchant/:merchant_id/settings`

Update merchant settings.

**Request Body:**
```json
{
  "merchant": {
    "businessName": "Updated Business Name",
    "businessEmail": "new@mybusiness.com",
    "website": "https://mybusiness.com",
    "supportEmail": "support@mybusiness.com",
    "description": "Updated description"
  },
  "notifications": {
    "emailSettlements": true,
    "emailFailures": true,
    "emailCredits": false,
    "emailWeekly": true,
    "emailMarketing": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Settings updated successfully"
  }
}
```

---

## 5. Network Identifiers

| Network | Identifier | Chain ID | Type |
|---------|------------|----------|------|
| Base | `base` | 8453 | Mainnet |
| Ethereum | `ethereum` | 1 | Mainnet |
| Optimism | `optimism` | 10 | Mainnet |
| Base Sepolia | `base-sepolia` | 84532 | Testnet |
| Sepolia | `sepolia` | 11155111 | Testnet |

---

## 6. Token Amounts

All token amounts are specified in the token's smallest unit:

| Token | Decimals | 1 Token | Example |
|-------|----------|---------|---------|
| USDC | 6 | `1000000` | `"1000000"` = 1 USDC |

---

## 7. Error Handling

### HTTP Status Codes

| Status | Meaning |
|--------|---------|
| 200 | Request processed (check response body for result) |
| 400 | Invalid request body or validation error |
| 401 | Unauthorized - missing or invalid authentication |
| 403 | Forbidden - authenticated but not authorized |
| 500 | Internal server error |

### Error Response Format

```json
{
  "success": false,
  "error": "Error message here"
}
```

### Common Errors

| Error | Description |
|-------|-------------|
| `Unauthorized: Missing authentication` | No auth header provided |
| `Unauthorized: Invalid or expired session` | Session token invalid |
| `Forbidden: Access denied` | Not authorized for this resource |
| `Invalid request body` | Malformed JSON |
| `Validation error: scheme must be "exact"` | Invalid scheme value |
| `Insufficient credits` | Merchant has no credits |
| `Unsupported network` | Network not configured |

---

## 8. Rate Limiting

Rate limits are applied per API key/session:

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /verify | 100 | per minute |
| POST /settle | 50 | per minute |
| GET endpoints | 1000 | per minute |

Rate limit headers in response:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1735776060
```

---

## 9. Testing Examples

### cURL Examples

```bash
# Health check
curl https://api.netpay.id/health

# Get supported networks
curl https://api.netpay.id/supported

# Get SIWE nonce
curl https://api.netpay.id/merchant/siwe/nonce

# Verify SIWE
curl -X POST https://api.netpay.id/merchant/siwe/verify \
  -H "Content-Type: application/json" \
  -d '{"message": "...", "signature": "0x..."}'

# Get dashboard stats (with session)
curl https://api.netpay.id/merchant/1/dashboard/stats \
  -H "X-Session-Token: uuid-session-token"

# Verify payment
curl -X POST https://api.netpay.id/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_live_abc123..." \
  -d '{
    "x402Version": 1,
    "paymentPayload": {...},
    "paymentRequirements": {...}
  }'

# Settle payment
curl -X POST https://api.netpay.id/settle \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_live_abc123..." \
  -d '{
    "x402Version": 1,
    "paymentPayload": {...},
    "paymentRequirements": {...}
  }'
```
