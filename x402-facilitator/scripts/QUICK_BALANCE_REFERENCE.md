# 🎯 Quick Reference: Funding Paymaster Wallets from External Key

## One-Line Summary
Use **facilitator-tools.mjs → Option 3 → Option 3** to fund paymaster wallets from any external private key.

---

## Quick Steps

```bash
# Step 1: Launch tool
cd /srv/x402/x402-facilitator
node scripts/facilitator-tools.mjs

# Step 2: Navigate menu
Press 3  # Paymaster Balance Management
Press 3  # Add External Funds & Distribute

# Step 3: Follow prompts
- Select network (1-8)
- Enter external private key
- Enter amount to distribute
- Review plan
- Type "yes" to execute
```

---

## What It Does

1. ✅ Accepts any external wallet private key
2. ✅ Shows funding wallet balance
3. ✅ Calculates equal distribution per paymaster wallet
4. ✅ Estimates gas costs automatically (with 20% buffer)
5. ✅ Shows before/after balances for each wallet
6. ✅ Executes batch or individual transfers
7. ✅ Confirms each transaction
8. ✅ Shows success/failure summary

---

## Example

```bash
$ node scripts/facilitator-tools.mjs

╔══════════════════════════════════════════════════════════════════╗
║                 X402 FACILITATOR TOOLS                           ║
╚══════════════════════════════════════════════════════════════════╝

1. Network Management
2. Token Metadata
3. Paymaster Balance Management
4. Deploy Contracts
5. Merchant Management
6. Gas Statistics
0. Exit

Select option: 3

╔══════════════════════════════════════════════════════════════════╗
║              PAYMASTER BALANCE MANAGEMENT                        ║
╚══════════════════════════════════════════════════════════════════╝

Loaded 16 paymaster wallet(s)

1. Check Balances (View only)
2. Rebalance Paymaster Wallets
3. Add External Funds & Distribute    ← SELECT THIS
4. Consolidate to Single Wallet
0. Back to Main Menu

Select option: 3

Available networks:
1. Base Sepolia
2. Ethereum Sepolia
3. HyperEVM Testnet
4. Base
5. Ethereum
6. HyperEVM
7. OP Sepolia
8. OP Mainnet

Select network: 1

════════════════════════════════════════════════════════════════════
Current Paymaster Wallets on Base Sepolia:
════════════════════════════════════════════════════════════════════

[1] 0x7254096Bd696EF9201F5866665Df5972DA24d49e: 0.001 ETH
[2] 0x650a7e304C9875712AE2B67619Aa3927fa656827: 0.002 ETH
[3] 0xa87C6592D975FEc68660cDfBd8c71c9AEbC42dD8: 0.001 ETH
... (13 more wallets)

──────────────────────────────────────────────────────────────────
Enter funding wallet details:
──────────────────────────────────────────────────────────────────

Private key (with or without 0x): 0x1234567890abcdef...

✅ Funding Wallet Loaded:
   Address: 0xABCD1234...
   Balance: 1.5 ETH

Amount to distribute (max: 1.5 ETH): 0.16

──────────────────────────────────────────────────────────────────
Distribution Plan:
  Total to distribute: 0.16 ETH
  Number of wallets: 16
  Per wallet: 0.01 ETH
  Estimated gas: ~0.007 ETH
  Remaining: ~1.333 ETH
──────────────────────────────────────────────────────────────────
  [1] 0x7254096Bd696EF9201F5866665Df5972DA24d49e
      Current: 0.001 ETH
      After: 0.011 ETH (+0.01)
  [2] 0x650a7e304C9875712AE2B67619Aa3927fa656827
      Current: 0.002 ETH
      After: 0.012 ETH (+0.01)
  ... (14 more wallets)
──────────────────────────────────────────────────────────────────

Execute distribution? (yes/no) [no]: yes

🚀 Executing Distribution...

[1/16] Sending to wallet [1]
  To: 0x7254096Bd696EF9201F5866665Df5972DA24d49e
  Amount: 0.01 ETH
  📤 TX: 0xabc123...
  ✅ Confirmed in block 12345678

[2/16] Sending to wallet [2]
  To: 0x650a7e304C9875712AE2B67619Aa3927fa656827
  Amount: 0.01 ETH
  📤 TX: 0xdef456...
  ✅ Confirmed in block 12345679

... (14 more transactions)

════════════════════════════════════════════════════════════════════
Distribution Complete!
  ✅ Success: 16
  ❌ Failed: 0
════════════════════════════════════════════════════════════════════

Press Enter to continue...
```

---

## Other Options Available

### Option 1: Check Balances (View Only)
Just view current balances without making changes.

### Option 2: Rebalance Paymaster Wallets
Redistribute funds evenly between existing paymaster wallets (no external funding needed).

### Option 4: Consolidate to Single Wallet
Collect all funds from paymaster wallets into one address (emergency recovery).

---

## Security

✅ **Safe**: Private key only used in memory, never written to disk
✅ **Preview**: Shows full plan before execution
✅ **Confirmation**: Requires explicit "yes" to execute
✅ **Validation**: Checks key format and balance before proceeding

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| "Invalid private key length" | Must be 64 hex chars (or 66 with 0x) |
| "Funding wallet has zero balance" | Add funds to external wallet first |
| "Insufficient balance" | Reduce distribution amount or add more funds |
| "No RPC configured" | Check `.env` has correct RPC URL |

---

## See Also

- **Full Guide**: [scripts/BALANCE_MANAGEMENT_GUIDE.md](BALANCE_MANAGEMENT_GUIDE.md)
- **Tool Overview**: [scripts/FACILITATOR_TOOLS.md](FACILITATOR_TOOLS.md)
- **Original Guide**: [FUND_PAYMASTER_WALLETS.md](../FUND_PAYMASTER_WALLETS.md)
