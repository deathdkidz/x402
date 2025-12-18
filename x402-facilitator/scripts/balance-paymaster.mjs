#!/usr/bin/env node
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

// Help text
const HELP_TEXT = `
╔═══════════════════════════════════════════════════════════════════╗
║                  PAYMASTER BALANCE MANAGER                        ║
╚═══════════════════════════════════════════════════════════════════╝

⚠️  RECOMMENDED: Use 'node facilitator-tools.mjs' for interactive mode
   This script is for CLI automation and scripting.

Manage paymaster wallet balances across multiple networks.

USAGE:
  node balance-paymaster.mjs [OPTIONS] [NETWORK]

MODES:
  1. Balance Check & Rebalancing (default)
     - Checks wallet balances
     - Rebalances if difference > threshold
     
  2. Fund Consolidation
     - Consolidates all funds to a single wallet
     - Use: --consolidate=<ADDRESS>
     
  3. Add External Funds (Interactive)
     - Add funds from external wallet
     - Distribute across paymaster wallets
     - Run without arguments for interactive mode

OPTIONS:
  --execute                    Execute transactions (default is dry-run)
  --consolidate=<ADDRESS>      Consolidate all funds to target address
  --help                       Show this help message

NETWORK:
  - Specify network name (e.g., "Base Sepolia", "Ethereum", "BSC")
  - If omitted, checks all configured networks or shows interactive menu

EXAMPLES:
  # Interactive mode (recommended)
  node balance-paymaster.mjs

  # Check balances (all networks, dry-run)
  node balance-paymaster.mjs "Ethereum Sepolia"

  # Rebalance specific network (execute)
  node balance-paymaster.mjs --execute "Base Sepolia"

  # Consolidate funds (execute)
  node balance-paymaster.mjs --consolidate=0x1234... --execute "Ethereum Sepolia"

`;

// Configuration
// ============================================================================
// CONFIGURATION - Networks
// ============================================================================
// Networks are now managed via networks.json
// To add/edit/remove networks, use: node manage-networks.mjs
// ============================================================================

// Load network configurations from JSON
let NETWORKS_CONFIG = {};
let RPC_URLS = {};
let GAS_TOKENS = {};
let ALL_NETWORKS = [];

try {
  const networksPath = join(__dirname, 'config', 'networks.json');
  const networksData = fs.readFileSync(networksPath, 'utf8');
  NETWORKS_CONFIG = JSON.parse(networksData);
  
  // Build RPC_URLS and GAS_TOKENS from networks.json
  Object.entries(NETWORKS_CONFIG).forEach(([name, config]) => {
    RPC_URLS[name] = process.env[config.rpcUrl]; // Get RPC from env variable
    GAS_TOKENS[name] = config.gasToken;
    ALL_NETWORKS.push(name);
  });
  
  console.log(`📡 Loaded ${ALL_NETWORKS.length} network(s) from networks.json`);
} catch (error) {
  console.error('❌ Error loading networks.json:', error.message);
  console.log('   Run: node manage-networks.mjs to configure networks');
  process.exit(1);
}

const PAYMASTER_PRIVATE_KEYS = process.env.PAYMASTER_PRIVATE_KEYS.split(',').map(k => k.trim());

// ============================================================================
// CONFIGURATION - Rebalancing Parameters
// ============================================================================
const REBALANCE_THRESHOLD = process.env.REBALANCE_THRESHOLD || '0.01'; // Default 0.01 ETH difference
const MIN_BALANCE_TO_KEEP = process.env.MIN_BALANCE_TO_KEEP || '0.005'; // Keep at least 0.005 ETH in source wallet
const USE_BATCHING = process.env.USE_BATCHING !== 'false'; // Enable batching by default
const GAS_LIMIT_SIMPLE_TRANSFER = 200000; // Standard ETH transfer gas limit

// Simple batch transfer contract ABI (if deployed on network)
const BATCH_TRANSFER_ABI = [
  'function batchTransfer(address[] recipients, uint256[] amounts) payable',
];

// ============================================================================
// Load batch transfer contracts from networks.json
// These contracts enable gas-efficient multi-recipient transfers
// Deploy to new networks using: node facilitator-tools.mjs (option 4)
// ============================================================================
let BATCH_CONTRACTS = {};
Object.entries(NETWORKS_CONFIG).forEach(([name, config]) => {
  if (config.batchContract) {
    BATCH_CONTRACTS[name] = config.batchContract;
  }
});
console.log(`📋 Loaded batch contracts for ${Object.keys(BATCH_CONTRACTS).length} network(s)`);

