import pkg from 'ethers';
const { ethers } = pkg;

// Test data matching what the demo app would create
const domain = {
  name: 'USDC',  // Base Sepolia USDC
  version: '2',
  chainId: 84532,  // Base Sepolia
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

// Sample authorization message
const authorization = {
  from: '0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C',
  to: '0x530f81F36D55118D8e829A1f8b15a4D910f43b6E',
  value: '10000',
  validAfter: '1734620270',  // Example timestamp as string
  validBefore: '1734623870', // Example timestamp as string
  nonce: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
};

// Using ethers built-in typed data hash (this is what wagmi uses)
const builtInHash = ethers.TypedDataEncoder.hash(domain, types, {
  from: authorization.from,
  to: authorization.to,
  value: authorization.value,
  validAfter: parseInt(authorization.validAfter),  // ethers expects number for uint256
  validBefore: parseInt(authorization.validBefore),
  nonce: authorization.nonce
});

console.log('=== ETHERS EIP-712 HASH COMPUTATION ===');
console.log('Domain:', JSON.stringify(domain, null, 2));
console.log('Message:', JSON.stringify(authorization, null, 2));
console.log('\nethers.TypedDataEncoder.hash (with int timestamps):', builtInHash);

// Show the hash when using strings for validAfter/validBefore
const builtInHashWithStrings = ethers.TypedDataEncoder.hash(domain, types, {
  from: authorization.from,
  to: authorization.to,
  value: authorization.value,
  validAfter: authorization.validAfter,  // Keep as string
  validBefore: authorization.validBefore,  // Keep as string
  nonce: authorization.nonce
});

console.log('ethers.TypedDataEncoder.hash (with string timestamps):', builtInHashWithStrings);
console.log('\nString vs Number timestamps match:', builtInHash === builtInHashWithStrings);

// Show domain and struct hashes
console.log('\n=== COMPONENTS ===');
const hashDomain = ethers.TypedDataEncoder.hashDomain(domain);
console.log('Domain separator:', hashDomain);

const hashStruct = ethers.TypedDataEncoder.hashStruct('TransferWithAuthorization', types, {
  from: authorization.from,
  to: authorization.to,
  value: authorization.value,
  validAfter: parseInt(authorization.validAfter),
  validBefore: parseInt(authorization.validBefore),
  nonce: authorization.nonce
});
console.log('Struct hash:', hashStruct);
