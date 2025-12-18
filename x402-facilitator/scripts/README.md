# X402 Facilitator Scripts

Utility scripts for managing, monitoring, and testing the x402 payment facilitator.

## 🚀 Quick Start

### Interactive Tool (Recommended)
```bash
node facilitator-tools.mjs
```

**All utilities in one interactive menu:**
- Network Management
- Token Metadata Fetcher  
- Paymaster Balance Checker
- Contract Deployment
- Merchant Management
- Gas Statistics

### Testing
```bash
node test-suite.mjs              # Run all tests
node test-suite.mjs network      # Test network normalization
node test-suite.mjs validation   # Test validation errors
node test-suite.mjs signature    # Test EIP-712 signatures
```

Before using these scripts, ensure:
1. `.env` file is configured in `/srv/x402/x402-facilitator/`
2. Required environment variables are set
3. Scripts have execute permissions: `chmod +x scripts/*.sh`

### 📁 File Structure

```
scripts/
├── config/
│   └── networks.json          # Single source of truth (includes batch contracts)
├── facilitator-tools.mjs      # Unified interactive tool (NEW)
├── test-suite.mjs             # Consolidated test suite (NEW)
├── balance-paymaster.mjs      # Paymaster balance manager
├── init-database.sql          # Database schema
└── README.md                  # This file
```
## 📋 Quick Reference

### Unified Tools (Use These)
| Script | Purpose | Usage |
|--------|---------|-------|
| `facilitator-tools.mjs` | **All-in-one interactive utility** | `node facilitator-tools.mjs` |
| `test-suite.mjs` | **Consolidated test suite** | `node test-suite.mjs [test-name]` |
| `balance-paymaster.mjs` | Paymaster balance manager (CLI) | `node balance-paymaster.mjs [--execute] [network]` |

### Monitoring & Performance
| Script | Purpose | Usage |
|--------|---------|-------|
| `monitor-system.sh` | System health dashboard | `./monitor-system.sh` |
| `monitor-alerts.sh` | Alert on threshold violations | `./monitor-alerts.sh` |
| `quick-performance.sh` | Quick performance snapshot | `./quick-performance.sh` |
| `benchmark-performance.sh` | Comprehensive benchmarks | `./benchmark-performance.sh` |

### Security & Testing
| Script | Purpose | Usage |
|--------|---------|-------|
| `security-check.sh` | Security audit & malware scan | `./security-check.sh` |
| `test-sig.js` | Test EIP-712 signatures | `node test-sig.js` |
| `compare-settlement.js` | Compare facilitator performance | `node compare-settlement.js` |
| `test-flashblock-performance.sh` | Test flashblock optimization | `./test-flashblock-performance.sh` |

### Setup
| Script | Purpose | Usage |
|--------|---------|-------|
| `setup-monitoring.sh` | Configure automated monitoring | `./setup-monitoring.sh` |
| `get-token-metadata.mjs` | Get ERC-20 token info | `node get-token-metadata.mjs <address> <network>` |

---

## 📖 Detailed Documentation

### Merchant Management

#### `generate-merchant-v2.mjs`
Generate new merchant accounts with auth and deposit wallets.

```bash
# Generate new random merchant
node generate-merchant-v2.mjs

# Import existing auth wallet
node generate-merchant-v2.mjs 0x1234...abcd

# With business name
node generate-merchant-v2.mjs 0x1234...abcd "My Business"
```

**Output:**
- Auth wallet address (for API authentication)
- Deposit wallet address (for receiving funds)
- API key and webhook secret
- Database merchant ID

#### `update-merchant-tier.mjs`
Update rate limiting tiers for merchants.

**Available Tiers:**
- `free`: 60 verify/min, 20 settle/min
- `basic`: 120 verify/min, 40 settle/min
- `pro`: 300 verify/min, 100 settle/min
- `enterprise`: 1000 verify/min, 500 settle/min
- `custom`: Specify your own limits

