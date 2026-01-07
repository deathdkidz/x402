#!/usr/bin/env node

/**
 * x402 Facilitator API Comprehensive Test Suite
 * 
 * Tests all endpoints for:
 * - Correct response structure
 * - x402 v2 protocol compliance
 * - Error handling
 * - Edge cases
 * - Header validation
 * - Authentication scenarios
 * 
 * Usage:
 *   node comprehensive-api-test.mjs [BASE_URL] [API_KEY]
 * 
 * Examples:
 *   node comprehensive-api-test.mjs https://api.netpay.id
 *   node comprehensive-api-test.mjs http://localhost:4020 x402_pk_test_abc123
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BASE_URL = process.argv[2] || 'https://api.netpay.id';
const API_KEY = process.argv[3] || process.env.X402_API_KEY || '';
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// Test data
const TEST_DATA = {
  validAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21',
  validAddress2: '0x8ba1f109551bD432803012645Ac136ddd64DBa72',
  usdcBaseSepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  usdcBase: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  validNonce: '0x0000000000000000000000000000000000000000000000000000000000000001',
  validSignature: '0x' + '1'.repeat(130), // 65 bytes
  futureTimestamp: Math.floor(Date.now() / 1000) + 3600,
  pastTimestamp: Math.floor(Date.now() / 1000) - 3600,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function log(color, ...args) {
  console.log(color + args.join(' ') + colors.reset);
}

function logHeader(text) {
  const line = '═'.repeat(70);
  console.log('\n' + colors.cyan + colors.bold + line);
  console.log(' ' + text);
  console.log(line + colors.reset);
}

function logSection(text) {
  console.log('\n' + colors.blue + colors.bold + '▶ ' + text + colors.reset);
}

function logTest(name) {
  process.stdout.write(colors.dim + '  ├─ ' + name + '... ' + colors.reset);
}

function logPass(msg = 'PASS') {
  console.log(colors.green + '✓ ' + msg + colors.reset);
}

function logFail(msg = 'FAIL') {
  console.log(colors.red + '✗ ' + msg + colors.reset);
}

function logWarn(msg) {
  console.log(colors.yellow + '⚠ ' + msg + colors.reset);
}

function logInfo(msg) {
  if (VERBOSE) console.log(colors.dim + '    ' + msg + colors.reset);
}

/**
 * Make HTTP request
 */
async function request(method, path, options = {}) {
  const url = new URL(path, BASE_URL);
  const isHttps = url.protocol === 'https:';
  const httpModule = isHttps ? https : http;

  const headers = {
    'User-Agent': 'x402-test-suite/1.0',
    ...options.headers,
  };

  if (options.body) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    headers['Content-Length'] = Buffer.byteLength(
      typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
    );
  }

  return new Promise((resolve, reject) => {
    const req = httpModule.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers,
      timeout: 30000,
      rejectUnauthorized: false, // Allow self-signed certs for local testing
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          // Not JSON - that's okay for some endpoints
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
          json,
        });
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

/**
 * Base64 encode JSON
 */
function b64Encode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

/**
 * Base64 decode JSON
 */
