# 💰 Paymaster Balance Management Guide

Complete guide for managing paymaster wallet balances using the X402 Facilitator tools.

---

## 🎯 Overview

The facilitator provides two ways to manage paymaster wallet balances:

1. **Interactive Mode**: `facilitator-tools.mjs` - User-friendly menu system
2. **CLI Mode**: `balance-paymaster.mjs` - Command-line interface with automation support

---

## 🚀 Quick Start - Interactive Mode (Recommended)

### Launch the Tool

```bash
cd /srv/x402/x402-facilitator
node scripts/facilitator-tools.mjs
```

### Menu Navigation

```
X402 FACILITATOR TOOLS
1. Network Management
2. Token Metadata
3. Paymaster Balances          ← Select this
4. Deploy Contracts
5. Merchant Management
6. Gas Statistics
0. Exit
```

### Balance Management Options

```
PAYMASTER BALANCE MANAGEMENT
1. Check Balances (View only)
2. Rebalance Paymaster Wallets
3. Add External Funds & Distribute    ← Use this to fund from external wallet
4. Consolidate to Single Wallet
0. Back to Main Menu
```

---

## 💵 Adding Funds from External Wallet

This is the primary way to fund your paymaster wallets from an external source.

### Step-by-Step Process

1. **Select Network**
   ```
   Available networks:
   1. Base Sepolia
   2. Ethereum Sepolia
   3. HyperEVM Testnet
   ...
   
   Select network: 1
   ```

2. **View Current Balances**
   ```
   Current Paymaster Wallets on Base Sepolia:
   [1] 0x7254...d49e: 0.001 ETH
   [2] 0x650a...6827: 0.002 ETH
   ...
   ```

3. **Enter External Private Key**
   ```
   Private key (with or without 0x): 0xYOUR_PRIVATE_KEY_HERE
   
   ✅ Funding Wallet Loaded:
      Address: 0x1234...5678
      Balance: 1.5 ETH
   ```

4. **Specify Amount to Distribute**
   ```
   Amount to distribute (max: 1.5 ETH): 0.16
   ```

5. **Review Distribution Plan**
   ```
   Distribution Plan:
     Total to distribute: 0.16 ETH
     Number of wallets: 16
     Per wallet: 0.01 ETH
     Estimated gas: ~0.007 ETH
     Remaining: ~1.333 ETH
   
   [1] 0x7254...d49e
       Current: 0.001 ETH
       After: 0.011 ETH (+0.01)
   ...
   ```

6. **Execute Distribution**
   ```
   Execute distribution? (yes/no) [no]: yes
   
   🚀 Executing Distribution...
   [1/16] Sending to wallet [1]
     📤 TX: 0xabc...
     ✅ Confirmed in block 12345678
   ...
   
   ✅ Success: 16
   ❌ Failed: 0
   ```

### Important Notes

- **Private Key Security**: The private key is only used in memory and never stored
- **Gas Buffer**: System automatically calculates gas costs with 20% buffer
- **Batch Transfers**: Uses batch contracts when available for gas savings
- **Dry Run**: Default mode shows preview without executing (select 'yes' to execute)

---

## ⚖️ Rebalancing Wallets

Redistributes funds evenly across all paymaster wallets.

### When to Rebalance

- Some wallets have significantly more/less than others
- After heavy usage on certain wallets
- To optimize wallet utilization

### Process

1. Select option 2: "Rebalance Paymaster Wallets"
2. Choose network
3. Review proposed distributions
4. Confirm execution

```
Proposed distributions:
  [1] Will send 0.05 ETH (has excess)
  [5] Needs 0.03 ETH
  [8] Already balanced
  
Execute transactions? (yes/no) [no]: yes
```

---

## 🏦 Consolidating Funds

Collect all funds from paymaster wallets into a single address.

### Use Cases

- Emergency fund recovery
- Moving to a new wallet system
- Collecting unused funds

### Process

1. Select option 4: "Consolidate to Single Wallet"
2. Choose network
3. Enter target address
4. Review consolidation plan
5. Confirm execution

```
Target address for consolidation: 0xYOUR_MAIN_WALLET

Wallet balances:
[1] 0x7254...d49e
    Balance: 0.05 ETH
    Will send: 0.0495 ETH (preserving gas)
...

Total to consolidate: 0.792 ETH
```

---

## 📊 Checking Balances

Simple balance viewer for all networks.

### Quick Check

```bash
# Interactive mode
node scripts/facilitator-tools.mjs
# Select: 3 → 1 → Choose Network

# Or use CLI mode
node scripts/balance-paymaster.mjs "Base Sepolia"
```

### Output

