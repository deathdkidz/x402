#!/usr/bin/env node

/**
 * Facilitator Settlement Benchmark
 * 
 * Compares settlement speed between NetPay and PayAI facilitators
 * using real signed transactions.
 * 
 * Usage:
 *   node benchmark-settle.mjs [iterations]
 * 
 * Environment Variables:
 *   PRIVATE_KEY       - Wallet private key (0x prefixed)
 *   MERCHANT_ADDRESS  - Merchant address to receive payments
 *   NETPAY_API_KEY    - API key for NetPay facilitator
 *   PAYAI_API_KEY     - API key for PayAI facilitator (optional)
 */

import { randomBytes } from 'crypto';
import ethers from 'ethers';

// Configuration
// Hardcoded test credentials from netpay-web
const TEST_API_KEY = 'df120001616ba25dbd53c2016fbbdcab272dc31f377dc644cb7c0dd36ee54958';
const TEST_PRIVATE_KEY = '0x2259e98a73602c87ef0b2c27366f8713988d0b67995f3c8d0dd3aa0990571280';
const TEST_MERCHANT = '0x706044A25A845e7dC2286835Fcf5cf59D8B2A84b';

const CONFIG = {
  netpay: {
    url: process.env.NETPAY_URL || 'https://api.netpay.id',
    apiKey: process.env.NETPAY_API_KEY || TEST_API_KEY
  },
  payai: {
    url: process.env.PAYAI_URL || 'https://facilitator.payai.network',
    apiKey: process.env.PAYAI_API_KEY || ''
  },
  privateKey: process.env.PRIVATE_KEY || TEST_PRIVATE_KEY,
  merchant: process.env.MERCHANT_ADDRESS || TEST_MERCHANT,
  iterations: parseInt(process.argv[2]) || 3,
  network: process.env.NETWORK || 'base-sepolia',
  skipSettle: process.argv.includes('--skip-settle')
};

// Colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Base Sepolia USDC configuration
const USDC_CONFIG = {
  address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  chainId: 84532,
  eip712: {
    name: 'USDC',
    version: '2',
    verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  }
};

let wallet;
let checksummedMerchant;

function initWallet() {
  wallet = new ethers.Wallet(CONFIG.privateKey);
  checksummedMerchant = ethers.utils.getAddress(CONFIG.merchant);
  
  console.log(`${colors.cyan}🔑 Wallet: ${wallet.address}${colors.reset}`);
  console.log(`${colors.cyan}💰 Merchant: ${checksummedMerchant}${colors.reset}`);
}

