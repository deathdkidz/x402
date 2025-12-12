#!/usr/bin/env node

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║            BATCH CONTRACT DEPLOYMENT SCRIPT                       ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 * 
 * Deploy the BatchTransfer contract to multiple networks for efficient
 * gas savings when distributing funds to multiple paymaster wallets.
 * 
 * USAGE:
 *   node deploy-batch-contract.mjs [--network <name>] [--all]
 * 
 * OPTIONS:
 *   --network <name>    Deploy to specific network (Base Sepolia, Ethereum, etc.)
 *   --all               Deploy to all configured networks
 *   (no args)           Interactive mode - prompts for network selection
 * 
 * EXAMPLES:
 *   node deploy-batch-contract.mjs --network "Base Sepolia"
 *   node deploy-batch-contract.mjs --all
 *   node deploy-batch-contract.mjs   # Interactive mode
 * 
 * REQUIREMENTS:
 *   - DEPLOYER_PRIVATE_KEY in .env (currently hardcoded in script)
 *   - RPC URLs configured in .env for target networks
 *   - Gas fees in deployer wallet
 * 
 * OUTPUT:
 *   - Saves deployed addresses to batch-contracts.json
 *   - Displays contract addresses and verification commands
 */

import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

// ============================================================================
// Load networks from networks.json
// To add/edit networks, use: node manage-networks.mjs
// ============================================================================
let NETWORKS = {};

try {
  const networksPath = join(__dirname, 'config', 'networks.json');
  const networksData = fs.readFileSync(networksPath, 'utf8');
  const networksConfig = JSON.parse(networksData);
  
  // Convert networks.json format to deployment format
  Object.entries(networksConfig).forEach(([name, config]) => {
    NETWORKS[name] = {
      rpcUrl: process.env[config.rpcUrl], // Get actual RPC from env
      chainId: config.chainId,
      explorer: config.explorer,
    };
  });
  
  console.log(`📡 Loaded ${Object.keys(NETWORKS).length} network(s) from networks.json\n`);
} catch (error) {
  console.error('❌ Error loading networks.json:', error.message);
  console.log('   Run: node manage-networks.mjs to configure networks\n');
  process.exit(1);
}

// Contract bytecode and ABI
const BYTECODE = '0x608060405234801561001057600080fd5b50610b6d806100206000396000f3fe6080604052600436106100295760003560e01c806352f7c9881461003557806369bfed0b1461004f57600080fd5b3661003057005b600080fd5b61004d610043366004610817565b610062565b005b61004d61005d3660046108ad565b6102c3565b81518351146100b85760405162461bcd60e51b815260206004820152601060248201527f4c656e677468206d69736d617463680000000000000000000000000000000000604482015260640160405180910390fd5b60008351116101095760405162461bcd60e51b815260206004820152600c60248201527f456d7074792061727261797300000000000000000000000000000000000000006044820152606401601f60405180910390fd5b60648351111561015b5760405162461bcd60e51b815260206004820152601360248201527f546f6f206d616e7920726563697069656e7473000000000000000000000000006044820152606401604051809101fd5b6000805b84518110156102155760006001600160a01b03168582815181106101855761018561092f565b60200260200101516001600160a01b0316036101e35760405162461bcd60e51b815260206004820152600c60248201527f5a65726f206164647265737300000000000000000000000000000000000000006044820152606401601f60405180910390fd5b8381815181106101f5576101f561092f565b60200260200101518261020891906109745f565b915080600101905061015f565b3481146102645760405162461bcd60e51b815260206004820152601760248201527f496e636f72726563742074otab616c20616d6f756e740000000000000000000006044820152606401601f60405180910390fd5b60005b84518110156102b857600085828151811061028457610284610945565b60200260200101516001600160a01b03168584815181106102a7576102a7610945565b60200260200101519060405180910390fd5b60005b82518110156104f0576000836102ed57836102ed610945565b60200260200101516001600160a01b031660001461036d5760405162461bcd60e51b815260206004820152600c60248201527f5a65726f206164647265737300000000000000000000000000000000000000006044820152606401601f60405180910390fd5b600083828151811061038157610381610945565b60200260200101519050600080856001600160a01b03168360405160006040518083038185875af1925050503d80600081146103d9576040519150601f19603f3d011682016040523d82523d6000602084013e6103de565b606091505b5091509150811561042d578360010193507f9c05491e5f4d3c9d3e2f8f5a8a7e1b2b8c7d3e2f8f5a8a7e1b2b8c7d3e2f8f88760200260200101518660405161042291815260200190565b60405180910390a150505b5050508060010190506102c6565b815183146105405760405162461bcd60e51b815260206004820152601560248201527f536f6d65207472616e73666572732066'; // Truncated for brevity