```
[01] 0x7254096Bd696EF9201F5866665Df5972DA24d49e: 0.0123 ETH
[02] 0x650a7e304C9875712AE2B67619Aa3927fa656827: 0.0145 ETH
...
[16] 0x3073819090B8FC26a627CAB85171fe0F47203E0b: 0.0198 ETH

Total: 0.2456 ETH
Average: 0.01535 ETH
```

---

## 🔧 CLI Mode (Advanced)

For automation and scripting, use the CLI mode directly.

### Balance Check

```bash
# Single network
node scripts/balance-paymaster.mjs "Base Sepolia"

# All networks
node scripts/balance-paymaster.mjs
```

### Rebalancing

```bash
# Dry run (preview only)
node scripts/balance-paymaster.mjs "Base Sepolia"

# Execute rebalancing
node scripts/balance-paymaster.mjs --execute "Base Sepolia"
```

### Consolidation

```bash
# Consolidate to target address
node scripts/balance-paymaster.mjs --consolidate=0xYOUR_ADDRESS --execute "Base Sepolia"
```

### Adding External Funds (CLI)

```bash
# Interactive mode with external funding
node scripts/balance-paymaster.mjs
# Then select option 3
```

---

## 💡 Best Practices

### Funding Strategy

1. **Initial Funding**: Use "Add External Funds" to distribute evenly
2. **Regular Checks**: Monitor balances weekly
3. **Rebalance**: When variance exceeds 50% of average
4. **Top-up**: Add funds when average drops below threshold

### Recommended Minimums

**Testnet:**
- Base Sepolia: 0.01 ETH per wallet
- Ethereum Sepolia: 0.01 ETH per wallet

**Mainnet:**
- Base: 0.05 ETH per wallet
- Ethereum: 0.1 ETH per wallet
- Optimism: 0.05 ETH per wallet

### Security

- Never commit private keys to version control
- Use environment variables for paymaster keys
- Test on testnet first
- Keep external funding wallet separate
- Monitor for unusual balance changes

---

## 🆘 Troubleshooting

### "No RPC configured"

**Solution:** Check `.env` file has correct RPC URL environment variable

```bash
# Example in .env
BASE_SEPOLIA_RPC=https://sepolia.base.org
ETHEREUM_SEPOLIA_RPC=https://ethereum-sepolia.publicnode.com
```

### "Invalid private key length"

**Solution:** Ensure private key is 64 hex characters (66 with 0x prefix)

```bash
# Correct formats:
0x1234567890abcdef... (66 chars total)
1234567890abcdef...   (64 chars, will add 0x automatically)
```

### "Insufficient balance"

**Solution:** The funding wallet doesn't have enough for distribution + gas

- Reduce distribution amount
- Add more funds to external wallet
- Check gas price isn't unusually high

### Failed Transactions

**Possible causes:**
- Network congestion (high gas prices)
- Insufficient gas limit
- RPC endpoint issues
- Nonce conflicts

**Solutions:**
- Wait and retry
- Use different RPC endpoint
- Check network status
- Increase gas limit buffer

---

## 📈 Monitoring

### Set Up Alerts

Monitor your paymaster wallets with automated checks:

```bash
# Add to crontab for daily checks
0 9 * * * cd /srv/x402/x402-facilitator && node scripts/balance-paymaster.mjs > /tmp/balance-check.log 2>&1
```

### Key Metrics to Track

1. **Total Balance**: Sum across all wallets
2. **Average Balance**: Should stay above minimum threshold
3. **Variance**: Large variance indicates need for rebalancing
4. **Burn Rate**: How fast funds are depleted (indicates usage)

---

## 🔗 Related Documentation

- [Facilitator Tools Overview](./FACILITATOR_TOOLS.md)
- [Fund Paymaster Wallets](../FUND_PAYMASTER_WALLETS.md)
- [Network Configuration](./config/networks.json)
- [Gas Tracking](../docs/GAS_TRACKING.md)

---

## ✅ Summary

| Task | Tool | Command |
|------|------|---------|
| Add funds from external wallet | Interactive | `facilitator-tools.mjs` → 3 → 3 |
| Check balances | Interactive | `facilitator-tools.mjs` → 3 → 1 |
| Rebalance wallets | Interactive | `facilitator-tools.mjs` → 3 → 2 |
| Consolidate funds | Interactive | `facilitator-tools.mjs` → 3 → 4 |
| CLI balance check | CLI | `balance-paymaster.mjs "Network"` |
| CLI rebalance | CLI | `balance-paymaster.mjs --execute "Network"` |
| CLI consolidate | CLI | `balance-paymaster.mjs --consolidate=0x... --execute` |

---

**Need Help?** Check the interactive help with `node scripts/facilitator-tools.mjs --help`
