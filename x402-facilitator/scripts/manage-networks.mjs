#!/usr/bin/env node

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║              NETWORK CONFIGURATION MANAGER                        ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 * 
 * Interactive tool to manage blockchain network configurations.
 * All network data is stored in networks.json for easy management.
 * 
 * USAGE:
 *   node manage-networks.mjs
 * 
 * FEATURES:
 *   - Add new networks interactively
 *   - Edit existing network configurations
 *   - Remove networks
 *   - List all configured networks
 *   - Validate network configurations
 * 
 * EXAMPLES:
 *   node manage-networks.mjs    # Interactive menu
 * 
 * NOTES:
 *   - Network data stored in networks.json
 *   - RPC URLs reference environment variables
 *   - Changes apply to all scripts immediately
 */

import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const NETWORKS_FILE = join(__dirname, 'config', 'networks.json');

// Load networks from JSON
function loadNetworks() {
  try {
    const data = fs.readFileSync(NETWORKS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log('⚠️  networks.json not found, creating new file...');
    return {};
  }
}

// Save networks to JSON
function saveNetworks(networks) {
  fs.writeFileSync(NETWORKS_FILE, JSON.stringify(networks, null, 2));
}

// Create readline interface
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// Prompt for input
function question(rl, query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Display main menu
async function showMenu() {
  console.clear();
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(18) + 'NETWORK MANAGER' + ' '.repeat(35) + '║');
  console.log('╚' + '═'.repeat(68) + '╝\n');
  
  const networks = loadNetworks();
  const networkCount = Object.keys(networks).length;
  
  console.log(`📡 Current Networks: ${networkCount}\n`);
  
  console.log('1. List all networks');
  console.log('2. Add new network');
  console.log('3. Edit existing network');
  console.log('4. Remove network');
  console.log('5. Validate network configuration');
  console.log('0. Exit\n');
  
  return networks;
}

// List all networks
function listNetworks(networks) {
  console.clear();
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(24) + 'NETWORKS' + ' '.repeat(36) + '║');
  console.log('╚' + '═'.repeat(68) + '╝\n');
  
  if (Object.keys(networks).length === 0) {
    console.log('No networks configured.\n');
    return;
  }
  
  const testnets = Object.entries(networks).filter(([_, cfg]) => cfg.type === 'testnet');
  const mainnets = Object.entries(networks).filter(([_, cfg]) => cfg.type === 'mainnet');
  
  if (testnets.length > 0) {
    console.log('🧪 TESTNETS:\n');
    testnets.forEach(([name, config], index) => {
      console.log(`${index + 1}. ${name}`);
      console.log(`   Chain ID: ${config.chainId}`);
      console.log(`   Gas Token: ${config.gasToken}`);
      console.log(`   RPC: ${config.rpcUrl} (from .env)`);
      console.log(`   Explorer: ${config.explorer}\n`);
    });
  }
  
  if (mainnets.length > 0) {
    console.log('🚀 MAINNETS:\n');
    mainnets.forEach(([name, config], index) => {
      console.log(`${index + 1}. ${name}`);
      console.log(`   Chain ID: ${config.chainId}`);
      console.log(`   Gas Token: ${config.gasToken}`);
      console.log(`   RPC: ${config.rpcUrl} (from .env)`);
      console.log(`   Explorer: ${config.explorer}\n`);
    });
  }
  
  console.log('═'.repeat(70) + '\n');
}

// Add new network
async function addNetwork(networks) {
  console.clear();
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(22) + 'ADD NETWORK' + ' '.repeat(35) + '║');
  console.log('╚' + '═'.repeat(68) + '╝\n');
  
  const rl = createInterface();
  
  try {
    const name = await question(rl, 'Network name (e.g., "Arbitrum Sepolia"): ');
    
    if (!name) {
      console.log('\n❌ Network name is required');
      return false;
    }
    
    if (networks[name]) {
      console.log(`\n⚠️  Network "${name}" already exists. Use edit to modify.`);
      return false;
    }
    
    const chainId = await question(rl, 'Chain ID (e.g., 421614): ');
    const gasToken = await question(rl, 'Gas token symbol (e.g., ETH, MATIC, BNB): ');
    const explorer = await question(rl, 'Block explorer URL: ');
    const type = await question(rl, 'Network type (testnet/mainnet): ');
    const envVar = await question(rl, 'Environment variable name (e.g., ARBITRUM_SEPOLIA_RPC): ');
    
    if (!chainId || !gasToken || !explorer || !type || !envVar) {
      console.log('\n❌ All fields are required');
      return false;
    }
    
    if (type !== 'testnet' && type !== 'mainnet') {
      console.log('\n❌ Type must be "testnet" or "mainnet"');
      return false;
    }
    
    networks[name] = {
      rpcUrl: envVar,
      chainId: parseInt(chainId),
      explorer: explorer,
      gasToken: gasToken.toUpperCase(),
      type: type
    };
    
    saveNetworks(networks);
    
    console.log(`\n✅ Network "${name}" added successfully!`);
    console.log(`\n⚠️  Don't forget to add ${envVar} to your .env file:`);
    console.log(`   ${envVar}=https://your-rpc-url-here`);
    console.log(`\n   Then update TESTNET_NETWORKS or MAINNET_NETWORKS in .env:`);
    console.log(`   ${type === 'testnet' ? 'TESTNET_NETWORKS' : 'MAINNET_NETWORKS'}=...,${name}`);
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    return false;
  } finally {
    rl.close();
  }
}

