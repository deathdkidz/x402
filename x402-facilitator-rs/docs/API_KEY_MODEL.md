# x402 Facilitator v2.0 - API Key Model

## Overview

The x402 Facilitator implements the **x402 v2 standard** with a simplified API key model for easier integration by AI agents and developers.

**x402 v2 Features:**
- Standardized headers: `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`, `PAYMENT-VERSION`
- Base64 encoded headers (except `PAYMENT-VERSION`)
- CAIP-2 network identifiers (`eip155:<chainId>`)
- `accepts` array in 402 responses

**API Key Model:**
- No authentication/login required
- No merchant registration needed
- Simple API key + USD credits model
- Support for multi-token gas pricing (ETH, HYPE, etc.)
- AI-friendly `/help` endpoint

## Quick Start

### 1. Get an API Key

```bash
# Create a new API key with $10 initial credits
curl -X POST https://pay.netpay.app/credits \
  -H "Content-Type: application/json" \
  -d '{"amount": 10}'
```

Response:
```json
{
  "success": true,
  "apiKey": "x402_pk_live_abc123...",
  "info": {
    "balance": 10.0,
    "totalTransactions": 0,
    "successRate": 0,
    "isActive": true,
    "expiresAt": "2026-01-01T00:00:00Z"
  },
  "message": "API key created. IMPORTANT: Save this key securely - it won't be shown again!"
}
```

### 2. Check Balance

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" https://pay.netpay.app/api/credits/balance
```

### 3. Verify Payments (x402 v2 Headers)

```bash
# Option 1: Using x402 v2 headers
curl -X POST https://pay.netpay.app/verify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "PAYMENT-VERSION: 2" \
  -H "PAYMENT-SIGNATURE: $(echo '{"authorization":{...},"signature":"0x..."}' | base64)"

# Option 2: Using JSON body
curl -X POST https://pay.netpay.app/verify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "x402Version": 2,
    "paymentPayload": {...},
    "paymentRequirements": {"network": "eip155:8453", ...}
  }'
```

### 4. Settle Payments

```bash
curl -X POST https://pay.netpay.app/settle \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "PAYMENT-VERSION: 2" \
  -H "PAYMENT-SIGNATURE: $(echo '{"authorization":{...},"signature":"0x..."}' | base64)"
```

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | Service info |
| GET | `/health` | No | Health check |
| GET | `/networks` | No | Supported networks (with CAIP-2) |
| GET | `/help` | No | x402 v2 protocol documentation |
| GET | `/api/credits/balance` | Yes | Check balance |
| GET | `/api/transactions` | Yes | Transaction history |
| POST | `/verify` | Yes | Verify payment signature |
| POST | `/settle` | Yes | Execute settlement |

## Pricing

- **Service Fee:** $0.001 per settlement
- **Gas Cost:** Actual blockchain gas converted to USD at real-time prices
- **Typical Total:** $0.002 - $0.01 per settlement depending on network

## Supported Networks (CAIP-2)

### Mainnet
- **Base** (`eip155:8453`) - Native: ETH
- **Ethereum** (`eip155:1`) - Native: ETH
- **OP Mainnet** (`eip155:10`) - Native: ETH
- **HyperEVM** (`eip155:998`) - Native: HYPE

### Testnet
- **Base Sepolia** (Chain ID: 84532)
- **Ethereum Sepolia** (Chain ID: 11155111)
- **OP Sepolia** (Chain ID: 11155420)
- **HyperEVM Testnet** (Chain ID: 998)

## API Key Management

### Creating a New Key

```json
POST /credits
{
  "amount": 10.0,          // USD credits to purchase (required)
  "email": "user@example.com"  // Optional - for future key recovery
}
```

### Adding Credits to Existing Key

```json
POST /credits
{
  "amount": 5.0,
  "apiKey": "existing_api_key"
}
```

### Checking Balance

```
GET /credits/{api_key}
```

Response:
```json
{
  "success": true,
  "balance": 9.994,
  "balanceFormatted": "$9.9940",
  "estimatedSettlementsRemaining": 1665,
  "info": {...},
  "recentTransactions": [...]
}
```

## Credit Ledger

Each settlement creates two ledger entries:
1. **service_fee**: Fixed $0.001 per settlement
2. **gas_cost**: Variable based on actual gas used

Example entries:
```json
[
  {
    "type": "purchase",
    "amount": 10.0,
    "balanceBefore": 0,
    "balanceAfter": 10.0,
    "description": "Initial credit purchase"
  },
  {
    "type": "service_fee",
    "amount": -0.001,
    "balanceBefore": 10.0,
    "balanceAfter": 9.999,
    "description": "Settlement service fee"
  },
  {
    "type": "gas_cost",
    "amount": -0.005,
    "balanceBefore": 9.999,
    "balanceAfter": 9.994,
    "description": "Gas: 0.00002 ETH @ $2500.00/ETH"
  }
]
```

## Multi-Token Gas Pricing

The facilitator supports different native tokens per network:

| Network | Native Token | Price Source |
|---------|--------------|--------------|
| Base, Ethereum, OP | ETH | CoinMarketCap |
| HyperEVM | HYPE | CoinMarketCap |

Gas costs are calculated as:
```
gas_cost_usd = gas_used × gas_price × native_token_price_usd
```

## Error Handling

All errors return JSON with `error` and `message` fields:

```json
{
  "error": "INSUFFICIENT_CREDITS",
  "message": "Not enough USD credits for the operation"
}
```

Common errors:
- `UNAUTHORIZED` - Missing or invalid API key
- `INSUFFICIENT_CREDITS` - Need to add more credits
- `INVALID_SIGNATURE` - EIP-3009 signature verification failed
- `NONCE_USED` - This payment has already been settled
- `EXPIRED` - Authorization has expired

## Database Schema

Run the migration:
```bash
sudo mysql < scripts/schema_v2_api_keys.sql
```

Tables:
- `api_keys` - API key records with USD balances
- `transactions` - Settlement transactions
- `credit_purchases` - Credit purchase records
- `credit_ledger` - Audit log of all credit movements
- `native_token_prices` - Cached token prices

## Migration from v1

If you have existing merchants, you'll need to:
1. Create new API keys for each merchant
2. Transfer credit balances
3. Update client integrations to use new auth model

The old merchant/admin endpoints have been removed:
- `/merchant/*` - Removed
- `/admin/*` - Removed
- SIWE authentication - Removed
- Session management - Removed
