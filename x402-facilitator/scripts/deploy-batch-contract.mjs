#!/usr/bin/env node
import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const DEPLOYER_PRIVATE_KEY = '0xa1f46be742d1b3114bf15d5ac73b7407259e67c47529b9c9904911d0e234d909';
const DEPLOYER_ADDRESS = '0x7b5f1298f62ce5127B2f86E0AFfE37a7437D7ebD';

// Networks to deploy to
const NETWORKS = {
  'Base Sepolia': {
    rpcUrl: process.env.BASE_SEPOLIA_RPC,
    chainId: 84532,
    explorer: 'https://sepolia.basescan.org',
  },
  'Ethereum Sepolia': {
    rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC,
    chainId: 11155111,
    explorer: 'https://sepolia.etherscan.io',
  },
  'BSC Testnet': {
    rpcUrl: process.env.BSC_TESTNET_RPC,
    chainId: 97,
    explorer: 'https://testnet.bscscan.com',
  },
};

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

async function deployToNetwork(networkName, networkConfig, compiled) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Deploying to ${networkName}`);
  console.log('='.repeat(70));
  
  try {
    const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
    const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
    
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
    
    return address;
    
  } catch (error) {
    console.error(`\n❌ Deployment failed:`, error.message);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const networkFilter = args[0]; // Get network name from command line
  
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(18) + 'BATCH TRANSFER DEPLOYER' + ' '.repeat(27) + '║');
  console.log('╚' + '═'.repeat(68) + '╝\n');
  
  // Filter networks if specified
  let networksToDeploy = NETWORKS;
  if (networkFilter) {
    if (!NETWORKS[networkFilter]) {
      console.error(`❌ Unknown network: ${networkFilter}`);
      console.log('Available networks:', Object.keys(NETWORKS).join(', '));
      process.exit(1);
    }
    networksToDeploy = { [networkFilter]: NETWORKS[networkFilter] };
    console.log(`🎯 Deploying only to: ${networkFilter}\n`);
  } else {
    console.log(`🌐 Deploying to all networks\n`);
  }
  
  // Compile contract
  const compiled = await compileContract();
  
  console.log('✅ Compilation successful!');
  console.log(`Bytecode size: ${(compiled.bytecode.length - 2) / 2} bytes\n`);
  
  // Deploy to selected networks
  const deployments = {};
  
  for (const [networkName, networkConfig] of Object.entries(networksToDeploy)) {
    const address = await deployToNetwork(networkName, networkConfig, compiled);
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
    let allDeployments = {};
    try {
      const existing = fs.readFileSync('/srv/x402/x402-facilitator/batch-contracts.json', 'utf8');
      allDeployments = JSON.parse(existing);
      console.log('\n📋 Loaded existing deployments');
    } catch (error) {
      console.log('\n📋 No existing deployments found, creating new file');
    }
    
    // Merge new deployments (new ones override existing)
    allDeployments = { ...allDeployments, ...deployments };
    
    // Save merged deployments
    fs.writeFileSync('/srv/x402/x402-facilitator/batch-contracts.json', JSON.stringify(allDeployments, null, 2));
    
    console.log('\n✅ All deployments saved to batch-contracts.json:');
    for (const [network, address] of Object.entries(allDeployments)) {
      console.log(`   ${network}: ${address}`);
    }
  }
  
  console.log('═'.repeat(70));
  console.log('\nUsage:');
  console.log('  node deploy-batch-contract.mjs                    # Deploy to all networks');
  console.log('  node deploy-batch-contract.mjs "BSC Testnet"      # Deploy to BSC only');
  console.log('  node deploy-batch-contract.mjs "Base Sepolia"     # Deploy to Base only');
  console.log('  node deploy-batch-contract.mjs "Ethereum Sepolia" # Deploy to Ethereum only');
}

main().catch(console.error);