// Create signed payment authorization
async function createPayment() {
  const nonce = '0x' + randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  
  const authorization = {
    from: wallet.address,
    to: checksummedMerchant,
    value: '10000', // 0.01 USDC
    validAfter: (now - 60).toString(),
    validBefore: (now + 3600).toString(),
    nonce: nonce
  };

  const domain = {
    name: USDC_CONFIG.eip712.name,
    version: USDC_CONFIG.eip712.version,
    chainId: USDC_CONFIG.chainId,
    verifyingContract: ethers.utils.getAddress(USDC_CONFIG.eip712.verifyingContract)
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

  const message = {
    from: authorization.from,
    to: authorization.to,
    value: BigInt(authorization.value),
    validAfter: BigInt(authorization.validAfter),
    validBefore: BigInt(authorization.validBefore),
    nonce: authorization.nonce
  };

  const signature = await wallet._signTypedData(domain, types, message);

  return { authorization, signature };
}

// Settle on NetPay
async function settleNetPay(payment, index) {
  const requestBody = {
    x402Version: 1,
    paymentPayload: payment,
    paymentRequirements: {
      scheme: 'exact',
      network: CONFIG.network,
      asset: USDC_CONFIG.address,
      payTo: checksummedMerchant,
      maxAmountRequired: '10000',
      resource: `/benchmark/netpay/${index}`,
      description: `NetPay Benchmark ${index}`,
      mimeType: 'application/json',
      maxTimeoutSeconds: 60
    }
  };

  const headers = {
    'Content-Type': 'application/json'
  };
  if (CONFIG.netpay.apiKey) {
    headers['Authorization'] = `Bearer ${CONFIG.netpay.apiKey}`;
  }

  const start = Date.now();
  try {
    const response = await fetch(`${CONFIG.netpay.url}/settle`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    const duration = Date.now() - start;
    const result = await response.json();
    
    return {
      duration,
      success: response.ok && result.success,
      status: response.status,
      transaction: result.transaction || result.transactionHash,
      error: result.errorReason || result.error_reason || result.error
    };
  } catch (error) {
    return {
      duration: Date.now() - start,
      success: false,
      error: error.message
    };
  }
}

// Settle on PayAI (uses different payload format)
async function settlePayAI(payment, index) {
  // PayAI uses nested payload structure
  const requestBody = {
    paymentPayload: {
      x402Version: 1,
      scheme: 'exact',
      network: CONFIG.network,
      payload: {
        signature: payment.signature,
        authorization: payment.authorization
      }
    },
    paymentRequirements: {
      scheme: 'exact',
      network: CONFIG.network,
      asset: USDC_CONFIG.address,
      payTo: checksummedMerchant,
      maxAmountRequired: '10000',
      resource: `/benchmark/payai/${index}`,
      description: `PayAI Benchmark ${index}`,
      mimeType: 'application/json',
      maxTimeoutSeconds: 60,
      extra: {
        name: 'USDC',
        version: '2'
      }
    }
  };

  const headers = {
    'Content-Type': 'application/json'
  };
  if (CONFIG.payai.apiKey) {
    headers['Authorization'] = `Bearer ${CONFIG.payai.apiKey}`;
  }

  const start = Date.now();
  try {
    const response = await fetch(`${CONFIG.payai.url}/settle`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    const duration = Date.now() - start;
    const result = await response.json();
    
    return {
      duration,
      success: response.ok && (result.success || result.transaction),
      status: response.status,
      transaction: result.transaction,
      error: result.error || result.message
    };
  } catch (error) {
    return {
      duration: Date.now() - start,
      success: false,
      error: error.message
    };
  }
}

// Verify endpoint benchmark
async function benchmarkVerify() {
  console.log(`\n${colors.bold}[1/3] Benchmarking /verify endpoint...${colors.reset}`);
  
  const netpayLatencies = [];
  const payaiLatencies = [];
  
  for (let i = 0; i < CONFIG.iterations; i++) {
    process.stdout.write(`\r  Progress: ${i + 1}/${CONFIG.iterations}`);
    
    const payment = await createPayment();
    
    // NetPay verify
    const npBody = {
      x402Version: 1,
      paymentPayload: payment,
      paymentRequirements: {
        scheme: 'exact',
        network: CONFIG.network,
        asset: USDC_CONFIG.address,
        payTo: checksummedMerchant,
        maxAmountRequired: '10000',
        resource: `/verify-test/${i}`,
        description: 'Verify test',
        mimeType: 'application/json',
        maxTimeoutSeconds: 60
      }
    };
    
    let start = Date.now();
    await fetch(`${CONFIG.netpay.url}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(npBody)
    });
    netpayLatencies.push(Date.now() - start);
    
    // PayAI verify
    const paBody = {
      paymentPayload: {
        x402Version: 1,
        scheme: 'exact',
        network: CONFIG.network,
        payload: {
          signature: payment.signature,
          authorization: payment.authorization
        }
      },
      paymentRequirements: {
        scheme: 'exact',
        network: CONFIG.network,
        asset: USDC_CONFIG.address,
        payTo: checksummedMerchant,
        maxAmountRequired: '10000',
        resource: `/verify-test/${i}`,
        description: 'Verify test',
        mimeType: 'application/json',
        maxTimeoutSeconds: 60,
        extra: { name: 'USDC', version: '2' }
      }
    };
    
    start = Date.now();
    await fetch(`${CONFIG.payai.url}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paBody)
    });
    payaiLatencies.push(Date.now() - start);
    
    await sleep(100);
  }
  
  console.log(` ${colors.green}✓${colors.reset}`);
  return { netpay: netpayLatencies, payai: payaiLatencies };
}

// Settle endpoint benchmark
async function benchmarkSettle() {
  console.log(`\n${colors.bold}[2/3] Benchmarking /settle endpoint...${colors.reset}`);
  console.log(`${colors.yellow}  ⚠️  This will spend ${(CONFIG.iterations * 2 * 0.01).toFixed(2)} USDC (${CONFIG.iterations} × 2 facilitators × 0.01 USDC)${colors.reset}`);
  
  const netpayResults = [];
  const payaiResults = [];
  
  for (let i = 0; i < CONFIG.iterations; i++) {
    process.stdout.write(`\r  Progress: ${i + 1}/${CONFIG.iterations}`);
    
    // Create separate payments for each facilitator (different nonces)
    const npPayment = await createPayment();
    const paPayment = await createPayment();
    
    // Settle on both
    const npResult = await settleNetPay(npPayment, i);
    netpayResults.push(npResult);
    
    await sleep(500); // Wait between settlements
    
    const paResult = await settlePayAI(paPayment, i);
    payaiResults.push(paResult);
    
    await sleep(500);
  }
  
  console.log(` ${colors.green}✓${colors.reset}`);
  return { netpay: netpayResults, payai: payaiResults };
}

// Health endpoint benchmark
async function benchmarkHealth() {
  console.log(`\n${colors.bold}[3/3] Benchmarking /health endpoint...${colors.reset}`);
  
  const netpayLatencies = [];
  const payaiLatencies = [];
  
  for (let i = 0; i < CONFIG.iterations; i++) {
    process.stdout.write(`\r  Progress: ${i + 1}/${CONFIG.iterations}`);
    
    let start = Date.now();
    await fetch(`${CONFIG.netpay.url}/health`);
    netpayLatencies.push(Date.now() - start);
    
    start = Date.now();
    await fetch(`${CONFIG.payai.url}/health`);
    payaiLatencies.push(Date.now() - start);
    
    await sleep(50);
  }
  
  console.log(` ${colors.green}✓${colors.reset}`);
  return { netpay: netpayLatencies, payai: payaiLatencies };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calcStats(values) {
  if (values.length === 0) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0 };
  
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
    p50: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)]
  };
}

