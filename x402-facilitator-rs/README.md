# x402 Facilitator (Rust)

Fast, reliable, and cheap payment facilitator service built in Rust.

## Overview

This facilitator enables gasless EIP-3009 (transferWithAuthorization) token transfers. Users sign payment authorizations off-chain, and the facilitator submits them on-chain, paying gas fees from merchant credit balances.

**NOTE**: All facilitator API calls use JSON body. The x402 protocol headers (PAYMENT-REQUIRED, PAYMENT-SIGNATURE, etc.) are used between merchants and buyers, NOT for facilitator API calls.

## Features

- **Multi-Token Support**: ERC-3009 (transferWithAuthorization) and ERC-2612 (permit + transferFrom)
- **Multi-Network**: Base, Ethereum, Optimism, HyperEVM + testnets
- **Separate Testnet/Mainnet Balances**: Credits tracked separately for test and production use
- **Network Enable/Disable**: Toggle networks without deleting configuration
- **Strategy Pattern**: Extensible architecture for adding new token standards
- **External Configuration**: TOML-based config for networks and tokens (no code changes needed)
- **Flashblock Optimization**: Sub-second confirmations on supported networks
- **Redis Caching**: Fast nonce lookup and merchant cache
- **Prometheus Metrics**: Built-in metrics endpoint
- **API Key Authentication**: Simple Bearer token auth with credit-based billing
- **Credit Purchase Tracking**: Full audit trail of all credit purchases and settlements

## Quick Start

```bash
# Install dependencies
cargo build --release

# Copy environment template
cp .env.example .env

# Configure your settings
nano .env

# Run the service
cargo run --release
```

## Configuration

### Environment Variables

Key environment variables (see `.env.example` for full list):

```bash
# Paymaster wallets (comma-separated private keys)
PAYMASTER_PRIVATE_KEYS=0x...

# Database
DB_HOST=localhost
DB_USER=x402_user
DB_PASSWORD=your_password
DB_DATABASE=x402_facilitator

# Redis
REDIS_URL=redis://127.0.0.1:6379

# Networks (RPC URLs)
BASE_RPC=wss://base-mainnet.g.alchemy.com/v2/YOUR_KEY
ETHEREUM_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

### External Config (Optional)

For advanced configuration, create TOML files in the `config/` directory:

- `config/networks.toml` - Network and token definitions
- `config/fees.toml` - Credit system and fee settings

Networks can be enabled/disabled without deletion:

```toml
[[networks]]
name = "Base"
chain_id = 8453
enabled = true  # Set to false to disable
# ...
```

See `config/` for examples and [ADDING_NETWORKS_AND_TOKENS.md](docs/ADDING_NETWORKS_AND_TOKENS.md) for detailed guide.

## Architecture

```
src/
├── main.rs           # Entry point
├── config/           # Configuration module
│   ├── mod.rs        # Main config
│   └── external.rs   # TOML config loader
├── strategies/       # Transfer strategy pattern
│   ├── mod.rs        # Strategy trait & factory
│   ├── types.rs      # Unified types
│   ├── erc3009.rs    # ERC-3009 implementation
│   └── erc2612.rs    # ERC-2612 implementation
├── services/         # Business logic
│   ├── settlement.rs # Settlement service
│   ├── verification.rs
│   └── ...
├── routes/           # HTTP handlers
├── middleware/       # Auth, rate limiting
└── types/            # Data types
```

## Transfer Types

### ERC-3009 (transferWithAuthorization)

Direct gasless transfers. The payer signs an EIP-712 authorization which the facilitator submits.

```
Payer signs → Facilitator submits → Token transfers
```

### ERC-2612 (permit + transferFrom)

Two-step process using permit approval:

```
Payer signs permit → Facilitator: permit() + transferFrom() → Token transfers
```

The forwarder contract (`contracts/X402Forwarder.sol`) executes both steps atomically.

## Database

Initialize the database:

```bash
sudo mysql < scripts/schema.sql
sudo mysql x402_facilitator < scripts/schema_multi_token.sql
```

## Contracts

### X402Forwarder

Access-controlled forwarder contract for ERC-2612 tokens:

- Executes `permit()` + `transferFrom()` atomically
- Single-transfer design (no batching for reliability)
- Pausable with emergency controls
- Reentrancy protected

Deploy with Foundry:

```bash
cd contracts
forge create X402Forwarder --constructor-args $OWNER_ADDRESS $USDC_ADDRESS
```

## API Endpoints

### Core Endpoints

- `POST /verify` - Verify a payment authorization
- `POST /settle` - Execute a settlement
- `GET /supported` - List supported networks (with CAIP-2)
- `GET /help` - x402 v2 protocol documentation (public, no auth)
- `GET /health` - Health check
- `GET /metrics` - Prometheus metrics

### Account Endpoints

- `POST /account` - Create API key with USDC payment or query account
  - Create: `{ "paymentSignature": {...} }`
  - Top-up: `{ "paymentSignature": {...}, "apiKey": "existing_key" }`
  - Balance: `{ "action": "balance" }` (with Authorization header)
  - Metrics: `{ "action": "metrics" }` (with Authorization header)

### Request Format

All endpoints use JSON body:

```http
POST /verify HTTP/1.1
Authorization: Bearer x402_pk_live_abc123
Content-Type: application/json