```bash
# Upgrade to pro tier
node update-merchant-tier.mjs 0x1234...abcd pro

# Custom limits
node update-merchant-tier.mjs 0x1234...abcd custom 500 200 60
```

---

### Financial Operations

#### `balance-paymaster.mjs`
Manage paymaster wallet balances across multiple networks.

**NEW: Interactive Mode** (Recommended)
```bash
# Run without arguments for interactive menu
node balance-paymaster.mjs
```

**Interactive Menu:**
1. **Check Balances** - View wallet balances (read-only)
2. **Rebalance Wallets** - Distribute balances evenly across wallets
3. **Add External Funds** - Fund paymasters from external wallet
   - Enter private key interactively
   - Specify amount to distribute
   - Automatically splits across all paymaster wallets
4. **Consolidate** - Move all funds to single wallet

**Command-Line Mode** (for automation):
```bash
# Check specific network
node balance-paymaster.mjs "Base Sepolia"

# Execute rebalancing
node balance-paymaster.mjs --execute "Ethereum Sepolia"

# Consolidate all funds
node balance-paymaster.mjs --consolidate=0x1234...abcd --execute
```

**Features:**
- ✅ Interactive mode with guided prompts
- ✅ Add funds from any external wallet
- ✅ Automatic distribution across paymasters
- ✅ Dry-run mode by default for safety
- ✅ Multi-network support
- ✅ Gas-efficient batch transfers

#### `deploy-batch-contract.mjs`
Deploy BatchTransfer contracts for efficient multi-recipient transfers.

**NEW: Interactive Wallet Selection**
```bash
# Interactive mode (recommended)
node deploy-batch-contract.mjs
```

**Interactive Process:**
1. Select deployer wallet:
   - Use DEPLOYER_PRIVATE_KEY from .env
   - Enter private key manually
2. Choose network to deploy to
3. Confirm deployment details
4. Addresses auto-saved to `config/batch-contracts.json`

**Command-Line Mode:**
```bash
# Deploy to specific network
node deploy-batch-contract.mjs "Base Sepolia"

# Deploy to all networks
node deploy-batch-contract.mjs --all
```

**Benefits:**
- ✅ Interactive private key input (no need to store in .env)
- ✅ Save gas when funding multiple paymaster wallets
- ✅ Single transaction instead of multiple transfers
- ✅ Deployed addresses auto-saved and auto-loaded by other scripts

#### `view-gas-stats.mjs`
View detailed gas usage statistics from database.

```bash
# All time stats
node view-gas-stats.mjs

# Today only
node view-gas-stats.mjs --today

# Last 7 days
node view-gas-stats.mjs --days 7

# Specific network
node view-gas-stats.mjs --network base-sepolia

# Specific merchant
node view-gas-stats.mjs --merchant 1

# Detailed breakdown
node view-gas-stats.mjs --detailed
```

---

### Monitoring & Performance

#### `monitor-system.sh`
Comprehensive system health monitoring dashboard.

**Monitors:**
- CPU, Memory, Disk usage
- MySQL connections and queries
- Redis cache performance
- PM2 process status
- Transaction queue status

```bash
# Run once
./monitor-system.sh

# Auto-refresh every 30 seconds
watch -n 30 ./monitor-system.sh
```

**Environment Variables:**
```bash
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_HOST=localhost
REDIS_HOST=localhost
ALERT_MEMORY_THRESHOLD=80
ALERT_MYSQL_THRESHOLD=180
```

#### `monitor-alerts.sh`
Automated alerting system with multi-channel notifications.

**Alert Channels:**
- Slack webhooks
- Discord webhooks
- Email notifications
- Custom webhooks

```bash
# Run alert check
./monitor-alerts.sh

# Configure via environment
SLACK_WEBHOOK_URL=https://hooks.slack.com/... ./monitor-alerts.sh
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... ./monitor-alerts.sh
```

**Thresholds:**
```bash
ALERT_MEMORY_THRESHOLD=80        # Memory %
ALERT_CPU_THRESHOLD=90           # CPU %
ALERT_MYSQL_THRESHOLD=180        # MySQL connections
ALERT_DISK_THRESHOLD=85          # Disk %
ALERT_PENDING_TX=100             # Pending transactions
```

