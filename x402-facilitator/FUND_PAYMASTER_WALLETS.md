# 💰 Fund Paymaster Wallets Guide

## Overview

You now have **16 paymaster wallets** that need to be funded with gas tokens (ETH) on each network where you want to process payments.

---

## Wallet Addresses

Your 16 paymaster wallets:

1. `0x7254096Bd696EF9201F5866665Df5972DA24d49e`
2. `0x650a7e304C9875712AE2B67619Aa3927fa656827`
3. `0xa87C6592D975FEc68660cDfBd8c71c9AEbC42dD8`
4. `0x7965d677a28D3584E009A76bFe096256e653a57D`
5. `0x88c2B9F5103EeBf594423dBc731663cE6363fDCE`
6. `0x462896Ac9EC00955C154395B09DD50a466D7951c`
7. `0xBFac609B0f5551749E605c7c4c29eCC5d5D97a2f`
8. `0xf4E28Ad3D5bA417D9efc4BE814b647dD732d5986`
9. `0x01Bc7fb22D37b7444d85074456281EBef6F17a83`
10. `0xeEc831Ff43ae73b95f085ef35254aA503DC64Fe3`
11. `0xAD5cb02686DC751956dE812d9e189Bf32B590912`
12. `0x00EDEed36c2F316C8F4EB83c1feDdF42e108b131`
13. `0x0fC45e8465ed2BD76B560adBFAA0a47705F9df0d`
14. `0x8d4D3010a640FD3ab97e328DB0FFc1b78E3Da3c3`
15. `0x7866795DC0bC424cF95032E9865beF30DffD69eA`
16. `0x3073819090B8FC26a627CAB85171fe0F47203E0b`

---

## Recommended Funding Amounts

### Testnet (for testing)
- **Base Sepolia:** 0.01 ETH per wallet (16 × 0.01 = 0.16 ETH total)
- **Ethereum Sepolia:** 0.01 ETH per wallet (16 × 0.01 = 0.16 ETH total)

### Mainnet (production)
- **Base:** 0.05 ETH per wallet (16 × 0.05 = 0.8 ETH total)
- **Ethereum:** 0.1 ETH per wallet (16 × 0.1 = 1.6 ETH total)

**Total Mainnet Funding:** ~2.4 ETH (~$8,500 at $3,500/ETH)

---

## Funding Methods

### Option 1: Manual Transfer (Recommended for Production)

Send ETH to each wallet address from your main wallet:

```
Network: Base Sepolia
Amount: 0.01 ETH each
Total: 0.16 ETH

Recipients:
0x7254096Bd696EF9201F5866665Df5972DA24d49e
0x650a7e304C9875712AE2B67619Aa3927fa656827
... (repeat for all 16)
```

### Option 2: Batch Transfer Script (Faster)

We'll create a script to fund all wallets at once.

**Install script dependencies:**
```bash
cd /srv/x402/x402-facilitator
npm install --save-dev ethers
```

**Create funding script:**

Save as `scripts/fund-paymasters.mjs`:

```javascript
import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const PAYMASTER_ADDRESSES = [
  '0x7254096Bd696EF9201F5866665Df5972DA24d49e',
  '0x650a7e304C9875712AE2B67619Aa3927fa656827',
  '0xa87C6592D975FEc68660cDfBd8c71c9AEbC42dD8',
  '0x7965d677a28D3584E009A76bFe096256e653a57D',
  '0x88c2B9F5103EeBf594423dBc731663cE6363fDCE',
  '0x462896Ac9EC00955C154395B09DD50a466D7951c',
  '0xBFac609B0f5551749E605c7c4c29eCC5d5D97a2f',
  '0xf4E28Ad3D5bA417D9efc4BE814b647dD732d5986',
  '0x01Bc7fb22D37b7444d85074456281EBef6F17a83',
  '0xeEc831Ff43ae73b95f085ef35254aA503DC64Fe3',
  '0xAD5cb02686DC751956dE812d9e189Bf32B590912',
  '0x00EDEed36c2F316C8F4EB83c1feDdF42e108b131',
  '0x0fC45e8465ed2BD76B560adBFAA0a47705F9df0d',
  '0x8d4D3010a640FD3ab97e328DB0FFc1b78E3Da3c3',
  '0x7866795DC0bC424cF95032E9865beF30DffD69eA',
  '0x3073819090B8FC26a627CAB85171fe0F47203E0b',
];

const NETWORKS = {
  'Base Sepolia': {
    rpcUrl: process.env.BASE_SEPOLIA_RPC,
    amount: '0.01', // ETH per wallet
  },
  'Ethereum Sepolia': {
    rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC,
    amount: '0.01',
  },
  'Base': {
    rpcUrl: process.env.BASE_RPC,
    amount: '0.05',
  },
  'Ethereum': {
    rpcUrl: process.env.ETHEREUM_RPC,
    amount: '0.1',
  },
};

async function fundWallets(networkName, networkConfig, funderPrivateKey) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Funding wallets on ${networkName}`);
  console.log('='.repeat(70));

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const funder = new ethers.Wallet(funderPrivateKey, provider);
  
  console.log(`Funder address: ${funder.address}`);
  
  const balance = await provider.getBalance(funder.address);
  console.log(`Funder balance: ${ethers.formatEther(balance)} ETH`);
  
  const amountPerWallet = ethers.parseEther(networkConfig.amount);
  const totalNeeded = amountPerWallet * BigInt(PAYMASTER_ADDRESSES.length);
  
  console.log(`Amount per wallet: ${networkConfig.amount} ETH`);
  console.log(`Total needed: ${ethers.formatEther(totalNeeded)} ETH`);
  
  if (balance < totalNeeded) {
    console.log(`❌ Insufficient balance. Need ${ethers.formatEther(totalNeeded)} ETH, have ${ethers.formatEther(balance)} ETH`);
    return;
  }

  console.log(`\nFunding ${PAYMASTER_ADDRESSES.length} wallets...`);
  
  for (let i = 0; i < PAYMASTER_ADDRESSES.length; i++) {
    const address = PAYMASTER_ADDRESSES[i];
    
    try {
      const tx = await funder.sendTransaction({
        to: address,
        value: amountPerWallet,
      });
      
      console.log(`[${i + 1}/16] Funding ${address}...`);
      console.log(`   Tx: ${tx.hash}`);
      
      await tx.wait();
      console.log(`   ✅ Confirmed`);
      
    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}`);
    }
  }
  
  console.log(`\n✅ Funding complete for ${networkName}`);
}

async function main() {
  const funderPrivateKey = process.argv[2];
  
  if (!funderPrivateKey) {
    console.error('Usage: node scripts/fund-paymasters.mjs <FUNDER_PRIVATE_KEY>');
    console.error('\nExample:');
    console.error('node scripts/fund-paymasters.mjs 0xYOUR_PRIVATE_KEY');
    process.exit(1);
  }

  const networkName = process.argv[3];
  
  if (networkName) {
    // Fund specific network
    const networkConfig = NETWORKS[networkName];
    if (!networkConfig) {
      console.error(`Unknown network: ${networkName}`);
      console.error('Available networks:', Object.keys(NETWORKS).join(', '));
      process.exit(1);
    }
    
    await fundWallets(networkName, networkConfig, funderPrivateKey);
  } else {
    // Fund all networks
    console.log('Funding all networks...');
    
    for (const [name, config] of Object.entries(NETWORKS)) {
      await fundWallets(name, config, funderPrivateKey);
    }
  }
}

main().catch(console.error);
```

**Usage:**

```bash
# Fund all networks at once
node scripts/fund-paymasters.mjs 0xYOUR_FUNDER_PRIVATE_KEY

# Fund specific network only
node scripts/fund-paymasters.mjs 0xYOUR_FUNDER_PRIVATE_KEY "Base Sepolia"
node scripts/fund-paymasters.mjs 0xYOUR_FUNDER_PRIVATE_KEY "Ethereum Sepolia"
node scripts/fund-paymasters.mjs 0xYOUR_FUNDER_PRIVATE_KEY "Base"
node scripts/fund-paymasters.mjs 0xYOUR_FUNDER_PRIVATE_KEY "Ethereum"
```

### Option 3: Get Testnet ETH (Free)

For testnet wallets, use faucets:

**Base Sepolia Faucet:**
- https://www.alchemy.com/faucets/base-sepolia
- Request 0.1 ETH per day

**Ethereum Sepolia Faucet:**
- https://www.alchemy.com/faucets/ethereum-sepolia
- https://sepoliafaucet.com/
- Request 0.5 ETH per day

You'll need to request from the faucet for each wallet address (16 times per network).

---

## Check Wallet Balances

Use the existing balance script:

```bash
cd /srv/x402/x402-facilitator
node scripts/balance-paymaster.mjs
```

**Expected output:**
```
======================================================================
Network: Base Sepolia (ETH)
======================================================================
[1] 0x7254096Bd696EF9201F5866665Df5972DA24d49e: 0.01 ETH
[2] 0x650a7e304C9875712AE2B67619Aa3927fa656827: 0.01 ETH
...
Total: 0.16 ETH across 16 wallets
```

---

## Gas Cost Estimation

**Average settlement gas cost:**
- ERC-3009 transfer: ~50,000 gas
- Base network: ~0.00001 ETH ($0.035)
- Ethereum network: ~0.001 ETH ($3.50)

**Number of settlements per wallet:**
- 0.01 ETH on Base: ~1,000 settlements
- 0.01 ETH on Ethereum: ~10 settlements
- 0.05 ETH on Base: ~5,000 settlements
- 0.1 ETH on Ethereum: ~100 settlements

**With 16 wallets:**
- Base: 80,000 settlements (5,000 × 16)
- Ethereum: 1,600 settlements (100 × 16)

---

## Monitoring & Refilling

### Set up low balance alerts

Create `scripts/check-low-balance.mjs`:

```javascript
import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const THRESHOLD_ETH = '0.005'; // Alert if below 0.005 ETH

async function checkBalances() {
  const privateKeys = process.env.PAYMASTER_PRIVATE_KEYS.split(',');
  const networks = [
    { name: 'Base Sepolia', rpc: process.env.BASE_SEPOLIA_RPC },
    { name: 'Ethereum Sepolia', rpc: process.env.ETHEREUM_SEPOLIA_RPC },
    { name: 'Base', rpc: process.env.BASE_RPC },
    { name: 'Ethereum', rpc: process.env.ETHEREUM_RPC },
  ];

  const threshold = ethers.parseEther(THRESHOLD_ETH);
  let lowBalanceCount = 0;

  for (const network of networks) {
    const provider = new ethers.JsonRpcProvider(network.rpc);
    
    for (let i = 0; i < privateKeys.length; i++) {
      const wallet = new ethers.Wallet(privateKeys[i], provider);
      const balance = await provider.getBalance(wallet.address);
      
      if (balance < threshold) {
        console.log(`⚠️ LOW BALANCE: ${network.name} - Wallet ${i + 1} (${wallet.address}): ${ethers.formatEther(balance)} ETH`);
        lowBalanceCount++;
      }
    }
  }

  if (lowBalanceCount === 0) {
    console.log('✅ All wallets have sufficient balance');
  } else {
    console.log(`\n⚠️ ${lowBalanceCount} wallet(s) need refilling`);
  }
}

checkBalances().catch(console.error);
```

**Run daily via cron:**
```bash
# Add to crontab
0 9 * * * cd /srv/x402/x402-facilitator && node scripts/check-low-balance.mjs >> logs/balance-check.log 2>&1
```

---

## Production Recommendations

1. **Start with testnet:** Fund Base Sepolia and Ethereum Sepolia first to test
2. **Monitor costs:** Track gas usage for first 100 settlements
3. **Batch refills:** Refill all wallets when any drops below 25% capacity
4. **Use hardware wallet:** Store main funds in hardware wallet, transfer to paymasters as needed
5. **Automate monitoring:** Set up alerts for low balances
6. **Budget planning:** Estimate monthly gas costs based on transaction volume

**Example monthly budget:**
- 10,000 settlements/month on Base: ~$350/month gas
- 1,000 settlements/month on Ethereum: ~$3,500/month gas
- **Total:** ~$3,850/month

---

## Next Steps

1. ✅ Fund testnet wallets (Base Sepolia + Ethereum Sepolia)
2. ✅ Test settlement on testnet
3. ✅ Monitor gas usage and costs
4. ✅ Fund mainnet wallets when ready for production
5. ✅ Set up automated balance monitoring

**⚠️ Security Warning:** Never commit private keys to git. Keep `.env` file secure and backed up in a safe location.