{
  "paymentPayload": {
    "authorization": {
      "from": "0x...",
      "to": "0x...",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1735776000",
      "nonce": "0x..."
    },
    "signature": "0x..."
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "eip155:84532",
    "asset": "0x...",
    "payTo": "0x...",
    "maxAmountRequired": "1000000",
    "resource": "/api",
    "description": "API access",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 60
  }
}
```

## Supported Networks

| Network | CAIP-2 | Chain ID | Type |
|---------|--------|----------|------|
| Base | `eip155:8453` | 8453 | Mainnet |
| Ethereum | `eip155:1` | 1 | Mainnet |
| Optimism | `eip155:10` | 10 | Mainnet |
| HyperEVM | `eip155:998` | 998 | Mainnet |
| Base Sepolia | `eip155:84532` | 84532 | Testnet |
| Sepolia | `eip155:11155111` | 11155111 | Testnet |

Networks can be enabled/disabled in `config/networks.toml` without deleting them.

## Credit System

### Separate Balances

API keys have separate balances for testnet and mainnet:

- **Mainnet Balance**: Used for settlements on production networks (Base, Ethereum, etc.)
- **Testnet Balance**: Used for settlements on test networks (Base Sepolia, Sepolia, etc.)

When purchasing credits, the balance type is determined by which network the payment comes from:
- Payment from Base → Credits added to mainnet balance
- Payment from Base Sepolia → Credits added to testnet balance

### Balance Response

```json
{
  "balance": 1000,
  "mainnet_balance": 750,
  "testnet_balance": 250
}
```

### Credit Tracking

All credit purchases are recorded with:
- Transaction hash
- Amount paid
- Credits received
- Network (mainnet/testnet)
- Payer address
- Timestamp

## Database Migrations

After updating, run any new migrations:

```bash
sudo mysql x402_facilitator < scripts/migrations/003_separate_testnet_mainnet_balance.sql
```

## Documentation

- [ADDING_NETWORKS_AND_TOKENS.md](docs/ADDING_NETWORKS_AND_TOKENS.md) - How to add new networks/tokens
- [QUICKSTART.md](docs/QUICKSTART.md) - Getting started guide
- [ENVIRONMENT.md](docs/ENVIRONMENT.md) - Environment variable reference
- [SECURITY.md](docs/SECURITY.md) - Security considerations
- [REDIS.md](docs/REDIS.md) - Redis configuration

## License

MIT
