# x402 Facilitator - API Key Model

## Overview

The x402 Facilitator provides a simplified API key model for easier integration by AI agents and developers.

**NOTE**: All facilitator API calls use JSON body. The x402 protocol headers (PAYMENT-REQUIRED, PAYMENT-SIGNATURE, etc.) are used between merchants and buyers, NOT for facilitator API calls.

**API Key Model:**
- No authentication/login required
- No merchant registration needed
- Simple API key + USD credits model
- Support for multi-token gas pricing (ETH, HYPE, etc.)
- AI-friendly `/help` endpoint

## Quick Start

### 1. Get an API Key

POST /account with a signed USDC transfer to the vault address:

```bash
curl -X POST https://api.netpay.id/account \
  -H "Content-Type: application/json" \
  -d '{
    "paymentSignature": {
      "authorization": {
        "from": "0xYourWallet...",
        "to": "0xVaultAddress...",
        "value": "10000000",
        "validAfter": "0",
        "validBefore": "1735776000",
        "nonce": "0x..."
      },
      "signature": "0x...",
      "network": "Base Sepolia",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    }
  }'
```

Response:
```json
{
  "success": true,
  "action": "create",
  "apiKey": "a1b2c3d4e5f6...",
  "balanceType": "testnet",
  "usdc": "10.000000",
  "transaction": "0x...",
  "message": "API key created. SAVE THIS KEY - it will not be shown again!"
}
```

### 2. Check Balance

```bash
curl -X POST https://api.netpay.id/account \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "balance"}'
```

### 3. Verify Payments

```bash
curl -X POST https://api.netpay.id/verify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentPayload": {
      "authorization": {...},
      "signature": "0x..."
    },
    "paymentRequirements": {
      "scheme": "exact",
      "network": "eip155:84532",
      ...
    }
  }'
```

### 4. Settle Payments

```bash
curl -X POST https://api.netpay.id/settle \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentPayload": {...},
    "paymentRequirements": {...}
  }'
```

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | Service info |
| GET | `/health` | No | Health check |
| GET | `/supported` | No | Supported networks |
| GET | `/help` | No | Complete API documentation |
| GET | `/account` | No | Account instructions |
| POST | `/account` | Varies | Create key, top-up, or query balance |
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
