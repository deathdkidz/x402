#!/usr/bin/env node

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║         X402 FACILITATOR UTILITY TOOLS (INTERACTIVE)              ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 * 
 * Unified interactive tool for managing the x402 facilitator.
 * All utilities in one place with network.json integration.
 * 
 * FEATURES:
 *   1. Network Management    - Add/edit/remove/view networks
 *   2. Token Metadata        - Fetch ERC-20/EIP-712 token info
 *   3. Paymaster Balances    - Check/rebalance paymaster wallets
 *   4. Deploy Contracts      - Deploy batch transfer contracts
 *   5. Merchant Management   - Create/update merchant accounts
 *   6. Gas Statistics        - View gas usage analytics
 * 
 * USAGE:
 *   node facilitator-tools.mjs [--help]
 *   
 * All operations work with networks.json for consistent configuration.
 */

import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
import mysql from 'mysql2/promise';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

// ============================================================================
// LOAD NETWORKS FROM networks.toml
// ============================================================================
let NETWORKS_CONFIG = {};
let ALL_NETWORKS = [];

function loadNetworksFromToml() {
  try {
    const networksPath = join(__dirname, '..', 'config', 'networks.toml');
    const tomlContent = fs.readFileSync(networksPath, 'utf8');
    
    // Parse TOML manually (simple parser for our needs)
    const networks = {};
    const lines = tomlContent.split('\n');
    let currentNetwork = null;
    let inTokenSection = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      
      // Check if entering token subsection (ignore these)
      if (trimmed === '[[networks.tokens]]') {
        inTokenSection = true;
        continue;
      }
      
      // New network section
      if (trimmed === '[[networks]]') {
        // Save previous network if exists
        if (currentNetwork && currentNetwork.name) {
          networks[currentNetwork.name] = currentNetwork;
        }
        currentNetwork = {};
        inTokenSection = false;
        continue;
      }
      
      // Skip token properties
      if (inTokenSection) {
        continue;
      }
      
      // Parse key-value pairs for networks only
      if (currentNetwork && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const cleanKey = key.trim();
        let value = valueParts.join('=').trim().replace(/"/g, '');
        
        // Convert types (but not hex addresses or other strings starting with 0x)
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (!isNaN(value) && value !== '' && !value.startsWith('0x')) value = parseInt(value);
        
        currentNetwork[cleanKey] = value;
      }
    }
    
    // Save last network
    if (currentNetwork && currentNetwork.name) {
      networks[currentNetwork.name] = currentNetwork;
    }
    
    // Map TOML property names to expected JavaScript property names
    for (const network of Object.values(networks)) {
      if (network.batch_contract) {
        network.batchContract = network.batch_contract;
      }
    }
    
    // Show all networks (both enabled and disabled, testnet and mainnet)
    NETWORKS_CONFIG = networks;
    ALL_NETWORKS = Object.keys(networks);
    
    if (ALL_NETWORKS.length === 0) {
      console.error('⚠️  No networks found in networks.toml');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error loading networks.toml:', error.message);
    return false;
  }
}

function loadNetworks() {
  return loadNetworksFromToml();
}

function saveNetworks() {
  console.log('⚠️  Cannot save to networks.toml from this tool.');
  console.log('   Please manually edit /srv/x402/x402-facilitator-rs/config/networks.toml');
}

// ============================================================================
// UTILITIES
// ============================================================================

async function safeDestroyProvider(provider) {
  if (provider instanceof ethers.WebSocketProvider) {
    try {
      await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay
      provider.removeAllListeners();
      await provider.destroy();
    } catch {}
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function clearScreen() {
  console.log('\x1Bc');
}

function isYes(input) {
  if (!input) return false;
  const v = input.trim().toLowerCase();
  return v === 'yes' || v === 'y';
}

function printHeader(title) {
  console.log('╔' + '═'.repeat(70) + '╗');
  console.log('║' + title.padStart(35 + Math.floor(title.length / 2)).padEnd(70) + '║');
  console.log('╚' + '═'.repeat(70) + '╝');
  console.log('');
}

// Helper to get and validate RPC URL
async function getRpcUrl(config, network) {
  if (!config.rpc_url_env) {
    console.log(`\n❌ Network ${network} has no rpc_url_env configured in networks.toml`);
    await question('Press Enter to continue...');
    return null;
  }
  
  const rpcUrl = process.env[config.rpc_url_env];
  
  if (!rpcUrl) {
    console.log(`\n❌ RPC not configured in .env`);
    console.log(`   Network: ${network}`);
    console.log(`   Required env variable: ${config.rpc_url_env}`);
    console.log(`   Please add this to your .env file:`);
    console.log(`   ${config.rpc_url_env}=${config.rpc_url_default || 'wss://your-rpc-url'}`);
    await question('Press Enter to continue...');
    return null;
  }
  
  return rpcUrl;
}

// ============================================================================
// 1. NETWORK MANAGEMENT
// ============================================================================

async function networkManagement() {
  while (true) {
    clearScreen();
    printHeader('NETWORK MANAGEMENT');
    
    console.log('1. View Networks');
    console.log('2. Add Network');
    console.log('3. Edit Network');
    console.log('4. Remove Network');
    console.log('0. Back to Main Menu\n');
    
    const choice = await question('Select option: ');
    
    switch (choice) {
      case '1':
        await viewNetworks();
        break;
      case '2':
        await addNetwork();
        break;
      case '3':
        await editNetwork();
        break;
      case '4':
        await removeNetwork();
        break;
      case '0':
        return;
      default:
        console.log('Invalid option');
        await question('Press Enter to continue...');
    }
  }
}

async function viewNetworks() {
  clearScreen();
  printHeader('NETWORKS');
  
  const testnets = ALL_NETWORKS.filter(n => NETWORKS_CONFIG[n].environment === 'testnet');
  const mainnets = ALL_NETWORKS.filter(n => NETWORKS_CONFIG[n].environment === 'mainnet');
  
  if (testnets.length > 0) {
    console.log('🧪 TESTNETS:\n');
    testnets.forEach((name, i) => {
      const config = NETWORKS_CONFIG[name];
      const status = config.enabled === true ? '✅' : config.enabled === false ? '❌' : '❓';
      console.log(`${i + 1}. ${name} ${status}`);
      console.log(`   Chain ID: ${config.chain_id}`);
      console.log(`   Gas Token: ${config.native_symbol}`);
      console.log(`   RPC: ${config.rpc_url_env} (from .env)`);
      console.log(`   Explorer: ${config.explorer_url}`);
      console.log('');
    });
  }
  
  if (mainnets.length > 0) {
    console.log('🚀 MAINNETS:\n');
    mainnets.forEach((name, i) => {
      const config = NETWORKS_CONFIG[name];
      const status = config.enabled === true ? '✅' : config.enabled === false ? '❌' : '❓';
      console.log(`${i + 1}. ${name} ${status}`);
      console.log(`   Chain ID: ${config.chain_id}`);
      console.log(`   Gas Token: ${config.native_symbol}`);
      console.log(`   RPC: ${config.rpc_url_env} (from .env)`);
      console.log(`   Explorer: ${config.explorer_url}`);
      console.log('');
    });
  }
  
  await question('Press Enter to continue...');
}

async function addNetwork() {
  clearScreen();
  printHeader('ADD NETWORK');
  
  console.log('⚠️  Network configuration uses networks.toml format.');
  console.log('   Please manually edit: /srv/x402/x402-facilitator-rs/config/networks.toml\n');
  await question('Press Enter to continue...');
  return;
  
  const chainId = parseInt(await question('Chain ID: '));
  const rpcEnvVar = await question('RPC env variable name (e.g., ARBITRUM_SEPOLIA_RPC): ');
  const gasToken = await question('Gas token (e.g., ETH, MATIC, BNB): ');
  const explorer = await question('Block explorer URL: ');
  const type = await question('Type (testnet/mainnet): ');
  const rebalanceThreshold = await question('Rebalance threshold (native token, e.g. 0.01) [optional]: ');
  const minBalanceToKeep = await question('Min balance to keep (native token, e.g. 0.005) [optional]: ');
  
  NETWORKS_CONFIG[name] = {
    rpcUrl: rpcEnvVar,
    chainId,
    explorer,
    gasToken,
    type,
    batchContract: null
  };
  if (rebalanceThreshold) NETWORKS_CONFIG[name].rebalanceThreshold = rebalanceThreshold;
  if (minBalanceToKeep) NETWORKS_CONFIG[name].minBalanceToKeep = minBalanceToKeep;
  
  saveNetworks();
  loadNetworks();
  
  console.log(`\n✅ Network "${name}" added successfully!`);
  console.log(`\n⚠️  Remember to add ${rpcEnvVar} to your .env file`);
  await question('Press Enter to continue...');
}

async function editNetwork() {
  clearScreen();
  printHeader('EDIT NETWORK');
  
  console.log('⚠️  Network configuration uses networks.toml format.');
  console.log('   Please manually edit: /srv/x402/x402-facilitator-rs/config/networks.toml\n');
  await question('Press Enter to continue...');
  return;
  
  const name = ALL_NETWORKS[index];
  const config = NETWORKS_CONFIG[name];
  
  console.log(`\nEditing: ${name}`);
  console.log('Leave blank to keep current value\n');
  
  const chainId = await question(`Chain ID [${config.chainId}]: `);
  const rpcEnvVar = await question(`RPC env var [${config.rpcUrl}]: `);
  const gasToken = await question(`Gas token [${config.gasToken}]: `);
  const explorer = await question(`Explorer [${config.explorer}]: `);
  const batchContract = await question(`Batch contract [${config.batchContract || 'none'}]: `);
  const rebalanceThreshold = await question(`Rebalance threshold [${config.rebalanceThreshold || ''}]: `);
  const minBalanceToKeep = await question(`Min balance to keep [${config.minBalanceToKeep || ''}]: `);
  
  if (chainId) config.chainId = parseInt(chainId);
  if (rpcEnvVar) config.rpcUrl = rpcEnvVar;
  if (gasToken) config.gasToken = gasToken;
  if (explorer) config.explorer = explorer;
  if (batchContract) config.batchContract = batchContract;
  if (rebalanceThreshold) config.rebalanceThreshold = rebalanceThreshold;
  if (minBalanceToKeep) config.minBalanceToKeep = minBalanceToKeep;
  
  saveNetworks();
  console.log('\n✅ Network updated successfully!');
  await question('Press Enter to continue...');
}

async function removeNetwork() {
  clearScreen();
  printHeader('REMOVE NETWORK');
  
  console.log('⚠️  Network configuration uses networks.toml format.');
  console.log('   Please manually edit: /srv/x402/x402-facilitator-rs/config/networks.toml\n');
  await question('Press Enter to continue...');
  return;
  
  const name = ALL_NETWORKS[index];
  const confirm = await question(`Remove "${name}"? (yes/no): `);
  
  if (isYes(confirm)) {
    delete NETWORKS_CONFIG[name];
    saveNetworks();
    loadNetworks();
    console.log(`\n✅ Network "${name}" removed`);
  }
  
  await question('Press Enter to continue...');
}

// ============================================================================
// 2. TOKEN METADATA
// ============================================================================

async function tokenMetadata() {
  clearScreen();
  printHeader('TOKEN METADATA FETCHER');
  
  console.log('Available networks:');
  ALL_NETWORKS.forEach((name, i) => console.log(`${i + 1}. ${name}`));
  console.log('');
  
  const networkIndex = parseInt(await question('Select network: ')) - 1;
  if (networkIndex < 0 || networkIndex >= ALL_NETWORKS.length) return;
  
  const network = ALL_NETWORKS[networkIndex];
  const config = NETWORKS_CONFIG[network];
  const rpcUrl = await getRpcUrl(config, network);
  
  if (!rpcUrl) return;
  
  const tokenAddress = await question('\nToken address: ');
  if (!ethers.isAddress(tokenAddress)) {
    console.log('❌ Invalid address');
    await question('Press Enter to continue...');
    return;
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`Fetching metadata for ${tokenAddress} on ${network}...`);
  console.log('='.repeat(70) + '\n');
  
  try {
    const provider = rpcUrl.startsWith('wss')
      ? new ethers.WebSocketProvider(rpcUrl)
      : new ethers.JsonRpcProvider(rpcUrl);
    
    const ERC20_ABI = [
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
    ];
    
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    const [name, symbol, decimals] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
    ]);
    
    console.log('✓ Name:', name);
    console.log('✓ Symbol:', symbol);
    console.log('✓ Decimals:', decimals);
    
    // Try EIP-712
    try {
      const EIP712_ABI = [
        'function DOMAIN_SEPARATOR() view returns (bytes32)',
        'function version() view returns (string)',
      ];
      const eip712Token = new ethers.Contract(tokenAddress, EIP712_ABI, provider);
      const [domainSep, version] = await Promise.all([
        eip712Token.DOMAIN_SEPARATOR(),
        eip712Token.version(),
      ]);
      console.log('\n🔐 EIP-712 Support:');
      console.log('✓ Version:', version);
      console.log('✓ Domain Separator:', domainSep);
    } catch {
      console.log('\n⚠️  EIP-712 not supported');
    }
    
    await safeDestroyProvider(provider);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  await question('\nPress Enter to continue...');
}

// ============================================================================
// 3. PAYMASTER BALANCES
// ============================================================================

// Constants for balance management (configurable via .env)
const REBALANCE_THRESHOLD = ethers.parseEther(process.env.REBALANCE_THRESHOLD || '0.01');
const MIN_BALANCE_TO_KEEP = ethers.parseEther(process.env.MIN_BALANCE_TO_KEEP || '0.005');
const GAS_LIMIT_SIMPLE_TRANSFER = 21000;

const BATCH_TRANSFER_ABI = [
  'function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external payable',
  'function batchTransferEqual(address[] calldata recipients) external payable',
  'event BatchTransferExecuted(address indexed sender, uint256 totalAmount, uint256 recipientCount)',
];

// Helper to execute batch transfer
async function executeBatchTransfer(wallet, batchContractAddress, recipients, amounts, config) {
  const contract = new ethers.Contract(batchContractAddress, BATCH_TRANSFER_ABI, wallet);
  const totalValue = amounts.reduce((sum, amt) => sum + amt, 0n);
  
  // Estimate gas for batch transfer
  const gasEstimate = await contract.batchTransfer.estimateGas(recipients, amounts, { value: totalValue });
  const gasLimit = gasEstimate * 120n / 100n; // 20% buffer
  
  const tx = await contract.batchTransfer(recipients, amounts, {
    value: totalValue,
    gasLimit,
  });
  
  return tx;
}

// Helper to execute individual transfers (fallback)
async function executeIndividualTransfers(fundingWallet, wallets, perWalletAmount, config) {
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < wallets.length; i++) {
    const targetAddress = wallets[i].address || wallets[i];
    console.log(`\n[${i + 1}/${wallets.length}] Sending to wallet [${i + 1}]`);
    console.log(`  To: ${targetAddress}`);
    console.log(`  Amount: ${ethers.formatEther(perWalletAmount)} ${config.native_symbol}`);
    
    try {
      const tx = await fundingWallet.sendTransaction({
        to: targetAddress,
        value: perWalletAmount,
        gasLimit: GAS_LIMIT_SIMPLE_TRANSFER,
      });
      
      console.log(`  📤 TX: ${tx.hash}`);
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
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
  console.log('Distribution Complete!');
  console.log(`  ✅ Success: ${successCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
  console.log('═'.repeat(70));
}

async function paymasterBalances() {
  while (true) {
    clearScreen();
    printHeader('PAYMASTER BALANCE MANAGEMENT');
    
    const keys = process.env.PAYMASTER_PRIVATE_KEYS?.split(',') || [];
    if (keys.length === 0) {
      console.log('❌ No paymaster keys configured in .env');
      await question('Press Enter to continue...');
      return;
    }
    
    console.log(`Loaded ${keys.length} paymaster wallet(s)\n`);
    console.log('1. Check Balances (View only)');
    console.log('2. Rebalance Paymaster Wallets');
    console.log('3. Add External Funds & Distribute');
    console.log('4. Consolidate to Single Wallet');
    console.log('0. Back to Main Menu\n');
    
    const choice = await question('Select option: ');
    
    switch (choice) {
      case '1':
        await viewPaymasterBalances();
        break;
      case '2':
        await rebalancePaymasters();
        break;
      case '3':
        await addExternalFundsMenu();
        break;
      case '4':
        await consolidateFundsMenu();
        break;
      case '0':
        return;
      default:
        console.log('Invalid option');
        await question('Press Enter to continue...');
    }
  }
}

async function viewPaymasterBalances() {
  clearScreen();
  printHeader('VIEW PAYMASTER BALANCES');
  
  const keys = process.env.PAYMASTER_PRIVATE_KEYS.split(',').map(k => k.trim());
  
  console.log('Available networks:');
  ALL_NETWORKS.forEach((name, i) => console.log(`${i + 1}. ${name}`));
  console.log('');
  
  const networkIndex = parseInt(await question('Select network: ')) - 1;
  if (networkIndex < 0 || networkIndex >= ALL_NETWORKS.length) return;
  
  const network = ALL_NETWORKS[networkIndex];
  const config = NETWORKS_CONFIG[network];
  const rpcUrl = await getRpcUrl(config, network);
  
  if (!rpcUrl) return;
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Checking balances on ${network}...`);
  console.log('='.repeat(70) + '\n');
  
  try {
    const provider = rpcUrl.startsWith('wss')
      ? new ethers.WebSocketProvider(rpcUrl)
      : new ethers.JsonRpcProvider(rpcUrl);
    
    const wallets = keys.map(k => new ethers.Wallet(k));
    let total = 0n;
    
    for (let i = 0; i < wallets.length; i++) {
      const balance = await provider.getBalance(wallets[i].address);
      const formatted = ethers.formatEther(balance);
      total += balance;
      console.log(`[${(i + 1).toString().padStart(2)}] ${wallets[i].address}: ${formatted} ${config.native_symbol}`);
    }
    
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Total: ${ethers.formatEther(total)} ${config.native_symbol}`);
    console.log(`Average: ${ethers.formatEther(total / BigInt(wallets.length))} ${config.native_symbol}`);
    
    await safeDestroyProvider(provider);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  await question('\nPress Enter to continue...');
}

async function rebalancePaymasters() {
  clearScreen();
  printHeader('REBALANCE PAYMASTER WALLETS');
  
  const keys = process.env.PAYMASTER_PRIVATE_KEYS.split(',').map(k => k.trim());
  
  console.log('Available networks:');
  ALL_NETWORKS.forEach((name, i) => console.log(`${i + 1}. ${name}`));
  console.log('');
  
  const networkIndex = parseInt(await question('Select network: ')) - 1;
  if (networkIndex < 0 || networkIndex >= ALL_NETWORKS.length) return;
  
  const network = ALL_NETWORKS[networkIndex];
  const config = NETWORKS_CONFIG[network];
  const rpcUrl = await getRpcUrl(config, network);
  
  if (!rpcUrl) return;
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Rebalancing on ${network}...`);
  console.log('='.repeat(70) + '\n');
  
  const executeChoice = await question('Execute transactions? (yes/no) [no]: ');
  const execute = isYes(executeChoice);
  
  try {
    const provider = rpcUrl.startsWith('wss')
      ? new ethers.WebSocketProvider(rpcUrl)
      : new ethers.JsonRpcProvider(rpcUrl);
    
    // Get balances
    const wallets = keys.map(k => new ethers.Wallet(k, provider));
    const balances = [];
    let total = 0n;
    
    for (let i = 0; i < wallets.length; i++) {
      const balance = await provider.getBalance(wallets[i].address);
      total += balance;
      balances.push({
        wallet: wallets[i],
        balance,
        address: wallets[i].address,
        index: i + 1,
      });
      console.log(`[${balances[i].index}] ${balances[i].address}: ${ethers.formatEther(balance)} ${config.native_symbol}`);
    }
    
    const targetBalance = total / BigInt(wallets.length);
    console.log(`\nTarget balance per wallet: ${ethers.formatEther(targetBalance)} ${config.native_symbol}`);
    // Per-network override for thresholds (fallback to global env defaults)
    const rebalanceThreshold = config.rebalanceThreshold ? ethers.parseEther(String(config.rebalanceThreshold)) : REBALANCE_THRESHOLD;
    const minBalanceToKeep = config.minBalanceToKeep ? ethers.parseEther(String(config.minBalanceToKeep)) : MIN_BALANCE_TO_KEEP;
    
    // Calculate distributions
    const distributions = [];
    console.log(`\nProposed distributions:`);
    
    for (const bal of balances) {
      const diff = bal.balance - targetBalance;
      const diffFormatted = ethers.formatEther(diff > 0n ? diff : -diff);
      
      if (diff > minBalanceToKeep) {
        console.log(`  [${bal.index}] Will send ${diffFormatted} ${config.native_symbol} (has excess)`);
        distributions.push({ from: bal, amount: diff, type: 'send' });
      } else if (diff < 0n) {
        console.log(`  [${bal.index}] Needs ${diffFormatted} ${config.native_symbol}`);
        distributions.push({ to: bal, amount: -diff, type: 'receive' });
      } else {
        console.log(`  [${bal.index}] Already balanced`);
      }
    }
    
    if (!execute) {
      console.log(`\n⚠️  DRY RUN MODE - No transactions will be sent`);
    } else {
      // Execute rebalancing
      const senders = distributions.filter(d => d.type === 'send');
      const receivers = distributions.filter(d => d.type === 'receive');
      
      if (receivers.length > 0) {
        console.log(`\n${'='.repeat(70)}`);
        console.log('Executing rebalancing...');
        
        let sender;
        if (senders.length > 0) {
          // Use the wallet with most excess
          sender = senders[0];
        } else {
          // No natural senders - find wallet with highest balance
          const sortedByBalance = balances.slice().sort((a, b) => b.balance > a.balance ? 1 : -1);
          sender = { from: sortedByBalance[0], amount: sortedByBalance[0].balance - targetBalance, type: 'send' };
          console.log(`\n⚠️  Using highest balance wallet [${sender.from.index}] as sender`);
        }
        
        let remaining = sender.amount;
        
        // Prepare batch of receivers
        const batchRecipients = [];
        const batchAmounts = [];
        
        for (const receiver of receivers) {
          if (remaining <= 0n) break;
          const sendAmount = remaining < receiver.amount ? remaining : receiver.amount;
          batchRecipients.push(receiver.to.address);
          batchAmounts.push(sendAmount);
          remaining -= sendAmount;
        }
        
        // Check if batch contract is available and makes sense (2+ recipients)
        if (config.batchContract && batchRecipients.length >= 2) {
          console.log(`\n🚀 Using batch transfer contract: ${config.batchContract}`);
          console.log(`   Distributing to ${batchRecipients.length} recipients in a single transaction`);
          
          try {
            const tx = await executeBatchTransfer(
              sender.from.wallet,
              config.batchContract,
              batchRecipients,
              batchAmounts,
              config
            );
            
            const totalAmount = batchAmounts.reduce((sum, amt) => sum + amt, 0n);
            console.log(`   Total: ${ethers.formatEther(totalAmount)} ${config.native_symbol}`);
            console.log(`   📤 TX: ${tx.hash}`);
            
            const receipt = await tx.wait();
            console.log(`   ✅ Batch confirmed in block ${receipt.blockNumber}`);
            console.log(`   ⛽ Gas used: ${receipt.gasUsed.toString()}`);
          } catch (error) {
            console.log(`\n❌ Batch transfer failed: ${error.message}`);
            console.log('   Falling back to individual transfers...');
            
            // Fallback to individual transfers
            for (let i = 0; i < batchRecipients.length; i++) {
              console.log(`\nSending ${ethers.formatEther(batchAmounts[i])} ${config.native_symbol} to [${receivers[i].to.index}]`);
              try {
                const tx = await sender.from.wallet.sendTransaction({
                  to: batchRecipients[i],
                  value: batchAmounts[i],
                  gasLimit: GAS_LIMIT_SIMPLE_TRANSFER,
                });
                console.log(`  📤 TX: ${tx.hash}`);
                const receipt = await tx.wait();
                console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
              } catch (err) {
                console.log(`  ❌ Error: ${err.message}`);
              }
            }
          }
        } else {
          // No batch contract or only 1 recipient - use individual transfers
          if (!config.batchContract && batchRecipients.length >= 2) {
            console.log(`\n⚠️  No batch contract deployed on ${network}. Using individual transfers.`);
            console.log(`   Tip: Deploy batch contract via menu option 4 to save gas.`);
          }
          
          for (let i = 0; i < batchRecipients.length; i++) {
            console.log(`\nSending ${ethers.formatEther(batchAmounts[i])} ${config.native_symbol} from [${sender.from.index}] to [${receivers[i].to.index}]`);
            
            try {
              const tx = await sender.from.wallet.sendTransaction({
                to: batchRecipients[i],
                value: batchAmounts[i],
                gasLimit: GAS_LIMIT_SIMPLE_TRANSFER,
              });
              
              console.log(`  📤 TX: ${tx.hash}`);
              const receipt = await tx.wait();
              console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
            } catch (error) {
              console.log(`  ❌ Error: ${error.message}`);
            }
          }
        }
        
        console.log('\n✅ Rebalancing complete!');
      } else {
        console.log('\nNo rebalancing needed');
      }
    }
    
    await safeDestroyProvider(provider);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  await question('\nPress Enter to continue...');
}

async function addExternalFundsMenu() {
  clearScreen();
  printHeader('ADD EXTERNAL FUNDS & DISTRIBUTE');
  
  const keys = process.env.PAYMASTER_PRIVATE_KEYS.split(',').map(k => k.trim());
  
  console.log('Available networks:');
  ALL_NETWORKS.forEach((name, i) => console.log(`${i + 1}. ${name}`));
  console.log('');
  
  const networkIndex = parseInt(await question('Select network: ')) - 1;
  if (networkIndex < 0 || networkIndex >= ALL_NETWORKS.length) return;
  
  const network = ALL_NETWORKS[networkIndex];
  const config = NETWORKS_CONFIG[network];
  const rpcUrl = await getRpcUrl(config, network);
  
  if (!rpcUrl) return;
  
  try {
    const provider = rpcUrl.startsWith('wss')
      ? new ethers.WebSocketProvider(rpcUrl)
      : new ethers.JsonRpcProvider(rpcUrl);
    
    // Show current paymaster balances
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Current Paymaster Wallets on ${network}:`);
    console.log('='.repeat(70) + '\n');
    
    const wallets = keys.map(k => new ethers.Wallet(k, provider));
    for (let i = 0; i < wallets.length; i++) {
      const balance = await provider.getBalance(wallets[i].address);
      console.log(`[${i + 1}] ${wallets[i].address}: ${ethers.formatEther(balance)} ${config.native_symbol}`);
    }
    
    // Get funding wallet private key
    console.log(`\n${'─'.repeat(70)}`);
    console.log('Enter funding wallet details:');
    console.log('─'.repeat(70));
    
    const privateKey = await question('\nPrivate key (with or without 0x): ');
    if (!privateKey) {
      console.log('\n❌ Private key is required');
      await question('Press Enter to continue...');
      return;
    }
    
    // Format and validate private key
    const formattedKey = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
    if (formattedKey.length !== 66) {
      console.log('\n❌ Invalid private key length (should be 64 hex characters)');
      await question('Press Enter to continue...');
      return;
    }
    
    // Create funding wallet
    const fundingWallet = new ethers.Wallet(formattedKey, provider);
    const fundingBalance = await provider.getBalance(fundingWallet.address);
    
    console.log(`\n✅ Funding Wallet Loaded:`);
    console.log(`   Address: ${fundingWallet.address}`);
    console.log(`   Balance: ${ethers.formatEther(fundingBalance)} ${config.native_symbol}`);
    
    if (fundingBalance === 0n) {
      console.log(`\n❌ Funding wallet has zero balance`);
      await question('Press Enter to continue...');
      return;
    }
    
    // Ask for amount
    const amountStr = await question(`\nAmount to distribute (max: ${ethers.formatEther(fundingBalance)} ${config.native_symbol}, or type 'max'): `);
    if (!amountStr) {
      console.log('\n❌ Amount is required');
      await question('Press Enter to continue...');
      return;
    }
    
    let totalToDistribute;
    let useMax = false;
    if (amountStr.toLowerCase() === 'max') {
      useMax = true;
      totalToDistribute = fundingBalance; // Will be adjusted after gas estimation
    } else {
      try {
        totalToDistribute = ethers.parseEther(amountStr);
      } catch (error) {
        console.log('\n❌ Invalid amount format');
        await question('Press Enter to continue...');
        return;
      }
    }
    
    // If using max, we need to estimate gas accurately
    if (useMax) {
      console.log(`\n⏳ Calculating optimal distribution after gas costs...`);
      
      // Iteratively calculate max distributable amount
      // Start with 90% of balance to leave room for gas
      let testDistribution = (fundingBalance * 90n) / 100n;
      let estimatedGasCost;
      let attempts = 0;
      const maxAttempts = 5;
      
      while (attempts < maxAttempts) {
        attempts++;
        const testPerWalletAmount = testDistribution / BigInt(wallets.length);
        
        try {
          if (config.batchContract && wallets.length >= 2) {
            // Estimate gas for batch transfer with actual amounts
            const contract = new ethers.Contract(config.batchContract, BATCH_TRANSFER_ABI, fundingWallet);
            const recipients = wallets.map(w => w.address);
            const amounts = wallets.map(() => testPerWalletAmount);
            const totalValue = testDistribution;
            
            const gasEstimate = await contract.batchTransfer.estimateGas(recipients, amounts, { value: totalValue });
            const gasLimit = gasEstimate * 130n / 100n; // 30% buffer for safety
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
            estimatedGasCost = gasLimit * gasPrice;
            
            // Check if we have enough balance
            if (testDistribution + estimatedGasCost <= fundingBalance) {
              // We found a working distribution
              totalToDistribute = testDistribution;
              break;
            } else {
              // Reduce distribution and try again
              const excess = (testDistribution + estimatedGasCost) - fundingBalance;
              testDistribution = testDistribution - excess - (excess / 10n); // Reduce by excess + 10%
            }
          } else {
            // Estimate gas for individual transfers
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
            estimatedGasCost = BigInt(GAS_LIMIT_SIMPLE_TRANSFER) * BigInt(wallets.length) * gasPrice * 130n / 100n; // 30% buffer
            
            if (testDistribution + estimatedGasCost <= fundingBalance) {
              totalToDistribute = testDistribution;
              break;
            } else {
              const excess = (testDistribution + estimatedGasCost) - fundingBalance;
              testDistribution = testDistribution - excess - (excess / 10n);
            }
          }
        } catch (error) {
          console.log(`\n⚠️  Gas estimation attempt ${attempts} failed: ${error.message}`);
          // Reduce by 10% and try again
          testDistribution = (testDistribution * 90n) / 100n;
        }
      }
      
      if (attempts >= maxAttempts) {
        console.log(`\n❌ Could not calculate safe distribution amount after ${maxAttempts} attempts`);
        await question('Press Enter to continue...');
        return;
      }
      
      if (totalToDistribute <= 0n) {
        console.log(`\n❌ Insufficient balance for gas costs:`);
        console.log(`   Gas estimate: ~${ethers.formatEther(estimatedGasCost)} ${config.native_symbol}`);
        console.log(`   Available: ${ethers.formatEther(fundingBalance)} ${config.native_symbol}`);
        await question('Press Enter to continue...');
        return;
      }
      
      console.log(`\n✅ Maximum distributable: ${ethers.formatEther(totalToDistribute)} ${config.native_symbol}`);
      console.log(`   (Reserved ~${ethers.formatEther(estimatedGasCost)} ${config.native_symbol} for gas)`);
    }
    
    // Calculate per-wallet distribution
    const finalPerWalletAmount = totalToDistribute / BigInt(wallets.length);
    
    // For non-max, validate balance
    if (!useMax) {
      // Estimate gas
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
      const gasEstimate = BigInt(GAS_LIMIT_SIMPLE_TRANSFER) * BigInt(wallets.length);
      const totalGasCost = gasEstimate * gasPrice;
      const buffer = totalGasCost / 5n; // 20% buffer
      const totalNeeded = totalToDistribute + totalGasCost + buffer;
      
      if (fundingBalance < totalNeeded) {
        console.log(`\n❌ Insufficient balance:`);
        console.log(`   Requested: ${ethers.formatEther(totalToDistribute)} ${config.native_symbol}`);
        console.log(`   Gas costs: ~${ethers.formatEther(totalGasCost + buffer)} ${config.native_symbol}`);
        console.log(`   Total needed: ${ethers.formatEther(totalNeeded)} ${config.native_symbol}`);
        console.log(`   Available: ${ethers.formatEther(fundingBalance)} ${config.native_symbol}`);
        await question('Press Enter to continue...');
        return;
      }
    }
    
    // Show distribution plan
    console.log(`\n${'─'.repeat(70)}`);
    console.log('Distribution Plan:');
    console.log(`  Total to distribute: ${ethers.formatEther(totalToDistribute)} ${config.native_symbol}`);
    console.log(`  Number of wallets: ${wallets.length}`);
    console.log(`  Per wallet: ${ethers.formatEther(finalPerWalletAmount)} ${config.native_symbol}`);
    if (useMax) {
      console.log(`  Wallet balance after: ${ethers.formatEther(fundingBalance - totalToDistribute)} ${config.native_symbol} (reserved for gas)`);
    }
    console.log('─'.repeat(70));
    
    for (let i = 0; i < wallets.length; i++) {
      const balance = await provider.getBalance(wallets[i].address);
      const newBalance = balance + finalPerWalletAmount;
      console.log(`  [${i + 1}] ${wallets[i].address}`);
      console.log(`      Current: ${ethers.formatEther(balance)} ${config.native_symbol}`);
      console.log(`      After: ${ethers.formatEther(newBalance)} ${config.native_symbol} (+${ethers.formatEther(finalPerWalletAmount)})`);
    }
    console.log('─'.repeat(70));
    
    const executeChoice = await question('\nExecute distribution? (yes/no) [no]: ');
    const execute = isYes(executeChoice);
    
    if (!execute) {
      console.log(`\n⚠️  DRY RUN MODE - No transactions will be sent`);
    } else {
      console.log(`\n🚀 Executing Distribution...`);
      
      // Prepare batch recipients and amounts
      const recipients = wallets.map(w => w.address);
      const amounts = wallets.map(() => finalPerWalletAmount);
      
      // Check if batch contract is available and makes sense (2+ recipients)
      if (config.batchContract && wallets.length >= 2) {
        console.log(`\n🚀 Using batch transfer contract: ${config.batchContract}`);
        console.log(`   Distributing to ${wallets.length} recipients in a single transaction`);
        
        try {
          const tx = await executeBatchTransfer(
            fundingWallet,
            config.batchContract,
            recipients,
            amounts,
            config
          );
          
          console.log(`   📤 TX: ${tx.hash}`);
          const receipt = await tx.wait();
          
          if (receipt.status === 1) {
            console.log(`   ✅ Batch confirmed in block ${receipt.blockNumber}`);
            console.log(`   ⛽ Gas used: ${receipt.gasUsed.toString()}`);
            console.log(`\n${'═'.repeat(70)}`);
            console.log('Distribution Complete!');
            console.log(`  ✅ All ${wallets.length} wallets funded successfully`);
            console.log('═'.repeat(70));
          } else {
            console.log(`   ❌ Batch transaction failed`);
          }
        } catch (error) {
          console.log(`\n❌ Batch transfer failed: ${error.message}`);
          console.log('   Falling back to individual transfers...');
          await executeIndividualTransfers(fundingWallet, wallets, finalPerWalletAmount, config);
        }
      } else {
        // No batch contract - use individual transfers
        if (!config.batchContract && wallets.length >= 2) {
          console.log(`\n⚠️  No batch contract deployed on ${network}. Using individual transfers.`);
          console.log(`   Tip: Deploy batch contract via menu option 4 to save gas.`);
        }
        await executeIndividualTransfers(fundingWallet, wallets, finalPerWalletAmount, config);
      }
    }
    
    await safeDestroyProvider(provider);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  await question('\nPress Enter to continue...');
}

async function consolidateFundsMenu() {
  clearScreen();
  printHeader('CONSOLIDATE TO SINGLE WALLET');
  
  const keys = process.env.PAYMASTER_PRIVATE_KEYS.split(',').map(k => k.trim());
  
  console.log('Available networks:');
  ALL_NETWORKS.forEach((name, i) => console.log(`${i + 1}. ${name}`));
  console.log('');
  
  const networkIndex = parseInt(await question('Select network: ')) - 1;
  if (networkIndex < 0 || networkIndex >= ALL_NETWORKS.length) return;
  
  const network = ALL_NETWORKS[networkIndex];
  const config = NETWORKS_CONFIG[network];
  const rpcUrl = await getRpcUrl(config, network);
  
  if (!rpcUrl) return;
  
  const targetAddress = await question('\nTarget address for consolidation: ');
  if (!ethers.isAddress(targetAddress)) {
    console.log('\n❌ Invalid address');
    await question('Press Enter to continue...');
    return;
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Consolidating funds on ${network} to ${targetAddress}...`);
  console.log('='.repeat(70) + '\n');
  
  const executeChoice = await question('Execute transactions? (yes/no) [no]: ');
  const execute = isYes(executeChoice);
  
  try {
    const provider = rpcUrl.startsWith('wss')
      ? new ethers.WebSocketProvider(rpcUrl)
      : new ethers.JsonRpcProvider(rpcUrl);
    
    const wallets = keys.map(k => new ethers.Wallet(k, provider));
    
    // Get current gas price
    console.log('Fetching gas price...');
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
    const estimatedGasCost = 21000n * gasPrice; // Simple transfer gas cost
    
    console.log(`Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
    console.log(`Estimated gas cost per TX: ${ethers.formatEther(estimatedGasCost)} ${config.native_symbol}\n`);
    
    let totalToConsolidate = 0n;
    
    console.log('Wallet balances:');
    for (let i = 0; i < wallets.length; i++) {
      const balance = await provider.getBalance(wallets[i].address);
      const amountToSend = balance > estimatedGasCost ? balance - estimatedGasCost : 0n;
      totalToConsolidate += amountToSend;
      
      console.log(`[${i + 1}] ${wallets[i].address}`);
      console.log(`    Balance: ${ethers.formatEther(balance)} ${config.native_symbol}`);
      if (balance <= estimatedGasCost) {
        console.log(`    Will send: 0 ${config.native_symbol} (insufficient for gas)`);
      } else {
        console.log(`    Will send: ~${ethers.formatEther(amountToSend)} ${config.native_symbol}`);
      }
    }
    
    console.log(`\nTotal to consolidate: ${ethers.formatEther(totalToConsolidate)} ${config.native_symbol}`);
    
    if (!execute) {
      console.log(`\n⚠️  DRY RUN MODE - No transactions will be sent`);
    } else {
      console.log(`\n🚀 Executing consolidation...`);
      
      for (let i = 0; i < wallets.length; i++) {
        const balance = await provider.getBalance(wallets[i].address);
        
        if (balance === 0n) {
          console.log(`\n[${i + 1}/${wallets.length}] Skipping wallet [${i + 1}] - zero balance`);
          continue;
        }
        
        // Estimate gas for actual transaction to target address
        let gasEstimate;
        let currentGasPrice;
        let gasCost;
        
        try {
          // Fetch current gas price first
          const currentFeeData = await provider.getFeeData();
          currentGasPrice = currentFeeData.gasPrice || currentFeeData.maxFeePerGas || 0n;
          
          // Estimate what we'll send (balance minus approximate gas cost)
          // Use 21000 * gasPrice as initial estimate for simple transfer
          const roughGasCost = 21000n * currentGasPrice;
          const estimatedSendAmount = balance > roughGasCost ? balance - roughGasCost : balance / 2n;
          
          // Estimate gas for the actual amount we plan to send
          gasEstimate = await provider.estimateGas({
            from: wallets[i].address,
            to: targetAddress,
            value: estimatedSendAmount,
          });
          
          // Calculate actual gas cost
          gasCost = gasEstimate * currentGasPrice;
          
          console.log(`\n[${i + 1}/${wallets.length}] Wallet [${i + 1}]`);
          console.log(`  Address: ${wallets[i].address}`);
          console.log(`  Balance: ${ethers.formatEther(balance)} ${config.native_symbol}`);
          console.log(`  Gas estimate: ${gasEstimate.toString()} units`);
          console.log(`  Gas price: ${ethers.formatUnits(currentGasPrice, 'gwei')} gwei`);
          console.log(`  Gas cost: ${ethers.formatEther(gasCost)} ${config.native_symbol}`);
          
        } catch (error) {
          console.log(`\n[${i + 1}/${wallets.length}] Skipping wallet [${i + 1}]`);
          console.log(`  Cannot estimate gas: ${error.message}`);
          continue;
        }
        
        // Calculate amount to send (balance minus exact gas cost)
        const amountToSend = balance > gasCost ? balance - gasCost : 0n;
        
        if (amountToSend <= 0n) {
          console.log(`  ⚠️  Skipping - insufficient balance (need ${ethers.formatEther(gasCost)} ${config.native_symbol} for gas)`);
          continue;
        }
        
        console.log(`  Amount to send: ${ethers.formatEther(amountToSend)} ${config.native_symbol}`);
        
        try {
          const tx = await wallets[i].sendTransaction({
            to: targetAddress,
            value: amountToSend,
            gasLimit: gasEstimate,
            gasPrice: currentGasPrice,
          });
          
          console.log(`  📤 TX: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
          console.log(`  ⛽ Gas used: ${receipt.gasUsed.toString()} units`);
          const actualCost = receipt.gasUsed * (receipt.gasPrice || currentGasPrice);
          console.log(`  ⛽ Gas cost: ${ethers.formatEther(actualCost)} ${config.native_symbol}`);
        } catch (error) {
          console.log(`  ❌ Error: ${error.shortMessage || error.message}`);
        }
      }
      
      console.log('\n✅ Consolidation complete!');
    }
    
    await safeDestroyProvider(provider);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  await question('\nPress Enter to continue...');
}

// ============================================================================
// 4. DEPLOY CONTRACTS
// ============================================================================

async function deployContracts() {
  clearScreen();
  printHeader('DEPLOY BATCH TRANSFER CONTRACT');
  
  console.log('⚠️  This will deploy the BatchTransfer contract to the selected network.');
  console.log('⚠️  Ensure you have gas funds in the deployer wallet.\n');
  
  console.log('Available networks:');
  ALL_NETWORKS.forEach((name, i) => {
    const deployed = NETWORKS_CONFIG[name].batchContract ? '✓' : '✗';
    console.log(`${i + 1}. ${name} ${deployed}`);
  });
  console.log('');
  
  const networkIndex = parseInt(await question('Select network: ')) - 1;
  if (networkIndex < 0 || networkIndex >= ALL_NETWORKS.length) return;
  
  const network = ALL_NETWORKS[networkIndex];
  const config = NETWORKS_CONFIG[network];
  
  if (config.batchContract) {
    console.log(`\n⚠️  Batch contract already deployed: ${config.batchContract}`);
    const overwrite = await question('Deploy new contract anyway? (yes/no): ');
    if (overwrite.toLowerCase() !== 'yes') return;
  }
  
  const paymasterEnv = process.env.PAYMASTER_PRIVATE_KEYS || '';
  const paymasterKeys = paymasterEnv.split(',').map(k => k.trim()).filter(k => k.length > 0);

  // Ensure RPC configured
  const rpcUrl = await getRpcUrl(config, network);
  if (!rpcUrl) return;

  // Create provider early to fetch balances
  const provider = rpcUrl.startsWith('wss')
    ? new ethers.WebSocketProvider(rpcUrl)
    : new ethers.JsonRpcProvider(rpcUrl);

  // Prepare list of candidate deployers (address + balance) from paymaster keys
  const candidates = [];

  for (let i = 0; i < paymasterKeys.length; i++) {
    const raw = paymasterKeys[i];
    const formatted = raw.startsWith('0x') ? raw : '0x' + raw;
    try {
      const w = new ethers.Wallet(formatted, provider);
      const bal = await provider.getBalance(w.address);
      candidates.push({ source: `paymaster[${i}]`, key: formatted, address: w.address, balance: bal });
    } catch (e) {
      // skip invalid key
    }
  }

  // Always allow entering an external deployer private key
  candidates.push({ source: 'external', key: null, address: '<enter private key>', balance: 0n });

  // Show candidates with balances
  console.log('\nAvailable deployer candidates:');
  candidates.forEach((c, idx) => {
    if (c.source === 'external') {
      console.log(`  ${idx + 1}. Enter external private key`);
    } else {
      console.log(`  ${idx + 1}. ${c.address} (${c.source}) - ${ethers.formatEther(c.balance)} ${config.native_symbol}`);
    }
  });

  const selInput = await question('\nSelect deployer number: ');
  const sel = parseInt(selInput) - 1;
  if (isNaN(sel) || sel < 0 || sel >= candidates.length) {
    console.log('\n❌ Invalid selection');
    await safeDestroyProvider(provider);
    await question('Press Enter to continue...');
    return;
  }

  let deployerKey;
  let wallet;
  let walletBalance;

  const selected = candidates[sel];
  if (selected.source === 'external') {
    const inputKey = await question('\nEnter external private key (with or without 0x): ');
    if (!inputKey) {
      console.log('\n❌ Private key is required');
      await safeDestroyProvider(provider);
      await question('Press Enter to continue...');
      return;
    }
    const formattedKey = inputKey.startsWith('0x') ? inputKey : '0x' + inputKey;
    try {
      wallet = new ethers.Wallet(formattedKey, provider);
      walletBalance = await provider.getBalance(wallet.address);
      deployerKey = formattedKey;
    } catch (e) {
      console.log('\n❌ Invalid private key');
      await safeDestroyProvider(provider);
      await question('Press Enter to continue...');
      return;
    }
  } else {
    deployerKey = selected.key;
    wallet = new ethers.Wallet(deployerKey, provider);
    walletBalance = selected.balance;
  }

  console.log(`\nDeployer: ${wallet.address}`);
    console.log(`Balance: ${ethers.formatEther(walletBalance)} ${config.native_symbol}\n`);
  if (walletBalance === 0n) {
    console.log('❌ Deployer wallet has zero balance');
    await safeDestroyProvider(provider);
    await question('Press Enter to continue...');
    return;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Deploying to ${network}...`);
  console.log('='.repeat(70) + '\n');
  
  try {
    // Complete compiled bytecode for BatchTransfer contract
    const bytecode = '0x608060405234801561001057600080fd5b50610c44806100206000396000f3fe6080604052600436106100295760003560e01c806352f7c9881461003557806369bfed0b1461004f57600080fd5b3661003057005b600080fd5b610048610043366004610961565b610064565b005b34801561005b57600080fd5b506100486103f5565b8151835114610105576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601060248201527f4c656e677468206d69736d617463680000000000000000000000000000000000604482015260640160405180910390fd5b6000835111610170576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f456d70747920617272617973000000000000000000000000000000000000000060448201526064015b60405180910390fd5b60648351111561021c576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601360248201527f546f6f206d616e7920726563697069656e747300000000000000000000000000604482015260640161016757505050565b6000805b84518110156103365760006001600160a01b03168582815181106102465761024661097d565b60200260200101516001600160a01b0316036102be576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f5a65726f20616464726573730000000000000000000000000000000000000000604482015260640161016757505050565b6000838281518110156102d3576102d361097d565b60200260200101511115610343576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600b60248201527f5a65726f20616d6f756e74000000000000000000000000000000000000000000604482015260640161016757505050565b82818151811061035557610355610993565b6020026020010151826103689190610a22565b91508061037481610a35565b915050610220565b50803414610340576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601660248201527f496e636f7272656374206f74616c20616d6f756e7400000000000000000000006044820152606401610167565b6000805b845181101561051d57600085828151811061041d5761041d61097d565b6020026020010151905060008583815181106104b5576104b561097d565b60200260200101519050600080600160a01b031686848151811061052557610525610993565b60200260200101516001600160a01b031614610570573684828151811061054e5761054e61097d565b905060200201516105705760405162461bcd60e51b8152602060048201526000602482015260440161016757505050565b828683815181106105835761058361097d565b6020026020010151604051600060405180830381858888f193505050503d80600081146105e5576040519150601f19603f3d011682016040523d82523d6000602084013e6105ea565b606091505b5091505081610620578360001901935061061b57604051807f5472616e73666572206661696c656400000000000000000000000000000000006000820152600f01604051809103902091505b61062d565b836001019350505050565b8061063781610a35565b9150506103f9565b508351821461071c576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601660248201527f536f6d65207472616e7366657273206661696c65640000000000000000000000604482015260640161016757505050565b7f6cfa61d92d19c7e34c096f2cd846b90b4c2dfed26d4e87cde4b99c2fa9adbdc133858551604051610751939291909283526020830191909152604082015260600190565b60405180910390a15050505050565b634e487b7160e01b600052604160045260246000fd5b604051601f82017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe016810167ffffffffffffffff811182821017156107c1576107c1610761565b604052919050565b600067ffffffffffffffff8211156107e3576107e3610761565b5060051b60200190565b6000602082840312156107ff57600080fd5b813567ffffffffffffffff81111561081657600080fd5b8201601f8101841361082757600080fd5b803561083a610835826107c9565b61078a565b80828252602082019150602084018760208584028101111561085b57600080fd5b60005b838110156108945781358060201b6001600160a01b038116811461088157600080fd5b84526020909301929190910190600101610830565b5095945050505050565b600080604083850312156108b157600080fd5b823567ffffffffffffffff808211156108c957600080fd5b6108d5868387016107ed565b935060208501359150808211156108eb57600080fd5b818501915085601f8301126108ff57600080fd5b813561090d610835826107c9565b80828252602082019150602084018860208560051b870101111561093057600080fd5b60005b8481101561095157813584526020938401939091019060010161093357505095945050505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b808201808211156109fe577f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b92915050565b60007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8203610a6c577f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b5060010190565b600060208284031215610a8557600080fd5b5051919050565b634e487b7160e01b600052603160045260246000fdfea2646970667358221220';
    
    const abi = [
      'event BatchTransferExecuted(address indexed sender, uint256 totalAmount, uint256 recipientCount)',
      'event TransferFailed(address indexed recipient, uint256 amount)',
      'function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external payable',
      'function batchTransferEqual(address[] calldata recipients) external payable',
    ];
    
    console.log('📝 Deploying BatchTransfer contract...\n');
    
    // Create contract factory
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    
    // Estimate gas
    console.log('⛽ Estimating deployment gas...');
    const deployTx = await factory.getDeployTransaction();
    const gasEstimate = await provider.estimateGas(deployTx);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
    const estimatedCost = gasEstimate * gasPrice;
    
    console.log(`   Gas estimate: ${gasEstimate.toString()} units`);
    console.log(`   Estimated cost: ~${ethers.formatEther(estimatedCost)} ${config.native_symbol}\n`);
    
    const confirm = await question('Deploy contract? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('\n❌ Deployment cancelled');
      await question('Press Enter to continue...');
      return;
    }
    
    console.log('\n🚀 Deploying contract...');
    const contract = await factory.deploy();
    console.log(`   📤 TX: ${contract.deploymentTransaction().hash}`);
    console.log(`   ⏳ Waiting for confirmation...`);
    
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    
    console.log(`\n${'═'.repeat(70)}`);
    console.log('✅ Contract Deployed Successfully!');
    console.log('═'.repeat(70));
    console.log(`Contract Address: ${address}`);
    console.log(`Network: ${network}`);
    console.log(`Chain ID: ${config.chainId}`);
    console.log(`Explorer: ${config.explorer}/address/${address}`);
    console.log('═'.repeat(70));
    
    // Save to networks.json
    const saveChoice = await question('\nSave contract address to networks.json? (yes/no): ');
    if (isYes(saveChoice)) {
      NETWORKS_CONFIG[network].batchContract = address;
      saveNetworks();
      console.log('✅ Contract address saved to networks.json');
    }
    
    await safeDestroyProvider(provider);
  } catch (error) {
    console.log('❌ Error:', error.message);
    if (error.code) {
      console.log(`   Code: ${error.code}`);
    }
  }
  
  await question('\nPress Enter to continue...');
}

// ============================================================================
// 5. MERCHANT MANAGEMENT
// ============================================================================

async function merchantManagement() {
  while (true) {
    clearScreen();
    printHeader('MERCHANT MANAGEMENT');
    
    console.log('1. Create Merchant');
    console.log('2. Update Merchant Tier');
    console.log('3. List Merchants');
    console.log('0. Back to Main Menu\n');
    
    const choice = await question('Select option: ');
    
    switch (choice) {
      case '1':
        await createMerchant();
        break;
      case '2':
        await updateMerchantTier();
        break;
      case '3':
        await listMerchants();
        break;
      case '0':
        return;
      default:
        console.log('Invalid option');
        await question('Press Enter to continue...');
    }
  }
}

async function createMerchant() {
  clearScreen();
  printHeader('CREATE MERCHANT');
  
  const businessName = await question('Business name (optional): ');
  const useExistingKey = await question('Use existing auth key? (yes/no): ');
  
  let authWallet;
  if (isYes(useExistingKey)) {
    const privateKey = await question('Auth private key: ');
    try {
      authWallet = new ethers.Wallet(privateKey);
    } catch (error) {
      console.log('❌ Invalid private key');
      await question('Press Enter to continue...');
      return;
    }
  } else {
    authWallet = ethers.Wallet.createRandom();
  }
  
  const depositWallet = ethers.Wallet.createRandom();
  const apiKey = crypto.randomBytes(32).toString('hex');
  const webhookSecret = crypto.randomBytes(32).toString('hex');
  
  console.log('\n' + '='.repeat(70));
  console.log('MERCHANT CREDENTIALS');
  console.log('='.repeat(70));
  console.log(`\nBusiness: ${businessName || 'Not set'}`);
  console.log(`Auth Address: ${authWallet.address}`);
  console.log(`API Key: ${apiKey}`);
  console.log(`Webhook Secret: ${webhookSecret}`);
  console.log(`\nAuth Wallet:`);
  console.log(`  Address: ${authWallet.address}`);
  console.log(`  Private Key: ${authWallet.privateKey}`);
  if (authWallet.mnemonic) {
    console.log(`  Mnemonic: ${authWallet.mnemonic.phrase}`);
  }
  console.log(`\nDeposit Wallet:`);
  console.log(`  Address: ${depositWallet.address}`);
  console.log(`  Private Key: ${depositWallet.privateKey}`);
  
  const saveToDb = await question('\nSave to database? (yes/no): ');
  
  if (isYes(saveToDb)) {
    try {
      const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        database: process.env.DB_NAME || 'x402_facilitator',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
      });
      
      await connection.execute(
        `INSERT INTO merchants 
         (auth_address, business_name, api_key, private_key, webhook_secret, webhook_events, tier) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          authWallet.address.toLowerCase(),
          businessName || null,
          apiKey,
          depositWallet.privateKey,
          webhookSecret,
          'payment.verified,payment.settled',
          'free'
        ]
      );
      
      await connection.end();
      console.log('\n✅ Merchant saved to database');
    } catch (error) {
      console.log('\n❌ Database error:', error.message);
    }
  }
  
  await question('\nPress Enter to continue...');
}