#### `quick-performance.sh`
Fast performance overview with minimal dependencies.

```bash
./quick-performance.sh

# Auto-refresh
watch -n 10 ./quick-performance.sh
```

**Shows:**
- API latency (5 sample requests)
- Database statistics
- Redis cache stats
- PM2 process health

#### `benchmark-performance.sh`
Comprehensive performance benchmarking suite.

```bash
# Test default facilitator
./benchmark-performance.sh

# Test specific facilitator
FACILITATOR_URL=http://localhost:3402 ./benchmark-performance.sh

# With API key for authenticated tests
TEST_API_KEY=your_key ./benchmark-performance.sh
```

**Tests:**
- Health endpoint (10 requests)
- Verify endpoint latency
- Settlement latency
- Concurrent request handling
- Error rates

---

### Security & Testing

#### `security-check.sh`
Comprehensive security audit and malware detection.

```bash
# Run security scan
./security-check.sh

# Save report
./security-check.sh > security-report.txt

# Continuous monitoring
watch -n 300 ./security-check.sh
```

**Checks:**
- Suspicious processes (cryptominers, backdoors)
- Unauthorized SSH attempts
- File integrity and permissions
- Network connections
- Environment security (.env exposure)
- Database security
- Open ports and firewall status

#### `test-sig.js`
Test EIP-712 signature generation and verification.

```bash
node test-sig.js
```

**Use Cases:**
- Debug settlement signature issues
- Verify EIP-712 implementation
- Test signature recovery
- Validate USDC EIP-3009 compatibility

#### `compare-settlement.js`
Compare performance across multiple facilitator instances.

```bash
node compare-settlement.js
```

**Tests:**
- Verify endpoint latency
- Settlement request/response time
- Side-by-side comparison
- Ranking by performance

**Configured Targets:**
- Local NetPay (localhost:80)
- PayAI facilitator
- NetPay production

#### `test-flashblock-performance.sh`
Analyze flashblock optimization impact on Base Sepolia.

```bash
./test-flashblock-performance.sh
```

**Expected Improvement:**
- Before: ~1.6s (standard polling)
- After: ~400-600ms (flashblock)
- 60-70% faster

---

### Setup

#### `setup-monitoring.sh`
One-time setup for automated monitoring cronjobs.

```bash
./setup-monitoring.sh
```

**Installs Cronjobs:**
- System monitoring every 5 minutes
- Alert checks every 2 minutes
- Log rotation daily

**Post-Setup:**
```bash
# Check cronjobs
crontab -l

# View logs
tail -f /var/log/x402-monitor.log
tail -f /var/log/x402-alerts.log
```

#### `get-token-metadata.mjs`
Retrieve ERC-20 token metadata from blockchain.

```bash
node get-token-metadata.mjs 0x036CbD53842c5426634e7929541eC2318f3dCF7e "Base Sepolia"
```

**Retrieves:**
- Token name, symbol, decimals
- EIP-712 domain (for USDC-like tokens)
- Version information
- Chain ID verification

---

## 🌐 Adding New Networks

### Interactive Method (Recommended)

The easiest way to add networks is using the interactive network manager:

```bash
cd /srv/x402/x402-facilitator/scripts
node manage-networks.mjs
```

**Features:**
- ✅ Add new networks with guided prompts
- ✅ Edit existing network configurations
- ✅ Remove networks
- ✅ List all configured networks
- ✅ Validate network configurations
- ✅ No code editing required!

**Menu Options:**
```
1. List all networks          - View all configured networks
2. Add new network            - Add a network interactively
3. Edit existing network      - Modify network settings
4. Remove network             - Delete a network
5. Validate configuration     - Check for configuration issues
0. Exit
```

### Example: Adding Arbitrum Sepolia

