#!/usr/bin/env node

/**
 * Verify that private keys match their corresponding addresses
 * Ensures wallet generation was correct and keys are valid
 */

import { ethers } from 'ethers';
import fs from 'fs';

const args = process.argv.slice(2);
const filePath = args[0] || '/tmp/new-paymasters-2026-01-11T12-57-12.txt';

console.log('\n╔' + '═'.repeat(70) + '╗');
console.log('║' + 'VERIFY PAYMASTER WALLETS'.padStart(42).padEnd(70) + '║');
console.log('╚' + '═'.repeat(70) + '╝\n');

if (!fs.existsSync(filePath)) {
  console.log(`❌ File not found: ${filePath}`);
  console.log('\nUsage: node verify-paymasters.mjs [file-path]');
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');

// Extract wallet data (address + private key pairs)
const walletMatches = [];
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  // Look for address comments like "# [1] 0x..."
  if (line.startsWith('# [') && line.includes('] 0x')) {
    const addressMatch = line.match(/0x[a-fA-F0-9]{40}/);
    if (addressMatch && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const keyMatch = nextLine.match(/^0x[a-fA-F0-9]{64}$/);
      if (keyMatch) {
        const walletNum = line.match(/\[(\d+)\]/)[1];
        walletMatches.push({
          num: parseInt(walletNum),
          expectedAddress: addressMatch[0],
          privateKey: keyMatch[0]
        });
      }
    }
  }
}

if (walletMatches.length === 0) {
  console.log('❌ No wallet data found in file');
  console.log('   Expected format: Address comment followed by private key');
  process.exit(1);
}

console.log(`Found ${walletMatches.length} wallet(s) to verify\n`);
console.log('═'.repeat(70));

let validCount = 0;
let invalidCount = 0;
const errors = [];

for (const wallet of walletMatches) {
  try {
    // Derive wallet from private key
    const derivedWallet = new ethers.Wallet(wallet.privateKey);
    const derivedAddress = derivedWallet.address;
    
    // Compare checksummed addresses
    const expectedChecksum = ethers.getAddress(wallet.expectedAddress);
    const derivedChecksum = ethers.getAddress(derivedAddress);
    
    if (expectedChecksum === derivedChecksum) {
      console.log(`[${wallet.num.toString().padStart(2)}] ✅ VALID`);
      console.log(`     Address: ${derivedAddress}`);
      console.log(`     Key: ${wallet.privateKey.slice(0, 10)}...${wallet.privateKey.slice(-8)}`);
      validCount++;
    } else {
      console.log(`[${wallet.num.toString().padStart(2)}] ❌ MISMATCH`);
      console.log(`     Expected: ${expectedChecksum}`);
      console.log(`     Derived:  ${derivedChecksum}`);
      console.log(`     Key: ${wallet.privateKey}`);
      invalidCount++;
      errors.push({
        num: wallet.num,
        expected: expectedChecksum,
        derived: derivedChecksum
      });
    }
  } catch (error) {
    console.log(`[${wallet.num.toString().padStart(2)}] ❌ ERROR`);
    console.log(`     ${error.message}`);
    console.log(`     Key: ${wallet.privateKey}`);
    invalidCount++;
    errors.push({
      num: wallet.num,
      error: error.message
    });
  }
  console.log('');
}

console.log('═'.repeat(70));
console.log('VERIFICATION SUMMARY');
console.log('═'.repeat(70));
console.log(`Total Wallets: ${walletMatches.length}`);
console.log(`✅ Valid: ${validCount}`);
console.log(`❌ Invalid: ${invalidCount}`);
console.log('═'.repeat(70));

if (invalidCount > 0) {
  console.log('\n⚠️  WARNING: Some wallets failed verification!');
  console.log('   DO NOT use these wallets until issues are resolved\n');
  process.exit(1);
} else {
  console.log('\n✅ All wallets verified successfully!');
  console.log('   Safe to update .env files and use these wallets\n');
  process.exit(0);
}
