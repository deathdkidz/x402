#!/usr/bin/env node

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║            X402 FACILITATOR TEST SUITE                            ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 * 
 * Unified testing utility for x402 facilitator.
 * Tests network normalization, validation, signatures, and more.
 * 
 * USAGE:
 *   node test-suite.mjs [test-name]
 * 
 * AVAILABLE TESTS:
 *   network      - Network name normalization
 *   validation   - Request validation and error messages
 *   signature    - EIP-712 signature verification
 *   all          - Run all tests (default)
 * 
 * EXAMPLES:
 *   node test-suite.mjs              # Run all tests
 *   node test-suite.mjs network      # Test network normalization only
 *   node test-suite.mjs validation   # Test validation errors only
 */

import { ethers } from 'ethers';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

// ============================================================================
// LOAD NETWORKS
// ============================================================================
let NETWORKS_CONFIG = {};
try {
  const networksPath = join(__dirname, 'config', 'networks.json');
  NETWORKS_CONFIG = JSON.parse(fs.readFileSync(networksPath, 'utf8'));
} catch (error) {
  console.error('❌ Error loading networks.json');
  process.exit(1);
}

// ============================================================================
// TEST 1: NETWORK NORMALIZATION
// ============================================================================

function testNetworkNormalization() {
  console.log('╔' + '═'.repeat(70) + '╗');
  console.log('║' + 'NETWORK NORMALIZATION TEST'.padStart(48).padEnd(70) + '║');
  console.log('╚' + '═'.repeat(70) + '╝\n');

  const testCases = [
    // Exact matches
    { input: 'Base Sepolia', expected: 'Base Sepolia' },
    { input: 'Ethereum Sepolia', expected: 'Ethereum Sepolia' },
    { input: 'HyperEVM Testnet', expected: 'HyperEVM Testnet' },
    
    // Case variations
    { input: 'base sepolia', expected: 'Base Sepolia' },
    { input: 'BASE SEPOLIA', expected: 'Base Sepolia' },
    { input: 'BaSe SePolia', expected: 'Base Sepolia' },
    
    // Separator variations
    { input: 'base-sepolia', expected: 'Base Sepolia' },
    { input: 'base_sepolia', expected: 'Base Sepolia' },
    { input: 'base sepolia', expected: 'Base Sepolia' },
    { input: 'BASE-SEPOLIA', expected: 'Base Sepolia' },
    
    // Mixed variations
    { input: 'hyperevm-testnet', expected: 'HyperEVM Testnet' },
    { input: 'HYPEREVM_TESTNET', expected: 'HyperEVM Testnet' },
    { input: 'HyperEVM-Testnet', expected: 'HyperEVM Testnet' },
    
    // Mainnet variations
    { input: 'base', expected: 'Base' },
    { input: 'BASE', expected: 'Base' },
    { input: 'ethereum', expected: 'Ethereum' },
    { input: 'ETHEREUM', expected: 'Ethereum' },
  ];

  let passed = 0;
  let failed = 0;

  testCases.forEach(({ input, expected }) => {
    const result = normalizeNetworkName(input);
    const isMatch = result === expected;
    
    if (isMatch) {
      console.log(`✓ "${input}" → "${result}"`);
      passed++;
    } else {
      console.log(`✗ "${input}" → "${result}" (expected "${expected}")`);
      failed++;
    }
  });

  console.log('\n' + '─'.repeat(72));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('─'.repeat(72) + '\n');

  return failed === 0;
}