async function updateMerchantTier() {
  clearScreen();
  printHeader('UPDATE MERCHANT TIER');
  
  const TIERS = {
    free: { verify: 60, settle: 20 },
    basic: { verify: 120, settle: 40 },
    pro: { verify: 300, settle: 100 },
    enterprise: { verify: 1000, settle: 500 },
  };
  
  const authAddress = await question('Merchant auth address: ');
  
  console.log('\nAvailable tiers:');
  Object.entries(TIERS).forEach(([name, limits]) => {
    console.log(`  ${name.padEnd(12)} - ${limits.verify} verify/min, ${limits.settle} settle/min`);
  });
  
  const tier = await question('\nSelect tier: ');
  
  if (!TIERS[tier]) {
    console.log('❌ Invalid tier');
    await question('Press Enter to continue...');
    return;
  }
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      database: process.env.DB_NAME || 'x402_facilitator',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });
    
    const [result] = await connection.execute(
      'UPDATE merchants SET tier = ? WHERE auth_address = ?',
      [tier, authAddress.toLowerCase()]
    );
    
    await connection.end();
    
    if (result.affectedRows > 0) {
      console.log(`\n✅ Merchant tier updated to ${tier}`);
    } else {
      console.log('\n❌ Merchant not found');
    }
  } catch (error) {
    console.log('\n❌ Database error:', error.message);
  }
  
  await question('\nPress Enter to continue...');
}

