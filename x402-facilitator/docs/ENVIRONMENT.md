# Environment Configuration

Complete reference for all environment variables used by the X402 Facilitator.

## Server Configuration

```env
# Service Information
SERVICE_NAME="Gastoken.ID Facilitator"
SERVICE_DESCRIPTION="Secure x402 payment facilitator"

# Server Ports
PORT=80                    # HTTP port
HTTPS_PORT=443            # HTTPS port
USE_HTTPS=true            # Enable HTTPS
SSL_CERT_PATH=/path/to/fullchain.pem
SSL_KEY_PATH=/path/to/privkey.pem

# Environment
NODE_ENV=production       # production | development
```

## Database Configuration

```env
# MySQL Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=x402_facilitator
DB_USER=root
DB_PASSWORD=your_password
```

## Redis Configuration

```env
# Redis Cache (required for rate limiting)
REDIS_URL=redis://localhost:6379
```

## Blockchain Configuration

```env
# Primary Network
NETWORK=base-sepolia      # base-sepolia | sepolia | bsc-testnet

# RPC URLs (at least one required per network)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
```

## Paymaster Configuration

```env
# Paymaster Private Keys (comma-separated for multiple paymasters)
# More paymasters = faster parallel settlement processing
PAYMASTER_PRIVATE_KEYS=0xkey1,0xkey2,0xkey3

# Example with single paymaster:
# PAYMASTER_PRIVATE_KEYS=0xa1f46be...

# Example with multiple paymasters for parallel processing:
# PAYMASTER_PRIVATE_KEYS=0xkey1,0xkey2,0xkey3,0xkey4,0xkey5
```

## Complete Example

```env
# Server
SERVICE_NAME="Gastoken.ID Facilitator"
SERVICE_DESCRIPTION="Secure x402 payment facilitator"
PORT=80
HTTPS_PORT=443
USE_HTTPS=true
SSL_CERT_PATH=/etc/letsencrypt/live/api.example.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/api.example.com/privkey.pem
NODE_ENV=production

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=x402_facilitator
DB_USER=root
DB_PASSWORD=your_secure_password

# Redis
REDIS_URL=redis://localhost:6379

# Blockchain
NETWORK=base-sepolia
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545

# Paymasters (5 wallets for parallel processing)
PAYMASTER_PRIVATE_KEYS=0xkey1,0xkey2,0xkey3,0xkey4,0xkey5
```

## Notes

- All private keys must be valid Ethereum private keys (64 hex characters with optional 0x prefix)
- At least one RPC URL must be configured for each network you want to support
- Redis is required for rate limiting and caching
- Use `.env.example` as a starting template