async function checkBalances(network) {
  const rpcUrl = RPC_URLS[network];
  
  // Skip networks without RPC configured
  if (!rpcUrl) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Network: ${network}`);
    console.log('='.repeat(70));
    console.log(`⚠️  Skipped: No RPC URL configured`);
    return null;
  }
  
  // Auto-detect provider type (WebSocket or HTTP)
  const provider = rpcUrl.startsWith('wss://') || rpcUrl.startsWith('ws://')
    ? new ethers.WebSocketProvider(rpcUrl)
    : new ethers.JsonRpcProvider(rpcUrl);
  
  const gasToken = GAS_TOKENS[network] || 'ETH';
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Network: ${network} (${gasToken})`);
  console.log('='.repeat(70));
  
  const balances = [];
  
  for (let i = 0; i < PAYMASTER_PRIVATE_KEYS.length; i++) {
    const wallet = new ethers.Wallet(PAYMASTER_PRIVATE_KEYS[i], provider);
    const balance = await provider.getBalance(wallet.address);
    const balanceFormatted = ethers.formatEther(balance);
    
    balances.push({
      index: i + 1,
      address: wallet.address,
      balance: balance,
      balanceFormatted: balanceFormatted,
      wallet: wallet,
    });
    
    console.log(`[${i + 1}] ${wallet.address}: ${balanceFormatted} ${gasToken}`);
  }
  
  return { network, gasToken, provider, balances };
}

async function rebalanceIfNeeded(networkData, dryRun = true) {
  const { network, gasToken, provider, balances } = networkData;
  
  // Sort by balance (highest first)
  balances.sort((a, b) => Number(b.balance - a.balance));
  
  const highest = balances[0];
  const lowest = balances[balances.length - 1];
  const difference = highest.balance - lowest.balance;
  const differenceFormatted = ethers.formatEther(difference);
  // Per-network overrides if present in networks.json
  const networkConfig = NETWORKS_CONFIG[network] || {};
  const threshold = networkConfig.rebalanceThreshold
    ? ethers.parseEther(String(networkConfig.rebalanceThreshold))
    : ethers.parseEther(REBALANCE_THRESHOLD);
  const minKeep = networkConfig.minBalanceToKeep
    ? ethers.parseEther(String(networkConfig.minBalanceToKeep))
    : ethers.parseEther(MIN_BALANCE_TO_KEEP);
  
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Balance Analysis:`);
  console.log(`  Highest: [${highest.index}] ${highest.balanceFormatted} ${gasToken}`);
  console.log(`  Lowest:  [${lowest.index}] ${lowest.balanceFormatted} ${gasToken}`);
  console.log(`  Difference: ${differenceFormatted} ${gasToken}`);
  console.log(`  Threshold: ${networkConfig.rebalanceThreshold || REBALANCE_THRESHOLD} ${gasToken}`);
  console.log('─'.repeat(70));
  
  if (difference < threshold) {
    console.log(`✓ Balances are well distributed (difference < threshold)`);
    return;
  }
  
  console.log(`⚠️  Rebalancing needed! (difference >= threshold)`);
  
  // Calculate average target balance
  const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0n);
  const targetBalance = totalBalance / BigInt(balances.length);
  const targetFormatted = ethers.formatEther(targetBalance);
  
  console.log(`\nTarget balance per wallet: ${targetFormatted} ${gasToken}`);
  console.log(`\nProposed distributions:`);
  
  const distributions = [];
  
  for (const wallet of balances) {
    const diff = wallet.balance - targetBalance;
    const diffFormatted = ethers.formatEther(diff > 0n ? diff : -diff);
    
    if (diff > minKeep) {
      // This wallet has excess and can distribute
      const amountToDistribute = diff;
      console.log(`  [${wallet.index}] Will send ${diffFormatted} ${gasToken} (has excess)`);
      distributions.push({
        from: wallet,
        amount: amountToDistribute,
        type: 'distribute',
      });
    } else if (diff < 0n) {
      // This wallet needs funds
      console.log(`  [${wallet.index}] Needs ${diffFormatted} ${gasToken}`);
      distributions.push({
        to: wallet,
        amount: -diff,
        type: 'receive',
      });
    } else {
      console.log(`  [${wallet.index}] Already balanced`);
    }
  }
  
  if (dryRun) {
    console.log(`\n⚠️  DRY RUN MODE - No transactions will be sent`);
    console.log(`   Run with --execute flag to perform actual rebalancing`);
    return;
  }
  
  // Execute rebalancing
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Executing Rebalancing...`);
  console.log('='.repeat(70));
  
  const receivers = distributions.filter(d => d.type === 'receive');
  const senders = distributions.filter(d => d.type === 'distribute');
  
  if (senders.length === 0 || receivers.length === 0) {
    console.log(`\nNo rebalancing needed (no senders or receivers)`);
    return;
  }
  
  // Check if we can use batching (multiple receivers from single sender)
  const canBatch = USE_BATCHING && senders.length === 1 && receivers.length > 1;
  
  if (canBatch) {
    console.log(`\n📦 Using batch transfer (${receivers.length} recipients in 1 transaction)`);
    await executeBatchTransfer(senders[0], receivers, gasToken, provider, network);
  } else {
    console.log(`\n📤 Using individual transfers (${senders.length} sender(s), ${receivers.length} receiver(s))`);
    await executeIndividualTransfers(senders, receivers, gasToken, provider);
  }
  
  console.log(`\n✓ Rebalancing complete!`);
}