const ABI = [
  'function batchTransfer(address[] recipients, uint256[] amounts) payable',
  'function batchTransferEqual(address[] recipients) payable',
  'event BatchTransferExecuted(address indexed sender, uint256 totalAmount, uint256 recipientCount)',
];

// Compile contract (using solc if available, otherwise use precompiled bytecode)
async function compileContract() {
  console.log('📝 Compiling BatchTransfer contract...\n');
  
  // Read the Solidity source
  const source = fs.readFileSync('/srv/x402/x402-facilitator/contracts/BatchTransfer.sol', 'utf8');
  
  try {
    // Try using solcjs to compile
    const solc = await import('solc');
    
    const input = {
      language: 'Solidity',
      sources: {
        'BatchTransfer.sol': { content: source },
      },
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode'],
          },
        },
      },
    };
    
    const output = JSON.parse(solc.default.compile(JSON.stringify(input)));
    
    if (output.errors) {
      const errors = output.errors.filter(e => e.severity === 'error');
      if (errors.length > 0) {
        console.error('Compilation errors:', errors);
        throw new Error('Compilation failed');
      }
    }
    
    const contract = output.contracts['BatchTransfer.sol']['BatchTransfer'];
    return {
      abi: contract.abi,
      bytecode: '0x' + contract.evm.bytecode.object,
    };
    
  } catch (error) {
    console.log('⚠️  solc not available, using forge to compile...\n');
    
    // Use forge (Foundry) to compile
    const { execSync } = await import('child_process');
    
    try {
      execSync('cd /srv/x402/x402-facilitator && forge build --contracts ./contracts/BatchTransfer.sol', {
        stdio: 'inherit',
      });
      
      // Read compiled output
      const artifact = JSON.parse(
        fs.readFileSync('/srv/x402/x402-facilitator/out/BatchTransfer.sol/BatchTransfer.json', 'utf8')
      );
      
      return {
        abi: artifact.abi,
        bytecode: artifact.bytecode.object,
      };
      
    } catch (forgeError) {
      console.error('❌ Forge compilation failed. Installing solc...');
      execSync('npm install --no-save solc@0.8.20', { stdio: 'inherit' });
      
      // Retry with solcjs
      const solc = await import('solc');
      const input = {
        language: 'Solidity',
        sources: { 'BatchTransfer.sol': { content: source } },
        settings: {
          optimizer: { enabled: true, runs: 200 },
          outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
        },
      };
      
      const output = JSON.parse(solc.default.compile(JSON.stringify(input)));
      const contract = output.contracts['BatchTransfer.sol']['BatchTransfer'];
      
      return {
        abi: contract.abi,
        bytecode: '0x' + contract.evm.bytecode.object,
      };
    }
  }
}

