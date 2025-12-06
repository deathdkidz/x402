# Multi-Paymaster Configuration Guide

## Overview

The x402 Facilitator supports **multiple paymaster wallets** to process settlement transactions in parallel. This dramatically improves throughput when handling many concurrent payment requests.

### Performance Impact

| Paymaster Wallets | Concurrent Settlements | Time for 20 Requests |
|-------------------|------------------------|----------------------|
| 1 wallet (default) | Sequential (queued) | ~5 minutes |
| 5 wallets | 5 parallel | ~1 minute |
| 10 wallets | 10 parallel | ~30 seconds |
| 20 wallets | 20 parallel | ~15 seconds |

## Configuration

### Single Wallet Mode (Default)

Use `FACILITATOR_PRIVATE_KEY` for backward compatibility:

```env
# .env file
FACILITATOR_PRIVATE_KEY=0x1234567890abcdef...
```

This runs in **sequential mode** - all settlements are queued per wallet.

### Multi-Wallet Mode (Recommended for Production)

Use `PAYMASTER_PRIVATE_KEYS` to enable parallel processing:

```env
# .env file
# Comma-separated list of private keys
PAYMASTER_PRIVATE_KEYS=0x1111111111111111111111111111111111111111111111111111111111111111,0x2222222222222222222222222222222222222222222222222222222222222222,0x3333333333333333333333333333333333333333333333333333333333333333

# Keep FACILITATOR_PRIVATE_KEY for backward compatibility (optional)
FACILITATOR_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111
```

**Important**: 
- Keys are comma-separated
- No spaces between keys
- Each key must be a valid 64-character hex string prefixed with `0x`
- When `PAYMASTER_PRIVATE_KEYS` is set, it overrides `FACILITATOR_PRIVATE_KEY`

## Wallet Selection Strategy

The facilitator uses **round-robin selection**:

```
Request 1 → Wallet 1
Request 2 → Wallet 2
Request 3 → Wallet 3
Request 4 → Wallet 1 (cycles back)
Request 5 → Wallet 2
...
```

This ensures:
- ✅ Even distribution of load across wallets
- ✅ Maximum parallelization (up to N wallets)
- ✅ No wallet is overloaded
- ✅ Automatic nonce management per wallet

## Setup Instructions

### Step 1: Generate Paymaster Wallets

Generate new Ethereum wallets for paymasters:

```bash
# Using Node.js
node -e "const { ethers } = require('ethers'); for(let i=0; i<5; i++) { const w = ethers.Wallet.createRandom(); console.log('Address:', w.address); console.log('Private Key:', w.privateKey); console.log('---'); }"
```

Or use any wallet generation tool (MetaMask, hardware wallet, etc).

### Step 2: Fund Paymaster Wallets

Each paymaster wallet needs **native gas tokens** (ETH, etc) to pay transaction fees:

**Recommended funding per wallet:**
- Base Sepolia (testnet): 0.1 ETH
- Base Mainnet: 0.05 ETH
- Ethereum Mainnet: 0.02 ETH

```bash
# Check balance
cast balance 0xYourPaymasterAddress --rpc-url https://sepolia.base.org

# Fund wallet (from your main wallet)
# Send native tokens to each paymaster address
```

### Step 3: Update .env File

```env
# Single wallet for testing
PAYMASTER_PRIVATE_KEYS=0xKEY1

# Multiple wallets for production (5 wallets for 5x parallelization)
PAYMASTER_PRIVATE_KEYS=0xKEY1,0xKEY2,0xKEY3,0xKEY4,0xKEY5

# Other required settings
SUPPORTED_NETWORKS=Base Sepolia,Base Mainnet
```

### Step 4: Restart Facilitator

```bash
cd /srv/x402/x402-facilitator
npm run build
pm2 restart x402-facilitator
```

### Step 5: Verify Initialization

Check logs to confirm wallets loaded:

```bash
pm2 logs x402-facilitator --lines 30
```

You should see:

```
✅ Loaded paymaster wallet 1: 0x1111...
✅ Loaded paymaster wallet 2: 0x2222...
✅ Loaded paymaster wallet 3: 0x3333...
✅ Loaded paymaster wallet 4: 0x4444...
✅ Loaded paymaster wallet 5: 0x5555...
📦 Paymaster pool initialized: 5 wallet(s) ready for parallel settlement
⚡ Multi-wallet mode: Can process 5 settlements in parallel
```

## Monitoring

### Check Pool Status

The facilitator logs which wallet is used for each settlement:

```
Using paymaster wallet: 0x1111... (Wallet 1)
Using paymaster wallet: 0x2222... (Wallet 2)
Using paymaster wallet: 0x3333... (Wallet 3)
```

### Monitor Gas Balances

Create a monitoring script:

```bash
#!/bin/bash
# monitor-paymasters.sh

WALLETS=(
  "0x1111111111111111111111111111111111111111"
  "0x2222222222222222222222222222222222222222"
  "0x3333333333333333333333333333333333333333"
)

RPC_URL="https://sepolia.base.org"

for wallet in "${WALLETS[@]}"; do
  balance=$(cast balance $wallet --rpc-url $RPC_URL)
  echo "Wallet $wallet: $balance ETH"
done
```

Set up alerts when balances drop below threshold:

```bash
# Add to crontab
*/30 * * * * /path/to/monitor-paymasters.sh | mail -s "Paymaster Balances" admin@example.com
```

## Best Practices

### 1. **Start with 5 Wallets**
Good balance between parallelization and management overhead.

### 2. **Secure Private Keys**
- Never commit `.env` to git
- Use environment variable injection in production
- Consider using secrets management (Vault, AWS Secrets Manager)

### 3. **Fund Adequately**
- Monitor balances regularly
- Set up low-balance alerts
- Keep at least 100 transactions worth of gas per wallet

### 4. **Scale Gradually**
```
Production Load → Recommended Wallets
1-10 settlements/min → 1-2 wallets
10-50 settlements/min → 5 wallets
50-100 settlements/min → 10 wallets
100+ settlements/min → 20+ wallets
```

### 5. **Use Different Wallets per Network**
If supporting multiple networks, consider separate wallet pools:

```env
# Base Sepolia paymasters
BASE_SEPOLIA_PAYMASTERS=0xKEY1,0xKEY2,0xKEY3

# Ethereum Sepolia paymasters
ETH_SEPOLIA_PAYMASTERS=0xKEY4,0xKEY5,0xKEY6
```

*(Future feature - currently uses same pool for all networks)*

## Troubleshooting

### Wallet Load Failed

```
Failed to load paymaster wallet 1: invalid private key
```

**Solution**: Check private key format (must start with `0x` and be 66 chars total)

### No Parallelization

```
⚠️ Single-wallet mode: Settlements will be sequential
```

**Solution**: Add `PAYMASTER_PRIVATE_KEYS` to `.env` file

### Nonce Errors

```
Transaction nonce conflict. System is processing previous transaction.
```

**Cause**: Multiple requests hitting same wallet simultaneously (unlikely with round-robin)

**Solution**: Add more wallets to pool

### Insufficient Funds

```
Merchant has insufficient funds for gas
```

**Solution**: Fund paymaster wallets with native gas tokens

## Security Considerations

### Private Key Storage

**Development:**
```env
# .env file (gitignored)
PAYMASTER_PRIVATE_KEYS=0xKEY1,0xKEY2
```

**Production (Docker):**
```bash
docker run -e PAYMASTER_PRIVATE_KEYS="0xKEY1,0xKEY2" x402-facilitator
```

**Production (Systemd):**
```ini
[Service]
Environment="PAYMASTER_PRIVATE_KEYS=0xKEY1,0xKEY2"
```

**Production (AWS/Secrets Manager):**
```bash
export PAYMASTER_PRIVATE_KEYS=$(aws secretsmanager get-secret-value --secret-id x402-paymasters --query SecretString --output text)
```

### Wallet Rotation

To rotate a compromised wallet:

1. Generate new wallet
2. Fund new wallet
3. Update `PAYMASTER_PRIVATE_KEYS` (remove old, add new)
4. Restart facilitator
5. Drain old wallet to safe address

```env
# Before
PAYMASTER_PRIVATE_KEYS=0xOLD1,0xOLD2,0xCOMPROMISED3

# After
PAYMASTER_PRIVATE_KEYS=0xOLD1,0xOLD2,0xNEW3
```

No downtime required!

## FAQ

**Q: Can I add/remove wallets without downtime?**  
A: Yes! Update `.env` and `pm2 restart x402-facilitator`. Takes ~2 seconds.

**Q: Do all wallets need the same balance?**  
A: No, but recommended for even distribution. Monitor individually.

**Q: What happens if one wallet runs out of gas?**  
A: That settlement fails with "insufficient funds" error. Other wallets continue working.

**Q: Can I use hardware wallets?**  
A: Not directly. Hardware wallets require manual signing. Use hot wallets for automated settlements.

**Q: How many wallets can I add?**  
A: No hard limit, but practical limit is ~20-50 wallets. Beyond that, diminishing returns.

**Q: Does this work with the database paymaster system?**  
A: No, this env-based approach replaces the database approach. Simpler and more reliable.

## Migration from Database Paymasters

If you previously used the `paymaster_wallets` table:

1. Export addresses and keys from database
2. Add to `PAYMASTER_PRIVATE_KEYS` in `.env`
3. Restart facilitator
4. Optionally drop `paymaster_wallets` table

The database approach is deprecated in favor of environment-based configuration.

---

**Updated**: December 6, 2025  
**Version**: 1.0 - Environment-based multi-paymaster support