// Prompt for input
function question(rl, query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Add external funds to paymaster wallets
async function addExternalFunds(networkData, dryRun = true, rl = null) {
  const { network, gasToken, provider, balances } = networkData;
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`💵 Add External Funds & Distribute`);
  console.log('═'.repeat(70));
  console.log(`Network: ${network}`);
  
  // Create readline interface only if not provided (for backward compatibility)
  const needsOwnRl = !rl;
  if (needsOwnRl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  
  try {
    console.log(`\nCurrent Paymaster Wallets:`);
    balances.forEach((b, i) => {
      console.log(`  [${i + 1}] ${b.address}: ${b.balanceFormatted} ${gasToken}`);
    });
    
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Enter funding wallet details:`);
    console.log('─'.repeat(70));
    
    const privateKey = await question(rl, '\nPrivate key (with or without 0x): ');
    
    if (!privateKey) {
      console.log('\n❌ Private key is required');
      if (needsOwnRl) rl.close();
      return;
    }
    
    // Format and validate private key
    const formattedKey = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
    if (formattedKey.length !== 66) {
      console.log('\n❌ Invalid private key length (should be 64 hex characters)');
      if (needsOwnRl) rl.close();
      return;
    }
    
    // Create wallet
    const fundingWallet = new ethers.Wallet(formattedKey, provider);
    const fundingBalance = await provider.getBalance(fundingWallet.address);
    const fundingBalanceFormatted = ethers.formatEther(fundingBalance);
    
    console.log(`\n✅ Funding Wallet Loaded:`);
    console.log(`   Address: ${fundingWallet.address}`);
    console.log(`   Balance: ${fundingBalanceFormatted} ${gasToken}`);
    
    if (fundingBalance === 0n) {
      console.log(`\n❌ Funding wallet has zero balance`);
      if (needsOwnRl) rl.close();
      return;
    }
    
    // Ask how much to distribute
    console.log(`\n${'─'.repeat(70)}`);
    const amountStr = await question(rl, `Amount to distribute (max: ${fundingBalanceFormatted} ${gasToken}): `);
    
    if (!amountStr) {
      console.log('\n❌ Amount is required');
      if (needsOwnRl) rl.close();
      return;
    }
    
    let totalToDistribute;
    try {
      totalToDistribute = ethers.parseEther(amountStr);
    } catch (error) {
      console.log('\n❌ Invalid amount format');
      if (needsOwnRl) rl.close();
      return;
    }
    
    // Calculate distribution
    const perWalletAmount = totalToDistribute / BigInt(balances.length);
    const perWalletFormatted = ethers.formatEther(perWalletAmount);
    
    // Prepare batch transfer data for gas estimation
    const recipients = balances.map(b => b.address);
    const amounts = balances.map(() => perWalletAmount);
    
    // Estimate gas costs (check if batch contract is available first)
    const batchContractAddress = BATCH_CONTRACTS[network];
    let gasEstimate;
    let totalGasCost;
    let useBatch = false;
    
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
    
    if (batchContractAddress && balances.length > 1) {
      // Try to estimate using batch contract
      try {
        const batchContract = new ethers.Contract(
          batchContractAddress,
          BATCH_TRANSFER_ABI,
          fundingWallet
        );
        
        gasEstimate = await batchContract.batchTransfer.estimateGas(recipients, amounts, {
          value: totalToDistribute,
        });
        
        totalGasCost = gasEstimate * gasPrice;
        useBatch = true;
        console.log(`\n💡 Batch contract available - using optimized gas estimation`);
      } catch (error) {
        console.log(`\n⚠️  Batch contract estimation failed, using individual transfer estimate`);
        gasEstimate = BigInt(GAS_LIMIT_SIMPLE_TRANSFER) * BigInt(balances.length);
        totalGasCost = gasEstimate * gasPrice;
      }
    } else {
      // Use individual transfer estimation
      gasEstimate = BigInt(GAS_LIMIT_SIMPLE_TRANSFER) * BigInt(balances.length);
      totalGasCost = gasEstimate * gasPrice;
    }
    
    const buffer = totalGasCost / 5n; // 20% buffer
    const totalNeeded = totalToDistribute + totalGasCost + buffer;
    
    if (fundingBalance < totalNeeded) {
      console.log(`\n❌ Insufficient balance:`);
      console.log(`   Requested: ${ethers.formatEther(totalToDistribute)} ${gasToken}`);
      console.log(`   Gas costs: ~${ethers.formatEther(totalGasCost + buffer)} ${gasToken} (${useBatch ? 'batch' : 'individual'})`);
      console.log(`   Total needed: ${ethers.formatEther(totalNeeded)} ${gasToken}`);
      console.log(`   Available: ${fundingBalanceFormatted} ${gasToken}`);
      if (needsOwnRl) rl.close();
      return;
    }
    
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Distribution Plan:`);
    console.log(`  Total to distribute: ${ethers.formatEther(totalToDistribute)} ${gasToken}`);
    console.log(`  Number of wallets: ${balances.length}`);
    console.log(`  Per wallet: ${perWalletFormatted} ${gasToken}`);
    console.log(`  Method: ${useBatch ? '📦 Batch Transfer (1 tx)' : '📤 Individual Transfers (' + balances.length + ' txs)'}`)
    console.log(`  Estimated gas: ~${ethers.formatEther(totalGasCost + buffer)} ${gasToken}`);
    console.log(`  Remaining in funding wallet: ~${ethers.formatEther(fundingBalance - totalNeeded)} ${gasToken}`);
    console.log('─'.repeat(70));
    
    balances.forEach((b, i) => {
      const newBalance = b.balance + perWalletAmount;
      console.log(`  [${i + 1}] ${b.address}`);
      console.log(`      Current: ${b.balanceFormatted} ${gasToken}`);
      console.log(`      After: ${ethers.formatEther(newBalance)} ${gasToken} (+${perWalletFormatted})`);
    });
    
    console.log('─'.repeat(70));
    
    if (needsOwnRl) rl.close();
    
    if (dryRun) {
      console.log(`\n⚠️  DRY RUN MODE - No transactions will be sent`);
      console.log(`   Run with --execute flag to perform actual distribution`);
      return;
    }
    
    // Execute distribution
    console.log(`\n🚀 Executing Distribution...`);
    
    // Reuse batchContractAddress from earlier (already declared in gas estimation section)
    if (batchContractAddress && balances.length > 1) {
      console.log(`\n📦 Using Batch Transfer (${balances.length} recipients in 1 transaction)`);
      console.log(`   Batch Contract: ${batchContractAddress}`);
      
      try {
        // Reuse recipients and amounts arrays from earlier (already declared in gas estimation section)
        
        // Create contract instance
        const batchContract = new ethers.Contract(
          batchContractAddress,
          BATCH_TRANSFER_ABI,
          fundingWallet
        );
        
        // Estimate gas
        const gasEstimate = await batchContract.batchTransfer.estimateGas(recipients, amounts, {
          value: totalToDistribute,
        });
        
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
        const gasCost = gasEstimate * gasPrice;
        
        const individualGasEstimate = BigInt(GAS_LIMIT_SIMPLE_TRANSFER) * BigInt(balances.length);
        const savings = Number(individualGasEstimate - gasEstimate);
        
        console.log(`\n   Gas estimate: ${gasEstimate.toString()} units`);
        console.log(`   Gas cost: ${ethers.formatEther(gasCost)} ${gasToken}`);
        console.log(`   Individual transfers would use: ${individualGasEstimate.toString()} units`);
        console.log(`   Gas savings: ${savings} units (${((savings / Number(individualGasEstimate)) * 100).toFixed(1)}%)`);
        
        // Execute batch transfer
        console.log(`\n   Sending batch transaction...`);
        const tx = await batchContract.batchTransfer(recipients, amounts, {
          value: totalToDistribute,
          gasLimit: gasEstimate + (gasEstimate / 10n), // Add 10% buffer
        });
        
        console.log(`   📤 TX sent: ${tx.hash}`);
        console.log(`   ⏳ Waiting for confirmation...`);
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
          console.log(`\n${'═'.repeat(70)}`);
          console.log(`✅ Batch Distribution Complete!`);
          console.log(`   Block: ${receipt.blockNumber}`);
          console.log(`   Gas used: ${receipt.gasUsed.toString()} units`);
          console.log(`   Recipients: ${balances.length}`);
          console.log(`   Amount per wallet: ${perWalletFormatted} ${gasToken}`);
          console.log('═'.repeat(70));
          return;
        } else {
          console.log(`\n   ❌ Batch transfer failed, falling back to individual transfers...`);
        }
        
      } catch (error) {
        console.error(`\n   ❌ Batch transfer error: ${error.message}`);
        console.log(`   Falling back to individual transfers...`);
      }
    } else if (!batchContractAddress) {
      console.log(`\n⚠️  No batch contract deployed on ${network}`);
      console.log(`   Deploy one using: node deploy-batch-contract.mjs`);
      console.log(`   Using individual transfers...`);
    }
    
    // Fallback: Individual transfers
    console.log(`\n📤 Using Individual Transfers (${balances.length} transactions)`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < balances.length; i++) {
      const recipient = balances[i];
      
      console.log(`\n[${i + 1}/${balances.length}] Sending to wallet [${recipient.index}]`);
      console.log(`  From: ${fundingWallet.address}`);
      console.log(`  To: ${recipient.address}`);
      console.log(`  Amount: ${perWalletFormatted} ${gasToken}`);
      
      try {
        const tx = await fundingWallet.sendTransaction({
          to: recipient.address,
          value: perWalletAmount,
          gasLimit: GAS_LIMIT_SIMPLE_TRANSFER,
        });
        
        console.log(`  📤 TX sent: ${tx.hash}`);
        console.log(`  ⏳ Waiting for confirmation...`);
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
          console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
          console.log(`  ⛽ Gas used: ${receipt.gasUsed.toString()} units`);
          successCount++;
        } else {
          console.log(`  ❌ Transaction failed`);
          failCount++;
        }
        
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        failCount++;
      }
    }
    
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`Distribution Complete!`);
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ❌ Failed: ${failCount}`);
    console.log('═'.repeat(70));
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    if (needsOwnRl) rl.close();
  }
}

// Interactive main menu
async function showMainMenu(rl) {
  console.clear();
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'PAYMASTER BALANCE MANAGER' + ' '.repeat(28) + '║');
  console.log('╚' + '═'.repeat(68) + '╝\n');
  
  console.log(`Loaded ${PAYMASTER_PRIVATE_KEYS.length} paymaster wallet(s)\n`);
  console.log(`Networks available: ${ALL_NETWORKS.length}\n`);
  
  console.log('Select Mode:\n');
  console.log('1. Check Balances (View only)');
  console.log('2. Rebalance Paymaster Wallets');
  console.log('3. Add External Funds & Distribute');
  console.log('4. Consolidate to Single Wallet');
  console.log('0. Exit\n');
  
  const choice = await question(rl, 'Select option: ');
  
  return choice;
}

// Select network interactively
async function selectNetworkInteractive(rl) {
  console.log('\n📡 Available Networks:\n');
  
  ALL_NETWORKS.forEach((name, index) => {
    console.log(`  ${index + 1}. ${name}`);
  });
  console.log(`  ${ALL_NETWORKS.length + 1}. All networks`);
  console.log(`  0. Cancel\n`);
  
  const choice = await question(rl, 'Select network: ');
  
  const idx = parseInt(choice);
  
  if (idx === 0) {
    return null;
  } else if (idx > 0 && idx <= ALL_NETWORKS.length) {
    return [ALL_NETWORKS[idx - 1]];
  } else if (idx === ALL_NETWORKS.length + 1) {
    return ALL_NETWORKS;
  } else {
    console.log('\n❌ Invalid selection');
    return null;
  }
}

async function consolidateToWallet(networkData, targetAddress, dryRun = true) {
  const { network, gasToken, provider, balances } = networkData;
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`💰 Consolidating Funds to Single Wallet`);
  console.log('═'.repeat(70));
  console.log(`Target Address: ${targetAddress}`);
  console.log(`Network: ${network}`);
  
  // Find target wallet in the list
  const targetWallet = balances.find(b => b.address.toLowerCase() === targetAddress.toLowerCase());
  
  if (!targetWallet) {
    console.log(`\n❌ Error: Target address ${targetAddress} not found in paymaster wallets`);
    return;
  }
  
  console.log(`\nTarget Wallet: [${targetWallet.index}] ${targetWallet.address}`);
  console.log(`Current Balance: ${targetWallet.balanceFormatted} ${gasToken}`);
  
  // Calculate total consolidation
  const senders = balances.filter(b => b.address.toLowerCase() !== targetAddress.toLowerCase() && b.balance > 0n);
  
  if (senders.length === 0) {
    console.log(`\n✓ No other wallets have funds. Target wallet already has all funds.`);
    return;
  }
  
  let totalToTransfer = 0n;
  const minKeep = ethers.parseEther('0.0001'); // Keep dust for gas
  
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Wallets to Consolidate (${senders.length}):`);
  console.log('─'.repeat(70));
  
  const transfers = [];
  
  for (const sender of senders) {
    // Estimate gas cost for this transfer
    const gasEstimate = BigInt(GAS_LIMIT_SIMPLE_TRANSFER);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
    const gasCost = gasEstimate * gasPrice;
    
    // Calculate amount to send (balance - gas cost - small buffer)
    const buffer = gasCost / 2n; // 50% buffer for gas price fluctuations
    const amountToSend = sender.balance - gasCost - buffer;
    
    if (amountToSend > minKeep) {
      totalToTransfer += amountToSend;
      transfers.push({
        from: sender,
        amount: amountToSend,
        gasCost: gasCost + buffer,
      });
      
      console.log(`  [${sender.index}] ${sender.balanceFormatted} ${gasToken} → Send ${ethers.formatEther(amountToSend)} ${gasToken} (gas: ${ethers.formatEther(gasCost + buffer)} ${gasToken})`);
    } else {
      console.log(`  [${sender.index}] ${sender.balanceFormatted} ${gasToken} → ⚠️ Balance too low (gas would consume all)`);
    }
  }
  
  console.log('─'.repeat(70));
  console.log(`Total to Transfer: ${ethers.formatEther(totalToTransfer)} ${gasToken}`);
  console.log(`Final Balance (estimated): ${ethers.formatEther(targetWallet.balance + totalToTransfer)} ${gasToken}`);
  console.log('─'.repeat(70));
  
  if (transfers.length === 0) {
    console.log(`\n⚠️ No wallets have sufficient balance to transfer (gas costs too high)`);
    return;
  }
  
  if (dryRun) {
    console.log(`\n⚠️  DRY RUN MODE - No transactions will be sent`);
    console.log(`   Run with --execute flag to perform actual consolidation`);
    return;
  }
  
  // Execute transfers
  console.log(`\n🚀 Executing Consolidation...`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < transfers.length; i++) {
    const transfer = transfers[i];
    
    console.log(`\n[${i + 1}/${transfers.length}] Transferring from wallet [${transfer.from.index}]`);
    console.log(`  From: ${transfer.from.address}`);
    console.log(`  To: ${targetAddress}`);
    console.log(`  Amount: ${ethers.formatEther(transfer.amount)} ${gasToken}`);
    
    try {
      const tx = await transfer.from.wallet.sendTransaction({
        to: targetAddress,
        value: transfer.amount,
        gasLimit: GAS_LIMIT_SIMPLE_TRANSFER,
      });
      
      console.log(`  📤 TX sent: ${tx.hash}`);
      console.log(`  ⏳ Waiting for confirmation...`);
      
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
        console.log(`  ⛽ Gas used: ${receipt.gasUsed.toString()} units`);
        successCount++;
      } else {
        console.log(`  ❌ Transaction failed`);
        failCount++;
      }
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      failCount++;
    }
  }
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`Consolidation Complete!`);
  console.log(`  ✅ Success: ${successCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
  console.log('═'.repeat(70));
}

async function executeBatchTransfer(sender, receivers, gasToken, provider, network) {
  const recipients = receivers.map(r => r.to.address);
  const amounts = receivers.map(r => r.amount);
  const totalAmount = amounts.reduce((sum, amt) => sum + amt, 0n);
  
  console.log(`\nBatch Transfer Details:`);
  console.log(`  From: [${sender.from.index}] ${sender.from.address}`);
  console.log(`  Total Amount: ${ethers.formatEther(totalAmount)} ${gasToken}`);
  console.log(`  Recipients: ${receivers.length}`);
  
  for (let i = 0; i < receivers.length; i++) {
    console.log(`    [${receivers[i].to.index}] ${ethers.formatEther(amounts[i])} ${gasToken} → ${recipients[i]}`);
  }
  
  // Check if batch contract is available for this network
  const batchContractAddress = BATCH_CONTRACTS[network];
  
  if (!batchContractAddress) {
    console.log(`\n  ⚠️  No batch contract deployed on ${network}, using individual transfers...`);
    await executeIndividualTransfers([sender], receivers, gasToken, provider);
    return;
  }
  
  try {
    console.log(`\n  Using batch contract: ${batchContractAddress}`);
    
    // Create contract instance
    const batchContract = new ethers.Contract(
      batchContractAddress,
      BATCH_TRANSFER_ABI,
      sender.from.wallet
    );
    
    // Estimate gas
    const gasEstimate = await batchContract.batchTransfer.estimateGas(recipients, amounts, {
      value: totalAmount,
    });
    
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
    const gasCost = gasEstimate * gasPrice;
    
    const individualGasEstimate = BigInt(GAS_LIMIT_SIMPLE_TRANSFER) * BigInt(receivers.length);
    const savings = Number(individualGasEstimate - gasEstimate);
    
    console.log(`\n  Gas estimate: ${gasEstimate.toString()} units`);
    console.log(`  Gas cost: ${ethers.formatEther(gasCost)} ${gasToken}`);
    console.log(`  Individual transfers would use: ${individualGasEstimate.toString()} units`);
    console.log(`  Gas savings: ${savings} units (${((savings / Number(individualGasEstimate)) * 100).toFixed(1)}%)`);
    
    // Execute batch transfer
    console.log(`\n  🚀 Executing batch transfer...`);
    const tx = await batchContract.batchTransfer(recipients, amounts, {
      value: totalAmount,
      gasLimit: gasEstimate,
    });
    
    console.log(`  TX hash: ${tx.hash}`);
    console.log(`  Waiting for confirmation...`);
    
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`  ✅ Batch transfer confirmed in block ${receipt.blockNumber}`);
      console.log(`  Actual gas used: ${receipt.gasUsed.toString()} units`);
    } else {
      console.log(`  ❌ Batch transfer failed`);
      throw new Error('Transaction reverted');
    }
    
  } catch (error) {
    console.error(`\n  ❌ Batch transfer error: ${error.message}`);
    console.log(`  Falling back to individual transfers...`);
    await executeIndividualTransfers([sender], receivers, gasToken, provider);
  }
}

async function executeIndividualTransfers(senders, receivers, gasToken, provider) {
  let senderIndex = 0;
  
  for (const receiver of receivers) {
    let remaining = receiver.amount;
    
    while (remaining > 0n && senderIndex < senders.length) {
      const sender = senders[senderIndex];
      const sendAmount = remaining < sender.amount ? remaining : sender.amount;
      
      console.log(`\nSending ${ethers.formatEther(sendAmount)} ${gasToken}`);
      console.log(`  From: [${sender.from.index}] ${sender.from.address}`);
      console.log(`  To:   [${receiver.to.index}] ${receiver.to.address}`);
      
      try {
        // Estimate gas
        const gasEstimate = await provider.estimateGas({
          from: sender.from.address,
          to: receiver.to.address,
          value: sendAmount,
        });
        
        const gasPrice = (await provider.getFeeData()).gasPrice;
        const gasCost = gasEstimate * gasPrice;
        
        console.log(`  Gas estimate: ${gasEstimate.toString()} units`);
        console.log(`  Gas cost: ${ethers.formatEther(gasCost)} ${gasToken}`);
        
        // Send transaction
        const tx = await sender.from.wallet.sendTransaction({
          to: receiver.to.address,
          value: sendAmount,
          gasLimit: gasEstimate,
        });
        
        console.log(`  TX sent: ${tx.hash}`);
        console.log(`  Waiting for confirmation...`);
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
          console.log(`  ✓ Confirmed in block ${receipt.blockNumber}`);
        } else {
          console.log(`  ✗ Transaction failed`);
        }
        
        // Update amounts
        sender.amount -= sendAmount;
        remaining -= sendAmount;
        
        if (sender.amount <= 0n) {
          senderIndex++;
        }
        
      } catch (error) {
        console.error(`  ✗ Error:`, error.message);
        break;
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }
  
  // Check if running in interactive mode (no arguments)
  if (args.length === 0) {
    // Interactive mode - create ONE readline interface for the entire session
    const mainRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    try {
      while (true) {
        const mode = await showMainMenu(mainRl);
        
        if (mode === '0') {
          console.log('\n👋 Goodbye!\n');
          mainRl.close();
          process.exit(0);
        }
        
        const networks = await selectNetworkInteractive(mainRl);
        
        if (!networks) {
          continue;
        }
        
        let execute = false;
        if (mode !== '1') {
          const confirmExecute = await question(mainRl, '\nExecute transactions? (yes/no) [no]: ');
          execute = confirmExecute.toLowerCase() === 'yes' || confirmExecute.toLowerCase() === 'y';
        }
        
        const providers = [];
        
        for (const network of networks) {
          try {
            const networkData = await checkBalances(network);
            
            if (networkData) {
              providers.push(networkData.provider);
              
              if (mode === '1') {
                // Just view balances
                await question(mainRl, '\nPress Enter to continue...');
              } else if (mode === '2') {
                // Rebalance
                await rebalanceIfNeeded(networkData, !execute);
                await question(mainRl, '\nPress Enter to continue...');
              } else if (mode === '3') {
                // Add external funds
                await addExternalFunds(networkData, !execute, mainRl);
                await question(mainRl, '\nPress Enter to continue...');
              } else if (mode === '4') {
                // Consolidate
                const targetAddr = await question(mainRl, '\nTarget address for consolidation: ');
                
                if (ethers.isAddress(targetAddr)) {
                  await consolidateToWallet(networkData, targetAddr, !execute);
                } else {
                  console.log('\n❌ Invalid address');
                }
                
                await question(mainRl, '\nPress Enter to continue...');
              }
            }
          } catch (error) {
            console.error(`\n✗ Error checking ${network}:`, error.message);
          }
        }
        
        // Cleanup
        for (const provider of providers) {
          if (provider instanceof ethers.WebSocketProvider) {
            try {
              await provider.destroy();
            } catch (e) { /* ignore */ }
          }
        }
      }
    } finally {
      mainRl.close();
    }
  }
  
  // Command-line mode (original behavior)
  const execute = args.includes('--execute');
  const consolidateArg = args.find(arg => arg.startsWith('--consolidate='));
  const networkFilter = args.find(arg => !arg.startsWith('--'));
  
  // Parse consolidate target address
  const consolidateMode = !!consolidateArg;
  const targetAddress = consolidateArg ? consolidateArg.split('=')[1] : null;
  
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'PAYMASTER BALANCE MANAGER' + ' '.repeat(28) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
  
  console.log(`\nLoaded ${PAYMASTER_PRIVATE_KEYS.length} paymaster wallet(s)`);
  
  if (consolidateMode) {
    console.log(`\n💰 MODE: Fund Consolidation`);
    if (!targetAddress || !ethers.isAddress(targetAddress)) {
      console.error(`\n❌ Error: Invalid target address: ${targetAddress}`);
      console.log(`\nUsage: node balance-paymaster.mjs --consolidate=<TARGET_ADDRESS> [--execute] [network]`);
      console.log(`Example: node balance-paymaster.mjs --consolidate=0x1234... --execute "Base Sepolia"`);
      console.log(`\nFor more help: node balance-paymaster.mjs --help`);
      process.exit(1);
    }
    console.log(`Target Address: ${targetAddress}`);
  } else {
    console.log(`\n⚖️  MODE: Balance Rebalancing`);
    console.log(`Rebalance threshold: ${REBALANCE_THRESHOLD} ETH/BNB`);
    console.log(`Minimum balance to keep: ${MIN_BALANCE_TO_KEEP} ETH/BNB`);
    console.log(`Batch transfers: ${USE_BATCHING ? 'enabled' : 'disabled'}`);
  }
  
  if (!execute) {
    console.log(`\n⚠️  Running in DRY RUN mode (use --execute to perform transactions)`);
  }
  
  const networksToCheck = networkFilter 
    ? [networkFilter]
    : ALL_NETWORKS;
  
  const providers = []; // Track providers for cleanup
  
  for (const network of networksToCheck) {
    try {
      const networkData = await checkBalances(network);
      // Skip if network has no RPC configured
      if (networkData) {
        providers.push(networkData.provider); // Track provider for cleanup
        
        if (consolidateMode) {
          await consolidateToWallet(networkData, targetAddress, !execute);
        } else {
          await rebalanceIfNeeded(networkData, !execute);
        }
      }
    } catch (error) {
      console.error(`\n✗ Error checking ${network}:`, error.message);
    }
  }
  
  // Cleanup WebSocket connections
  for (const provider of providers) {
    if (provider instanceof ethers.WebSocketProvider) {
      await provider.destroy();
    }
  }
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log('Done!');
  console.log(`${'═'.repeat(70)}\n`);
}

main().catch(console.error);