async function listMerchants() {
  clearScreen();
  printHeader('MERCHANTS');
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      database: process.env.DB_NAME || 'x402_facilitator',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });
    
    const [merchants] = await connection.execute(
      'SELECT id, auth_address, business_name, tier, created_at FROM merchants ORDER BY created_at DESC LIMIT 20'
    );
    
    await connection.end();
    
    if (merchants.length === 0) {
      console.log('No merchants found');
    } else {
      merchants.forEach((m, i) => {
        console.log(`${i + 1}. ${m.auth_address}`);
        console.log(`   Business: ${m.business_name || 'N/A'}`);
        console.log(`   Tier: ${m.tier}`);
        console.log(`   Created: ${m.created_at}\n`);
      });
    }
  } catch (error) {
    console.log('❌ Database error:', error.message);
  }
  
  await question('Press Enter to continue...');
}

// ============================================================================
// 6. GAS STATISTICS
// ============================================================================

async function gasStatistics() {
  clearScreen();
  printHeader('GAS STATISTICS');
  
  console.log('1. All Time Stats');
  console.log('2. Today\'s Stats');
  console.log('3. Last 7 Days');
  console.log('4. By Network');
  console.log('0. Back to Main Menu\n');
  
  const choice = await question('Select option: ');
  
  let whereClause = '1=1';
  let params = [];
  
  switch (choice) {
    case '1':
      // All time
      break;
    case '2':
      whereClause = 'DATE(timestamp) = CURDATE()';
      break;
    case '3':
      whereClause = 'timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
      break;
    case '4':
      console.log('\nAvailable networks:');
      ALL_NETWORKS.forEach((name, i) => console.log(`${i + 1}. ${name}`));
      const networkIndex = parseInt(await question('\nSelect network: ')) - 1;
      if (networkIndex >= 0 && networkIndex < ALL_NETWORKS.length) {
        whereClause = 'network = ?';
        params.push(ALL_NETWORKS[networkIndex]);
      }
      break;
    case '0':
      return;
    default:
      await question('Invalid option. Press Enter...');
      return;
  }
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      database: process.env.DB_NAME || 'x402_facilitator',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });
    
    const [summary] = await connection.execute(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COALESCE(SUM(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as total_cost,
        COALESCE(AVG(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as avg_cost
      FROM gas_tracking
      WHERE ${whereClause}`,
      params
    );
    
    await connection.end();
    
    const stats = summary[0];
    
    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Transactions: ${stats.total}`);
    console.log(`  ✅ Successful: ${stats.successful}`);
    console.log(`  ❌ Failed: ${stats.failed}`);
    console.log(`\nTotal Gas Cost: ${parseFloat(stats.total_cost).toFixed(6)}`);
    console.log(`Average Cost: ${parseFloat(stats.avg_cost).toFixed(6)}`);
    
  } catch (error) {
    console.log('❌ Database error:', error.message);
  }
  
  await question('\nPress Enter to continue...');
}

// ============================================================================
// MAIN MENU
// ============================================================================

async function mainMenu() {
  while (true) {
    clearScreen();
    printHeader('X402 FACILITATOR TOOLS');
    
    console.log('1. Network Management');
    console.log('2. Token Metadata');
    console.log('3. Paymaster Balances');
    console.log('4. Deploy Contracts');
    console.log('5. Merchant Management');
    console.log('6. Gas Statistics');
    console.log('0. Exit\n');
    
    const choice = await question('Select option: ');
    
    switch (choice) {
      case '1':
        await networkManagement();
        break;
      case '2':
        await tokenMetadata();
        break;
      case '3':
        await paymasterBalances();
        break;
      case '4':
        await deployContracts();
        break;
      case '5':
        await merchantManagement();
        break;
      case '6':
        await gasStatistics();
        break;
      case '0':
        console.log('\n👋 Goodbye!\n');
        rl.close();
        process.exit(0);
      default:
        console.log('Invalid option');
        await question('Press Enter to continue...');
    }
  }
}

// ============================================================================
// STARTUP
// ============================================================================

async function main() {
  if (!loadNetworks()) {
    console.log('Creating default networks.json...');
    // Could create default here
    process.exit(1);
  }
  
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
X402 FACILITATOR TOOLS

Interactive utility for managing x402 facilitator:
  • Network management (add/edit/remove networks)
  • Token metadata fetcher (ERC-20/EIP-712)
  • Paymaster balance checker
  • Contract deployment
  • Merchant management
  • Gas statistics

All operations use networks.json for consistent configuration.

Usage:
  node facilitator-tools.mjs
    `);
    process.exit(0);
  }
  
  await mainMenu();
}

main().catch(error => {
  console.error('Fatal error:', error);
  rl.close();
  process.exit(1);
});