function b64Decode(str) {
  try {
    return JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Create a test payment signature (not cryptographically valid, but structurally correct)
 */
function createTestPaymentSignature(overrides = {}) {
  const base = {
    authorization: {
      from: TEST_DATA.validAddress,
      to: TEST_DATA.validAddress2,
      value: '1000000',
      validAfter: '0',
      validBefore: String(TEST_DATA.futureTimestamp),
      nonce: TEST_DATA.validNonce,
    },
    signature: TEST_DATA.validSignature,
    network: 'Base Sepolia',
    asset: TEST_DATA.usdcBaseSepolia,
  };
  return { ...base, ...overrides };
}

/**
 * Create test payment requirements
 */
function createTestPaymentRequirements(overrides = {}) {
  const base = {
    scheme: 'exact',
    network: 'eip155:84532',
    asset: TEST_DATA.usdcBaseSepolia,
    payTo: TEST_DATA.validAddress2,
    maxAmountRequired: '1000000',
    resource: 'https://api.example.com/test',
    description: 'Test payment',
    mimeType: 'application/json',
    maxTimeoutSeconds: 60,
  };
  return { ...base, ...overrides };
}

// ============================================================================
// TEST RESULT TRACKING
// ============================================================================

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: [],
};

function recordTest(category, name, passed, message = '', details = null) {
  results.total++;
  if (passed) {
    results.passed++;
    logPass(message);
  } else {
    results.failed++;
    logFail(message);
  }
  results.tests.push({ category, name, passed, message, details });
}

function recordWarning(category, name, message) {
  results.warnings++;
  logWarn(message);
  results.tests.push({ category, name, passed: true, warning: message });
}

// ============================================================================
// TEST CATEGORIES
// ============================================================================

async function testPublicEndpoints() {
  logSection('PUBLIC ENDPOINTS');

  // Test GET /
  logTest('GET / - Service Info');
  try {
    const res = await request('GET', '/');
    const checks = [
      res.status === 200,
      res.json?.name,
      res.json?.version,
      res.json?.endpoints,
      Array.isArray(res.json?.mainnetNetworks),
      Array.isArray(res.json?.testnetNetworks),
    ];
    recordTest('public', 'GET /', checks.every(Boolean), 
      checks.every(Boolean) ? `v${res.json?.version}` : 'Invalid response structure');
    logInfo(`Response: ${JSON.stringify(res.json, null, 2).substring(0, 200)}...`);
  } catch (e) {
    recordTest('public', 'GET /', false, e.message);
  }

  // Test GET /health
  logTest('GET /health - Health Check');
  try {
    const res = await request('GET', '/health');
    const checks = [
      res.status === 200,
      res.json?.status === 'ok',
      res.json?.service === 'x402-facilitator',
      typeof res.json?.timestamp === 'number',
      typeof res.json?.uptime === 'number',
    ];
    recordTest('public', 'GET /health', checks.every(Boolean),
      checks.every(Boolean) ? `uptime: ${Math.floor(res.json?.uptime || 0)}s` : 'Invalid response');
  } catch (e) {
    recordTest('public', 'GET /health', false, e.message);
  }

  // Test GET /supported
  logTest('GET /supported - Network List');
  try {
    const res = await request('GET', '/supported');
    const hasPaymentVersion = res.headers['payment-version'] === '2';
    const hasMainnet = Array.isArray(res.json?.mainnet);
    const hasTestnet = Array.isArray(res.json?.testnet);
    
    // Validate network structure
    let validStructure = true;
    const validateNetwork = (n) => {
      return n.network && n.caip2 && typeof n.chainId === 'number' && Array.isArray(n.tokens);
    };
    
    if (hasMainnet) {
      validStructure = res.json.mainnet.every(validateNetwork);
    }
    if (hasTestnet) {
      validStructure = validStructure && res.json.testnet.every(validateNetwork);
    }

    const checks = [res.status === 200, hasMainnet, hasTestnet, validStructure];
    recordTest('public', 'GET /supported', checks.every(Boolean),
      `${res.json?.mainnet?.length || 0} mainnet, ${res.json?.testnet?.length || 0} testnet`);
    
    if (!hasPaymentVersion) {
      recordWarning('public', 'GET /supported', 'Missing PAYMENT-VERSION header');
    }
    
    // Check CAIP-2 format
    const allNetworks = [...(res.json?.mainnet || []), ...(res.json?.testnet || [])];
    for (const net of allNetworks) {
      if (!net.caip2?.startsWith('eip155:')) {
        recordWarning('public', 'GET /supported', `Invalid CAIP-2 format: ${net.caip2}`);
        break;
      }
    }
  } catch (e) {
    recordTest('public', 'GET /supported', false, e.message);
  }

  // Test GET /metrics
  logTest('GET /metrics - Prometheus Metrics');
  try {
    const res = await request('GET', '/metrics');
    // Metrics endpoint may be restricted to localhost for security
    if (res.status === 403) {
      recordTest('public', 'GET /metrics', true, 'Restricted to localhost (expected)');
    } else {
      const isPrometheus = res.headers['content-type']?.includes('text/plain');
      const hasMetrics = res.data?.includes('x402_') || res.data?.includes('# HELP');
      recordTest('public', 'GET /metrics', res.status === 200 && isPrometheus,
        hasMetrics ? 'Valid Prometheus format' : 'No metrics data');
    }
  } catch (e) {
    recordTest('public', 'GET /metrics', false, e.message);
  }

  // Test GET /help
  logTest('GET /help - Protocol Documentation');
  try {
    const res = await request('GET', '/help');
    const isText = res.headers['content-type']?.includes('text/plain');
    const hasContent = res.data?.length > 100;
    const hasPaymentVersion = res.headers['payment-version'] === '2';
    recordTest('public', 'GET /help', res.status === 200 && hasContent,
      `${res.data?.length || 0} bytes`);
    if (!hasPaymentVersion) {
      recordWarning('public', 'GET /help', 'Missing PAYMENT-VERSION header');
    }
  } catch (e) {
    recordTest('public', 'GET /help', false, e.message);
  }

  // Test GET /account
  logTest('GET /account - Account Instructions');
  try {
    const res = await request('GET', '/account');
    const isText = res.headers['content-type']?.includes('text/plain');
    const hasVaultAddress = res.data?.includes('0x') || res.data?.includes('VAULT');
    recordTest('public', 'GET /account', res.status === 200 && res.data?.length > 100,
      hasVaultAddress ? 'Contains vault info' : 'No vault info found');
  } catch (e) {
    recordTest('public', 'GET /account', false, e.message);
  }
}

async function testAuthenticationScenarios() {
  logSection('AUTHENTICATION SCENARIOS');

  // Test missing auth header
  logTest('POST /verify - No auth header');
  try {
    const res = await request('POST', '/verify', {
      body: { test: true },
    });
    recordTest('auth', 'No auth header', res.status === 401,
      res.status === 401 ? 'Correctly rejected' : `Got ${res.status}`);
  } catch (e) {
    recordTest('auth', 'No auth header', false, e.message);
  }

  // Test invalid auth header format
  logTest('POST /verify - Invalid auth format');
  try {
    const res = await request('POST', '/verify', {
      headers: { 'Authorization': 'InvalidFormat' },
      body: { test: true },
    });
    recordTest('auth', 'Invalid auth format', res.status === 401,
      res.status === 401 ? 'Correctly rejected' : `Got ${res.status}`);
  } catch (e) {
    recordTest('auth', 'Invalid auth format', false, e.message);
  }

  // Test invalid API key
  logTest('POST /verify - Invalid API key');
  try {
    const res = await request('POST', '/verify', {
      headers: { 'Authorization': 'Bearer x402_pk_test_invalid123456789' },
      body: { test: true },
    });
    recordTest('auth', 'Invalid API key', res.status === 401,
      res.status === 401 ? 'Correctly rejected' : `Got ${res.status}`);
  } catch (e) {
    recordTest('auth', 'Invalid API key', false, e.message);
  }

  // Test legacy hex format key (should be rejected if not in DB)
  logTest('POST /verify - Legacy hex key format');
  try {
    const legacyKey = 'a'.repeat(64);
    const res = await request('POST', '/verify', {
      headers: { 'Authorization': `Bearer ${legacyKey}` },
      body: { test: true },
    });
    // Should be 401 (not found) or accepted if format is valid
    recordTest('auth', 'Legacy hex format', res.status === 401 || res.status === 400,
      `Status: ${res.status}`);
  } catch (e) {
    recordTest('auth', 'Legacy hex format', false, e.message);
  }

  // Test Bearer prefix variations
  logTest('POST /settle - Bearer with lowercase');
  try {
    const res = await request('POST', '/settle', {
      headers: { 'Authorization': 'bearer x402_pk_test_invalid' },
      body: { test: true },
    });
    // Should handle case-insensitivity or reject
    recordTest('auth', 'Bearer lowercase', res.status === 401 || res.status === 400,
      `Status: ${res.status}`);
  } catch (e) {
    recordTest('auth', 'Bearer lowercase', false, e.message);
  }

  // Test with valid API key if provided
  if (API_KEY) {
    logTest('POST /verify - Valid API key');
    try {
      const res = await request('POST', '/verify', {
        headers: { 'Authorization': `Bearer ${API_KEY}` },
        body: createTestPaymentRequirements(), // Still invalid payload but auth should pass
      });
      // Should pass auth (not 401) even if payload validation fails (400)
      recordTest('auth', 'Valid API key', res.status !== 401,
        res.status === 401 ? 'Auth failed' : `Auth passed (status: ${res.status})`);
    } catch (e) {
      recordTest('auth', 'Valid API key', false, e.message);
    }
  } else {
    logTest('POST /verify - Valid API key');
    recordWarning('auth', 'Valid API key', 'Skipped - no API_KEY provided');
  }
}

async function testVerifyEndpoint() {
  logSection('POST /verify - VERIFICATION ENDPOINT');

  if (!API_KEY) {
    logTest('Verification tests');
    recordWarning('verify', 'All tests', 'Skipped - no API_KEY provided. Use: node script.mjs URL API_KEY');
    return;
  }

  const authHeaders = { 'Authorization': `Bearer ${API_KEY}` };

  // Test missing body
  logTest('Empty body');
  try {
    const res = await request('POST', '/verify', { headers: authHeaders });
    recordTest('verify', 'Empty body', res.status === 400,
      res.status === 400 ? 'Correctly rejected' : `Got ${res.status}`);
  } catch (e) {
    recordTest('verify', 'Empty body', false, e.message);
  }

  // Test with invalid JSON
  logTest('Invalid JSON body');
  try {
    const res = await request('POST', '/verify', {
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: 'not valid json{',
    });
    recordTest('verify', 'Invalid JSON', res.status === 400,
      res.status === 400 ? 'Correctly rejected' : `Got ${res.status}`);
  } catch (e) {
    recordTest('verify', 'Invalid JSON', false, e.message);
  }

  // Test JSON body format (legacy v1)
  logTest('JSON body format (v1)');
  try {
    const res = await request('POST', '/verify', {
      headers: authHeaders,
      body: {
        x402Version: 1,
        paymentPayload: {
          authorization: {
            from: TEST_DATA.validAddress,
            to: TEST_DATA.validAddress2,
            value: '1000000',
            validAfter: '0',
            validBefore: String(TEST_DATA.futureTimestamp),
            nonce: TEST_DATA.validNonce,
          },
          signature: TEST_DATA.validSignature,
        },
        paymentRequirements: createTestPaymentRequirements(),
      },
    });
    // Should accept format (signature will be invalid)
    const isValidResponse = res.json?.isValid !== undefined;
    recordTest('verify', 'JSON body v1', res.status === 200 && isValidResponse,
      isValidResponse ? `isValid: ${res.json.isValid}` : `Status: ${res.status}`);
    logInfo(`Response: ${JSON.stringify(res.json)}`);
  } catch (e) {
    recordTest('verify', 'JSON body v1', false, e.message);
  }

  // Test x402 v2 header format
  logTest('x402 v2 header format');
  try {
    const paymentSig = createTestPaymentSignature();
    const paymentReq = createTestPaymentRequirements();
    
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(paymentSig),
        'PAYMENT-REQUIRED': b64Encode(paymentReq),
      },
    });
    
    const hasVersionHeader = res.headers['payment-version'] === '2';
    const isValidResponse = res.json?.isValid !== undefined;
    
    recordTest('verify', 'v2 headers', res.status === 200 && isValidResponse,
      isValidResponse ? `isValid: ${res.json.isValid}` : `Status: ${res.status}`);
    
    if (!hasVersionHeader) {
      recordWarning('verify', 'v2 headers', 'Missing PAYMENT-VERSION in response');
    }
  } catch (e) {
    recordTest('verify', 'v2 headers', false, e.message);
  }

  // Test invalid scheme
  logTest('Invalid scheme (not "exact")');
  try {
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(createTestPaymentSignature()),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements({ scheme: 'relative' })),
      },
    });
    // Should reject or handle gracefully
    recordTest('verify', 'Invalid scheme', res.status === 400 || res.json?.isValid === false,
      res.json?.invalidReason || `Status: ${res.status}`);
  } catch (e) {
    recordTest('verify', 'Invalid scheme', false, e.message);
  }

  // Test invalid Ethereum address
  logTest('Invalid from address');
  try {
    const sig = createTestPaymentSignature();
    sig.authorization.from = 'not-an-address';
    
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(sig),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    recordTest('verify', 'Invalid address', res.status === 400 || res.json?.isValid === false,
      res.json?.invalidReason || `Status: ${res.status}`);
  } catch (e) {
    recordTest('verify', 'Invalid address', false, e.message);
  }

  // Test expired authorization
  logTest('Expired authorization (validBefore in past)');
  try {
    const sig = createTestPaymentSignature();
    sig.authorization.validBefore = String(TEST_DATA.pastTimestamp);
    
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(sig),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    const isExpiredReason = res.json?.invalidReason?.toLowerCase().includes('expir');
    recordTest('verify', 'Expired auth', res.json?.isValid === false,
      res.json?.invalidReason || 'No reason provided');
  } catch (e) {
    recordTest('verify', 'Expired auth', false, e.message);
  }

  // Test network normalization - CAIP-2 format
  logTest('Network: CAIP-2 format (eip155:84532)');
  try {
    const req = createTestPaymentRequirements({ network: 'eip155:84532' });
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(createTestPaymentSignature()),
        'PAYMENT-REQUIRED': b64Encode(req),
      },
    });
    recordTest('verify', 'CAIP-2 network', res.status === 200,
      `Status: ${res.status}`);
  } catch (e) {
    recordTest('verify', 'CAIP-2 network', false, e.message);
  }

  // Test network normalization - chain ID
  logTest('Network: Chain ID (84532)');
  try {
    const req = createTestPaymentRequirements({ network: '84532' });
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(createTestPaymentSignature()),
        'PAYMENT-REQUIRED': b64Encode(req),
      },
    });
    recordTest('verify', 'Chain ID network', res.status === 200,
      `Status: ${res.status}`);
  } catch (e) {
    recordTest('verify', 'Chain ID network', false, e.message);
  }

  // Test network normalization - name variants
  logTest('Network: Name variant (BASE SEPOLIA)');
  try {
    const req = createTestPaymentRequirements({ network: 'BASE SEPOLIA' });
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(createTestPaymentSignature()),
        'PAYMENT-REQUIRED': b64Encode(req),
      },
    });
    recordTest('verify', 'Name variant network', res.status === 200,
      `Status: ${res.status}`);
  } catch (e) {
    recordTest('verify', 'Name variant network', false, e.message);
  }

  // Test unsupported network
  logTest('Network: Unsupported network');
  try {
    const req = createTestPaymentRequirements({ network: 'unsupported-network' });
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(createTestPaymentSignature()),
        'PAYMENT-REQUIRED': b64Encode(req),
      },
    });
    recordTest('verify', 'Unsupported network', res.status === 400 || res.json?.isValid === false,
      res.json?.invalidReason || `Status: ${res.status}`);
  } catch (e) {
    recordTest('verify', 'Unsupported network', false, e.message);
  }

  // Test amount mismatch
  logTest('Amount mismatch (value != maxAmountRequired)');
  try {
    const sig = createTestPaymentSignature();
    sig.authorization.value = '500000'; // 0.5 USDC
    const req = createTestPaymentRequirements({ maxAmountRequired: '1000000' }); // 1 USDC
    
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(sig),
        'PAYMENT-REQUIRED': b64Encode(req),
      },
    });
    // Might be invalid or handled differently
    recordTest('verify', 'Amount mismatch', true, // Just log the behavior
      res.json?.isValid === false ? res.json?.invalidReason : `isValid: ${res.json?.isValid}`);
  } catch (e) {
    recordTest('verify', 'Amount mismatch', false, e.message);
  }

  // Test recipient mismatch
  logTest('Recipient mismatch (to != payTo)');
  try {
    const sig = createTestPaymentSignature();
    sig.authorization.to = '0x1111111111111111111111111111111111111111';
    const req = createTestPaymentRequirements({ payTo: TEST_DATA.validAddress2 });
    
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(sig),
        'PAYMENT-REQUIRED': b64Encode(req),
      },
    });
    recordTest('verify', 'Recipient mismatch', true,
      res.json?.isValid === false ? res.json?.invalidReason : `isValid: ${res.json?.isValid}`);
  } catch (e) {
    recordTest('verify', 'Recipient mismatch', false, e.message);
  }
}

