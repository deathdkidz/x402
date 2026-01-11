#!/usr/bin/env node

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const TARGET_ADDRESS = '0xc4784E798EbCa3898f4317a8365a19a2494A1860';
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
    rpcEnv: 'OPTIMISM_RPC',
    symbol: 'ETH'
  }
};

async function consolidateNetwork(networkName, config) {
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

    for (let i = 0; i < wallets.length; i++) {
      try {
        // Get fresh balance and gas price
        const balance = await provider.getBalance(wallets[i].address);
        
        if (balance === 0n) {
          console.log(`[${i + 1}/${wallets.length}] ${wallets[i].address.slice(0, 10)}... - Empty, skipping`);
          skippedCount++;
          continue;
        }

        // Get current gas price with buffer
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
        
        // Use 2x gas price as buffer for safety
        const maxGasCost = BigInt(GAS_LIMIT) * gasPrice * 2n;
        
        if (balance <= maxGasCost) {
          console.log(`[${i + 1}/${wallets.length}] ${wallets[i].address.slice(0, 10)}... - ${ethers.formatEther(balance)} ${config.symbol} (too low, skipping)`);
          skippedCount++;
          continue;
        }

        const amountToSend = balance - maxGasCost;
        
        console.log(`[${i + 1}/${wallets.length}] ${wallets[i].address.slice(0, 10)}... - Sending ${ethers.formatEther(amountToSend)} ${config.symbol}`);

        const tx = await wallets[i].sendTransaction({
          to: TARGET_ADDRESS,
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
        console.log(`[${i + 1}/${wallets.length}] ❌ Error: ${error.message}`);
        failCount++;
      }

      // Small delay between transactions
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
  console.log('\n╔' + '═'.repeat(70) + '╗');
  console.log('║' + 'CONSOLIDATE ALL PAYMASTER FUNDS'.padStart(45).padEnd(70) + '║');
  console.log('╚' + '═'.repeat(70) + '╝');
  console.log(`\nTarget Address: ${TARGET_ADDRESS}`);
  console.log(`Networks: Base, HyperEVM, OP Mainnet\n`);

  for (const [networkName, config] of Object.entries(NETWORKS)) {
    await consolidateNetwork(networkName, config);
  }

  console.log('\n╔' + '═'.repeat(70) + '╗');
  console.log('║' + 'CONSOLIDATION COMPLETE'.padStart(41).padEnd(70) + '║');
  console.log('╚' + '═'.repeat(70) + '╝\n');
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
