# x402 Facilitator API Reference

Complete API documentation for the x402 v2 payment facilitator service.

## x402 Protocol Version 2

This API implements the **x402 v2 standard** with the following features:

- **Standardized Headers**: `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`, `PAYMENT-VERSION`
- **Base64 Encoding**: All headers except `PAYMENT-VERSION` are Base64 encoded JSON
- **CAIP-2 Network IDs**: Primary network identifier using `eip155:<chainId>` format

## Base URL

```
https://api.netpay.id
```

---

## Table of Contents

- [x402 v2 Headers](#x402-v2-headers)
- [CAIP-2 Network Format](#caip-2-network-format)
- [Public Endpoints](#public-endpoints)
  - [GET /](#get---service-info)
  - [GET /health](#get-health)
  - [GET /networks](#get-networks)
  - [GET /metrics](#get-metrics)
  - [GET /help](#get-help)
  - [GET /account](#get-account)
  - [POST /account](#post-account)
  - [POST /verify](#post-verify)
  - [POST /settle](#post-settle)
- [Data Types](#data-types)
- [Error Handling](#error-handling)

---

## x402 v2 Headers

The x402 v2 protocol defines these standardized headers:

| Header | Direction | Encoding | Description |
|--------|-----------|----------|-------------|
| `PAYMENT-REQUIRED` | Response | Base64 | 402 response with payment requirements |
| `PAYMENT-SIGNATURE` | Request | Base64 | Payment authorization and signature |
| `PAYMENT-RESPONSE` | Response | Base64 | Settlement result |
| `PAYMENT-VERSION` | Both | Plain text | Protocol version (always `2`) |

### Encoding Example

**PAYMENT-SIGNATURE Header:**
```
Base64 encoded JSON:
{
  "authorization": { ... },
  "signature": "0x..."
}
```

**Decoded from request header:**
```javascript
const decoded = JSON.parse(atob(request.headers['PAYMENT-SIGNATURE']));
```

---

## CAIP-2 Network Format

CAIP-2 is the **primary network identifier** in x402 v2:

| Network | CAIP-2 | Chain ID | Type |
|---------|--------|----------|------|
| Base | `eip155:8453` | 8453 | Mainnet |
| OP Mainnet | `eip155:10` | 10 | Mainnet |
| HyperEVM | `eip155:999` | 999 | Mainnet |
| Base Sepolia | `eip155:84532` | 84532 | Testnet |
| OP Sepolia | `eip155:11155420` | 11155420 | Testnet |
| HyperEVM Testnet | `eip155:998` | 998 | Testnet |

All endpoints accept multiple network formats for compatibility:
- CAIP-2: `eip155:8453`
- Chain ID: `8453`
- Name variants: `base`, `BASE`, `Base`

---

## Public Endpoints

### GET / - Service Info

Returns service information and available endpoints.

#### Response (200 OK)

```json
{
  "name": "x402 Facilitator",
  "description": "Secure x402 payment facilitator",
  "version": "2.0.0",
  "endpoints": {
    "health": "GET /health",
    "networks": "GET /networks",
    "help": "GET /help",
    "account": "GET /account (info) | POST /account (purchase credits)",
    "verify": "POST /verify (requires API key)",
    "settle": "POST /settle (requires API key)"
  },
  "mainnetNetworks": ["Base", "OP Mainnet", "HyperEVM"],
  "testnetNetworks": ["Base Sepolia", "OP Sepolia", "HyperEVM Testnet"]
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

#### Response Headers

| Header | Value |
|--------|-------|
| `PAYMENT-VERSION` | `2` |

#### Response (200 OK)

```json
{
  "success": true,
  "mainnet": [
    {
      "network": "Base",
      "caip2": "eip155:8453",
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
      "network": "Base Sepolia",
      "caip2": "eip155:84532",
      "chainId": 84532,
      "tokens": [
        {
          "symbol": "USDC",
          "name": "USD Coin",
          "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          "decimals": 6,
          "eip712": {
            "name": "USDC",
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
| `network` | string | Network name used in API requests |
| `caip2` | string | CAIP-2 identifier (e.g., `eip155:8453`) |
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

### GET /help

Returns x402 v2 protocol documentation in plain text format.

#### Response Headers

| Header | Value |
|--------|-------|
| `PAYMENT-VERSION` | `2` |
| `Content-Type` | `text/plain; charset=utf-8` |

#### Response (200 OK)

Returns plain text documentation including:
- Protocol overview
- Vault address for credit purchases
- Supported networks and USDC addresses
- Endpoint documentation
- Header specifications
- Request/response examples
- Error codes

---

### GET /account

Returns plain text instructions for credit purchases and account management.

#### Response Headers

| Header | Value |
|--------|-------|
| `Content-Type` | `text/plain; charset=utf-8` |

#### Response (200 OK)

Returns plain text documentation including:
- How to purchase credits
- Vault address
- Supported networks and USDC addresses
- Request format for purchases
- PAYMENT-SIGNATURE structure
- Response examples

---

### POST /account

Unified account endpoint for credit purchases and account queries.

#### Two Modes of Operation

**Mode A: Credit Purchase** (with `PAYMENT-SIGNATURE` header)
- Creates new API key or tops up existing account
- Requires signed USDC payment to vault address

**Mode B: Account Query** (with `Authorization` header)
- Check balance or get usage metrics
- Requires valid API key

---

#### Mode A: Credit Purchase

##### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `PAYMENT-SIGNATURE` | string | Yes | Base64 encoded payment signature |
| `API-KEY` | string | No | Existing API key (for top-up) |

##### PAYMENT-SIGNATURE Content (decoded)

```json
{
  "authorization": {
    "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
    "to": "0x...",
    "value": "1000000",
    "validAfter": "0",
    "validBefore": "1735776000",
    "nonce": "0x0000000000000000000000000000000000000000000000000000000000000001"
  },
  "signature": "0x...",
  "network": "Base Sepolia",
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `authorization` | object | Yes | EIP-3009 authorization data |
| `signature` | string | Yes | EIP-712 signature |
| `network` | string | Yes | Network name or CAIP-2 |
| `asset` | string | Yes | Token contract address |

##### Success Response - New Account (200 OK)

```json
{
  "success": true,
  "action": "create",
  "apiKey": "x402_pk_test_abc123...",
  "balanceType": "testnet",
  "usdc": "10.000000",
  "transaction": "0x...",
  "message": "API key created. SAVE THIS KEY - it will not be shown again!"
}
```

##### Success Response - Top-up (200 OK)

```json
{
  "success": true,
  "action": "topup",
  "balanceType": "testnet",
  "usdc": "5.000000",
  "newBalance": "15.000000",
  "transaction": "0x..."
}
```

---

#### Mode B: Account Query

##### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Authorization` | string | Yes | `Bearer <api_key>` |
| `Content-Type` | string | Yes | `application/json` |

##### Request Body

```json
{
  "action": "balance"
}
```

| Field | Type | Required | Values | Description |
|-------|------|----------|--------|-------------|
| `action` | string | Yes | `"balance"`, `"metrics"` | Query type |

##### Balance Response (200 OK)

```json
{
  "success": true,
  "totalBalance": "9.956061",
  "mainnetBalance": "0.000000",
  "testnetBalance": "9.956061",
  "estimatedMainnetSettlements": 0,
  "estimatedTestnetSettlements": 9956,
  "isActive": true,
  "expiresAt": null
}
```

##### Metrics Response (200 OK)

```json
{
  "success": true,
  "usdc": "9.956061",
  "stats": {
    "totalTransactions": 34,
    "successfulTransactions": 34,
    "failedTransactions": 0,
    "successRate": "100.0%",
    "totalSpent": "0.043938 USDC",
    "totalGasCost": "0.009938 USDC",
    "totalServiceFees": "0.034000 USDC"
  },
  "createdAt": "2026-01-03 17:38:26 UTC",
  "lastUsed": "2026-01-03 18:55:53 UTC"
}
```

##### Error Response - Missing Parameters (400)

```json
{
  "error": "MISSING_PARAMETERS",
  "message": "POST /account requires either PAYMENT-SIGNATURE header (for purchase) or Authorization header with action body (for queries)",
  "usage": {
    "purchase": {
      "headers": {"PAYMENT-SIGNATURE": "<base64>", "PAYMENT-VERSION": "2"},
      "note": "Send payment to vault address"
    },
    "query": {
      "headers": {"Authorization": "Bearer <api_key>"},
      "body": {"action": "balance or metrics"}
    }
  }
}
```

---

### POST /verify

Verify a payment authorization without executing it. Validates the signature, checks balances, and ensures the authorization is valid.

**Accepts both header-based (x402 v2) and JSON body requests. Headers take priority if both are provided.**

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Authorization` | string | Yes | API key: `Bearer <api_key>` |
| `PAYMENT-SIGNATURE` | string | No* | Base64 encoded payment signature |
| `PAYMENT-REQUIRED` | string | No* | Base64 encoded payment requirements |
| `PAYMENT-VERSION` | string | No | Protocol version (default: `2`) |
| `Content-Type` | string | No* | `application/json` if using body |

*Either both `PAYMENT-SIGNATURE` + `PAYMENT-REQUIRED` headers OR JSON body is required.

#### Option 1: Header-based Request (x402 v2)

```http
POST /verify HTTP/1.1
Authorization: Bearer x402_pk_live_abc123
PAYMENT-VERSION: 2
PAYMENT-SIGNATURE: <base64>
PAYMENT-REQUIRED: <base64>
```

##### PAYMENT-SIGNATURE Content (decoded)

```json
{
  "authorization": {
    "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
    "to": "0x8ba1f109551bD432803012645Ac136ddd64DBa72",
    "value": "1000000",
    "validAfter": "0",
    "validBefore": "1735776000",
    "nonce": "0x0000000000000000000000000000000000000000000000000000000000000001"
  },
  "signature": "0x...",
  "network": "Base Sepolia",
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
}
```

##### PAYMENT-REQUIRED Content (decoded)

```json
{
  "scheme": "exact",
  "network": "eip155:84532",
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "payTo": "0x8ba1f109551bD432803012645Ac136ddd64DBa72",
  "maxAmountRequired": "1000000",
  "resource": "https://api.example.com/premium/data",
  "description": "Premium API access",
  "mimeType": "application/json",
  "maxTimeoutSeconds": 60
}
```

#### Option 2: JSON Body Request

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
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x8ba1f109551bD432803012645Ac136ddd64DBa72",
    "maxAmountRequired": "1000000",
    "resource": "https://api.example.com/premium/data",
    "description": "Premium API access",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 60
  }
}
```

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
| `network` | string | Yes | Non-empty | Network (CAIP-2 preferred: `eip155:8453`) |
| `asset` | string | Yes | Must match `^0x[a-fA-F0-9]{40}$` | Token contract address |
| `payTo` | string | Yes | Must match `^0x[a-fA-F0-9]{40}$` | Recipient address to receive payment |
| `maxAmountRequired` | string | Yes | Must be numeric string | Maximum amount required in smallest token units |
| `resource` | string | No | - | Resource identifier being paid for |
| `description` | string | No | - | Human-readable description |
| `mimeType` | string | No | - | MIME type of the resource |
| `maxTimeoutSeconds` | integer | No | Must be ≥ 1 | Maximum timeout in seconds |
| `outputSchema` | object | No | - | Optional output schema |
| `extra` | object | No | - | Optional extra data |

#### Response

##### Response Headers (x402 v2)

| Header | Value |
|--------|-------|
| `PAYMENT-VERSION` | `2` |

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

**Accepts both header-based (x402 v2) and JSON body requests. Headers take priority if both are provided.**

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Authorization` | string | Yes | API key: `Bearer <api_key>` |
| `PAYMENT-SIGNATURE` | string | No* | Base64 encoded payment signature |
| `PAYMENT-REQUIRED` | string | No* | Base64 encoded payment requirements |
| `PAYMENT-VERSION` | string | No | Protocol version (default: `2`) |
| `Content-Type` | string | No* | `application/json` if using body |

*Either both `PAYMENT-SIGNATURE` + `PAYMENT-REQUIRED` headers OR JSON body is required.

#### Option 1: Header-based Request (x402 v2)

```http
POST /settle HTTP/1.1
Authorization: Bearer x402_pk_live_abc123
PAYMENT-VERSION: 2
PAYMENT-SIGNATURE: <base64>
PAYMENT-REQUIRED: <base64>
```

#### Option 2: JSON Body Request

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
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
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

##### Response Headers (x402 v2)

| Header | Value | Description |
|--------|-------|-------------|
| `PAYMENT-VERSION` | `2` | Protocol version |
| `PAYMENT-RESPONSE` | Base64 | Base64 encoded settlement result |

##### Success Response (200 OK)

```json
{
  "success": true,
  "transaction": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "network": "eip155:8453",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
  "status": "completed"
}
```

##### Preconfirmed Response (200 OK) - Flashblock Networks

```json
{
  "success": true,
  "transaction": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "network": "eip155:8453",
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

## Data Types

### Network Identifiers

| Network | Identifier | CAIP-2 | Chain ID | Type |
|---------|------------|--------|----------|------|
| Base | `Base` | `eip155:8453` | 8453 | Mainnet |
| OP Mainnet | `OP Mainnet` | `eip155:10` | 10 | Mainnet |
| HyperEVM | `HyperEVM` | `eip155:999` | 999 | Mainnet |
| Base Sepolia | `Base Sepolia` | `eip155:84532` | 84532 | Testnet |
| OP Sepolia | `OP Sepolia` | `eip155:11155420` | 11155420 | Testnet |
| HyperEVM Testnet | `HyperEVM Testnet` | `eip155:998` | 998 | Testnet |

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

#### Health Check

```bash
curl https://api.netpay.id/health
```

#### Get Networks

```bash
curl https://api.netpay.id/networks
```

#### Verify Payment (Header-Based x402 v2)

```bash
curl -X POST https://api.netpay.id/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_live_abc123..." \
  -H 'PAYMENT-SIGNATURE: {"authorization":{"from":"0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21","to":"0x8ba1f109551bD432803012645Ac136ddd64DBa72","value":"1000000","validAfter":"0","validBefore":"1735776000","nonce":"0x0000000000000000000000000000000000000000000000000000000000000001"},"signature":"0x...","network":"Base","asset":"USDC"}' \
  -H 'PAYMENT-REQUIRED: {"x402Version":2,"scheme":"exact","network":"Base","asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","payTo":"0x8ba1f109551bD432803012645Ac136ddd64DBa72","maxAmountRequired":"1000000","resource":"https://api.example.com/data","description":"API access"}'
```

#### Settle Payment (Header-Based x402 v2)

```bash
curl -X POST https://api.netpay.id/settle \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_live_abc123..." \
  -H 'PAYMENT-SIGNATURE: {"authorization":{"from":"0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21","to":"0x8ba1f109551bD432803012645Ac136ddd64DBa72","value":"1000000","validAfter":"0","validBefore":"1735776000","nonce":"0x0000000000000000000000000000000000000000000000000000000000000001"},"signature":"0x...","network":"Base","asset":"USDC"}' \
  -H 'PAYMENT-REQUIRED: {"x402Version":2,"scheme":"exact","network":"Base","asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","payTo":"0x8ba1f109551bD432803012645Ac136ddd64DBa72","maxAmountRequired":"1000000","resource":"https://api.example.com/data","description":"API access"}'
```

#### Get Account Balance

```bash
curl -X POST https://api.netpay.id/account \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_live_abc123..." \
  -d '{"action": "balance"}'
```

#### Get Account Metrics

```bash
curl -X POST https://api.netpay.id/account \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_live_abc123..." \
  -d '{"action": "metrics"}'
```