async function deployToNetwork(networkName, networkConfig, compiled, deployerPrivateKey) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Deploying to ${networkName}`);
  console.log('='.repeat(70));
  
  try {
    // Support both HTTP(S) and WebSocket RPC URLs
    let provider;
    if (networkConfig.rpcUrl.startsWith('ws://') || networkConfig.rpcUrl.startsWith('wss://')) {
      console.log('Using WebSocket provider...');
      provider = new ethers.WebSocketProvider(networkConfig.rpcUrl);
    } else {
      console.log('Using JSON-RPC provider...');
      provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
    }
    
    const deployer = new ethers.Wallet(deployerPrivateKey, provider);
    
    console.log(`Deployer: ${deployer.address}`);
    
    // Check balance
    const balance = await provider.getBalance(deployer.address);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
    
    if (balance === 0n) {
      console.log('⚠️  Insufficient balance for deployment\n');
      return null;
    }
    
    // Create contract factory
    const factory = new ethers.ContractFactory(compiled.abi, compiled.bytecode, deployer);
    
    // Estimate gas
    const deployTx = await factory.getDeployTransaction();
    const gasEstimate = await provider.estimateGas(deployTx);
    const feeData = await provider.getFeeData();
    const gasCost = gasEstimate * (feeData.gasPrice || feeData.maxFeePerGas || 0n);
    
    console.log(`Gas estimate: ${gasEstimate.toString()} units`);
    console.log(`Gas cost: ${ethers.formatEther(gasCost)} ETH`);
    
    if (balance < gasCost) {
      console.log('⚠️  Insufficient balance for gas\n');
      return null;
    }
    
    // Deploy
    console.log('\n🚀 Deploying contract...');
    const contract = await factory.deploy();
    
    console.log(`TX hash: ${contract.deploymentTransaction().hash}`);
    console.log('Waiting for confirmation...');
    
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    
    console.log(`\n✅ Contract deployed!`);
    console.log(`Address: ${address}`);
    console.log(`Explorer: ${networkConfig.explorer}/address/${address}`);
    
    // Note: WebSocket will be cleaned up automatically when process exits
    // Explicit cleanup causes unhandled rejection errors in ethers.js
    
    return address;
    
  } catch (error) {
    console.error(`\n❌ Deployment failed:`, error.message);
    return null;
  }
}

// Prompt for input
function question(rl, query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Interactive deployer wallet input
async function getDeployerWallet() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    console.log('\n💰 Deployer Wallet Configuration\n');
    console.log('Options:');
    console.log('  1. Use DEPLOYER_PRIVATE_KEY from .env');
    console.log('  2. Enter private key manually');
    console.log('  0. Cancel\n');

    const choice = await question(rl, 'Select option: ');

    if (choice === '0') {
      console.log('\n❌ Deployment cancelled\n');
      rl.close();
      process.exit(0);
    } else if (choice === '1') {
      const envKey = process.env.DEPLOYER_PRIVATE_KEY;
      if (!envKey) {
        console.log('\n❌ DEPLOYER_PRIVATE_KEY not found in .env\n');
        rl.close();
        process.exit(1);
      }
      rl.close();
      return envKey;
    } else if (choice === '2') {
      const privateKey = await question(rl, '\nEnter private key (with or without 0x): ');
      
      if (!privateKey) {
        console.log('\n❌ Private key is required\n');
        rl.close();
        process.exit(1);
      }
      
      // Add 0x prefix if missing
      const formattedKey = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
      
      // Validate length
      if (formattedKey.length !== 66) {
        console.log('\n❌ Invalid private key length (should be 64 hex characters)\n');
        rl.close();
        process.exit(1);
      }
      
      rl.close();
      return formattedKey;
    } else {
      console.log('\n❌ Invalid option\n');
      rl.close();
      process.exit(1);
    }
  } catch (error) {
    rl.close();
    throw error;
  }
}

// Interactive network selection
async function selectNetwork() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('\n📡 Available Networks:\n');
    const networkNames = Object.keys(NETWORKS);
    
    networkNames.forEach((name, index) => {
      console.log(`  ${index + 1}. ${name}`);
    });
    console.log(`  ${networkNames.length + 1}. Deploy to ALL networks`);
    console.log(`  0. Cancel\n`);

    rl.question('Select network (enter number): ', (answer) => {
      rl.close();
      
      const choice = parseInt(answer.trim());
      
      if (choice === 0) {
        console.log('\n❌ Deployment cancelled\n');
        process.exit(0);
      } else if (choice > 0 && choice <= networkNames.length) {
        const selectedNetwork = networkNames[choice - 1];
        resolve({ [selectedNetwork]: NETWORKS[selectedNetwork] });
      } else if (choice === networkNames.length + 1) {
        resolve(NETWORKS);
      } else {
        console.log('\n❌ Invalid selection\n');
        process.exit(1);
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(18) + 'BATCH TRANSFER DEPLOYER' + ' '.repeat(27) + '║');
  console.log('╚' + '═'.repeat(68) + '╝\n');
  
  // Get deployer wallet
  const DEPLOYER_PRIVATE_KEY = await getDeployerWallet();
  
  let networksToDeploy;
  
  // Check for command-line arguments (for automation)
  if (args.length > 0) {
    const networkFilter = args[0];
    
    if (networkFilter === '--all') {
      networksToDeploy = NETWORKS;
      console.log(`🌐 Deploying to all networks\n`);
    } else if (NETWORKS[networkFilter]) {
      networksToDeploy = { [networkFilter]: NETWORKS[networkFilter] };
      console.log(`🎯 Deploying only to: ${networkFilter}\n`);
    } else {
      console.error(`❌ Unknown network: ${networkFilter}`);
      console.log('Available networks:', Object.keys(NETWORKS).join(', '));
      process.exit(1);
    }
  } else {
    // Interactive mode - show menu
    networksToDeploy = await selectNetwork();
    
    const selectedNames = Object.keys(networksToDeploy);
    if (selectedNames.length === Object.keys(NETWORKS).length) {
      console.log(`\n🌐 Deploying to all networks\n`);
    } else {
      console.log(`\n🎯 Deploying to: ${selectedNames[0]}\n`);
    }
  }
  
  // Compile contract
  const compiled = await compileContract();
  
  console.log('✅ Compilation successful!');
  console.log(`Bytecode size: ${(compiled.bytecode.length - 2) / 2} bytes\n`);
  
  // Deploy to selected networks
  const deployments = {};
  
  for (const [networkName, networkConfig] of Object.entries(networksToDeploy)) {
    const address = await deployToNetwork(networkName, networkConfig, compiled, DEPLOYER_PRIVATE_KEY);
    if (address) {
      deployments[networkName] = address;
    }
  }
  
  // Summary
  console.log(`\n${'═'.repeat(70)}`);
  console.log('DEPLOYMENT SUMMARY');
  console.log('═'.repeat(70));
  
  if (Object.keys(deployments).length === 0) {
    console.log('No contracts deployed');
  } else {
    for (const [network, address] of Object.entries(deployments)) {
      console.log(`${network}: ${address}`);
    }
    
    // Load existing deployments and merge with new ones
    const batchContractsPath = join(__dirname, 'config', 'batch-contracts.json');
    let allDeployments = {};
    try {
      const existing = fs.readFileSync(batchContractsPath, 'utf8');
      allDeployments = JSON.parse(existing);
      console.log('\n📋 Loaded existing deployments');
    } catch (error) {
      console.log('\n📋 No existing deployments found, creating new file');
    }
    
    // Merge new deployments (new ones override existing)
    allDeployments = { ...allDeployments, ...deployments };
    
    // Save merged deployments to scripts folder
    fs.writeFileSync(batchContractsPath, JSON.stringify(allDeployments, null, 2));
    
    console.log('\n✅ All deployments saved to batch-contracts.json:');
    for (const [network, address] of Object.entries(allDeployments)) {
      console.log(`   ${network}: ${address}`);
    }
  }
  
  console.log('═'.repeat(70));
  console.log('\nUsage:');
  console.log('  node deploy-batch-contract.mjs                    # Interactive menu');
  console.log('  node deploy-batch-contract.mjs --all              # Deploy to all networks');
  console.log('  node deploy-batch-contract.mjs "Base Sepolia"     # Deploy to specific network');
  console.log('  node deploy-batch-contract.mjs "HyperEVM Testnet" # Deploy to HyperEVM');
  
  // Exit cleanly (important for preventing WebSocket errors)
  process.exit(0);
}

main().catch(console.error);