function printTable(title, netpayStats, payaiStats) {
  console.log(`\n${colors.bold}${title}${colors.reset}`);
  console.log('┌─────────────┬────────────────────┬────────────────────┐');
  console.log('│ Metric      │ NetPay (ms)        │ PayAI (ms)         │');
  console.log('├─────────────┼────────────────────┼────────────────────┤');
  console.log(`│ Min         │ ${netpayStats.min.toFixed(2).padStart(18)} │ ${payaiStats.min.toFixed(2).padStart(18)} │`);
  console.log(`│ Max         │ ${netpayStats.max.toFixed(2).padStart(18)} │ ${payaiStats.max.toFixed(2).padStart(18)} │`);
  console.log(`│ Avg         │ ${netpayStats.avg.toFixed(2).padStart(18)} │ ${payaiStats.avg.toFixed(2).padStart(18)} │`);
  console.log(`│ P50         │ ${netpayStats.p50.toFixed(2).padStart(18)} │ ${payaiStats.p50.toFixed(2).padStart(18)} │`);
  console.log(`│ P95         │ ${netpayStats.p95.toFixed(2).padStart(18)} │ ${payaiStats.p95.toFixed(2).padStart(18)} │`);
  console.log('└─────────────┴────────────────────┴────────────────────┘');
  
  const diff = payaiStats.avg - netpayStats.avg;
  const pct = Math.abs(diff / payaiStats.avg * 100).toFixed(1);
  
  if (netpayStats.avg < payaiStats.avg) {
    console.log(`  ${colors.green}✓ NetPay is ${pct}% faster (${Math.abs(diff).toFixed(0)}ms)${colors.reset}`);
  } else if (netpayStats.avg > payaiStats.avg) {
    console.log(`  ${colors.blue}✓ PayAI is ${pct}% faster (${Math.abs(diff).toFixed(0)}ms)${colors.reset}`);
  } else {
    console.log(`  ${colors.yellow}≈ Both are equal${colors.reset}`);
  }
}

