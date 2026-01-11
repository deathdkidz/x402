#!/usr/bin/env node

import { ethers } from 'ethers';
import fs from 'fs';

console.log('\n╔' + '═'.repeat(70) + '╗');
console.log('║' + 'GENERATE 16 NEW PAYMASTER WALLETS'.padStart(46).padEnd(70) + '║');
console.log('╚' + '═'.repeat(70) + '╝\n');

const wallets = [];
const privateKeys = [];

for (let i = 0; i < 16; i++) {
  const wallet = ethers.Wallet.createRandom();
  wallets.push(wallet);
  privateKeys.push(wallet.privateKey);
  
  console.log(`[${(i + 1).toString().padStart(2)}] ${wallet.address}`);
  console.log(`     Private Key: ${wallet.privateKey}`);
  if (wallet.mnemonic) {
    console.log(`     Mnemonic: ${wallet.mnemonic.phrase}`);
  }
  console.log('');
}

// Generate .env format
const envLine = `PAYMASTER_PRIVATE_KEYS=${privateKeys.join(',')}`;

console.log('\n' + '═'.repeat(70));
console.log('NEW .ENV LINE:');
console.log('═'.repeat(70));
console.log(envLine);
console.log('═'.repeat(70));

// Save to file
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const filename = `/tmp/new-paymasters-${timestamp}.txt`;
const fileContent = `# Generated: ${new Date().toISOString()}
# NEW PAYMASTER WALLETS - REPLACE IN .ENV FILE

${envLine}

# Individual Keys (for reference):
${privateKeys.map((key, i) => `# [${i + 1}] ${wallets[i].address}\n${key}`).join('\n\n')}
`;

fs.writeFileSync(filename, fileContent);

console.log(`\n✅ Saved to: ${filename}\n`);
console.log('⚠️  ACTION REQUIRED:');
console.log('   1. Update PAYMASTER_PRIVATE_KEYS in both .env files');
console.log('   2. Restart facilitator services');
console.log('   3. Fund these new wallets with gas tokens');
console.log('   4. Securely delete the old private keys\n');
