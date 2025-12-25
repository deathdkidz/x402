# x402 Facilitator (Rust)

Fast, reliable, and cheap x402 payment facilitator service built in Rust.

## Features

- **Multi-Token Support**: ERC-3009 (transferWithAuthorization) and ERC-2612 (permit + transferFrom)
- **Multi-Network**: Base, Ethereum, Optimism, HyperEVM + testnets
- **Strategy Pattern**: Extensible architecture for adding new token standards
- **External Configuration**: TOML-based config for networks and tokens
- **Flashblock Optimization**: Sub-second confirmations on supported networks
- **Redis Caching**: Fast nonce lookup and merchant cache
- **Prometheus Metrics**: Built-in metrics endpoint
- **Webhook Support**: Real-time transaction notifications

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

See `config/` for examples.

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

- `POST /verify` - Verify a payment authorization
- `POST /settle` - Execute a settlement
- `GET /health` - Health check
- `GET /metrics` - Prometheus metrics

## License

MIT