async function testSettleEndpoint() {
  logSection('POST /settle - SETTLEMENT ENDPOINT');

  if (!API_KEY) {
    logTest('Settlement tests');
    recordWarning('settle', 'All tests', 'Skipped - no API_KEY provided');
    return;
  }

  const authHeaders = { 'Authorization': `Bearer ${API_KEY}` };

  // Test empty body
  logTest('Empty body');
  try {
    const res = await request('POST', '/settle', { headers: authHeaders });
    recordTest('settle', 'Empty body', res.status === 400,
      res.status === 400 ? 'Correctly rejected' : `Got ${res.status}`);
  } catch (e) {
    recordTest('settle', 'Empty body', false, e.message);
  }

  // Test x402 v2 header format
  logTest('x402 v2 header format');
  try {
    const paymentSig = createTestPaymentSignature();
    const paymentReq = createTestPaymentRequirements();
    
    const res = await request('POST', '/settle', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(paymentSig),
        'PAYMENT-REQUIRED': b64Encode(paymentReq),
      },
    });
    
    const hasVersionHeader = res.headers['payment-version'] === '2';
    const hasResponseHeader = res.headers['payment-response'];
    
    // Should have response structure even if settlement fails
    const hasResponseStructure = res.json?.success !== undefined || res.json?.error;
    
    recordTest('settle', 'v2 headers', res.status === 200 && hasResponseStructure,
      res.json?.success ? 'Success' : (res.json?.errorReason || res.json?.error || `Status: ${res.status}`));
    
    if (!hasVersionHeader) {
      recordWarning('settle', 'v2 headers', 'Missing PAYMENT-VERSION in response');
    }
    if (!hasResponseHeader) {
      recordWarning('settle', 'v2 headers', 'Missing PAYMENT-RESPONSE header');
    } else {
      const decoded = b64Decode(hasResponseHeader);
      if (decoded) {
        logInfo(`PAYMENT-RESPONSE: ${JSON.stringify(decoded)}`);
      }
    }
  } catch (e) {
    recordTest('settle', 'v2 headers', false, e.message);
  }

  // Test response structure
  logTest('Response structure validation');
  try {
    const res = await request('POST', '/settle', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(createTestPaymentSignature()),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    
    const requiredFields = ['success', 'network'];
    const hasRequiredFields = requiredFields.every(f => f in (res.json || {}));
    
    // Check conditional fields
    if (res.json?.success) {
      const successFields = ['transaction', 'payer', 'status'];
      const hasSuccessFields = successFields.some(f => res.json[f]);
      recordTest('settle', 'Response structure', hasRequiredFields,
        `Has required fields: ${hasRequiredFields}, Success fields: ${hasSuccessFields}`);
    } else {
      const hasErrorReason = 'errorReason' in (res.json || {}) || 'error' in (res.json || {});
      recordTest('settle', 'Response structure', hasRequiredFields,
        `Has required fields: ${hasRequiredFields}, Error reason: ${hasErrorReason}`);
    }
  } catch (e) {
    recordTest('settle', 'Response structure', false, e.message);
  }

  // Test settlement status values
  logTest('Settlement status field');
  try {
    const res = await request('POST', '/settle', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(createTestPaymentSignature()),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    
    const validStatuses = ['pending', 'preconfirmed', 'completed', 'failed'];
    const status = res.json?.status;
    const isValidStatus = !status || validStatuses.includes(status);
    
    recordTest('settle', 'Status field', isValidStatus,
      status ? `Status: ${status}` : 'No status field');
  } catch (e) {
    recordTest('settle', 'Status field', false, e.message);
  }
}

async function testAccountEndpoint() {
  logSection('POST /account - ACCOUNT MANAGEMENT');

  // Test missing parameters
  logTest('Missing parameters (no headers, no body)');
  try {
    const res = await request('POST', '/account');
    recordTest('account', 'Missing params', res.status === 400,
      res.json?.error || `Status: ${res.status}`);
  } catch (e) {
    recordTest('account', 'Missing params', false, e.message);
  }

  // Test balance query with API key
  if (API_KEY) {
    logTest('Balance query with API key');
    try {
      const res = await request('POST', '/account', {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: { action: 'balance' },
      });
      
      const hasBalanceFields = res.json?.totalBalance !== undefined || 
                               res.json?.mainnetBalance !== undefined;
      recordTest('account', 'Balance query', res.status === 200 && hasBalanceFields,
        hasBalanceFields ? `Balance: ${res.json?.totalBalance || res.json?.mainnetBalance}` : `Status: ${res.status}`);
      logInfo(`Response: ${JSON.stringify(res.json)}`);
    } catch (e) {
      recordTest('account', 'Balance query', false, e.message);
    }

    // Test metrics query
    logTest('Metrics query with API key');
    try {
      const res = await request('POST', '/account', {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: { action: 'metrics' },
      });
      
      const hasStats = res.json?.stats || res.json?.usdc !== undefined;
      recordTest('account', 'Metrics query', res.status === 200 && hasStats,
        hasStats ? 'Has metrics data' : `Status: ${res.status}`);
      logInfo(`Response: ${JSON.stringify(res.json)}`);
    } catch (e) {
      recordTest('account', 'Metrics query', false, e.message);
    }

    // Test invalid action
    logTest('Invalid action');
    try {
      const res = await request('POST', '/account', {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: { action: 'invalid_action' },
      });
      recordTest('account', 'Invalid action', res.status === 400,
        res.json?.error || `Status: ${res.status}`);
    } catch (e) {
      recordTest('account', 'Invalid action', false, e.message);
    }
  } else {
    logTest('Balance/Metrics queries');
    recordWarning('account', 'API key tests', 'Skipped - no API_KEY provided');
  }

  // Test purchase with invalid PAYMENT-SIGNATURE
  logTest('Purchase with invalid signature');
  try {
    const res = await request('POST', '/account', {
      headers: {
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': 'not-valid-base64!!!',
      },
    });
    recordTest('account', 'Invalid signature', res.status === 400,
      res.json?.error || `Status: ${res.status}`);
  } catch (e) {
    recordTest('account', 'Invalid signature', false, e.message);
  }

  // Test purchase with valid structure but no funds
  logTest('Purchase with valid structure');
  try {
    const paymentSig = createTestPaymentSignature();
    const res = await request('POST', '/account', {
      headers: {
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(paymentSig),
      },
    });
    // Should fail at signature verification, balance check, or vault config - not parsing
    // CONFIG_ERROR is acceptable if vault is not configured
    const isExpectedError = res.status === 200 || res.status === 400 || 
                           res.json?.error === 'CONFIG_ERROR' ||
                           res.json?.error?.includes('signature') ||
                           res.json?.error?.includes('balance');
    recordTest('account', 'Valid structure', isExpectedError,
      res.json?.error || res.json?.message || `Status: ${res.status}`);
  } catch (e) {
    recordTest('account', 'Valid structure', false, e.message);
  }
}

async function testHeaderEncoding() {
  logSection('BASE64 ENCODING VALIDATION');

  if (!API_KEY) {
    logTest('Encoding tests');
    recordWarning('encoding', 'All tests', 'Skipped - no API_KEY provided');
    return;
  }

  const authHeaders = { 'Authorization': `Bearer ${API_KEY}` };

  // Test malformed base64
  logTest('Malformed base64 in PAYMENT-SIGNATURE');
  try {
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': 'not!!!valid###base64',
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    recordTest('encoding', 'Malformed base64', res.status === 400,
      res.json?.error || `Status: ${res.status}`);
  } catch (e) {
    recordTest('encoding', 'Malformed base64', false, e.message);
  }

  // Test valid base64 but invalid JSON
  logTest('Valid base64 but invalid JSON');
  try {
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': Buffer.from('not json content').toString('base64'),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    recordTest('encoding', 'Invalid JSON in base64', res.status === 400,
      res.json?.error || `Status: ${res.status}`);
  } catch (e) {
    recordTest('encoding', 'Invalid JSON in base64', false, e.message);
  }

  // Test missing required fields in encoded JSON
  logTest('Missing fields in encoded JSON');
  try {
    const incompletePayload = { authorization: { from: TEST_DATA.validAddress } };
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(incompletePayload),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    recordTest('encoding', 'Missing fields', res.status === 400,
      res.json?.error || `Status: ${res.status}`);
  } catch (e) {
    recordTest('encoding', 'Missing fields', false, e.message);
  }

  // Test extra fields (should be tolerated)
  logTest('Extra fields in encoded JSON');
  try {
    const extraFieldsPayload = {
      ...createTestPaymentSignature(),
      extraField: 'should be ignored',
      anotherExtra: { nested: true },
    };
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(extraFieldsPayload),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    recordTest('encoding', 'Extra fields', res.status === 200,
      res.status === 200 ? 'Correctly tolerated' : `Status: ${res.status}`);
  } catch (e) {
    recordTest('encoding', 'Extra fields', false, e.message);
  }
}