function printSettleTable(title, netpayResults, payaiResults) {
  const npDurations = netpayResults.map(r => r.duration);
  const paDurations = payaiResults.map(r => r.duration);
  
  const npStats = calcStats(npDurations);
  const paStats = calcStats(paDurations);
  
  const npSuccess = netpayResults.filter(r => r.success).length;
  const paSuccess = payaiResults.filter(r => r.success).length;
  
  console.log(`\n${colors.bold}${title}${colors.reset}`);
  console.log('┌─────────────┬────────────────────┬────────────────────┐');
  console.log('│ Metric      │ NetPay (ms)        │ PayAI (ms)         │');
  console.log('├─────────────┼────────────────────┼────────────────────┤');
  console.log(`│ Min         │ ${npStats.min.toFixed(2).padStart(18)} │ ${paStats.min.toFixed(2).padStart(18)} │`);
  console.log(`│ Max         │ ${npStats.max.toFixed(2).padStart(18)} │ ${paStats.max.toFixed(2).padStart(18)} │`);
  console.log(`│ Avg         │ ${npStats.avg.toFixed(2).padStart(18)} │ ${paStats.avg.toFixed(2).padStart(18)} │`);
  console.log(`│ P50         │ ${npStats.p50.toFixed(2).padStart(18)} │ ${paStats.p50.toFixed(2).padStart(18)} │`);
  console.log(`│ P95         │ ${npStats.p95.toFixed(2).padStart(18)} │ ${paStats.p95.toFixed(2).padStart(18)} │`);
  console.log('├─────────────┼────────────────────┼────────────────────┤');
  console.log(`│ Success     │ ${(npSuccess + '/' + netpayResults.length).padStart(18)} │ ${(paSuccess + '/' + payaiResults.length).padStart(18)} │`);
  console.log('└─────────────┴────────────────────┴────────────────────┘');
  
  // Show errors if any
  const npErrors = netpayResults.filter(r => !r.success);
  const paErrors = payaiResults.filter(r => !r.success);
  
  if (npErrors.length > 0) {
    console.log(`  ${colors.red}NetPay errors: ${npErrors.map(e => e.error).join(', ')}${colors.reset}`);
  }
  if (paErrors.length > 0) {
    console.log(`  ${colors.red}PayAI errors: ${paErrors.map(e => e.error).join(', ')}${colors.reset}`);
  }
  
  // Only compare if both have successes
  if (npSuccess > 0 && paSuccess > 0) {
    const npSuccessAvg = calcStats(netpayResults.filter(r => r.success).map(r => r.duration)).avg;
    const paSuccessAvg = calcStats(payaiResults.filter(r => r.success).map(r => r.duration)).avg;
    
    const diff = paSuccessAvg - npSuccessAvg;
    const pct = Math.abs(diff / paSuccessAvg * 100).toFixed(1);
    
    if (npSuccessAvg < paSuccessAvg) {
      console.log(`  ${colors.green}✓ NetPay is ${pct}% faster (${Math.abs(diff).toFixed(0)}ms) for successful settlements${colors.reset}`);
    } else {
      console.log(`  ${colors.blue}✓ PayAI is ${pct}% faster (${Math.abs(diff).toFixed(0)}ms) for successful settlements${colors.reset}`);
    }
  }
  
  // Show transaction hashes
  console.log(`\n  ${colors.cyan}Transaction Hashes:${colors.reset}`);
  netpayResults.forEach((r, i) => {
    if (r.transaction) {
      console.log(`    NetPay #${i}: ${r.transaction}`);
    }
  });
  payaiResults.forEach((r, i) => {
    if (r.transaction) {
      console.log(`    PayAI #${i}: ${r.transaction}`);
    }
  });
}

