#!/usr/bin/env node
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const TESTNET_NETWORKS = (process.env.TESTNET_NETWORKS || '').split(',').map(n => n.trim()).filter(n => n.length > 0);
const MAINNET_NETWORKS = (process.env.MAINNET_NETWORKS || '').split(',').map(n => n.trim()).filter(n => n.length > 0);
const ALL_NETWORKS = [...TESTNET_NETWORKS, ...MAINNET_NETWORKS];
const PAYMASTER_PRIVATE_KEYS = process.env.PAYMASTER_PRIVATE_KEYS.split(',').map(k => k.trim());

// RPC URLs
const RPC_URLS = {
  'Base Sepolia': process.env.BASE_SEPOLIA_RPC,
  'Ethereum Sepolia': process.env.ETHEREUM_SEPOLIA_RPC,
  'BSC Testnet': process.env.BSC_TESTNET_RPC,
  'Base': process.env.BASE_RPC,
  'Ethereum': process.env.ETHEREUM_RPC,
  'BSC': process.env.BSC_RPC,
};

// Gas tokens
const GAS_TOKENS = {
  'Base Sepolia': 'ETH',
  'Ethereum Sepolia': 'ETH',
  'BSC Testnet': 'BNB',
  'Base': 'ETH',
  'Ethereum': 'ETH',
  'BSC': 'BNB',
};

// Threshold for rebalancing (in ETH/BNB)
const REBALANCE_THRESHOLD = process.env.REBALANCE_THRESHOLD || '0.01'; // Default 0.01 ETH difference
const MIN_BALANCE_TO_KEEP = process.env.MIN_BALANCE_TO_KEEP || '0.005'; // Keep at least 0.005 ETH in source wallet
const USE_BATCHING = process.env.USE_BATCHING !== 'false'; // Enable batching by default

// Simple batch transfer contract ABI (if deployed on network)
const BATCH_TRANSFER_ABI = [
  'function batchTransfer(address[] recipients, uint256[] amounts) payable',
];

// Known batch transfer contracts (if available)
const BATCH_CONTRACTS = {
  'Base Sepolia': '0xe6158F16A2781241703cc8005229c8e1ADd866De',
  'Ethereum Sepolia': '0x725487b8d800AA6155ed21d25470991139770616',
  'BSC Testnet': '0xF7B3f366aaA6d293E4C391F2E834056dB7f3bE50',
};

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
  
  const provider = new ethers.JsonRpcProvider(rpcUrl);
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
  const threshold = ethers.parseEther(REBALANCE_THRESHOLD);
  const minKeep = ethers.parseEther(MIN_BALANCE_TO_KEEP);
  
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Balance Analysis:`);
  console.log(`  Highest: [${highest.index}] ${highest.balanceFormatted} ${gasToken}`);
  console.log(`  Lowest:  [${lowest.index}] ${lowest.balanceFormatted} ${gasToken}`);
  console.log(`  Difference: ${differenceFormatted} ${gasToken}`);
  console.log(`  Threshold: ${REBALANCE_THRESHOLD} ${gasToken}`);
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
    
    const individualGasEstimate = 21000n * BigInt(receivers.length);
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
  const execute = args.includes('--execute');
  const networkFilter = args.find(arg => !arg.startsWith('--'));
  
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'PAYMASTER BALANCE MANAGER' + ' '.repeat(28) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
  
  console.log(`\nLoaded ${PAYMASTER_PRIVATE_KEYS.length} paymaster wallets`);
  console.log(`Rebalance threshold: ${REBALANCE_THRESHOLD} ETH/BNB`);
  console.log(`Minimum balance to keep: ${MIN_BALANCE_TO_KEEP} ETH/BNB`);
  console.log(`Batch transfers: ${USE_BATCHING ? 'enabled' : 'disabled'}`);
  
  if (!execute) {
    console.log(`\n⚠️  Running in DRY RUN mode (use --execute to perform rebalancing)`);
  }
  
  const networksToCheck = networkFilter 
    ? [networkFilter]
    : ALL_NETWORKS;
  
  for (const network of networksToCheck) {
    try {
      const networkData = await checkBalances(network);
      // Skip if network has no RPC configured
      if (networkData) {
        await rebalanceIfNeeded(networkData, !execute);
      }
    } catch (error) {
      console.error(`\n✗ Error checking ${network}:`, error.message);
    }
  }
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log('Done!');
  console.log(`${'═'.repeat(70)}\n`);
}

main().catch(console.error);
