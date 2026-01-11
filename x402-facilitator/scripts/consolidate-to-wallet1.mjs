#!/usr/bin/env node

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const GAS_LIMIT = 21000;

const NETWORKS = {
  'Base': {
    rpcEnv: 'BASE_RPC',
    symbol: 'ETH'
  },
  'HyperEVM': {
    rpcEnv: 'HYPEREVM_RPC',
    symbol: 'HYPE'
  },
  'OP Mainnet': {
    rpcEnv: 'OP_MAINNET_RPC',
    symbol: 'ETH'
  }
};

async function consolidateNetwork(networkName, config, targetAddress) {
  const rpcUrl = process.env[config.rpcEnv];
  if (!rpcUrl) {
    console.log(`\n⚠️  Skipping ${networkName} - no RPC configured (${config.rpcEnv})`);
    return;
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${networkName.toUpperCase()}`);
  console.log('═'.repeat(70));

  try {
    const provider = rpcUrl.startsWith('wss')
      ? new ethers.WebSocketProvider(rpcUrl)
      : new ethers.JsonRpcProvider(rpcUrl);

    const keys = process.env.PAYMASTER_PRIVATE_KEYS.split(',').map(k => k.trim());
    const wallets = keys.map(k => new ethers.Wallet(k, provider));

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    let totalConsolidated = 0n;

    for (let i = 1; i < wallets.length; i++) {  // Start from 1, skip wallet 0
      try {
        const balance = await provider.getBalance(wallets[i].address);
        
        if (balance === 0n) {
          console.log(`[${i + 1}/${wallets.length}] ${wallets[i].address.slice(0, 10)}... - Empty, skipping`);
          skippedCount++;
          continue;
        }

        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
        const maxGasCost = BigInt(GAS_LIMIT) * gasPrice * 2n;
        
        if (balance <= maxGasCost) {
          console.log(`[${i + 1}/${wallets.length}] ${wallets[i].address.slice(0, 10)}... - ${ethers.formatEther(balance)} ${config.symbol} (too low, skipping)`);
          skippedCount++;
          continue;
        }

        const amountToSend = balance - maxGasCost;
        
        console.log(`[${i + 1}/${wallets.length}] ${wallets[i].address.slice(0, 10)}... - Sending ${ethers.formatEther(amountToSend)} ${config.symbol}`);

        const tx = await wallets[i].sendTransaction({
          to: targetAddress,
          value: amountToSend,
          gasLimit: GAS_LIMIT,
        });

        console.log(`  📤 TX: ${tx.hash}`);
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
          console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
          successCount++;
          totalConsolidated += amountToSend;
        } else {
          console.log(`  ❌ Transaction failed`);
          failCount++;
        }
      } catch (error) {
        console.log(`[${i + 1}/${wallets.length}] ❌ Error: ${error.message.split('\n')[0]}`);
        failCount++;
      }

      if (i < wallets.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`${networkName} Summary:`);
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ❌ Failed: ${failCount}`);
    console.log(`  ⏭️  Skipped: ${skippedCount}`);
    console.log(`  💰 Total Consolidated: ${ethers.formatEther(totalConsolidated)} ${config.symbol}`);
    console.log('─'.repeat(70));

    if (provider instanceof ethers.WebSocketProvider) {
      await provider.destroy();
    }
  } catch (error) {
    console.log(`\n❌ Network error: ${error.message}`);
  }
}

async function main() {
  const keys = process.env.PAYMASTER_PRIVATE_KEYS.split(',').map(k => k.trim());
  const wallet1 = new ethers.Wallet(keys[0]);
  const TARGET_ADDRESS = wallet1.address;

  console.log('\n╔' + '═'.repeat(70) + '╗');
  console.log('║' + 'CONSOLIDATE TO WALLET #1'.padStart(42).padEnd(70) + '║');
  console.log('╚' + '═'.repeat(70) + '╝');
  console.log(`\nTarget Address: ${TARGET_ADDRESS} (Paymaster Wallet #1)`);
  console.log(`Networks: Base, HyperEVM, OP Mainnet\n`);

  for (const [networkName, config] of Object.entries(NETWORKS)) {
    await consolidateNetwork(networkName, config, TARGET_ADDRESS);
  }

  console.log('\n╔' + '═'.repeat(70) + '╗');
  console.log('║' + 'CONSOLIDATION COMPLETE'.padStart(41).padEnd(70) + '║');
  console.log('╚' + '═'.repeat(70) + '╝\n');
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