async function main() {
  console.log(`\n${colors.bold}${colors.cyan}╔══════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║      x402 Facilitator Settlement Benchmark                       ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚══════════════════════════════════════════════════════════════════╝${colors.reset}`);
  
  console.log(`\n${colors.bold}Configuration:${colors.reset}`);
  console.log(`  NetPay URL:   ${colors.green}${CONFIG.netpay.url}${colors.reset}`);
  console.log(`  NetPay Key:   ${CONFIG.netpay.apiKey ? colors.green + '✓ configured' + colors.reset : colors.red + '✗ missing (settle will fail)' + colors.reset}`);
  console.log(`  PayAI URL:    ${colors.blue}${CONFIG.payai.url}${colors.reset}`);
  console.log(`  PayAI Key:    ${CONFIG.payai.apiKey ? colors.green + '✓ configured' + colors.reset : colors.yellow + '○ not set (may work without)' + colors.reset}`);
  console.log(`  Network:      ${CONFIG.network}`);
  console.log(`  Iterations:   ${CONFIG.iterations}`);
  if (CONFIG.skipSettle) {
    console.log(`  ${colors.yellow}⚠️  Settlement tests skipped (--skip-settle)${colors.reset}`);
  }
  
  initWallet();
  
  // Run benchmarks
  const healthResults = await benchmarkHealth();
  const verifyResults = await benchmarkVerify();
  
  let settleResults = null;
  if (!CONFIG.skipSettle) {
    settleResults = await benchmarkSettle();
  }
  
  // Print results
  console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}                           RESULTS                                 ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  
  printTable('GET /health', calcStats(healthResults.netpay), calcStats(healthResults.payai));
  printTable('POST /verify (with valid signatures)', calcStats(verifyResults.netpay), calcStats(verifyResults.payai));
  
  if (settleResults) {
    printSettleTable('POST /settle (real transactions)', settleResults.netpay, settleResults.payai);
  } else {
    console.log(`\n${colors.yellow}POST /settle skipped (use without --skip-settle to test settlements)${colors.reset}`);
  }
  
  // Summary
  console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}                          SUMMARY                                  ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  
  const healthNp = calcStats(healthResults.netpay).avg;
  const healthPa = calcStats(healthResults.payai).avg;
  const verifyNp = calcStats(verifyResults.netpay).avg;
  const verifyPa = calcStats(verifyResults.payai).avg;
  
  let settleNp = 0, settlePa = 0;
  if (settleResults) {
    settleNp = calcStats(settleResults.netpay.map(r => r.duration)).avg;
    settlePa = calcStats(settleResults.payai.map(r => r.duration)).avg;
  }
  
  console.log(`\nAverage Latencies (ms):\n`);
  console.log(`                    NetPay          PayAI           Winner`);
  console.log(`  ─────────────────────────────────────────────────────────`);
  console.log(`  /health           ${healthNp.toFixed(2).padStart(8)}        ${healthPa.toFixed(2).padStart(8)}        ${healthNp < healthPa ? colors.green + 'NetPay' + colors.reset : colors.blue + 'PayAI' + colors.reset}`);
  console.log(`  /verify           ${verifyNp.toFixed(2).padStart(8)}        ${verifyPa.toFixed(2).padStart(8)}        ${verifyNp < verifyPa ? colors.green + 'NetPay' + colors.reset : colors.blue + 'PayAI' + colors.reset}`);
  
  if (settleResults) {
    console.log(`  /settle           ${settleNp.toFixed(2).padStart(8)}        ${settlePa.toFixed(2).padStart(8)}        ${settleNp < settlePa ? colors.green + 'NetPay' + colors.reset : colors.blue + 'PayAI' + colors.reset}`);
  }
  
  const totalNp = healthNp + verifyNp + (settleResults ? settleNp : 0);
  const totalPa = healthPa + verifyPa + (settleResults ? settlePa : 0);
  
  console.log(`\n${colors.bold}Overall Winner: ${totalNp < totalPa ? colors.green + 'NetPay (api.netpay.id)' : colors.blue + 'PayAI (facilitator.payai.network)'}${colors.reset}`);
  
  console.log(`\nBenchmark completed at ${new Date().toISOString()}\n`);
}

main().catch(console.error);
