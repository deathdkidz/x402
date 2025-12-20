#!/usr/bin/env node

/**
 * Interactive X402 Settlement Benchmark Tool
 * 
 * Tests settlement endpoint performance with interactive configuration.
 * 
 * Usage:
 *   node scripts/benchmark-settle.mjs
 * 
 * Environment Variables (optional):
 *   PRIVATE_KEY                 - Wallet private key (0x prefixed)
 *   NEXT_PUBLIC_MERCHANT_ADDRESS - Merchant address to receive payments
 *   X402_API_KEY                - API key for facilitator
 *   NEXT_PUBLIC_FACILITATOR_URL - Facilitator URL
 */

import { createHash, randomBytes } from 'crypto';
import { parseArgs } from 'util';
import ethers from 'ethers';
import * as readline from 'readline';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisified readline question
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Configuration
let CONFIG = {
  facilitator: process.env.NEXT_PUBLIC_FACILITATOR_URL || 'https://api.novacasino.xyz',
  apiKey: process.env.X402_API_KEY || '',
  privateKey: process.env.PRIVATE_KEY || '',
  merchant: process.env.NEXT_PUBLIC_MERCHANT_ADDRESS || '',
  count: 10,
  concurrent: 1,
  network: 'Base Sepolia',
  delay: 0
};

// Interactive configuration
async function configureInteractive() {
  console.log('\n🚀 X402 Settlement Benchmark - Interactive Setup\n');
  
  // Check environment variables first
  const hasEnvVars = CONFIG.apiKey && CONFIG.privateKey && CONFIG.merchant;
  if (hasEnvVars) {
    console.log('✅ Environment variables detected:');
    console.log(`   Facilitator: ${CONFIG.facilitator}`);
    console.log(`   API Key: ${CONFIG.apiKey.slice(0, 10)}...`);
    console.log(`   Private Key: ${CONFIG.privateKey.slice(0, 10)}...`);
    console.log(`   Merchant: ${CONFIG.merchant}\n`);
    
    const useEnv = await question('Use environment variables? (Y/n): ');
    if (useEnv.toLowerCase() !== 'n') {
      return await configureTestParams();
    }
  }

  // Get API credentials
  console.log('\n📝 Configuration:\n');
  
  const facilitator = await question(`Facilitator URL (${CONFIG.facilitator}): `);
  if (facilitator.trim()) CONFIG.facilitator = facilitator.trim();
  
  const apiKey = await question('API Key: ');
  if (apiKey.trim()) CONFIG.apiKey = apiKey.trim();
  
  const privateKey = await question('Private Key (0x...): ');
  if (privateKey.trim()) CONFIG.privateKey = privateKey.trim();
  
  const merchant = await question('Merchant Address (0x...): ');
  if (merchant.trim()) CONFIG.merchant = merchant.trim();

  return await configureTestParams();
}

// Configure test parameters
async function configureTestParams() {
  console.log('\n⚙️  Test Parameters:\n');
  
  // Fetch available networks
  console.log('📡 Fetching available networks...');
  const networks = await getAvailableNetworks();
  
  if (networks.length > 0) {
    console.log('\nAvailable networks:');
    networks.forEach((net, i) => {
      console.log(`  ${i + 1}. ${net.network} (Chain ID: ${net.chainId})`);
    });
    
    const networkChoice = await question(`\nSelect network (1-${networks.length}) or enter custom name (${CONFIG.network}): `);
    if (networkChoice.trim()) {
      const choice = parseInt(networkChoice);
      if (!isNaN(choice) && choice >= 1 && choice <= networks.length) {
        CONFIG.network = networks[choice - 1].network;
      } else {
        CONFIG.network = networkChoice.trim();
      }
    }
  }
  
  const count = await question(`\nNumber of settlements (${CONFIG.count}): `);
  if (count.trim()) CONFIG.count = parseInt(count);
  
  const concurrent = await question(`Concurrent requests (${CONFIG.concurrent}): `);
  if (concurrent.trim()) CONFIG.concurrent = parseInt(concurrent);
  
  const delay = await question(`Delay between batches in ms (${CONFIG.delay}): `);
  if (delay.trim()) CONFIG.delay = parseInt(delay);
  
  // Summary
  console.log('\n📋 Configuration Summary:\n');
  console.log(`  Facilitator:     ${CONFIG.facilitator}`);
  console.log(`  Network:         ${CONFIG.network}`);
  console.log(`  Settlements:     ${CONFIG.count}`);
  console.log(`  Concurrent:      ${CONFIG.concurrent}`);
  console.log(`  Batch Delay:     ${CONFIG.delay}ms`);
  console.log(`  Cost per tx:     0.01 USDC`);
  console.log(`  Total cost:      ${(CONFIG.count * 0.01).toFixed(2)} USDC\n`);
  
  const confirm = await question('Start benchmark? (Y/n): ');
  if (confirm.toLowerCase() === 'n') {
    console.log('❌ Benchmark cancelled');
    rl.close();
    process.exit(0);
  }
}

