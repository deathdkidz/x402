# Facilitator Tools - Unified Interactive Utility

All x402 facilitator utilities combined into one interactive tool with dynamic network configuration.

## 🚀 Quick Start

```bash
node scripts/facilitator-tools.mjs
```

## ✨ Features

### 1. **Network Management**
- View all configured networks (testnets & mainnets)
- Add new networks
- Edit existing networks (RPC, chain ID, explorer, batch contracts)
- Remove networks
- All changes update `networks.json`

### 2. **Token Metadata**
- Fetch ERC-20 metadata (name, symbol, decimals)
- Check EIP-712 support (for USDC and similar tokens)
- Automatically uses networks from `networks.json`
- Works with any ERC-20 token address

### 3. **Paymaster Balance Management** 🆕
Comprehensive paymaster wallet management with multiple operations:

#### a) Check Balances (View Only)
- View balances of all paymaster wallets
- Display total and average balances per network
- Quick overview of wallet funding status

#### b) Rebalance Paymaster Wallets
- Automatically balance funds across all paymaster wallets
- Target: Equal distribution of funds
- Supports dry-run mode (default) and execute mode
- Shows proposed distributions before execution

#### c) Add External Funds & Distribute
- **Fund from external private key** ✅
- Input any external wallet private key
- Distribute funds evenly across all paymaster wallets
- Gas cost estimation with buffer
- Batch transfer support (when available)
- Shows before/after balances for each wallet

#### d) Consolidate to Single Wallet
- Collect all funds from paymaster wallets
- Send to a single target address
- Preserves gas for transactions
- Useful for emergency fund recovery

### 4. **Deploy Contracts**
- Deploy BatchTransfer contracts to any network
- Saves deployed addresses to `networks.json`
- Check deployment status per network
- Interactive network selection

### 5. **Merchant Management**
- Create new merchants (with auto-generated wallets & API keys)
- Update merchant tiers (free, basic, pro, enterprise)
- List all merchants
- Database integration

### 6. **Gas Statistics**
- View gas usage statistics
- Filter by time period (today, last 7 days, all time)
- Filter by network
- Success/failure rates

## 📋 Configuration

All utilities now use **`scripts/config/networks.json`** as the single source of truth:

```json
{
  "Base Sepolia": {
    "rpcUrl": "BASE_SEPOLIA_RPC",
    "chainId": 84532,
    "explorer": "https://sepolia.basescan.org",
    "gasToken": "ETH",
    "type": "testnet",
    "batchContract": "0xe6158F16A2781241703cc8005229c8e1ADd866De"
  }
}
```

### Key Features:
- **Dynamic**: Add/edit networks without code changes
- **Integrated**: Batch contracts stored with network config
- **Consistent**: All scripts read from same source
- **Flexible**: RPC URLs reference .env variables

## 🔧 Individual Scripts (Still Available)

If you prefer command-line over interactive:

### Network Management
```bash
node scripts/manage-networks.mjs
```

### Token Metadata
```bash
node scripts/get-token-metadata.mjs <token_address> "<network_name>"
# Example
node scripts/get-token-metadata.mjs 0x036CbD53842c5426634e7929541eC2318f3dCF7e "Base Sepolia"
```

### Paymaster Balances
```bash
node scripts/balance-paymaster.mjs "<network_name>"
# Example
node scripts/balance-paymaster.mjs "Base Sepolia"
node scripts/balance-paymaster.mjs --execute "Base Sepolia"  # Actually rebalance
```

### Deploy Batch Contract
Use the interactive tool to deploy the BatchTransfer contract. You can select a deployer from configured paymaster keys or enter an external private key at deploy time.

```bash
# Interactive (recommended)
node scripts/facilitator-tools.mjs
# Select: 4. Deploy Contracts → choose network → select deployer or enter external key

# CLI automation: use `balance-paymaster.mjs` or custom scripts with your deploy key
```

### Merchant Management
```bash
# Create merchant
node scripts/generate-merchant-v2.mjs [private_key] [business_name]

# Update tier
node scripts/update-merchant-tier.mjs <auth_address> <tier>
```

### Gas Statistics
```bash
node scripts/view-gas-stats.mjs [--today] [--network <name>] [--days <n>]
```

## 🔄 Migration from Old Scripts

### Before (Hardcoded Networks)
```javascript
const NETWORKS = {
  'Base Sepolia': {
    rpcUrl: process.env.BASE_SEPOLIA_RPC,
    chainId: 84532,
  }
};
```

### After (Dynamic from JSON)
```javascript
import { NETWORKS_CONFIG } from './config/networks.json';
const rpcUrl = process.env[NETWORKS_CONFIG['Base Sepolia'].rpcUrl];
```

### Deprecated Files
- `scripts/config/batch-contracts.json` → Merged into `networks.json` (batchContract field)
- Individual network configs in scripts → Replaced by centralized `networks.json`

## 📦 Benefits

### 1. **Single Configuration Source**
- Add network once, available everywhere
- No more updating multiple scripts

### 2. **Consistent Network Names**
- Same network names across all tools
- Reduced errors from typos/format differences

### 3. **Batch Contract Integration**
- Batch contracts stored with network config
- Automatic availability checking
- Simplified deployment tracking

### 4. **Interactive + CLI**
- Interactive menu for exploration
- CLI flags for automation/scripting

### 5. **Better User Experience**
- Guided workflows
- Clear error messages
- Visual formatting

## 🛠️ Advanced Usage

### Add Network via CLI
Instead of interactive menu, you can manually edit `networks.json`:

```json
{
  "Arbitrum Sepolia": {
    "rpcUrl": "ARBITRUM_SEPOLIA_RPC",
    "chainId": 421614,
    "explorer": "https://sepolia.arbiscan.io",
    "gasToken": "ETH",
    "type": "testnet",
    "batchContract": null
  }
}
```

Then add to `.env`:
```bash
ARBITRUM_SEPOLIA_RPC=wss://arbitrum-sepolia.g.alchemy.com/v2/YOUR_KEY
```

### Automation Examples

```bash
# Check all network balances
for network in "Base Sepolia" "Ethereum Sepolia" "HyperEVM Testnet"; do
  node scripts/balance-paymaster.mjs "$network"
done

# Deploy to all testnets
node scripts/deploy-batch-contract.mjs --all --testnet

# Daily gas report
node scripts/view-gas-stats.mjs --today > daily-gas-report.txt
```

## 🎯 Best Practices

1. **Always use networks.json** - Don't hardcode network configs
2. **Test on testnet first** - Especially for deployments
3. **Keep .env secure** - RPC keys, private keys, DB passwords
4. **Backup networks.json** - Version control this file
5. **Use batch transfers** - Save gas when funding multiple wallets

## 🐛 Troubleshooting

### "Network not found"
- Check `networks.json` has the network
- Verify network name matches exactly (case-sensitive)

### "No RPC URL configured"
- Ensure `.env` has the RPC variable (e.g., `BASE_SEPOLIA_RPC`)
- Check the `rpcUrl` field in `networks.json` matches .env variable name

### "Batch contract not deployed"
- Use option 4 (Deploy Contracts) to deploy
- Or manually add address to `batchContract` field in `networks.json`

### Database connection errors
- Verify `.env` has correct DB credentials
- Check MySQL service is running: `systemctl status mysql`

## 📚 See Also

- [Network Management Guide](../docs/NETWORK_MANAGEMENT.md)
- [Batch Contract Deployment](../docs/BATCH_CONTRACT_DEPLOYMENT.md)
- [Merchant Management](../docs/MERCHANT_MANAGEMENT.md)
- [Main README](../README.md)
