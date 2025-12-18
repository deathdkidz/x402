#!/usr/bin/env node
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

// ERC-20 Standard ABI
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

// EIP-712 Domain ABI (for USDC and similar tokens)
const EIP712_ABI = [
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function version() view returns (string)',
  'function name() view returns (string)',
];

// ============================================================================
// CONFIGURATION - Networks
// ============================================================================
// Networks are now managed via networks.json
// To add/edit/remove networks, use: node manage-networks.mjs
// ============================================================================

// Load network configurations from JSON
let NETWORKS_CONFIG = {};
let RPC_URLS = {};
let CHAIN_IDS = {};
let ALL_NETWORKS = [];

try {
  const networksPath = join(__dirname, 'config', 'networks.json');
  const networksData = fs.readFileSync(networksPath, 'utf8');
  NETWORKS_CONFIG = JSON.parse(networksData);
  
  // Build RPC_URLS and CHAIN_IDS from networks.json
  Object.entries(NETWORKS_CONFIG).forEach(([name, config]) => {
    RPC_URLS[name] = process.env[config.rpcUrl]; // Get RPC from env variable
    CHAIN_IDS[name] = config.chainId;
    ALL_NETWORKS.push(name);
  });
  
  console.log(`📡 Loaded ${ALL_NETWORKS.length} network(s) from networks.json\n`);
} catch (error) {
  console.error('❌ Error loading networks.json:', error.message);
  console.log('   Run: node manage-networks.mjs to configure networks');
  process.exit(1);
}

async function getTokenMetadata(tokenAddress, network) {
  const rpcUrl = RPC_URLS[network];
  
  if (!rpcUrl) {
    console.error(`❌ No RPC URL configured for network: ${network}`);
    return null;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Network: ${network}`);
  console.log(`Token Address: ${tokenAddress}`);
  console.log('='.repeat(70));

  try {
    // Create provider
    const provider = rpcUrl.startsWith('wss://') || rpcUrl.startsWith('ws://')
      ? new ethers.WebSocketProvider(rpcUrl)
      : new ethers.JsonRpcProvider(rpcUrl);

    // Create contract instance
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    // Fetch basic ERC-20 metadata
    console.log('\n📋 Fetching ERC-20 metadata...');
    
    const [name, symbol, decimals] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
    ]);

    console.log(`✓ Name: ${name}`);
    console.log(`✓ Symbol: ${symbol}`);
    console.log(`✓ Decimals: ${decimals}`);

    // Try to fetch EIP-712 metadata (if supported)
    let eip712 = null;
    try {
      console.log('\n🔐 Checking EIP-712 support...');
      const eip712Token = new ethers.Contract(tokenAddress, EIP712_ABI, provider);
      
      const [domainSeparator, version, eip712Name] = await Promise.all([
        eip712Token.DOMAIN_SEPARATOR(),
        eip712Token.version(),
        eip712Token.name(),
      ]);

      eip712 = {
        name: eip712Name,
        version: version,
        domainSeparator: domainSeparator,
      };

      console.log(`✓ EIP-712 Name: ${eip712.name}`);
      console.log(`✓ EIP-712 Version: ${eip712.version}`);
      console.log(`✓ Domain Separator: ${eip712.domainSeparator}`);
    } catch (error) {
      console.log('⚠️  EIP-712 not supported (this is normal for non-permit tokens)');
    }

    // Build result object
    const metadata = {
      network,
      chainId: CHAIN_IDS[network],
      address: tokenAddress,
      name,
      symbol,
      decimals: Number(decimals),
      eip712: eip712 ? {
        name: eip712.name,
        version: eip712.version,
      } : undefined,
    };

    // Print formatted output
    console.log('\n📦 Token Metadata:');
    console.log(JSON.stringify(metadata, null, 2));

    // Print config format
    console.log('\n📝 Config Format (for src/config/index.ts):');
    console.log('{');
    console.log(`  symbol: '${symbol}',`);
    console.log(`  name: '${name}',`);
    console.log(`  address: '${tokenAddress}',`);
    console.log(`  decimals: ${decimals},`);
    if (eip712) {
      console.log(`  eip712: {`);
      console.log(`    name: '${eip712.name}',`);
      console.log(`    version: '${eip712.version}',`);
      console.log(`  },`);
    }
    console.log('}');

    // Cleanup WebSocket if used
    if (provider instanceof ethers.WebSocketProvider) {
      await provider.destroy();
    }

    return metadata;

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    if (error.data) {
      console.error(`   Data: ${error.data}`);
    }
    return null;
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node get-token-metadata.mjs <token_address> <network>');
    console.log('');
    console.log('Available Networks:');
    ALL_NETWORKS.forEach(net => {
      const status = RPC_URLS[net] ? '✓' : '✗';
      const type = NETWORKS_CONFIG[net]?.type || '';
      console.log(`  ${status} ${net} (${type})`);
    });
    console.log('');
    console.log('Example:');
    console.log('  node get-token-metadata.mjs 0x036CbD53842c5426634e7929541eC2318f3dCF7e "Base Sepolia"');
    console.log('  node get-token-metadata.mjs 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 "Ethereum Sepolia"');
    console.log('');
    console.log('To add/edit networks: node manage-networks.mjs');
    process.exit(1);
  }

  return {
    tokenAddress: args[0],
    network: args.slice(1).join(' '), // Handle network names with spaces
  };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                  TOKEN METADATA FETCHER                            ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  const { tokenAddress, network } = parseArgs();

  // Validate Ethereum address
  if (!ethers.isAddress(tokenAddress)) {
    console.error(`\n❌ Invalid Ethereum address: ${tokenAddress}`);
    process.exit(1);
  }

  // Validate network
  if (!RPC_URLS[network]) {
    console.error(`\n❌ Unknown network: ${network}`);
    console.log('\nAvailable networks:');
    ALL_NETWORKS.forEach(net => {
      const status = RPC_URLS[net] ? '✓' : '✗';
      const type = NETWORKS_CONFIG[net]?.type || '';
      console.log(`  ${status} ${net} (${type})`);
    });
    console.log('\nTo add this network: node manage-networks.mjs');
    process.exit(1);
  }

  const metadata = await getTokenMetadata(tokenAddress, network);

  if (metadata) {
    console.log('\n' + '═'.repeat(70));
    console.log('✅ Success!');
    console.log('═'.repeat(70));
  } else {
    console.log('\n' + '═'.repeat(70));
    console.log('❌ Failed to fetch token metadata');
    console.log('═'.repeat(70));
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
