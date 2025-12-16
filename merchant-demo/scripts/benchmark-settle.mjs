#!/usr/bin/env node

/**
 * Batch Settlement Benchmark Script
 * 
 * Tests settlement endpoint performance by submitting multiple payments
 * with actual wallet signatures and measuring response times, success rates, and throughput.
 * 
 * Prerequisites:
 *   - Wallet must have sufficient token balance for payments
 *   - Each payment costs 10000 units (0.01 USDC)
 * 
 * Usage:
 *   node scripts/benchmark-settle.mjs [options]
 * 
 * Environment Variables:
 *   PRIVATE_KEY                 - Wallet private key (0x prefixed)
 *   NEXT_PUBLIC_MERCHANT_ADDRESS - Merchant address to receive payments
 *   X402_API_KEY                - API key for facilitator
 * 
 * Options:
 *   --count <n>           Number of settlements to test (default: 10)
 *   --concurrent <n>      Number of concurrent requests (default: 1)
 *   --network <name>      Network to use (default: Base Sepolia)
 *   --delay <ms>          Delay between batches in ms (default: 0)
 *   --facilitator <url>   Facilitator URL (default: from env)
 *   --private-key <key>   Private key for signing (overrides env var)
 *   --merchant <addr>     Merchant address (overrides env var)
 *   --apiKey <key>        API key (overrides env var)
 * 
 * Example:
 *   export PRIVATE_KEY=0x...
 *   export NEXT_PUBLIC_MERCHANT_ADDRESS=0x530f...
 *   export X402_API_KEY=df12...
 *   node scripts/benchmark-settle.mjs --count 10 --concurrent 3 --network "Base Sepolia"
 */

import { createHash, randomBytes } from 'crypto';
import { parseArgs } from 'util';
import { ethers } from 'ethers';

// Parse command line arguments
const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '10' },
    concurrent: { type: 'string', default: '1' },
    network: { type: 'string', default: 'Base Sepolia' },
    delay: { type: 'string', default: '0' },
    facilitator: { type: 'string', default: process.env.NEXT_PUBLIC_FACILITATOR_URL || 'https://api.novacasino.xyz' },
    apiKey: { type: 'string', default: process.env.X402_API_KEY || '' },
    privateKey: { type: 'string', default: process.env.PRIVATE_KEY || '' },
    merchant: { type: 'string', default: process.env.NEXT_PUBLIC_MERCHANT_ADDRESS || '' },
  }
});

const COUNT = parseInt(values.count);
const CONCURRENT = parseInt(values.concurrent);
const NETWORK = values.network;
const DELAY = parseInt(values.delay);
const FACILITATOR_URL = values.facilitator;
const API_KEY = values.apiKey;
const PRIVATE_KEY = values.privateKey;
const MERCHANT_ADDRESS = values.merchant;

if (!API_KEY) {
  console.error('❌ Error: X402_API_KEY environment variable not set');
  console.error('   Set it or pass --apiKey flag');
  process.exit(1);
}

if (!PRIVATE_KEY) {
  console.error('❌ Error: PRIVATE_KEY environment variable not set');
  console.error('   Set it or pass --private-key flag');
  process.exit(1);
}

if (!MERCHANT_ADDRESS) {
  console.error('❌ Error: NEXT_PUBLIC_MERCHANT_ADDRESS environment variable not set');
  console.error('   Set it or pass --merchant flag');
  process.exit(1);
}

// Initialize wallet
let wallet;
let checksummedMerchantAddress;
try {
  wallet = new ethers.Wallet(PRIVATE_KEY);
  // CRITICAL: Use checksummed addresses for EIP-712 signing
  checksummedMerchantAddress = ethers.getAddress(MERCHANT_ADDRESS);
  console.log(`🔑 Wallet Address: ${wallet.address}`);
  console.log(`💰 Merchant Address: ${checksummedMerchantAddress}`);
} catch (error) {
  console.error('❌ Invalid private key or merchant address:', error.message);
  process.exit(1);
}

// Get network configuration from facilitator
async function getNetworkConfig(network) {
  try {
    const response = await fetch(`${FACILITATOR_URL}/networks`);
    if (!response.ok) {
      throw new Error(`Failed to fetch networks: ${response.status}`);
    }
    
    const data = await response.json();
    const allNetworks = [...(data.mainnet || []), ...(data.testnet || [])];
    const networkConfig = allNetworks.find(n => n.network === network);
    
    if (!networkConfig) {
      console.error(`❌ Network "${network}" not found`);
      console.error(`   Available networks: ${allNetworks.map(n => n.network).join(', ')}`);
      process.exit(1);
    }
    
    return networkConfig;
  } catch (error) {
    console.error('❌ Failed to fetch network config:', error.message);
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
    verifyingContract: ethers.getAddress(token.eip712.verifyingContract)
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

  // Sign with EIP-712
  const signature = await wallet.signTypedData(domain, types, messageToSign);

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
    const response = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
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
  console.log('🚀 X-402 Settlement Benchmark\n');
  console.log(`Configuration:`);
  console.log(`  Facilitator: ${FACILITATOR_URL}`);
  console.log(`  Network: ${NETWORK}`);
  console.log(`  Total Settlements: ${COUNT}`);
  console.log(`  Concurrent Requests: ${CONCURRENT}`);
  console.log(`  Delay Between Batches: ${DELAY}ms`);
  console.log(`  Debug Mode: ${process.env.DEBUG_PAYLOADS ? '✅ Enabled (showing all payloads)' : '❌ Disabled (set DEBUG_PAYLOADS=1 to enable)'}\n`);

  // Fetch network configuration
  console.log('📡 Fetching network configuration...');
  const networkConfig = await getNetworkConfig(NETWORK);
  console.log(`✅ Using ${networkConfig.network} (Chain ID: ${networkConfig.chainId})`);
  console.log(`   Token: ${networkConfig.tokens[0].symbol} (${networkConfig.tokens[0].address})\n`);

  console.log('⏱️  Starting benchmark...\n');

  const results = [];
  const overallStart = Date.now();

  // Process in batches based on concurrency
  for (let i = 0; i < COUNT; i += CONCURRENT) {
    const batchSize = Math.min(CONCURRENT, COUNT - i);
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
    const percent = ((completed / COUNT) * 100).toFixed(1);
    const successful = results.filter(r => r.success).length;
    process.stdout.write(`\r  Progress: ${completed}/${COUNT} (${percent}%) | Success: ${successful}`);

    // Delay between batches if specified
    if (DELAY > 0 && i + CONCURRENT < COUNT) {
      await new Promise(resolve => setTimeout(resolve, DELAY));
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
    total: COUNT,
    successful: successful.length,
    failed: failed.length,
    successRate: ((successful.length / COUNT) * 100).toFixed(2),
    overallDuration: overallDuration,
    throughput: (COUNT / (overallDuration / 1000)).toFixed(2),
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
}

// Run the benchmark
runBenchmark().catch(error => {
  console.error('\n❌ Benchmark failed:', error.message);
  process.exit(1);
});