1. Run `node manage-networks.mjs`
2. Select option `2` (Add new network)
3. Enter the details:
   ```
   Network name: Arbitrum Sepolia
   Chain ID: 421614
   Gas token: ETH
   Explorer URL: https://sepolia.arbiscan.io
   Network type: testnet
   Environment variable: ARBITRUM_SEPOLIA_RPC
   ```
4. Add RPC URL to `.env`:
   ```bash
   ARBITRUM_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
   ```
5. Done! The network is now available in all scripts.

### Manual Method (Advanced)

To add support for a new blockchain network manually:

#### 1. Edit networks.json

Edit `/srv/x402/x402-facilitator/scripts/networks.json`:

```json
{
  "Arbitrum Sepolia": {
    "rpcUrl": "ARBITRUM_SEPOLIA_RPC",
    "chainId": 421614,
    "explorer": "https://sepolia.arbiscan.io",
    "gasToken": "ETH",
    "type": "testnet"
  }
}
```

#### 2. Add RPC URL to .env

Edit `/srv/x402/x402-facilitator/.env`:

```bash
# Add RPC URL for the network
ARBITRUM_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
# Or use WebSocket:
# ARBITRUM_SEPOLIA_RPC=wss://sepolia-rollup.arbitrum.io/rpc
```

#### 3. Deploy Batch Transfer Contract (Optional)

For gas-efficient multi-recipient transfers:

```bash
cd /srv/x402/x402-facilitator/scripts

# Interactive menu
node deploy-batch-contract.mjs

# Or deploy directly
node deploy-batch-contract.mjs "Arbitrum Sepolia"
```

The contract address will be saved to `batch-contracts.json` and automatically used by `balance-paymaster.mjs`.

#### 4. Validate Configuration

```bash
node manage-networks.mjs
# Select option 5 (Validate configuration)
```

#### 5. Test the Network

```bash
# Check balances on new network
node balance-paymaster.mjs "Arbitrum Sepolia"
```

### Network Configuration Reference

| Parameter | Description | Example |
|-----------|-------------|---------|
| Network Name | Human-readable name | `"Arbitrum Sepolia"` |
| RPC URL | HTTP(S) or WebSocket endpoint | `https://...` or `wss://...` |
| Chain ID | Network's chain ID | `421614` |
| Explorer | Block explorer URL | `https://sepolia.arbiscan.io` |
| Gas Token | Native token symbol | `ETH`, `BNB`, `HYPE` |

### Common Networks

#### Testnets
```bash
# Base Sepolia
CHAIN_ID=84532
EXPLORER=https://sepolia.basescan.org
GAS_TOKEN=ETH

# Arbitrum Sepolia  
CHAIN_ID=421614
EXPLORER=https://sepolia.arbiscan.io
GAS_TOKEN=ETH

# Polygon Mumbai
CHAIN_ID=80001
EXPLORER=https://mumbai.polygonscan.com
GAS_TOKEN=MATIC

# Optimism Sepolia
CHAIN_ID=11155420
EXPLORER=https://sepolia-optimistic.etherscan.io
GAS_TOKEN=ETH
```

#### Mainnets
```bash
# Base
CHAIN_ID=8453
EXPLORER=https://basescan.org
GAS_TOKEN=ETH

# Arbitrum
CHAIN_ID=42161
EXPLORER=https://arbiscan.io
GAS_TOKEN=ETH

# Optimism
CHAIN_ID=10
EXPLORER=https://optimistic.etherscan.io
GAS_TOKEN=ETH

# Polygon
CHAIN_ID=137
EXPLORER=https://polygonscan.com
GAS_TOKEN=MATIC
```

### Troubleshooting

**"No RPC URL configured" error:**
- Check network name matches exactly (case-sensitive)
- Verify env variable is set in `.env`
- Ensure `.env` is in `/srv/x402/x402-facilitator/` directory

**"Invalid RPC URL" error:**
- Test RPC endpoint with curl: `curl -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' <RPC_URL>`
- Verify WebSocket URLs start with `ws://` or `wss://`
- Check RPC provider is accessible from your server

