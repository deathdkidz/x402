// Test what hash viem produces with string values vs BigInt values
import { hashTypedData, recoverTypedDataAddress } from 'viem';

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
    { name: 'nonce', type: 'bytes32' }
  ]
};

// Message with STRING values (like the demo app sends)
const messageStrings = {
  from: '0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C',
  to: '0x530f81F36D55118D8e829A1f8b15a4D910f43b6E',
  value: '10000',
  validAfter: '1734620270',
  validBefore: '1734623870',
  nonce: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
};

// Message with BigInt values
const messageBigInt = {
  from: '0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C',
  to: '0x530f81F36D55118D8e829A1f8b15a4D910f43b6E',
  value: 10000n,
  validAfter: 1734620270n,
  validBefore: 1734623870n,
  nonce: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
};

console.log('=== Viem Hash Comparison ===\n');

try {
  const hashStrings = hashTypedData({
    domain,
    types,
    primaryType: 'TransferWithAuthorization',
    message: messageStrings
  });
  console.log('Hash with STRING values:', hashStrings);
} catch (e) {
  console.log('Error with strings:', e.message);
}

try {
  const hashBigInt = hashTypedData({
    domain,
    types,
    primaryType: 'TransferWithAuthorization',
    message: messageBigInt
  });
  console.log('Hash with BigInt values:', hashBigInt);
} catch (e) {
  console.log('Error with BigInt:', e.message);
}

// Expected from Rust
console.log('\nExpected from Rust:      0x1b262cf1b2ae920daf545f9e14e512bbe9f9b9a2a85674dde9394b6bec355ed9');