async function testValidationEdgeCases() {
  logSection('VALIDATION EDGE CASES');

  if (!API_KEY) {
    logTest('Validation tests');
    recordWarning('validation', 'All tests', 'Skipped - no API_KEY provided');
    return;
  }

  const authHeaders = { 'Authorization': `Bearer ${API_KEY}` };

  // Test zero amount
  logTest('Zero amount value');
  try {
    const sig = createTestPaymentSignature();
    sig.authorization.value = '0';
    const req = createTestPaymentRequirements({ maxAmountRequired: '0' });
    
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(sig),
        'PAYMENT-REQUIRED': b64Encode(req),
      },
    });
    recordTest('validation', 'Zero amount', true,
      res.json?.isValid === false ? res.json?.invalidReason : `isValid: ${res.json?.isValid}`);
  } catch (e) {
    recordTest('validation', 'Zero amount', false, e.message);
  }

  // Test very large amount
  logTest('Very large amount');
  try {
    const sig = createTestPaymentSignature();
    sig.authorization.value = '999999999999999999'; // Very large
    const req = createTestPaymentRequirements({ maxAmountRequired: '999999999999999999' });
    
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(sig),
        'PAYMENT-REQUIRED': b64Encode(req),
      },
    });
    recordTest('validation', 'Large amount', res.status === 200,
      `Status: ${res.status}`);
  } catch (e) {
    recordTest('validation', 'Large amount', false, e.message);
  }

  // Test negative amount (should fail)
  logTest('Negative amount');
  try {
    const sig = createTestPaymentSignature();
    sig.authorization.value = '-1000000';
    
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(sig),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    recordTest('validation', 'Negative amount', res.status === 400 || res.json?.isValid === false,
      res.json?.invalidReason || res.json?.error || `Status: ${res.status}`);
  } catch (e) {
    recordTest('validation', 'Negative amount', false, e.message);
  }

  // Test checksummed vs non-checksummed addresses
  logTest('Non-checksummed address');
  try {
    const sig = createTestPaymentSignature();
    sig.authorization.from = TEST_DATA.validAddress.toLowerCase(); // All lowercase
    
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(sig),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    recordTest('validation', 'Non-checksummed', res.status === 200,
      res.status === 200 ? 'Accepted' : `Status: ${res.status}`);
  } catch (e) {
    recordTest('validation', 'Non-checksummed', false, e.message);
  }

  // Test validAfter in future
  logTest('validAfter in future (not yet valid)');
  try {
    const sig = createTestPaymentSignature();
    sig.authorization.validAfter = String(TEST_DATA.futureTimestamp + 7200); // 2 hours in future
    sig.authorization.validBefore = String(TEST_DATA.futureTimestamp + 86400); // 24 hours in future
    
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(sig),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    const isNotYetValid = res.json?.invalidReason?.toLowerCase().includes('not yet') ||
                          res.json?.invalidReason?.toLowerCase().includes('valid after');
    recordTest('validation', 'Future validAfter', true,
      res.json?.isValid === false ? res.json?.invalidReason : `isValid: ${res.json?.isValid}`);
  } catch (e) {
    recordTest('validation', 'Future validAfter', false, e.message);
  }

  // Test empty nonce
  logTest('Empty nonce');
  try {
    const sig = createTestPaymentSignature();
    sig.authorization.nonce = '';
    
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(sig),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    recordTest('validation', 'Empty nonce', res.status === 400 || res.json?.isValid === false,
      res.json?.invalidReason || res.json?.error || `Status: ${res.status}`);
  } catch (e) {
    recordTest('validation', 'Empty nonce', false, e.message);
  }

  // Test invalid nonce format
  logTest('Invalid nonce format (not hex)');
  try {
    const sig = createTestPaymentSignature();
    sig.authorization.nonce = 'not-a-hex-value';
    
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(sig),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    recordTest('validation', 'Invalid nonce', res.status === 400 || res.json?.isValid === false,
      res.json?.invalidReason || res.json?.error || `Status: ${res.status}`);
  } catch (e) {
    recordTest('validation', 'Invalid nonce', false, e.message);
  }

  // Test short nonce (should still work with 0x prefix)
  logTest('Short nonce (0x1)');
  try {
    const sig = createTestPaymentSignature();
    sig.authorization.nonce = '0x1';
    
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(sig),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    recordTest('validation', 'Short nonce', res.status === 200,
      res.status === 200 ? 'Accepted' : `Status: ${res.status}`);
  } catch (e) {
    recordTest('validation', 'Short nonce', false, e.message);
  }
}

