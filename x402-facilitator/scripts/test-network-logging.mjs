#!/usr/bin/env node

/**
 * Test Network Normalization in Logs
 * 
 * Verifies that logs show the correct normalized network name
 * instead of the raw value from merchant payload
 */

const FACILITATOR_URL = 'https://api.netpay.id';
const API_KEY = '10426200df51076eeee39dba3963b78ba616b6d490ba6606bb16dfb7974e3036';

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║          NETWORK NAME LOGGING TEST                               ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

async function testNetworkLogging(rawNetwork, expectedNormalized) {
  console.log(`\n📋 Testing: ${rawNetwork} → ${expectedNormalized}`);
  console.log('─'.repeat(70));
  
  const payload = {
    x402Version: 1,
    paymentPayload: {
      authorization: {
        from: '0x0000000000000000000000000000000000000000',
        to: '0x0000000000000000000000000000000000000000',
        value: '10000',
        validAfter: '0',
        validBefore: '999999999999',
        nonce: '0x' + Array(64).fill('0').join('')
      },
      signature: '0x' + Array(130).fill('0').join('')
    },
    paymentRequirements: {
      scheme: 'exact',
      network: rawNetwork,
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo: '0x0000000000000000000000000000000000000000',
      maxAmountRequired: '10000',
      resource: '/test',
      description: 'Test',
      mimeType: 'text/plain',
      maxTimeoutSeconds: 300
    }
  };

  try {
    console.log(`Sending verify request with network: "${rawNetwork}"`);
    const response = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${JSON.stringify(data, null, 2)}`);
    console.log(`\n💡 Check facilitator logs to verify network name is logged as "${expectedNormalized}"`);
    
    return true;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  const tests = [
    { raw: 'base-sepolia', normalized: 'Base Sepolia' },
    { raw: 'BASE-SEPOLIA', normalized: 'Base Sepolia' },
    { raw: 'base_sepolia', normalized: 'Base Sepolia' },
    { raw: 'Base Sepolia', normalized: 'Base Sepolia' },
  ];

  console.log('\n🔍 Testing network name normalization in logs...\n');
  console.log('Note: Check pm2 logs to verify the normalized network name appears in:');
  console.log('  - "Network (raw): [original]" (in route handler)');
  console.log('  - "Network: [normalized]" (in service layer)\n');

  for (const test of tests) {
    await testNetworkLogging(test.raw, test.normalized);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '═'.repeat(70));
  console.log('Check the facilitator logs with:');
  console.log('  pm2 logs x402-facilitator --lines 50');
  console.log('═'.repeat(70));
}

runTests().catch(console.error);
