# x402 Facilitator API Reference

Complete API documentation for the x402 payment facilitator service.

## Base URL

```
http://localhost:8080
```

---

## Table of Contents

- [Public Endpoints](#public-endpoints)
  - [GET /](#get---service-info)
  - [GET /health](#get-health)
  - [GET /networks](#get-networks)
  - [GET /metrics](#get-metrics)
  - [POST /verify](#post-verify)
  - [POST /settle](#post-settle)
- [Merchant Endpoints](#merchant-endpoints)
  - [GET /merchant/siwe/nonce](#get-merchantsiwenonce)
  - [POST /merchant/siwe/verify](#post-merchantsiweverify)
  - [POST /merchant/session](#post-merchantsession)
  - [POST /merchant/logout](#post-merchantlogout)
  - [GET /merchant/:merchant_id/dashboard/stats](#get-merchantmerchant_iddashboardstats)
  - [GET /merchant/:merchant_id/transactions](#get-merchantmerchant_idtransactions)
  - [GET /merchant/:merchant_id/credits](#get-merchantmerchant_idcredits)
  - [GET /merchant/:merchant_id/credits/packages](#get-merchantmerchant_idcreditspackages)
  - [POST /merchant/:merchant_id/credits/topup](#post-merchantmerchant_idcreditstopup)
  - [GET /merchant/:merchant_id/credits/topup/:order_id](#get-merchantmerchant_idcreditstopuporder_id)
  - [GET /merchant/:merchant_id/analytics](#get-merchantmerchant_idanalytics)
  - [GET /merchant/:merchant_id/settings](#get-merchantmerchant_idsettings)
  - [PUT /merchant/:merchant_id/settings](#put-merchantmerchant_idsettings)
- [Admin Endpoints](#admin-endpoints)
- [Data Types](#data-types)
- [Error Handling](#error-handling)

---

## Public Endpoints

### GET / - Service Info

Returns service information and available endpoints.

#### Response (200 OK)

```json
{
  "name": "x402 Facilitator",
  "description": "Payment facilitator service for x402 protocol",
  "endpoints": {
    "health": "GET /health",
    "networks": "GET /networks",
    "verify": "POST /verify",
    "settle": "POST /settle"
  },
  "mainnetNetworks": ["base", "ethereum", "optimism"],
  "testnetNetworks": ["base-sepolia", "sepolia"]
}
```

---

### GET /health

Health check endpoint for load balancers and monitoring.

#### Response (200 OK)

```json
{
  "status": "ok",
  "service": "x402-facilitator",
  "timestamp": 1767355984545,
  "uptime": 672595.523348902
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Service status, always `"ok"` if responding |
| `service` | string | Service name: `"x402-facilitator"` |
| `timestamp` | integer | Current Unix timestamp in milliseconds |
| `uptime` | float | Service uptime in seconds |

---

### GET /networks

Returns list of supported networks and their token configurations.

#### Response (200 OK)

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

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` for successful response |
| `mainnet` | array | List of mainnet network configurations |
| `testnet` | array | List of testnet network configurations |

##### NetworkInfo Object

| Field | Type | Description |
|-------|------|-------------|
| `network` | string | Network identifier used in API requests |
| `chainId` | integer | EVM chain ID |
| `tokens` | array | List of supported tokens on this network |

##### TokenInfo Object

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | string | Token symbol (e.g., `"USDC"`) |
| `name` | string | Full token name |
| `address` | string | Token contract address |
| `decimals` | integer | Token decimals |
| `eip712` | object \| null | EIP-712 domain configuration for signing |

---

### GET /metrics

Prometheus-compatible metrics endpoint.

#### Response (200 OK)

Content-Type: `text/plain; version=0.0.4; charset=utf-8`

```text
# HELP x402_verifications_total Total number of verification requests
# TYPE x402_verifications_total counter
x402_verifications_total{network="base",valid="true"} 1234

# HELP x402_settlements_total Total number of settlement requests
# TYPE x402_settlements_total counter
x402_settlements_total{network="base",success="true"} 1000

# HELP x402_verification_duration_seconds Verification request duration
# TYPE x402_verification_duration_seconds histogram
x402_verification_duration_seconds_bucket{network="base",le="0.1"} 900

# HELP x402_settlement_duration_seconds Settlement request duration
# TYPE x402_settlement_duration_seconds histogram
x402_settlement_duration_seconds_bucket{network="base",le="1.0"} 800
```

---

### POST /verify

Verify a payment authorization without executing it. Validates the signature, checks balances, and ensures the authorization is valid.

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Content-Type` | string | Yes | Must be `application/json` |
| `Authorization` | string | Yes | Merchant API key: `Bearer <api_key>` |

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x402Version` | integer | Yes | Protocol version. Must be `1` |
| `paymentPayload` | object | Yes | Payment payload containing authorization and signature |
| `paymentRequirements` | object | Yes | Payment requirements from merchant |

##### PaymentPayload Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `authorization` | object | Yes | EIP-3009 authorization data |
| `signature` | string | Yes | EIP-712 signature (hex string, 0x-prefixed) |

##### Authorization Object (EIP-3009)

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `from` | string | Yes | Must match `^0x[a-fA-F0-9]{40}$` | Payer address (token owner) |
| `to` | string | Yes | Must match `^0x[a-fA-F0-9]{40}$` | Recipient address |
| `value` | string | Yes | Must be numeric string | Transfer amount in smallest token units |
| `validAfter` | string | Yes | Must be numeric string | Unix timestamp after which transfer is valid |
| `validBefore` | string | Yes | Must be numeric string | Unix timestamp before which transfer is valid |
| `nonce` | string | Yes | Must match `^0x[a-fA-F0-9]+$` | Unique nonce (32-byte hex string) |
| `extra` | object | No | - | Optional extra data |

##### PaymentRequirements Object

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `scheme` | string | Yes | Must be `"exact"` | Payment scheme (only "exact" supported) |
| `network` | string | Yes | Non-empty | Network identifier (e.g., `"base"`, `"base-sepolia"`) |
| `asset` | string | Yes | Must match `^0x[a-fA-F0-9]{40}$` | Token contract address |
| `payTo` | string | Yes | Must match `^0x[a-fA-F0-9]{40}$` | Merchant address to receive payment |
| `maxAmountRequired` | string | Yes | Must be numeric string | Maximum amount required in smallest token units |
| `resource` | string | Yes | - | Resource identifier being paid for |
| `description` | string | Yes | - | Human-readable description |
| `mimeType` | string | Yes | - | MIME type of the resource |
| `maxTimeoutSeconds` | integer | Yes | Must be ≥ 1 | Maximum timeout in seconds |
| `outputSchema` | object | No | - | Optional output schema |
| `extra` | object | No | - | Optional extra data |

#### Example Request

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
    "signature": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b"
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

#### Response

##### Success Response (200 OK)

```json
{
  "isValid": true,
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21"
}
```

##### Invalid Response (200 OK)

```json
{
  "isValid": false,
  "invalidReason": "Insufficient balance: has 500000, needs 1000000"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `isValid` | boolean | Whether the authorization is valid |
| `payer` | string \| null | Payer address (only present if valid) |
| `invalidReason` | string \| null | Reason for invalidity (only present if invalid) |

#### Common Invalid Reasons

| Reason | Description |
|--------|-------------|
| `Insufficient balance: has X, needs Y` | Payer doesn't have enough tokens |
| `Invalid signature` | Signature verification failed |
| `Authorization expired` | `validBefore` timestamp has passed |
| `Authorization not yet valid` | `validAfter` timestamp is in the future |
| `Nonce already used` | The nonce has been consumed |
| `Amount mismatch` | Authorization amount doesn't match requirements |
| `Recipient mismatch` | Authorization recipient doesn't match payTo |

---

### POST /settle

Execute a payment settlement on the blockchain. Submits the signed authorization and transfers tokens from payer to recipient.

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Content-Type` | string | Yes | Must be `application/json` |
| `Authorization` | string | Yes | Merchant API key: `Bearer <api_key>` |

#### Request Body

Same structure as `/verify`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x402Version` | integer | Yes | Protocol version. Must be `1` |
| `paymentPayload` | object | Yes | Payment payload containing authorization and signature |
| `paymentRequirements` | object | Yes | Payment requirements from merchant |

#### Example Request

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
    "signature": "0x1234567890abcdef..."
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

#### Response

##### Success Response (200 OK)

```json
{
  "success": true,
  "transaction": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "network": "base",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
  "status": "completed"
}
```

##### Preconfirmed Response (200 OK) - Flashblock Networks

```json
{
  "success": true,
  "transaction": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "network": "base",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
  "status": "preconfirmed",
  "message": "Transaction preconfirmed via flashblock"
}
```

##### Cached Response (200 OK) - Already Processed

```json
{
  "success": true,
  "transaction": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "network": "base",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
  "status": "completed",
  "cached": true,
  "message": "Transaction already processed"
}
```

##### Failure Response (200 OK)

```json
{
  "success": false,
  "network": "base",
  "errorReason": "Insufficient credits",
  "status": "failed"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether settlement was successful |
| `transaction` | string \| null | Transaction hash (0x-prefixed) |
| `network` | string | Network where settlement was attempted |
| `payer` | string \| null | Payer address |
| `errorReason` | string \| null | Error message if failed |
| `status` | string \| null | Settlement status: `"pending"`, `"preconfirmed"`, `"completed"`, `"failed"` |
| `cached` | boolean \| null | `true` if this was a duplicate request |
| `message` | string \| null | Additional message |

#### Settlement Statuses

| Status | Description |
|--------|-------------|
| `pending` | Transaction submitted, awaiting confirmation |
| `preconfirmed` | Transaction preconfirmed via flashblock (fast) |
| `completed` | Transaction confirmed on-chain |
| `failed` | Transaction failed |

---

## Merchant Endpoints

Authentication for merchant endpoints uses either:
- `X-Session-Token` header with a valid session token from SIWE authentication
- `X-Internal-Secret` header for internal service calls

### GET /merchant/siwe/nonce

Generate a SIWE (Sign-In with Ethereum) nonce for authentication.

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "nonce": "a1b2c3d4e5f6789012345678901234567890123456789012345678901234"
  }
}
```

---

### POST /merchant/siwe/verify

Verify SIWE message and authenticate merchant.

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | SIWE message that was signed |
| `signature` | string | Yes | EIP-191 signature of the message |

#### Example Request

```json
{
  "message": "example.com wants you to sign in with your Ethereum account:\n0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21\n\nSign in to x402 Facilitator\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: a1b2c3d4e5f6...\nIssued At: 2026-01-02T12:00:00.000Z",
  "signature": "0x..."
}
```

#### Response (200 OK)

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

### POST /merchant/session

Validate an existing session token.

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionToken` | string | Yes | Session token to validate |

#### Response (200 OK)

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

### POST /merchant/logout

Logout and invalidate session.

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionToken` | string | Yes | Session token to invalidate |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "success": true
  }
}
```

---

### GET /merchant/:merchant_id/dashboard/stats

Get merchant dashboard statistics.

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-Session-Token` | string | Yes* | Valid session token |
| `X-Internal-Secret` | string | Yes* | Internal API secret (alternative) |

*One of these headers is required.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `merchant_id` | integer | Merchant ID |

#### Response (200 OK)

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

### GET /merchant/:merchant_id/transactions

Get merchant transactions with pagination and filtering.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | integer | No | 1 | Page number (min: 1) |
| `limit` | integer | No | 20 | Items per page (max: 100) |
| `status` | string | No | - | Filter by status: `pending`, `completed`, `failed` |
| `network` | string | No | - | Filter by network |
| `search` | string | No | - | Search by payer address or tx hash |

#### Response (200 OK)

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

### GET /merchant/:merchant_id/credits

Get merchant credit balance and history.

#### Response (200 OK)

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

### GET /merchant/:merchant_id/credits/packages

Get available credit top-up packages.

#### Response (200 OK)

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

### POST /merchant/:merchant_id/credits/topup

Create a credit top-up order.

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `packageId` | integer | No* | Package ID to purchase |
| `creditAmount` | integer | No* | Custom credit amount |
| `network` | string | Yes | Network for payment: `"base"`, `"ethereum"` |

*Either `packageId` or `creditAmount` is required.

#### Response (200 OK)

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

### GET /merchant/:merchant_id/analytics

Get merchant analytics data.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `period` | string | No | `"30d"` | Time period: `"7d"`, `"30d"`, `"90d"`, `"all"` |

#### Response (200 OK)

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

### GET /merchant/:merchant_id/settings

Get merchant settings.

#### Response (200 OK)

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

### PUT /merchant/:merchant_id/settings

Update merchant settings.

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `merchant` | object | No | Merchant info to update |
| `merchant.businessName` | string | No | Business name |
| `merchant.businessEmail` | string | No | Business email |
| `merchant.website` | string | No | Website URL |
| `merchant.supportEmail` | string | No | Support email |
| `merchant.description` | string | No | Business description |
| `notifications` | object | No | Notification preferences |
| `notifications.emailSettlements` | boolean | No | Email on settlements |
| `notifications.emailFailures` | boolean | No | Email on failures |
| `notifications.emailCredits` | boolean | No | Email on low credits |
| `notifications.emailWeekly` | boolean | No | Weekly summary email |
| `notifications.emailMarketing` | boolean | No | Marketing emails |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "message": "Settings updated successfully"
  }
}
```

---

## Admin Endpoints

Admin endpoints require authentication via:
- `X-Admin-Session` header with valid admin session token
- `X-Internal-Secret` header for internal service calls

### Admin Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/auth/login` | Admin login |
| POST | `/admin/auth/session` | Validate admin session |
| POST | `/admin/auth/logout` | Admin logout |
| GET | `/admin/dashboard` | Admin dashboard stats |
| GET | `/admin/merchants` | List all merchants |
| GET | `/admin/merchants/:merchant_id` | Get merchant details |
| PUT | `/admin/merchants/:merchant_id` | Update merchant |
| POST | `/admin/merchants/:merchant_id/ban` | Ban merchant |
| POST | `/admin/merchants/:merchant_id/unban` | Unban merchant |
| POST | `/admin/merchants/:merchant_id/credits` | Adjust merchant credits |
| GET | `/admin/transactions` | List all transactions |
| GET | `/admin/transactions/:tx_id` | Get transaction details |
| GET | `/admin/settings` | Get system settings |
| PUT | `/admin/settings` | Update system settings |
| GET | `/admin/metrics` | Get system metrics |
| GET | `/admin/audit` | Get audit log |
| GET | `/admin/topup/orders` | List top-up orders |
| POST | `/admin/topup/orders/:order_id/complete` | Complete top-up order |

---

## Data Types

### Network Identifiers

| Network | Identifier | Chain ID | Type |
|---------|------------|----------|------|
| Base | `base` | 8453 | Mainnet |
| Ethereum | `ethereum` | 1 | Mainnet |
| Optimism | `optimism` | 10 | Mainnet |
| Base Sepolia | `base-sepolia` | 84532 | Testnet |
| Sepolia | `sepolia` | 11155111 | Testnet |

### Token Amounts

All token amounts are specified in the token's smallest unit:

| Token | Decimals | 1 Token | Example |
|-------|----------|---------|---------|
| USDC | 6 | `1000000` | `"1000000"` = 1 USDC |

### Address Format

- All addresses must be 0x-prefixed
- 40 hex characters (20 bytes)
- Example: `0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21`

### Signature Format

- 0x-prefixed hex string
- 65 bytes (130 hex characters + 2 for prefix = 132 characters)
- Format: `r (32 bytes) + s (32 bytes) + v (1 byte)`

### Nonce Format (EIP-3009)

- 32-byte hex value with 0x prefix
- 66 characters total
- Example: `0x0000000000000000000000000000000000000000000000000000000000000001`

---

## Error Handling

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

### Validation Errors

```json
{
  "error": "Validation error",
  "message": "x402Version must be 1"
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
| `Validation error: must be a valid Ethereum address` | Invalid address format |
| `Insufficient credits` | Merchant has no credits |
| `Unsupported network` | Network not configured |

---

## Rate Limiting

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

## Examples

### cURL Examples

#### Verify Payment

```bash
curl -X POST http://localhost:8080/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_live_abc123..." \
  -d '{
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
      "resource": "https://api.example.com/data",
      "description": "API access",
      "mimeType": "application/json",
      "maxTimeoutSeconds": 60
    }
  }'
```

#### Health Check

```bash
curl http://localhost:8080/health
```

#### Get Networks

```bash
curl http://localhost:8080/networks
```

#### SIWE Authentication Flow

```bash
# 1. Get nonce
curl http://localhost:8080/merchant/siwe/nonce

# 2. Sign message with wallet and verify
curl -X POST http://localhost:8080/merchant/siwe/verify \
  -H "Content-Type: application/json" \
  -d '{
    "message": "...",
    "signature": "0x..."
  }'

# 3. Use session token for authenticated requests
curl http://localhost:8080/merchant/1/dashboard/stats \
  -H "X-Session-Token: uuid-session-token"
```