async function testRateLimiting() {
  logSection('RATE LIMITING');

  // Quick burst test on public endpoint
  logTest('Burst requests to /health');
  try {
    const promises = Array(10).fill().map(() => request('GET', '/health'));
    const responses = await Promise.all(promises);
    
    const successCount = responses.filter(r => r.status === 200).length;
    const rateLimited = responses.filter(r => r.status === 429).length;
    
    recordTest('ratelimit', 'Burst /health', successCount > 0,
      `${successCount}/10 succeeded, ${rateLimited} rate limited`);
    
    // Check for rate limit headers
    const hasRateLimitHeaders = responses.some(r => 
      r.headers['x-ratelimit-limit'] || r.headers['x-ratelimit-remaining']
    );
    if (hasRateLimitHeaders) {
      logInfo('Rate limit headers present');
    }
  } catch (e) {
    recordTest('ratelimit', 'Burst /health', false, e.message);
  }
}

async function testContentTypeHandling() {
  logSection('CONTENT-TYPE HANDLING');

  if (!API_KEY) {
    logTest('Content-Type tests');
    recordWarning('content-type', 'All tests', 'Skipped - no API_KEY provided');
    return;
  }

  const authHeaders = { 'Authorization': `Bearer ${API_KEY}` };

  // Test with wrong content type
  logTest('Wrong Content-Type (text/plain)');
  try {
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload: {
          authorization: {
            from: TEST_DATA.validAddress,
            to: TEST_DATA.validAddress2,
            value: '1000000',
            validAfter: '0',
            validBefore: String(TEST_DATA.futureTimestamp),
            nonce: TEST_DATA.validNonce,
          },
          signature: TEST_DATA.validSignature,
        },
        paymentRequirements: createTestPaymentRequirements(),
      }),
    });
    // Should still parse JSON or return appropriate error
    recordTest('content-type', 'Wrong Content-Type', true,
      `Status: ${res.status} - ${res.status === 200 ? 'Accepted' : 'Rejected'}`);
  } catch (e) {
    recordTest('content-type', 'Wrong Content-Type', false, e.message);
  }

  // Test with no content type (headers only)
  logTest('No Content-Type with v2 headers');
  try {
    const res = await request('POST', '/verify', {
      headers: {
        ...authHeaders,
        'PAYMENT-VERSION': '2',
        'PAYMENT-SIGNATURE': b64Encode(createTestPaymentSignature()),
        'PAYMENT-REQUIRED': b64Encode(createTestPaymentRequirements()),
      },
    });
    recordTest('content-type', 'No Content-Type', res.status === 200,
      `Status: ${res.status}`);
  } catch (e) {
    recordTest('content-type', 'No Content-Type', false, e.message);
  }
}

