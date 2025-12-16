#!/usr/bin/env node

/**
 * Test Network Normalization
 * 
 * This script tests that the network name normalization is working correctly.
 * It should accept various formats: 'Base Sepolia', 'base-sepolia', 'base sepolia', 'BaSe SePolia', etc.
 */

const FACILITATOR_URL = 'http://localhost:8080';

// Test different network name formats
const testCases = [
  'Base Sepolia',      // Standard format
  'base-sepolia',      // Hyphenated lowercase (common from frontend)
  'base sepolia',      // Lowercase with space
  'BASE-SEPOLIA',      // Uppercase with hyphen
  'BaSe-SePolia',      // Mixed case with hyphen
  'base_sepolia',      // Underscore separator
  'BASE SEPOLIA',      // Uppercase with space
];

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║          NETWORK NORMALIZATION TEST                               ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

async function testNetworkFormat(networkName) {
  try {
    const response = await fetch(`${FACILITATOR_URL}/networks`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Check if our network format would be normalized correctly
    // by attempting a verify request (without actual payment data)
    const verifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_key'
      },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload: {
          x402Version: 1,
          payload: {
            authorization: {
              from: '0x0000000000000000000000000000000000000000',
              to: '0x0000000000000000000000000000000000000000',
              value: '0',
              validAfter: '0',
              validBefore: '0',
              nonce: '0x00'
            },
            signature: '0x00'
          }
        },
        paymentRequirements: {
          scheme: 'exact',
          network: networkName,
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          payTo: '0x0000000000000000000000000000000000000000',
          maxAmountRequired: '0',
          resource: '/test',
          description: 'Test',
          mimeType: 'text/plain',
          maxTimeoutSeconds: 300
        }
      })
    });
    
    const verifyData = await verifyResponse.json();
    
    // Check if the error is about network support (means normalization failed)
    // vs other validation errors (means network was normalized correctly)
    const isNetworkError = verifyData.invalidReason?.includes('not supported') || 
                           verifyData.errorReason?.includes('not supported');
    
    if (isNetworkError) {
      console.log(`❌ ${networkName.padEnd(20)} → Network not recognized`);
      return false;
    } else {
      console.log(`✅ ${networkName.padEnd(20)} → Normalized successfully`);
      return true;
    }
  } catch (error) {
    console.log(`❌ ${networkName.padEnd(20)} → Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    const result = await testNetworkFormat(testCase);
    if (result) {
      passed++;
    } else {
      failed++;
    }
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log(`Results: ${passed}/${testCases.length} passed, ${failed} failed`);
  console.log('═'.repeat(70));
  
  if (failed === 0) {
    console.log('\n✅ All network formats are being normalized correctly!');
  } else {
    console.log('\n⚠️  Some network formats failed normalization.');
  }
}

runTests().catch(console.error);
