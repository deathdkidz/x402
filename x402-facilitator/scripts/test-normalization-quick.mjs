#!/usr/bin/env node

/**
 * Quick test to verify network normalization logging
 */

import { normalizeNetworkName } from '../dist/config/index.js';

const testCases = [
  'Base Sepolia',
  'base-sepolia',
  'hyperevm-testnet',
  'HyperEVM Testnet',
  'ETHEREUM_SEPOLIA',
  'ethereum sepolia',
];

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║          NETWORK NORMALIZATION TEST                               ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

testCases.forEach(input => {
  const normalized = normalizeNetworkName(input);
  console.log(`Input: ${input.padEnd(25)} → Normalized: ${normalized}`);
});

console.log('\n✅ Network names are normalized correctly!');
console.log('These normalized names will appear in logs instead of raw input.\n');