// Edit existing network
async function editNetwork(networks) {
  console.clear();
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(21) + 'EDIT NETWORK' + ' '.repeat(35) + '║');
  console.log('╚' + '═'.repeat(68) + '╝\n');
  
  const networkNames = Object.keys(networks);
  
  if (networkNames.length === 0) {
    console.log('No networks to edit.\n');
    return false;
  }
  
  console.log('Select network to edit:\n');
  networkNames.forEach((name, index) => {
    console.log(`${index + 1}. ${name}`);
  });
  console.log('0. Cancel\n');
  
  const rl = createInterface();
  
  try {
    const choice = await question(rl, 'Enter number: ');
    const index = parseInt(choice) - 1;
    
    if (choice === '0' || index < 0 || index >= networkNames.length) {
      return false;
    }
    
    const name = networkNames[index];
    const config = networks[name];
    
    console.log(`\nEditing: ${name}`);
    console.log('(Press Enter to keep current value)\n');
    
    const chainId = await question(rl, `Chain ID [${config.chainId}]: `);
    const gasToken = await question(rl, `Gas token [${config.gasToken}]: `);
    const explorer = await question(rl, `Explorer [${config.explorer}]: `);
    const type = await question(rl, `Type [${config.type}]: `);
    const envVar = await question(rl, `Env variable [${config.rpcUrl}]: `);
    
    if (chainId) config.chainId = parseInt(chainId);
    if (gasToken) config.gasToken = gasToken.toUpperCase();
    if (explorer) config.explorer = explorer;
    if (type && (type === 'testnet' || type === 'mainnet')) config.type = type;
    if (envVar) config.rpcUrl = envVar;
    
    networks[name] = config;
    saveNetworks(networks);
    
    console.log(`\n✅ Network "${name}" updated successfully!`);
    return true;
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    return false;
  } finally {
    rl.close();
  }
}

// Remove network
async function removeNetwork(networks) {
  console.clear();
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(20) + 'REMOVE NETWORK' + ' '.repeat(34) + '║');
  console.log('╚' + '═'.repeat(68) + '╝\n');
  
  const networkNames = Object.keys(networks);
  
  if (networkNames.length === 0) {
    console.log('No networks to remove.\n');
    return false;
  }
  
  console.log('Select network to remove:\n');
  networkNames.forEach((name, index) => {
    console.log(`${index + 1}. ${name}`);
  });
  console.log('0. Cancel\n');
  
  const rl = createInterface();
  
  try {
    const choice = await question(rl, 'Enter number: ');
    const index = parseInt(choice) - 1;
    
    if (choice === '0' || index < 0 || index >= networkNames.length) {
      return false;
    }
    
    const name = networkNames[index];
    const confirm = await question(rl, `⚠️  Remove "${name}"? (yes/no): `);
    
    if (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y') {
      delete networks[name];
      saveNetworks(networks);
      console.log(`\n✅ Network "${name}" removed successfully!`);
      return true;
    } else {
      console.log('\n❌ Cancelled');
      return false;
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    return false;
  } finally {
    rl.close();
  }
}

// Validate network configuration
function validateNetworks(networks) {
  console.clear();
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(18) + 'VALIDATION REPORT' + ' '.repeat(33) + '║');
  console.log('╚' + '═'.repeat(68) + '╝\n');
  
  let valid = 0;
  let warnings = 0;
  
  Object.entries(networks).forEach(([name, config]) => {
    const issues = [];
    
    if (!config.chainId || isNaN(config.chainId)) {
      issues.push('Invalid chain ID');
    }
    if (!config.gasToken) {
      issues.push('Missing gas token');
    }
    if (!config.explorer || !config.explorer.startsWith('http')) {
      issues.push('Invalid explorer URL');
    }
    if (!config.type || (config.type !== 'testnet' && config.type !== 'mainnet')) {
      issues.push('Invalid type (must be testnet or mainnet)');
    }
    if (!config.rpcUrl) {
      issues.push('Missing RPC URL env variable');
    }
    
    if (issues.length > 0) {
      console.log(`❌ ${name}:`);
      issues.forEach(issue => console.log(`   - ${issue}`));
      console.log('');
      warnings++;
    } else {
      console.log(`✅ ${name}`);
      valid++;
    }
  });
  
  console.log('\n' + '═'.repeat(70));
  console.log(`Total: ${Object.keys(networks).length} | Valid: ${valid} | Issues: ${warnings}`);
  console.log('═'.repeat(70) + '\n');
}

// Main loop
async function main() {
  const rl = createInterface();
  
  while (true) {
    const networks = await showMenu();
    
    const choice = await question(rl, 'Select option: ');
    
    switch (choice) {
      case '1':
        listNetworks(networks);
        await question(rl, '\nPress Enter to continue...');
        break;
        
      case '2':
        await addNetwork(networks);
        await question(rl, '\nPress Enter to continue...');
        break;
        
      case '3':
        await editNetwork(networks);
        await question(rl, '\nPress Enter to continue...');
        break;
        
      case '4':
        await removeNetwork(networks);
        await question(rl, '\nPress Enter to continue...');
        break;
        
      case '5':
        validateNetworks(networks);
        await question(rl, '\nPress Enter to continue...');
        break;
        
      case '0':
        console.log('\n👋 Goodbye!\n');
        rl.close();
        process.exit(0);
        
      default:
        console.log('\n❌ Invalid option\n');
        await question(rl, 'Press Enter to continue...');
    }
  }
}

main().catch(console.error);