**Batch contract deployment fails:**
- Ensure deployer wallet has gas tokens
- Verify RPC endpoint supports contract deployment
- Check contract isn't already deployed (saved in batch-contracts.json)

---

## 🔧 Requirements

### Node.js Scripts
- Node.js v18+
- npm packages: `ethers`, `mysql2`, `dotenv`
- `.env` file in `/srv/x402/x402-facilitator/`

### Bash Scripts
- curl, bc, date (for performance tests)
- mysql client (for database monitoring)
- redis-cli (for cache monitoring)
- pm2 (for process management)
- jq (for JSON parsing)

---

## 🔐 Environment Setup

All scripts load environment variables from `/srv/x402/x402-facilitator/.env`

**Required Variables:**
```bash
# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=x402_facilitator
DB_USER=root
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Blockchain RPCs (configure in networks.json via manage-networks.mjs)
BASE_SEPOLIA_RPC=https://... or wss://...
ETHEREUM_SEPOLIA_RPC=https://... or wss://...
HYPEREVM_TESTNET_RPC=wss://...

# Paymaster Wallets
PAYMASTER_PRIVATE_KEYS=0x...,0x...

# Optional: Deployer Key (or enter interactively)
DEPLOYER_PRIVATE_KEY=0x...

# Test Keys (for benchmarks)
# Use CLI flags (e.g. --private-key) or interactive prompts instead of storing PRIVATE_KEY in .env
TEST_API_KEY=your_api_key

# Alerts (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
ALERT_EMAIL=admin@example.com
```

**Note on Private Keys:**
- Scripts support interactive private key input or CLI flags (e.g. --private-key)
- Avoid storing sensitive keys in .env; prefer runtime entry or secure secret stores

---

## 📊 Common Workflows

### New Merchant Onboarding
```bash
# 1. Generate merchant
node generate-merchant-v2.mjs "Business Name"

# 2. Update tier if needed
node update-merchant-tier.mjs 0x... pro
```

### Daily Operations
```bash
# Morning check
./quick-performance.sh

# Check paymaster balances
node balance-paymaster.mjs

# View yesterday's gas usage
node view-gas-stats.mjs --today
```

### Performance Analysis
```bash
# Quick check
./quick-performance.sh

# Full benchmark
./benchmark-performance.sh

# Compare facilitators
node compare-settlement.js
```

### Security Audit
```bash
# Run full security scan
./security-check.sh

# Setup continuous monitoring
./setup-monitoring.sh

# Check alerts
tail -f /var/log/x402-alerts.log
```

---

## 🚨 Troubleshooting

### "Cannot read properties of undefined"
- Check `.env` file exists in parent directory
- Verify all required environment variables are set
- Scripts now auto-load from `/srv/x402/x402-facilitator/.env`

### "Permission denied"
```bash
chmod +x scripts/*.sh
```

### MySQL connection errors
- Verify MySQL is running: `systemctl status mysql`
- Check credentials in `.env`
- Test connection: `mysql -u root -p`

### Redis connection errors
- Verify Redis is running: `redis-cli ping`
- Check host/port in `.env`

### PM2 not found
```bash
npm install -g pm2
```

---

## 📝 Adding New Scripts

When adding new scripts:

1. Add comprehensive header documentation
2. Include usage examples
3. List required environment variables
4. Handle missing .env gracefully
5. Update this README
6. Make executable: `chmod +x script.sh`

**Template:**
```javascript
#!/usr/bin/env node

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║                    SCRIPT NAME                                    ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 * 
 * Brief description of what the script does.
 * 
 * USAGE:
 *   node script.mjs [options]
 * 
 * OPTIONS:
 *   --option    Description
 * 
 * EXAMPLES:
 *   node script.mjs
 * 
 * REQUIREMENTS:
 *   - List requirements
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });
```

---

## 📞 Support

For issues or questions:
1. Check script's built-in help: `node script.mjs --help`
2. Review script header documentation
3. Check logs: `/var/log/x402-*.log`
4. Review environment variables in `.env`

---

**Last Updated:** December 12, 2025