// Get available networks from facilitator
async function getAvailableNetworks() {
  try {
    const response = await fetch(`${CONFIG.facilitator}/networks`);
    if (!response.ok) return [];
    
    const data = await response.json();
    return [...(data.mainnet || []), ...(data.testnet || [])];
  } catch (error) {
    console.error(`⚠️  Could not fetch networks: ${error.message}`);
    return [];
  }
}

// Initialize wallet
let wallet;
let checksummedMerchantAddress;

function initializeWallet() {
  try {
    wallet = new ethers.Wallet(CONFIG.privateKey);
    // CRITICAL: Use checksummed addresses for EIP-712 signing
    checksummedMerchantAddress = ethers.utils.getAddress(CONFIG.merchant);
    console.log(`\n🔑 Wallet Address: ${wallet.address}`);
    console.log(`💰 Merchant Address: ${checksummedMerchantAddress}\n`);
  } catch (error) {
    console.error('❌ Invalid private key or merchant address:', error.message);
    rl.close();
    process.exit(1);
  }
}

// Get network configuration from facilitator
async function getNetworkConfig(network) {
  try {
    const response = await fetch(`${CONFIG.facilitator}/networks`);
    if (!response.ok) {
      throw new Error(`Failed to fetch networks: ${response.status}`);
    }
    
    const data = await response.json();
    const allNetworks = [...(data.mainnet || []), ...(data.testnet || [])];
    const networkConfig = allNetworks.find(n => n.network === network);
    
    if (!networkConfig) {
      console.error(`❌ Network "${network}" not found`);
      console.error(`   Available networks: ${allNetworks.map(n => n.network).join(', ')}`);
      rl.close();
      process.exit(1);
    }
    
    return networkConfig;
  } catch (error) {
    console.error('❌ Failed to fetch network config:', error.message);
    rl.close();
    process.exit(1);
  }
}

// Create and sign a unique payment
async function createPayment(networkConfig) {
  const token = networkConfig.tokens[0];
  const nonce = "0x" + randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  
  // Use checksummed addresses for EIP-712 signing
  // Set validAfter slightly in the past to account for clock skew
  const authorization = {
    from: wallet.address, // wallet.address is already checksummed
    to: checksummedMerchantAddress,
    value: "10000",
    validAfter: (now - 60).toString(), // 60 seconds in the past
    validBefore: (now + 3600).toString(),
    nonce: nonce
  };

  // Create EIP-712 domain and types
  // CRITICAL: All addresses must be checksummed for EIP-712
  const domain = {
    name: token.eip712.name,
    version: token.eip712.version,
    chainId: networkConfig.chainId,
    verifyingContract: ethers.utils.getAddress(token.eip712.verifyingContract)
  };

  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' }
    ]
  };

  const messageToSign = {
    from: authorization.from,
    to: authorization.to,
    value: BigInt(authorization.value),
    validAfter: BigInt(authorization.validAfter),
    validBefore: BigInt(authorization.validBefore),
    nonce: authorization.nonce
  };

  if (process.env.DEBUG_PAYLOADS) {
    console.log('\n🔐 EIP-712 Signing:');
    console.log('Domain:', JSON.stringify(domain, null, 2));
    console.log('Message:', JSON.stringify(messageToSign, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    , 2));
  }

  // Sign with EIP-712 (ethers v5 uses _signTypedData)
  const signature = await wallet._signTypedData(domain, types, messageToSign);

  const payment = {
    authorization,
    signature
  };

  if (process.env.DEBUG_PAYLOADS) {
    console.log('\n📝 Payment Payload:');
    console.log(JSON.stringify(payment, null, 2));
  }

  return payment;
}

// Settle a single payment
async function settlePayment(paymentPayload, networkConfig, index) {
  const token = networkConfig.tokens[0];
  
  const requestBody = {
    x402Version: 1,
    paymentPayload: paymentPayload,
    paymentRequirements: {
      scheme: 'exact',
      network: networkConfig.network,
      asset: token.address,
      payTo: checksummedMerchantAddress,
      maxAmountRequired: "10000",
      resource: `/benchmark/${index}`,
      description: `Benchmark Settlement ${index}`,
      mimeType: 'application/json',
      maxTimeoutSeconds: 3600
    }
  };

  if (process.env.DEBUG_PAYLOADS) {
    console.log(`\n🔄 Settlement Request #${index}:`);
    console.log(JSON.stringify(requestBody, null, 2));
  }

  const startTime = Date.now();
  
  try {
    const response = await fetch(`${CONFIG.facilitator}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    const duration = Date.now() - startTime;
    const result = await response.json();

    if (process.env.DEBUG_PAYLOADS) {
      console.log(`\n✅ Settlement Response #${index} (${response.status}):`);
      console.log(JSON.stringify(result, null, 2));
    }

    return {
      index,
      success: response.ok && result.success,
      status: result.status || (result.success ? 'completed' : 'failed'),
      duration,
      statusCode: response.status,
      error: result.errorReason || result.error_reason,
      transactionHash: result.transaction || result.transactionHash,
      message: result.message,
      rawResponse: process.env.DEBUG_PAYLOADS ? result : undefined
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      index,
      success: false,
      status: 'error',
      duration,
      error: error.message
    };
  }
}

