#!/usr/bin/env node
import { ethers } from 'ethers';
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

/**
 * Generate a new merchant with auth wallet
 * 
 * Usage:
 *   node scripts/generate-merchant-v2.mjs                    # Generate random wallet
 *   node scripts/generate-merchant-v2.mjs <auth-private-key> # Use existing key
 */
async function generateMerchant(authPrivateKey = null) {
  let connection;

  try {
    console.log('🔐 Generating new merchant account...\n');

    // Generate or import auth wallet
    let authWallet;
    let hasAuthMnemonic = false;
    
    if (authPrivateKey) {
      console.log('📥 Importing auth wallet from private key...');
      authWallet = new ethers.Wallet(authPrivateKey);
      console.log('✅ Auth wallet imported\n');
    } else {
      console.log('🎲 Generating random auth wallet...');
      authWallet = ethers.Wallet.createRandom();
      hasAuthMnemonic = true;
      console.log('✅ Auth wallet generated\n');
    }

    // Generate deposit wallet (private key stored for deposits)
    console.log('🎲 Generating deposit wallet (for top-ups only)...');
    const depositWallet = ethers.Wallet.createRandom();
    console.log('✅ Deposit wallet generated\n');
    // Generate API key
    const apiKey = crypto.randomBytes(32).toString('hex');
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    // Get business name from command line or use default
    const businessName = process.argv[3] || null;

    console.log('✅ Merchant Generated:');
    console.log('━'.repeat(80));
    console.log('\n📋 MERCHANT INFORMATION:');
    console.log(`   Business Name: ${businessName || 'Not set'}`);
    console.log(`   Auth Address (PRIMARY): ${authWallet.address}`);
    console.log(`   Deposit Address (derived from private_key): ${depositWallet.address}`);
    console.log(`   Tier: free`);

    console.log('\n🔑 API CREDENTIALS:');
    console.log(`   API Key: ${apiKey}`);
    console.log(`   Webhook Secret: ${webhookSecret}`);

    console.log('\n🔐 AUTH WALLET (PRIMARY - dashboard login, API identity, payment recipient):');
    console.log(`   Address: ${authWallet.address}`);
    console.log(`   Private Key: ${authWallet.privateKey}`);
    if (hasAuthMnemonic && authWallet.mnemonic) {
      console.log(`   Mnemonic: ${authWallet.mnemonic.phrase}`);
    }

    console.log('\n💰 DEPOSIT WALLET (OPTIONAL - for deposits/top-ups only):');
    console.log(`   Address: ${depositWallet.address}`);
    console.log(`   Private Key: ${depositWallet.privateKey}`);

    if (depositWallet.mnemonic) {
      console.log(`   Mnemonic: ${depositWallet.mnemonic.phrase}`);
    }

    // Connect to database
    console.log('\n📊 Saving to database...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      database: process.env.DB_NAME || 'x402_facilitator',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });

    // Insert merchant
    await connection.execute(
      `INSERT INTO merchants 
       (auth_address, business_name, api_key, private_key, webhook_secret, webhook_events, tier) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        authWallet.address.toLowerCase(),
        businessName,
        apiKey,
        depositWallet.privateKey,  // Store deposit wallet private key
        webhookSecret,
        'transaction.completed,transaction.failed',
        'free'
      ]
    );

    console.log('✅ Merchant saved to database!');
    
    console.log('\n⚠️  IMPORTANT - SAVE THESE CREDENTIALS:');
    console.log('━'.repeat(80));
    console.log('1. AUTH WALLET (PRIMARY) - Dashboard login, API identity, payment recipient');
    console.log(`   Address: ${authWallet.address}`);
    console.log(`   Private Key: ${authWallet.privateKey}`);
    console.log(`   Private Key: ${authWallet.privateKey}`);
    
    console.log('\n2. DEPOSIT WALLET (OPTIONAL) - Only for deposits (private key stored in DB)');
    console.log(`   Address: ${depositWallet.address}`);
    console.log(`   Private Key: ${depositWallet.privateKey}`);
    console.log(`   Note: Deposit address is derived from private_key in database`);
    
    console.log('\n3. API CREDENTIALS');
    console.log(`   API Key: ${apiKey}`);
    console.log(`   Webhook Secret: ${webhookSecret}`);
    
    console.log('\n📝 NEXT STEPS:');
    console.log('━'.repeat(80));
    console.log('1. Save all credentials in a secure location');
    console.log('2. Import AUTH wallet to MetaMask for dashboard login');
    console.log('3. Use AUTH address for receiving payments (primary)');
    console.log('4. Deposit address is derived automatically from private_key (safe)');
    console.log('5. Use API Key in your application\'s Authorization header');
    console.log('6. Access dashboard at your merchant-demo URL');
    console.log('━'.repeat(80));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Parse command line arguments
const authKey = process.argv[2];

generateMerchant(authKey);
