#!/usr/bin/env node

/**
 * Test Improved Error Messages
 * 
 * Tests the new validation error messages for common merchant mistakes
 */

const FACILITATOR_URL = 'http://localhost:8080';
const API_KEY = 'test_key';

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║          VALIDATION ERROR MESSAGE TEST                           ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

async function testValidationError(testName, payload) {
  console.log(`\n📋 Test: ${testName}`);
  console.log('─'.repeat(70));
  
  try {
    const response = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (response.status === 400) {
      console.log(`✅ Status: ${response.status} (Validation Error - as expected)`);
      console.log(`Message: ${data.message}`);
      if (data.details && data.details.length > 0) {
        console.log(`\nValidation Errors:`);
        data.details.forEach(err => {
          console.log(`  • ${err.field}: ${err.message}`);
        });
      }
      if (data.hint) {
        console.log(`\n💡 Hint: ${data.hint}`);
      }
      return true;
    } else {
      console.log(`⚠️  Unexpected status: ${response.status}`);
      console.log(JSON.stringify(data, null, 2));
      return false;
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  const tests = [
    {
      name: 'Missing required fields',
      payload: {
        x402Version: 1,
      }
    },
    {
      name: 'Invalid scheme value',
      payload: {
        x402Version: 1,
        paymentPayload: {
          authorization: {
            from: '0x0000000000000000000000000000000000000000',
            to: '0x0000000000000000000000000000000000000000',
            value: '10000',
            validAfter: '0',
            validBefore: '0',
            nonce: '0x00'
          },
          signature: '0x00'
        },
        paymentRequirements: {
          scheme: 'upto', // Invalid: only 'exact' is supported
          network: 'Base Sepolia',
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          payTo: '0x0000000000000000000000000000000000000000',
          maxAmountRequired: '10000',
          resource: '/test',
          description: 'Test',
          mimeType: 'text/plain',
          maxTimeoutSeconds: 300
        }
      }
    },
    {
      name: 'Invalid address format',
      payload: {
        x402Version: 1,
        paymentPayload: {
          authorization: {
            from: 'invalid-address', // Invalid address
            to: '0x0000000000000000000000000000000000000000',
            value: '10000',
            validAfter: '0',
            validBefore: '0',
            nonce: '0x00'
          },
          signature: '0x00'
        },
        paymentRequirements: {
          scheme: 'exact',
          network: 'Base Sepolia',
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          payTo: '0x0000000000000000000000000000000000000000',
          maxAmountRequired: '10000',
          resource: '/test',
          description: 'Test',
          mimeType: 'text/plain',
          maxTimeoutSeconds: 300
        }
      }
    },
    {
      name: 'Invalid amount format',
      payload: {
        x402Version: 1,
        paymentPayload: {
          authorization: {
            from: '0x0000000000000000000000000000000000000000',
            to: '0x0000000000000000000000000000000000000000',
            value: '0.01', // Should be integer string
            validAfter: '0',
            validBefore: '0',
            nonce: '0x00'
          },
          signature: '0x00'
        },
        paymentRequirements: {
          scheme: 'exact',
          network: 'Base Sepolia',
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          payTo: '0x0000000000000000000000000000000000000000',
          maxAmountRequired: '10000',
          resource: '/test',
          description: 'Test',
          mimeType: 'text/plain',
          maxTimeoutSeconds: 300
        }
      }
    },
    {
      name: 'Missing network field',
      payload: {
        x402Version: 1,
        paymentPayload: {
          authorization: {
            from: '0x0000000000000000000000000000000000000000',
            to: '0x0000000000000000000000000000000000000000',
            value: '10000',
            validAfter: '0',
            validBefore: '0',
            nonce: '0x00'
          },
          signature: '0x00'
        },
        paymentRequirements: {
          scheme: 'exact',
          // network missing
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          payTo: '0x0000000000000000000000000000000000000000',
          maxAmountRequired: '10000',
          resource: '/test',
          description: 'Test',
          mimeType: 'text/plain',
          maxTimeoutSeconds: 300
        }
      }
    }
  ];

  let passed = 0;
  for (const test of tests) {
    const result = await testValidationError(test.name, test.payload);
    if (result) passed++;
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`Results: ${passed}/${tests.length} tests passed`);
  console.log('═'.repeat(70));
  
  if (passed === tests.length) {
    console.log('\n✅ All validation error messages are working correctly!');
  }
}

runTests().catch(console.error);