// Run benchmark
async function runBenchmark() {
  console.log('⏱️  Starting benchmark...\n');

  // Fetch network configuration
  console.log('📡 Fetching network configuration...');
  const networkConfig = await getNetworkConfig(CONFIG.network);
  console.log(`✅ Using ${networkConfig.network} (Chain ID: ${networkConfig.chainId})`);
  console.log(`   Token: ${networkConfig.tokens[0].symbol} (${networkConfig.tokens[0].address})\n`);

  const results = [];
  const overallStart = Date.now();

  // Process in batches based on concurrency
  for (let i = 0; i < CONFIG.count; i += CONFIG.concurrent) {
    const batchSize = Math.min(CONFIG.concurrent, CONFIG.count - i);
    const batchPromises = [];

    for (let j = 0; j < batchSize; j++) {
      const index = i + j + 1;
      const payment = await createPayment(networkConfig);
      batchPromises.push(settlePayment(payment, networkConfig, index));
    }

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Progress indicator
    const completed = results.length;
    const percent = ((completed / CONFIG.count) * 100).toFixed(1);
    const successful = results.filter(r => r.success).length;
    process.stdout.write(`\r  Progress: ${completed}/${CONFIG.count} (${percent}%) | Success: ${successful}`);

    // Delay between batches if specified
    if (CONFIG.delay > 0 && i + CONFIG.concurrent < CONFIG.count) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.delay));
    }
  }

  const overallDuration = Date.now() - overallStart;
  console.log('\n\n📊 Benchmark Results:\n');

  // Calculate statistics
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const durations = results.map(r => r.duration);
  const successfulDurations = successful.map(r => r.duration);

  const stats = {
    total: CONFIG.count,
    successful: successful.length,
    failed: failed.length,
    successRate: ((successful.length / CONFIG.count) * 100).toFixed(2),
    overallDuration: overallDuration,
    throughput: (CONFIG.count / (overallDuration / 1000)).toFixed(2),
    avgDuration: (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2),
    minDuration: Math.min(...durations),
    maxDuration: Math.max(...durations),
    medianDuration: durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)],
  };

  if (successful.length > 0) {
    stats.avgSuccessfulDuration = (successfulDurations.reduce((a, b) => a + b, 0) / successfulDurations.length).toFixed(2);
    stats.minSuccessfulDuration = Math.min(...successfulDurations);
    stats.maxSuccessfulDuration = Math.max(...successfulDurations);
  }

  // Print summary
  console.log(`Success Rate:`);
  console.log(`  Total Requests: ${stats.total}`);
  console.log(`  Successful: ${stats.successful} (${stats.successRate}%)`);
  console.log(`  Failed: ${stats.failed}`);
  console.log();
  
  console.log(`Performance:`);
  console.log(`  Overall Duration: ${stats.overallDuration}ms`);
  console.log(`  Throughput: ${stats.throughput} req/sec`);
  console.log(`  Avg Response Time: ${stats.avgDuration}ms`);
  console.log(`  Min Response Time: ${stats.minDuration}ms`);
  console.log(`  Max Response Time: ${stats.maxDuration}ms`);
  console.log(`  Median Response Time: ${stats.medianDuration}ms`);
  
  if (successful.length > 0) {
    console.log();
    console.log(`Successful Settlements:`);
    console.log(`  Avg Duration: ${stats.avgSuccessfulDuration}ms`);
    console.log(`  Min Duration: ${stats.minSuccessfulDuration}ms`);
    console.log(`  Max Duration: ${stats.maxSuccessfulDuration}ms`);
  }

  // Show status breakdown
  const statusCounts = {};
  results.forEach(r => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  });

  console.log();
  console.log(`Status Breakdown:`);
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });

  // Show errors if any
  if (failed.length > 0) {
    console.log();
    console.log(`❌ Failed Settlements (first 5 - set DEBUG_PAYLOADS=1 for full details):`);
    failed.slice(0, 5).forEach(r => {
      console.log(`  #${r.index}: ${r.error || 'Unknown error'} (${r.duration}ms)`);
    });
    if (failed.length > 5) {
      console.log(`  ... and ${failed.length - 5} more failures`);
    }
  }

  // Show sample successful transactions
  if (successful.length > 0) {
    console.log();
    console.log(`✅ Sample Successful Transactions (first 3):`);
    successful.slice(0, 3).forEach(r => {
      console.log(`  #${r.index}: ${r.transactionHash || 'N/A'} (${r.duration}ms, ${r.status})`);
    });
  }

  console.log();
  console.log('✨ Benchmark complete!');
  
  // Ask if user wants to run again
  console.log();
  const again = await question('Run another benchmark? (y/N): ');
  if (again.toLowerCase() === 'y') {
    await configureTestParams();
    initializeWallet();
    await runBenchmark();
  } else {
    rl.close();
  }
}

// Main entry point
async function main() {
  try {
    await configureInteractive();
    initializeWallet();
    await runBenchmark();
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error.message);
    rl.close();
    process.exit(1);
  }
}

// Run the benchmark
main();
