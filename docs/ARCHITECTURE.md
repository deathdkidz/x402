# x402 System Architecture

Complete technical documentation for the x402 payment protocol facilitator and NetPay merchant dashboard.

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [x402-facilitator-rs (Rust Backend)](#x402-facilitator-rs-rust-backend)
4. [NetPay-Web (Dashboard Frontend)](#netpay-web-dashboard-frontend)
5. [Authentication System](#authentication-system)
6. [Database Schema](#database-schema)
7. [API Reference](#api-reference)
8. [Security Architecture](#security-architecture)
9. [Payment Flow](#payment-flow)
10. [Credit System](#credit-system)
11. [Infrastructure](#infrastructure)

---

## System Overview

The x402 system enables **gasless cryptocurrency payments** using the ERC-3009 `transferWithAuthorization` standard. This allows users to pay for resources without holding ETH for gas fees - the facilitator covers gas costs using a paymaster wallet system.

### Key Features

- **Gasless Payments**: Users sign payment authorizations; the facilitator submits transactions
- **Multi-Network Support**: Base, Optimism, Arbitrum, Ethereum mainnets and testnets
- **EIP-712 Typed Signatures**: Cryptographically secure payment authorizations
- **Credit-Based Billing**: Merchants purchase credits to cover settlement gas costs
- **Sub-Second Confirmations**: Flashblock support for Base/OP networks (200-500ms)
- **SIWE Authentication**: EIP-4361 Sign-In with Ethereum for merchant dashboard

### System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client/AI Agent                            │
│                    (Makes HTTP 402 Payment Required)                │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Merchant Application                           │
│              (Integrates x402 middleware, returns 402)              │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
┌─────────────────────────────┐   ┌─────────────────────────────────┐
│   x402-facilitator-rs       │   │        NetPay-Web               │
│   (Rust Backend)            │   │    (Dashboard Frontend)         │
│   Port: 8080                │   │    Port: 3001                   │
│                             │   │                                 │
│   • Payment verification    │◄──│   • Merchant management         │
│   • Settlement execution    │   │   • Transaction history         │
│   • Credit management       │   │   • Credit purchase             │
│   • Gas tracking            │   │   • Analytics                   │
└─────────────────┬───────────┘   └─────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────┐   ┌─────────────────────────────────┐
│        MySQL Database       │   │           Redis                 │
│   x402_facilitator          │   │   Caching & Rate Limiting       │
└─────────────────────────────┘   └─────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Blockchain Networks                              │
│        Base • Optimism • Arbitrum • Ethereum (+ Testnets)          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### x402-facilitator-rs (Rust Backend)

The core payment processing service written in Rust using Axum framework.

**Location**: `/srv/x402/x402-facilitator-rs/`

**Key Responsibilities**:
- Verify EIP-712 payment signatures
- Execute ERC-3009 `transferWithAuthorization` transactions
- Manage paymaster wallets for gas sponsorship
- Track transactions and gas costs
- Merchant authentication via SIWE (EIP-4361)
- Admin dashboard API

**Directory Structure**:
```
src/
├── main.rs              # Application entry point
├── config/              # Environment configuration
├── types/               # Request/response types
├── services/
│   ├── database.rs      # MySQL operations
│   ├── redis.rs         # Caching layer
│   ├── provider_pool.rs # Multi-RPC management
│   ├── paymaster_pool.rs# Round-robin gas wallets
│   ├── verification.rs  # 6-layer payment verification
│   ├── settlement.rs    # 15-layer settlement with safety checks
│   ├── transaction_monitor.rs # Background confirmation monitoring
│   └── metrics.rs       # Prometheus metrics
├── middleware/
│   ├── auth.rs          # API key authentication
│   ├── rate_limit.rs    # Request throttling
│   ├── security.rs      # Attack pattern blocking
│   └── validation.rs    # Request validation
├── routes/
│   ├── mod.rs           # Core /verify, /settle endpoints
│   ├── merchant.rs      # Dashboard API routes
│   └── admin.rs         # Admin panel routes
└── utils/               # Logging, helpers
```

### NetPay-Web (Dashboard Frontend)

Next.js 15 merchant dashboard for account management and analytics.

**Location**: `/srv/x402/netpay-web/`

**Key Responsibilities**:
- Merchant authentication (SIWE login)
- Transaction history and search
- Credit balance and purchase
- Analytics and reporting
- Settings management
- Protected resources configuration

**Directory Structure**:
```
app/
├── page.tsx             # Landing/login page
├── layout.tsx           # Root layout
├── globals.css          # Tailwind styles
├── api/
│   ├── auth/
│   │   ├── siwe/        # SIWE nonce & verify
│   │   ├── me/          # Session check
│   │   └── logout/      # Session termination
│   ├── dashboard/       # Stats, data endpoints
│   └── admin/           # Admin-only routes
├── dashboard/
│   ├── page.tsx         # Main dashboard
│   ├── transactions/    # Transaction history
│   ├── credits/         # Credit management
│   ├── analytics/       # Charts and stats
│   └── settings/        # Account settings
└── lib/
    ├── auth-context.tsx # Authentication state
    ├── api.ts           # Facilitator API client
    ├── session.ts       # Cookie management
    └── security.ts      # Rate limiting, validation
```

---

## Authentication System

### SIWE (Sign-In with Ethereum) - EIP-4361

The authentication method using cryptographic wallet signatures.

#### SIWE Flow

```
┌──────────┐        ┌────────────┐        ┌────────────────┐
│  Client  │        │ NetPay-Web │        │  Facilitator   │
└────┬─────┘        └─────┬──────┘        └───────┬────────┘
     │                    │                       │
     │ 1. Click "Connect" │                       │
     │ ──────────────────>│                       │
     │                    │ 2. GET /api/auth/siwe/nonce
     │                    │ ─────────────────────>│
     │                    │                       │
     │                    │ 3. Return nonce       │
     │                    │ <─────────────────────│
     │                    │                       │
     │ 4. Build SIWE message                      │
     │ <──────────────────│                       │
     │                    │                       │
     │ 5. Sign message    │                       │
     │    (Wallet)        │                       │
     │                    │                       │
     │ 6. Send signature  │                       │
     │ ──────────────────>│                       │
     │                    │ 7. POST /api/auth/siwe/verify
     │                    │ ─────────────────────>│
     │                    │                       │
     │                    │    • Verify signature │
     │                    │    • Verify nonce     │
     │                    │    • Create session   │
     │                    │    • Create/get merchant
     │                    │                       │
     │                    │ 8. Return session token
     │                    │ <─────────────────────│
     │                    │                       │
     │ 9. Set cookie      │                       │
     │ <──────────────────│                       │
     │                    │                       │
```

#### SIWE Message Format (EIP-4361)

```
netpay.example.com wants you to sign in with your Ethereum account:
0x1234567890abcdef1234567890abcdef12345678

Sign in to NetPay Dashboard

URI: https://netpay.example.com
Version: 1
Chain ID: 1
Nonce: 32-character-random-string
Issued At: 2024-01-15T12:00:00.000Z
```

#### Nonce Management

Nonces prevent replay attacks and ensure message freshness:

| Field | Description |
|-------|-------------|
| `nonce` | 32-character random string |
| `expires_at` | 10 minutes from creation |
| `used_at` | Set when nonce is consumed |
| `address` | Set after successful verification |

### Session Management

After successful authentication:

1. **Session Token**: UUID stored in `merchant_sessions` table
2. **HTTP-Only Cookie**: Secure cookie set in browser
3. **Session Duration**: 30 days default
4. **Redis Cache**: Sessions cached for fast validation

---

## Database Schema

### Core Tables (12 tables)

#### `merchants`
Primary merchant account table.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT | Primary key |
| `auth_address` | VARCHAR(42) | Ethereum address (lowercase) |
| `business_name` | VARCHAR(255) | Display name |
| `api_key` | VARCHAR(80) | API authentication key |
| `credit_balance` | INT | Current credit balance |
| `lifetime_credits_purchased` | INT | Total credits ever purchased |
| `lifetime_credits_used` | INT | Total credits consumed |
| `status` | ENUM | pending, active, suspended, banned |
| `webhook_url` | VARCHAR(255) | Settlement notification URL |
| `webhook_secret` | VARCHAR(64) | HMAC signature secret |
| `is_active` | BOOLEAN | Account enabled flag |

#### `merchant_sessions`
Active login sessions.

| Column | Type | Description |
|--------|------|-------------|
| `session_token` | VARCHAR(64) | Primary key (UUID) |
| `merchant_id` | BIGINT | Foreign key to merchants |
| `expires_at` | DATETIME | Session expiration |
| `nonce` | VARCHAR(64) | SIWE nonce used |
| `signature` | TEXT | Signature for audit |
| `ip_address` | VARCHAR(45) | Login IP |
| `user_agent` | TEXT | Browser/client info |

#### `siwe_nonces`
SIWE authentication nonces.

| Column | Type | Description |
|--------|------|-------------|
| `nonce` | VARCHAR(64) | Primary key |
| `created_at` | DATETIME | Generation time |
| `expires_at` | DATETIME | Valid until |
| `used_at` | DATETIME | Consumption time |
| `address` | VARCHAR(42) | Authenticated address |

#### `transactions`
Payment settlement records.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `merchant_id` | BIGINT | Foreign key |
| `payer_address` | VARCHAR(42) | Token sender |
| `recipient_address` | VARCHAR(42) | Token receiver (merchant) |
| `amount` | DECIMAL(36,18) | Token amount |
| `asset` | VARCHAR(42) | Token contract address |
| `network` | VARCHAR(32) | Chain name |
| `status` | ENUM | pending, preconfirmed, completed, failed |
| `tx_hash` | VARCHAR(66) | Blockchain transaction hash |
| `nonce` | VARCHAR(66) | ERC-3009 authorization nonce |
| `gas_used` | BIGINT | Actual gas consumed |
| `gas_price` | BIGINT | Gas price in wei |
| `credit_cost` | INT | Credits charged |
| `resource` | VARCHAR(512) | Protected resource URL |
| `error_message` | TEXT | Failure reason |

### Credit System Tables

#### `credit_packages`
Available credit purchase options.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT | Primary key |
| `name` | VARCHAR(64) | Package name |
| `credits` | INT | Credits included |
| `price_usdc` | DECIMAL(10,2) | Price in USDC |
| `is_active` | BOOLEAN | Available for purchase |

#### `credit_topup_orders`
Credit purchase orders (crypto payments).

| Column | Type | Description |
|--------|------|-------------|
| `order_id` | VARCHAR(64) | Primary key (UUID) |
| `merchant_id` | BIGINT | Purchasing merchant |
| `package_id` | INT | Package being purchased |
| `status` | ENUM | pending, completed, failed, expired |
| `payment_address` | VARCHAR(42) | Expected payment address |
| `tx_hash` | VARCHAR(66) | Payment transaction |

#### `credit_transactions`
Credit balance change ledger.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `merchant_id` | BIGINT | Affected merchant |
| `type` | ENUM | purchase, usage, refund, adjustment |
| `amount` | INT | Credit delta (+/-) |
| `balance_after` | INT | New balance |
| `reference_type` | VARCHAR(32) | Source entity type |
| `reference_id` | VARCHAR(64) | Source entity ID |

### Admin Tables

#### `admin_users`
Administrative accounts.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT | Primary key |
| `auth_address` | VARCHAR(42) | Ethereum address |
| `role` | ENUM | super_admin, admin, support |
| `totp_secret` | VARCHAR(32) | 2FA secret (encrypted) |
| `totp_enabled` | BOOLEAN | 2FA active |

### Utility Tables

#### `system_settings`
System configuration key-value store.

| Column | Type | Description |
|--------|------|-------------|
| `setting_key` | VARCHAR(64) | Setting name |
| `setting_value` | TEXT | Setting value |
| `setting_type` | ENUM | string, number, boolean |

---

## API Reference

### Public Endpoints

#### `GET /health`
Health check endpoint.

**Response**:
```json
{
  "status": "ok",
  "service": "x402-facilitator",
  "timestamp": 1705312000000,
  "uptime": 3600.5
}
```

#### `GET /supported`
List supported networks and tokens.

**Response**:
```json
{
  "success": true,
  "mainnet": [
    {
      "network": "base",
      "chain_id": 8453,
      "tokens": [
        {
          "symbol": "USDC",
          "name": "USD Coin",
          "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          "decimals": 6,
          "eip712": {
            "name": "USD Coin",
            "version": "2"
          }
        }
      ]
    }
  ],
  "testnet": [...]
}
```

### Authenticated Endpoints (API Key Required)

#### `POST /verify`
Verify a payment authorization without executing it.

**Headers**:
```
Authorization: Bearer <api_key>
```

**Request**:
```json
{
  "paymentPayload": {
    "authorization": {
      "from": "0xPayer...",
      "to": "0xMerchant...",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1705398400",
      "nonce": "0x..."
    },
    "signature": "0x..."
  },
  "paymentRequirements": {
    "network": "base",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "maxAmountRequired": "1000000",
    "payTo": "0xMerchant..."
  }
}
```

**Response (Success)**:
```json
{
  "isValid": true,
  "reason": null,
  "payer": "0xPayer..."
}
```

**Response (Failure)**:
```json
{
  "isValid": false,
  "reason": "Insufficient balance: required 1.00 USDC, available 0.50 USDC",
  "payer": null
}
```

#### `POST /settle`
Execute a verified payment authorization.

**Request**: Same as `/verify`

**Response (Success)**:
```json
{
  "success": true,
  "network": "base",
  "txHash": "0x...",
  "status": "preconfirmed",
  "settlementId": "uuid-...",
  "message": "Preconfirmed via Flashblocks in 247ms"
}
```

### Merchant Dashboard Endpoints

#### `GET /merchant/siwe/nonce`
Generate SIWE authentication nonce.

#### `POST /merchant/siwe/verify`
Verify SIWE signature and create session.

#### `POST /merchant/session`
Validate existing session token.

#### `GET /merchant/:id/dashboard/stats`
Get dashboard statistics.

#### `GET /merchant/:id/transactions`
List transactions with pagination and filters.

#### `GET /merchant/:id/credits`
Get credit balance and history.

#### `POST /merchant/:id/credits/topup`
Create credit purchase order.

---

## Security Architecture

### Multi-Layer Defense

```
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 1: Nginx Proxy                         │
│    • TLS termination (HTTPS only)                               │
│    • HTTP/2 support                                             │
│    • Request size limits                                        │
│    • Gzip compression                                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                Layer 2: Security Middleware                     │
│    • Path pattern blocking (LFI, RCE attempts)                  │
│    • Suspicious IP tracking and banning                         │
│    • Request body size limits (1MB)                             │
│    • Admin routes IP restricted (/metrics localhost only)       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Layer 3: Rate Limiting                          │
│    • Unauthenticated: 200 req/min per IP                        │
│    • Authenticated: 1,500 req/min per API key                   │
│    • SIWE nonce: 30 req/min per IP                              │
│    • SIWE verify: 10 attempts/min per IP                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              Layer 4: Authentication                            │
│    • API key validation (for /verify, /settle)                  │
│    • Session token validation (for dashboard)                   │
│    • SIWE signature verification (for login)                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              Layer 5: Input Validation                          │
│    • JSON schema validation                                     │
│    • Address format validation (checksummed)                    │
│    • Amount bounds checking                                     │
│    • Signature format validation                                │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│             Layer 6: Business Logic Verification                │
│    • EIP-712 signature verification                             │
│    • Token balance checking                                     │
│    • Time window validation                                     │
│    • Nonce replay prevention                                    │
│    • Credit balance sufficiency                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Blocked Attack Patterns

The security middleware blocks requests matching:

| Pattern | Attack Type |
|---------|-------------|
| `../../` | Path traversal |
| `/bin/sh` | Shell injection |
| `eval-stdin.php` | PHPUnit RCE |
| `/cgi-bin/` | CGI exploits |
| `.env` | Environment file exposure |
| `/phpunit/` | PHPUnit exploits |
| `/vendor/` | Composer vendor scans |
| `/.git/` | Git metadata exposure |
| `.sql` | SQL file access |
| `/wp-admin/` | WordPress scans |
| `/phpmyadmin` | phpMyAdmin probes |

### SIWE Security Features

- **Nonce Expiration**: 5-minute validity window
- **Single Use**: Nonces marked as used after verification
- **Domain Binding**: Message bound to specific domain
- **Timestamp Validation**: Issued-at time checked
- **Address Case Normalization**: Lowercase comparison

### Settlement Security Checks

The `/settle` endpoint performs 15 safety checks:

1. Network validation
2. Token validation
3. Payer address extraction
4. Authorization structure validation
5. Recipient address matching
6. EIP-712 signature verification
7. Time window validation
8. Amount matching validation
9. Duplicate transaction detection (Redis)
10. Pre-settlement balance verification
11. Nonce replay attack prevention (on-chain check)
12. Merchant credit balance check
13. Gas estimation
14. Transaction execution
15. Confirmation monitoring

---

## Payment Flow

### Complete Settlement Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │ Merchant │     │Facilitator│    │Blockchain│
└────┬─────┘     └────┬─────┘     └────┬──────┘    └────┬─────┘
     │                │                │                │
     │ 1. Request     │                │                │
     │   resource     │                │                │
     │ ──────────────>│                │                │
     │                │                │                │
     │ 2. HTTP 402    │                │                │
     │   Payment      │                │                │
     │   Required     │                │                │
     │ <──────────────│                │                │
     │                │                │                │
     │ 3. Sign ERC-3009                │                │
     │   authorization                 │                │
     │   (wallet)     │                │                │
     │                │                │                │
     │ 4. Retry with  │                │                │
     │   X-Payment    │                │                │
     │ ──────────────>│                │                │
     │                │                │                │
     │                │ 5. POST /verify│                │
     │                │ ──────────────>│                │
     │                │                │ 6. Verify      │
     │                │                │   signature    │
     │                │                │ ──────────────>│
     │                │                │                │
     │                │                │ 7. Check       │
     │                │                │   balance      │
     │                │                │ <──────────────│
     │                │                │                │
     │                │ 8. Valid       │                │
     │                │ <──────────────│                │
     │                │                │                │
     │                │ 9. POST /settle│                │
     │                │ ──────────────>│                │
     │                │                │                │
     │                │                │ 10. Execute    │
     │                │                │   transferWith │
     │                │                │   Authorization│
     │                │                │ ──────────────>│
     │                │                │                │
     │                │                │ 11. Tx         │
     │                │                │   preconfirmed │
     │                │                │ <──────────────│
     │                │                │                │
     │                │ 12. Settlement │                │
     │                │    response    │                │
     │                │ <──────────────│                │
     │                │                │                │
     │ 13. Resource   │                │                │
     │    response    │                │                │
     │ <──────────────│                │                │
     │                │                │                │
```

### Flashblock Optimization (Base/Optimism)

For supported networks, the facilitator uses Flashblock subscriptions for sub-second confirmation:

1. Submit transaction to mempool
2. Subscribe to Flashblock WebSocket
3. Wait for transaction inclusion (200-500ms typical)
4. Return "preconfirmed" status
5. Background monitor upgrades to "completed" on L1 finality

---

## Credit System

### How Credits Work

Credits abstract away the complexity of gas costs across different networks:

| Operation | Credit Cost |
|-----------|-------------|
| Testnet settlement | 0 credits (free tier) |
| Mainnet settlement | 1 credit |
| Failed settlement | 0 credits (refunded) |

### Credit Packages

| Package | Credits | Price (USDC) | Per-Credit Cost |
|---------|---------|--------------|-----------------|
| Starter | 100 | $10 | $0.10 |
| Growth | 500 | $45 | $0.09 |
| Pro | 1,000 | $80 | $0.08 |
| Enterprise | 5,000 | $350 | $0.07 |

### Credit Purchase Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Merchant │     │Facilitator│    │Blockchain│
└────┬─────┘     └────┬──────┘    └────┬─────┘
     │                │                │
     │ 1. Select      │                │
     │   package      │                │
     │ ──────────────>│                │
     │                │                │
     │ 2. Return order│                │
     │   with payment │                │
     │   address      │                │
     │ <──────────────│                │
     │                │                │
     │ 3. Send USDC   │                │
     │   to payment   │                │
     │   address      │                │
     │ ───────────────────────────────>│
     │                │                │
     │                │ 4. Monitor     │
     │                │   for payment  │
     │                │ <──────────────│
     │                │                │
     │ 5. Credits     │                │
     │   added        │                │
     │ <──────────────│                │
     │                │                │
```

### Free Testnet Credits

New merchants receive free testnet credits for development:

- **Allocation**: 1,000 credits per month
- **Reset**: First of each month
- **Networks**: All testnets (Base Sepolia, Optimism Sepolia, etc.)

---

## Infrastructure

### System Requirements

- **CPU**: 2+ cores
- **RAM**: 4GB minimum
- **Storage**: 20GB SSD
- **OS**: Linux (Ubuntu 22.04 LTS recommended)

### Dependencies

| Service | Version | Purpose |
|---------|---------|---------|
| Rust | 1.75+ | Facilitator runtime |
| Node.js | 20+ | NetPay-Web |
| MySQL | 8.0+ | Primary database |
| Redis | 7.0+ | Caching, rate limiting |
| Nginx | 1.24+ | Reverse proxy |

### Ports

| Port | Service | Access |
|------|---------|--------|
| 8080 | x402-facilitator-rs | Internal only |
| 3001 | netpay-web | Internal only |
| 443 | Nginx (HTTPS) | Public |
| 80 | Nginx (redirect) | Public |

### Systemd Services

```bash
# Facilitator service
sudo systemctl status x402-facilitator-rs
sudo systemctl restart x402-facilitator-rs
sudo journalctl -u x402-facilitator-rs -f

# NetPay-Web (PM2 managed)
pm2 status netpay-web
pm2 restart netpay-web
pm2 logs netpay-web
```

### Environment Variables

#### Facilitator (`/srv/x402/x402-facilitator-rs/.env`)

```env
# Server
PORT=8080
NODE_ENV=production

# Database
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=x402_user
DATABASE_PASSWORD=<secure_password>
DATABASE_NAME=x402_facilitator

# Redis
REDIS_URL=redis://localhost:6379

# Networks
MAINNET_NETWORKS=base,optimism,arbitrum
TESTNET_NETWORKS=base-sepolia,optimism-sepolia

# Paymaster wallets (comma-separated private keys)
PAYMASTER_PRIVATE_KEYS=0x...,0x...

# RPC URLs
BASE_RPC_URL=https://...
OPTIMISM_RPC_URL=https://...

# Security
SECURITY_BAN_THRESHOLD=10
SECURITY_BAN_DURATION_MS=3600000
```

### Monitoring

#### Prometheus Metrics (`GET /metrics`)

Available metrics:

- `x402_requests_total` - Total requests by endpoint and status
- `x402_request_duration_seconds` - Request latency histogram
- `x402_verifications_total` - Verification attempts
- `x402_settlements_total` - Settlement attempts
- `x402_settlement_duration_seconds` - Settlement latency
- `x402_gas_used_total` - Total gas consumed by network

#### Health Check

```bash
curl http://localhost:8080/health
# {"status":"ok","service":"x402-facilitator","uptime":3600.5}
```

---

## Troubleshooting

### Common Issues

#### "Insufficient credits"
- Check merchant credit balance via dashboard
- Purchase more credits or use testnet for development

#### "Network not supported"
- Verify network name matches supported list
- Use `/supported` endpoint to see available networks

#### "Signature verification failed"
- Ensure correct EIP-712 domain parameters
- Verify token contract implements EIP-3009
- Check signature includes correct nonce format

#### "Session expired"
- Re-authenticate via SIWE
- Sessions expire after 7 days

### Logs

```bash
# Facilitator logs
tail -f /srv/x402/x402-facilitator-rs/logs/x402-facilitator.log

# NetPay-Web logs
pm2 logs netpay-web --lines 100

# Nginx access logs
tail -f /var/log/nginx/access.log
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01 | Initial Rust implementation |
| 1.1.0 | 2024-01 | Added SIWE authentication |
| 1.2.0 | 2024-01 | Flashblock support for Base/OP |
| 1.3.0 | 2024-01 | Credit system overhaul |

---

*Last updated: January 2025*
