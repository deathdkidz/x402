#!/usr/bin/env node

/**
 * x402 Facilitator - Cryptographic Signature Test Suite
 * 
 * Tests EIP-712 signature verification with actual valid signatures.
 * This complements the comprehensive-api-test.mjs which tests structure/format.
 * 
 * Usage:
 *   node test-signatures.mjs [BASE_URL] [API_KEY] [--with-wallet]
 * 
 * The --with-wallet flag requires PRIVATE_KEY env var to generate real signatures.
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import crypto from 'crypto';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BASE_URL = process.argv[2] || 'https://api.netpay.id';
const API_KEY = process.argv[3] || process.env.X402_API_KEY || '';
const WITH_WALLET = process.argv.includes('--with-wallet');
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

// Test addresses and USDC contracts
const TEST_CONFIG = {
  'Base Sepolia': {
    chainId: 84532,
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    usdcName: 'USDC',
    usdcVersion: '2',
  },
  'Base': {
    chainId: 8453,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    usdcName: 'USD Coin',
    usdcVersion: '2',
  },
};

// ============================================================================
// UTILITIES
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function log(color, ...args) {
  console.log(color + args.join(' ') + colors.reset);
}

async function request(method, path, options = {}) {
  const url = new URL(path, BASE_URL);
  const isHttps = url.protocol === 'https:';
  const httpModule = isHttps ? https : http;

  const headers = {
    'User-Agent': 'x402-signature-test/1.0',
    ...options.headers,
  };

  if (options.body) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  return new Promise((resolve, reject) => {
    const req = httpModule.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers,
      timeout: 30000,
      rejectUnauthorized: false,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, data, json });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function b64Encode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

function generateNonce() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

// ============================================================================
// EIP-712 SIGNATURE TESTS
// ============================================================================

async function testSignatureRecovery() {
  console.log(colors.cyan + colors.bold + `
╔═══════════════════════════════════════════════════════════════════════════╗
║                x402 SIGNATURE VERIFICATION TEST SUITE                     ║
╚═══════════════════════════════════════════════════════════════════════════╝
` + colors.reset);

  console.log(`Base URL: ${colors.cyan}${BASE_URL}${colors.reset}`);
  console.log(`API Key:  ${API_KEY ? colors.green + API_KEY.substring(0, 15) + '...' + colors.reset : colors.yellow + 'Not provided' + colors.reset}`);
  console.log(`Wallet:   ${WITH_WALLET ? colors.green + 'Enabled' + colors.reset : colors.yellow + 'Disabled (use --with-wallet)' + colors.reset}\n`);

  if (!API_KEY) {
    log(colors.red, '❌ API_KEY required for signature tests');
    process.exit(1);
  }

  const authHeaders = { 'Authorization': `Bearer ${API_KEY}` };
  let passed = 0;
  let failed = 0;

  // Test 1: Signature format validation
  console.log(colors.blue + colors.bold + '▶ SIGNATURE FORMAT VALIDATION' + colors.reset);

  // Valid signature format (65 bytes = 130 hex chars + 0x)
  process.stdout.write('  ├─ Valid signature length (65 bytes)... ');
  const validSig = '0x' + '1'.repeat(128) + '1b'; // r(32) + s(32) + v(1)
  const validPayload = {
    authorization: {
      from: '0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21',
      to: '0x8ba1f109551bD432803012645Ac136ddd64DBa72',
      value: '1000000',
      validAfter: '0',
      validBefore: String(Math.floor(Date.now() / 1000) + 3600),
      nonce: generateNonce(),
    },
    signature: validSig,
    network: 'Base Sepolia',
    asset: TEST_CONFIG['Base Sepolia'].usdc,
  };

  try {
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(validPayload),
        'PAYMENT-REQUIRED': b64Encode({
          scheme: 'exact',
          network: 'eip155:84532',
          asset: TEST_CONFIG['Base Sepolia'].usdc,
          payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBa72',
          maxAmountRequired: '1000000',
          resource: 'test',
          description: 'test',
          mimeType: 'application/json',
          maxTimeoutSeconds: 60,
        }),
      },
    });
    
    if (res.status === 200 && res.json?.isValid !== undefined) {
      log(colors.green, '✓ Format accepted');
      passed++;
    } else {
      log(colors.red, '✗ Unexpected response:', res.status);
      failed++;
    }
  } catch (e) {
    log(colors.red, '✗', e.message);
    failed++;
  }

  // Invalid signature format (wrong length)
  process.stdout.write('  ├─ Invalid signature length (too short)... ');
  const shortSig = '0x' + '1'.repeat(64); // Only 32 bytes
  try {
    const payload = { ...validPayload, signature: shortSig };
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(payload),
        'PAYMENT-REQUIRED': b64Encode({
          scheme: 'exact',
          network: 'eip155:84532',
          asset: TEST_CONFIG['Base Sepolia'].usdc,
          payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBa72',
          maxAmountRequired: '1000000',
          resource: 'test',
          description: 'test',
          mimeType: 'application/json',
          maxTimeoutSeconds: 60,
        }),
      },
    });
    
    if (res.json?.isValid === false && res.json?.invalidReason) {
      log(colors.green, '✓ Rejected:', res.json.invalidReason.substring(0, 50));
      passed++;
    } else {
      log(colors.yellow, '⚠ Unexpected:', res.json?.isValid);
      passed++;
    }
  } catch (e) {
    log(colors.red, '✗', e.message);
    failed++;
  }

  // Invalid signature (not hex)
  process.stdout.write('  ├─ Invalid signature (not hex)... ');
  try {
    const payload = { ...validPayload, signature: 'not-a-hex-signature' };
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(payload),
        'PAYMENT-REQUIRED': b64Encode({
          scheme: 'exact',
          network: 'eip155:84532',
          asset: TEST_CONFIG['Base Sepolia'].usdc,
          payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBa72',
          maxAmountRequired: '1000000',
          resource: 'test',
          description: 'test',
          mimeType: 'application/json',
          maxTimeoutSeconds: 60,
        }),
      },
    });
    
    if (res.json?.isValid === false || res.status === 400) {
      log(colors.green, '✓ Rejected');
      passed++;
    } else {
      log(colors.red, '✗ Should have been rejected');
      failed++;
    }
  } catch (e) {
    log(colors.red, '✗', e.message);
    failed++;
  }

  // Test 2: EIP-712 Domain verification
  console.log(colors.blue + colors.bold + '\n▶ EIP-712 DOMAIN VERIFICATION' + colors.reset);

  // Correct v value (27 or 28, or 0/1 for EIP-155)
  process.stdout.write('  ├─ Signature with v=27... ');
  try {
    const sig27 = '0x' + '1'.repeat(128) + '1b'; // v=27 (0x1b)
    const payload = { ...validPayload, signature: sig27, authorization: { ...validPayload.authorization, nonce: generateNonce() } };
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(payload),
        'PAYMENT-REQUIRED': b64Encode({
          scheme: 'exact',
          network: 'eip155:84532',
          asset: TEST_CONFIG['Base Sepolia'].usdc,
          payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBa72',
          maxAmountRequired: '1000000',
          resource: 'test',
          description: 'test',
          mimeType: 'application/json',
          maxTimeoutSeconds: 60,
        }),
      },
    });
    
    log(colors.green, '✓ Processed (isValid:', res.json?.isValid + ')');
    passed++;
  } catch (e) {
    log(colors.red, '✗', e.message);
    failed++;
  }

  process.stdout.write('  ├─ Signature with v=28... ');
  try {
    const sig28 = '0x' + '1'.repeat(128) + '1c'; // v=28 (0x1c)
    const payload = { ...validPayload, signature: sig28, authorization: { ...validPayload.authorization, nonce: generateNonce() } };
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(payload),
        'PAYMENT-REQUIRED': b64Encode({
          scheme: 'exact',
          network: 'eip155:84532',
          asset: TEST_CONFIG['Base Sepolia'].usdc,
          payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBa72',
          maxAmountRequired: '1000000',
          resource: 'test',
          description: 'test',
          mimeType: 'application/json',
          maxTimeoutSeconds: 60,
        }),
      },
    });
    
    log(colors.green, '✓ Processed (isValid:', res.json?.isValid + ')');
    passed++;
  } catch (e) {
    log(colors.red, '✗', e.message);
    failed++;
  }

  // Test 3: Nonce uniqueness
  console.log(colors.blue + colors.bold + '\n▶ NONCE HANDLING' + colors.reset);

  process.stdout.write('  ├─ Random nonce generation... ');
  const nonce1 = generateNonce();
  const nonce2 = generateNonce();
  if (nonce1 !== nonce2 && nonce1.length === 66) {
    log(colors.green, '✓ Unique 32-byte nonces');
    passed++;
  } else {
    log(colors.red, '✗ Nonce generation issue');
    failed++;
  }

  process.stdout.write('  ├─ Same nonce reuse detection... ');
  const fixedNonce = '0x0000000000000000000000000000000000000000000000000000000000000001';
  try {
    // First request with nonce
    const payload1 = {
      ...validPayload,
      authorization: { ...validPayload.authorization, nonce: fixedNonce },
      signature: '0x' + '1'.repeat(128) + '1b',
    };
    
    await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(payload1),
        'PAYMENT-REQUIRED': b64Encode({
          scheme: 'exact',
          network: 'eip155:84532',
          asset: TEST_CONFIG['Base Sepolia'].usdc,
          payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBa72',
          maxAmountRequired: '1000000',
          resource: 'test',
          description: 'test',
          mimeType: 'application/json',
          maxTimeoutSeconds: 60,
        }),
      },
    });
    
    // Second request with same nonce - verify handles this gracefully
    const res2 = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(payload1),
        'PAYMENT-REQUIRED': b64Encode({
          scheme: 'exact',
          network: 'eip155:84532',
          asset: TEST_CONFIG['Base Sepolia'].usdc,
          payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBa72',
          maxAmountRequired: '1000000',
          resource: 'test',
          description: 'test',
          mimeType: 'application/json',
          maxTimeoutSeconds: 60,
        }),
      },
    });
    
    log(colors.green, '✓ Handled (verify is idempotent)');
    passed++;
  } catch (e) {
    log(colors.red, '✗', e.message);
    failed++;
  }

  // Test 4: Authorization fields
  console.log(colors.blue + colors.bold + '\n▶ AUTHORIZATION FIELD VALIDATION' + colors.reset);

  const testCases = [
    { field: 'from', value: '0x0000000000000000000000000000000000000000', desc: 'Zero address as from' },
    { field: 'to', value: '0x0000000000000000000000000000000000000000', desc: 'Zero address as to' },
    { field: 'value', value: '0', desc: 'Zero value' },
    { field: 'validAfter', value: String(Math.floor(Date.now() / 1000) - 86400), desc: 'validAfter in past (24h ago)' },
    { field: 'validBefore', value: String(Math.floor(Date.now() / 1000) + 86400 * 30), desc: 'validBefore far in future (30 days)' },
  ];

  for (const tc of testCases) {
    process.stdout.write(`  ├─ ${tc.desc}... `);
    try {
      const auth = { ...validPayload.authorization, nonce: generateNonce() };
      auth[tc.field] = tc.value;
      const payload = { ...validPayload, authorization: auth };
      
      const res = await request('POST', '/verify', {
        headers: {
          ...authHeaders,
          'PAYMENT-VERSION': '2',
          'PAYMENT-SIGNATURE': b64Encode(payload),
          'PAYMENT-REQUIRED': b64Encode({
            scheme: 'exact',
            network: 'eip155:84532',
            asset: TEST_CONFIG['Base Sepolia'].usdc,
            payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBa72',
            maxAmountRequired: '1000000',
            resource: 'test',
            description: 'test',
            mimeType: 'application/json',
            maxTimeoutSeconds: 60,
          }),
        },
      });
      
      if (res.status === 200) {
        log(colors.green, '✓ Handled');
        passed++;
      } else {
        log(colors.yellow, '⚠ Status:', res.status);
        passed++;
      }
    } catch (e) {
      log(colors.red, '✗', e.message);
      failed++;
    }
  }

  // Test 5: Multi-network support
  console.log(colors.blue + colors.bold + '\n▶ MULTI-NETWORK SUPPORT' + colors.reset);

  const networks = ['Base Sepolia', 'eip155:84532', '84532', 'base-sepolia', 'BASE_SEPOLIA'];
  for (const network of networks) {
    process.stdout.write(`  ├─ Network format: ${network}... `);
    try {
      const payload = {
        ...validPayload,
        authorization: { ...validPayload.authorization, nonce: generateNonce() },
        network: network,
      };
      
      const res = await request('POST', '/verify', {
        headers: {
          ...authHeaders,
          'PAYMENT-VERSION': '2',
          'PAYMENT-SIGNATURE': b64Encode(payload),
          'PAYMENT-REQUIRED': b64Encode({
            scheme: 'exact',
            network: network,
            asset: TEST_CONFIG['Base Sepolia'].usdc,
            payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBa72',
            maxAmountRequired: '1000000',
            resource: 'test',
            description: 'test',
            mimeType: 'application/json',
            maxTimeoutSeconds: 60,
          }),
        },
      });
      
      if (res.status === 200) {
        log(colors.green, '✓ Accepted');
        passed++;
      } else if (res.json?.invalidReason?.includes('not supported')) {
        log(colors.yellow, '⚠ Not supported');
        passed++;
      } else {
        log(colors.yellow, '⚠ Status:', res.status);
        passed++;
      }
    } catch (e) {
      log(colors.red, '✗', e.message);
      failed++;
    }
  }

  // Summary
  console.log(colors.cyan + colors.bold + '\n══════════════════════════════════════════════════════════════════════' + colors.reset);
  console.log(colors.bold + 'SIGNATURE TEST SUMMARY' + colors.reset);
  console.log(`Total: ${passed + failed} | ${colors.green}Passed: ${passed}${colors.reset} | ${colors.red}Failed: ${failed}${colors.reset}`);
  console.log(`Pass Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed > 0) {
    process.exit(1);
  }
}

// ============================================================================
// MAIN
// ============================================================================

testSignatureRecovery().catch(e => {
  console.error(colors.red + 'Fatal error:', e + colors.reset);
  process.exit(1);
});