function normalizeNetworkName(network) {
  const allNetworks = Object.keys(NETWORKS_CONFIG);
  
  // Try exact match first (case-insensitive)
  const exactMatch = allNetworks.find(n => n.toLowerCase() === network.toLowerCase());
  if (exactMatch) return exactMatch;
  
  // Special cases for acronyms
  const specialCases = { 
    'evm': 'EVM', 
    'bsc': 'BSC', 
    'bnb': 'BNB', 
    'op': 'OP',
    'hyperevm': 'HyperEVM'
  };
  
  // Normalize to title case handling hyphens, underscores, spaces
  const normalizedNetwork = network.split(/[-_\s]+/).map(word => {
    const lowerWord = word.toLowerCase();
    if (specialCases[lowerWord]) return specialCases[lowerWord];
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
  
  return allNetworks.find(n => n === normalizedNetwork) || network;
}

// ============================================================================
// TEST 2: VALIDATION ERRORS
// ============================================================================

async function testValidationErrors() {
  console.log('╔' + '═'.repeat(70) + '╗');
  console.log('║' + 'VALIDATION ERROR MESSAGES TEST'.padStart(50).padEnd(70) + '║');
  console.log('╚' + '═'.repeat(70) + '╝\n');

  const API_URL = 'http://localhost:8080';
  const testCases = [
    {
      name: 'Missing required fields',
      payload: {},
      expectedError: 'paymentPayload is required'
    },
    {
      name: 'Invalid asset address',
      payload: {
        paymentPayload: {
          authorization: { from: '0x123', to: '0x456', value: '1000', validAfter: 0, validBefore: 9999999999, nonce: '0x00' },
          signature: '0xabc'
        },
        paymentRequirements: {
          network: 'Base Sepolia',
          asset: 'invalid-address',
          maxAmountRequired: '1000',
          scheme: 'exact',
          payTo: '0x530f81F36D55118D8e829A1f8b15a4D910f43b6E'
        }
      },
      expectedError: 'must be a valid Ethereum address'
    },
    {
      name: 'Invalid scheme',
      payload: {
        paymentPayload: {
          authorization: { from: '0x123', to: '0x456', value: '1000', validAfter: 0, validBefore: 9999999999, nonce: '0x00' },
          signature: '0xabc'
        },
        paymentRequirements: {
          network: 'Base Sepolia',
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          maxAmountRequired: '1000',
          scheme: 'flexible',
          payTo: '0x530f81F36D55118D8e829A1f8b15a4D910f43b6E'
        }
      },
      expectedError: 'must be "exact"'
    }
  ];

  console.log('Testing validation error messages...\n');

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      const response = await fetch(`${API_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCase.payload)
      });

      const result = await response.json();
      
      if (response.status === 400 && result.error && result.error.includes(testCase.expectedError)) {
        console.log(`✓ ${testCase.name}`);
        console.log(`  Error: ${result.error.substring(0, 80)}...`);
        passed++;
      } else {
        console.log(`✗ ${testCase.name}`);
        console.log(`  Expected: "${testCase.expectedError}"`);
        console.log(`  Got: "${result.error || 'no error'}"`);
        failed++;
      }
    } catch (error) {
      console.log(`✗ ${testCase.name} - Network error: ${error.message}`);
      failed++;
    }
    console.log('');
  }

  console.log('─'.repeat(72));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('─'.repeat(72) + '\n');

  return failed === 0;
}

// ============================================================================
// TEST 3: SIGNATURE VERIFICATION
// ============================================================================

async function testSignatureVerification() {
  console.log('╔' + '═'.repeat(70) + '╗');
  console.log('║' + 'EIP-712 SIGNATURE VERIFICATION TEST'.padStart(52).padEnd(70) + '║');
  console.log('╚' + '═'.repeat(70) + '╝\n');

  // Test wallet
  const wallet = new ethers.Wallet('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  console.log(`Test Wallet: ${wallet.address}\n`);

  // EIP-712 Domain (USDC on Base Sepolia)
  const domain = {
    name: 'USDC',
    version: '2',
    chainId: 84532,
    verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  };

  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };

  console.log('Test 1: Checksummed addresses (CORRECT)');
  const value1 = {
    from: ethers.getAddress(wallet.address),
    to: ethers.getAddress('0x530f81F36D55118D8e829A1f8b15a4D910f43b6E'),
    value: 1000000n,
    validAfter: 0,
    validBefore: Math.floor(Date.now() / 1000) + 3600,
    nonce: ethers.hexlify(ethers.randomBytes(32)),
  };

  try {
    const sig1 = await wallet.signTypedData(domain, types, value1);
    const recovered1 = ethers.verifyTypedData(domain, types, value1, sig1);
    
    if (recovered1.toLowerCase() === wallet.address.toLowerCase()) {
      console.log(`✓ Signature valid`);
      console.log(`  From (checksummed): ${value1.from}`);
      console.log(`  Recovered: ${recovered1}`);
    } else {
      console.log(`✗ Signature verification failed`);
    }
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }

  console.log('\nTest 2: Lowercase addresses (INCORRECT - will fail on-chain)');
  const value2 = {
    from: wallet.address.toLowerCase(),
    to: '0x530f81f36d55118d8e829a1f8b15a4d910f43b6e',
    value: 1000000n,
    validAfter: 0,
    validBefore: Math.floor(Date.now() / 1000) + 3600,
    nonce: ethers.hexlify(ethers.randomBytes(32)),
  };

  try {
    const sig2 = await wallet.signTypedData(domain, types, value2);
    const recovered2 = ethers.verifyTypedData(domain, types, value2, sig2);
    
    console.log(`⚠️  Off-chain verification passes`);
    console.log(`  From (lowercase): ${value2.from}`);
    console.log(`  Recovered: ${recovered2}`);
    console.log(`  ❌ But will FAIL on-chain due to checksum mismatch!`);
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }

  console.log('\n' + '─'.repeat(72));
  console.log('Key Takeaway: Always use ethers.getAddress() for checksummed addresses');
  console.log('─'.repeat(72) + '\n');

  return true;
}

// ============================================================================
// MAIN
// ============================================================================

async function runTests(testName = 'all') {
  console.log('\n' + '═'.repeat(72));
  console.log('X402 FACILITATOR TEST SUITE');
  console.log('═'.repeat(72) + '\n');

  const results = {};

  if (testName === 'all' || testName === 'network') {
    results.network = testNetworkNormalization();
  }

  if (testName === 'all' || testName === 'validation') {
    results.validation = await testValidationErrors();
  }

  if (testName === 'all' || testName === 'signature') {
    results.signature = await testSignatureVerification();
  }

  // Summary
  console.log('═'.repeat(72));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(72));

  const testsRun = Object.keys(results);
  const testsPassed = Object.values(results).filter(r => r).length;
  const testsFailed = testsRun.length - testsPassed;

  testsRun.forEach(name => {
    const status = results[name] ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} - ${name}`);
  });

  console.log('─'.repeat(72));
  console.log(`Total: ${testsRun.length} tests, ${testsPassed} passed, ${testsFailed} failed`);
  console.log('═'.repeat(72) + '\n');

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Parse command line
const testName = process.argv[2] || 'all';

if (['all', 'network', 'validation', 'signature'].includes(testName)) {
  runTests(testName);
} else {
  console.log('Usage: node test-suite.mjs [test-name]');
  console.log('');
  console.log('Available tests:');
  console.log('  network      - Network name normalization');
  console.log('  validation   - Request validation and error messages');
  console.log('  signature    - EIP-712 signature verification');
  console.log('  all          - Run all tests (default)');
  process.exit(1);
}