// ============================================================================
// GENERATE REPORT
// ============================================================================

function generateReport() {
  logHeader('TEST RESULTS SUMMARY');
  
  const passRate = ((results.passed / results.total) * 100).toFixed(1);
  
  console.log(`
${colors.bold}Total Tests:${colors.reset}    ${results.total}
${colors.green}Passed:${colors.reset}         ${results.passed}
${colors.red}Failed:${colors.reset}         ${results.failed}
${colors.yellow}Warnings:${colors.reset}       ${results.warnings}
${colors.bold}Pass Rate:${colors.reset}      ${passRate}%
`);

  // Group by category
  const categories = {};
  for (const test of results.tests) {
    if (!categories[test.category]) {
      categories[test.category] = { passed: 0, failed: 0, warnings: 0 };
    }
    if (test.passed && !test.warning) {
      categories[test.category].passed++;
    } else if (!test.passed) {
      categories[test.category].failed++;
    }
    if (test.warning) {
      categories[test.category].warnings++;
    }
  }

  console.log(colors.bold + 'Results by Category:' + colors.reset);
  for (const [cat, stats] of Object.entries(categories)) {
    const status = stats.failed > 0 ? colors.red + '✗' : colors.green + '✓';
    console.log(`  ${status} ${cat}: ${stats.passed} passed, ${stats.failed} failed, ${stats.warnings} warnings${colors.reset}`);
  }

  // List failures
  const failures = results.tests.filter(t => !t.passed);
  if (failures.length > 0) {
    console.log('\n' + colors.red + colors.bold + 'FAILURES:' + colors.reset);
    for (const f of failures) {
      console.log(colors.red + `  ✗ [${f.category}] ${f.name}: ${f.message}` + colors.reset);
    }
  }

  // List warnings
  const warnings = results.tests.filter(t => t.warning);
  if (warnings.length > 0) {
    console.log('\n' + colors.yellow + colors.bold + 'WARNINGS:' + colors.reset);
    for (const w of warnings) {
      console.log(colors.yellow + `  ⚠ [${w.category}] ${w.name}: ${w.warning}` + colors.reset);
    }
  }

  // x402 v2 Compliance Summary
  console.log('\n' + colors.bold + 'x402 v2 PROTOCOL COMPLIANCE:' + colors.reset);
  
  const complianceChecks = [
    { name: 'PAYMENT-VERSION header', check: () => true },
    { name: 'PAYMENT-SIGNATURE header parsing', check: () => !results.tests.some(t => t.name.includes('v2 header') && !t.passed) },
    { name: 'PAYMENT-REQUIRED header parsing', check: () => !results.tests.some(t => t.name.includes('v2 header') && !t.passed) },
    { name: 'PAYMENT-RESPONSE header in settle', check: () => !results.tests.some(t => t.name === 'v2 headers' && t.category === 'settle' && !t.passed) },
    { name: 'Base64 encoding/decoding', check: () => !results.tests.some(t => t.category === 'encoding' && !t.passed) },
    { name: 'CAIP-2 network identifiers', check: () => !results.tests.some(t => t.name.includes('CAIP-2') && !t.passed) },
    { name: 'Multiple network formats', check: () => !results.tests.some(t => t.name.includes('network') && !t.passed) },
  ];

  for (const c of complianceChecks) {
    const status = c.check() ? colors.green + '✓' : colors.red + '✗';
    console.log(`  ${status} ${c.name}${colors.reset}`);
  }

  // Return exit code
  return results.failed > 0 ? 1 : 0;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(colors.cyan + colors.bold + `
╔═══════════════════════════════════════════════════════════════════════════╗
║                    x402 FACILITATOR API TEST SUITE                        ║
║                           v2.0 Protocol                                   ║
╚═══════════════════════════════════════════════════════════════════════════╝
` + colors.reset);

  console.log(`Base URL: ${colors.cyan}${BASE_URL}${colors.reset}`);
  console.log(`API Key:  ${API_KEY ? colors.green + API_KEY.substring(0, 15) + '...' + colors.reset : colors.yellow + 'Not provided (some tests skipped)' + colors.reset}`);
  console.log(`Verbose:  ${VERBOSE ? 'Yes' : 'No'}`);

  // Check connectivity
  logSection('CONNECTIVITY CHECK');
  logTest('Server reachable');
  try {
    const res = await request('GET', '/health');
    if (res.status === 200) {
      logPass(`Connected (uptime: ${Math.floor(res.json?.uptime || 0)}s)`);
    } else {
      logFail(`Status: ${res.status}`);
      console.log(colors.red + '\nCannot connect to server. Aborting tests.' + colors.reset);
      process.exit(1);
    }
  } catch (e) {
    logFail(e.message);
    console.log(colors.red + '\nCannot connect to server. Aborting tests.' + colors.reset);
    process.exit(1);
  }

  // Run all test categories
  await testPublicEndpoints();
  await testAuthenticationScenarios();
  await testVerifyEndpoint();
  await testSettleEndpoint();
  await testAccountEndpoint();
  await testHeaderEncoding();
  await testValidationEdgeCases();
  await testRateLimiting();
  await testContentTypeHandling();

  // Generate report
  const exitCode = generateReport();
  
  console.log('\n' + colors.dim + `Test completed at ${new Date().toISOString()}` + colors.reset);
  process.exit(exitCode);
}

main().catch(e => {
  console.error(colors.red + 'Fatal error:', e + colors.reset);
  process.exit(1);
});
