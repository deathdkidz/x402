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
 * Generate a new merchant with wallet and API key
 * Adds the merchant to the database
 * 
 * Usage:
 *   node scripts/generate-merchant.mjs                          # Generate random wallet
 *   node scripts/generate-merchant.mjs <private-key>            # Use existing private key
 */
async function generateMerchant(privateKey = null) {
  let connection;

  try {
    console.log('🔐 Generating new merchant wallet...\n');

    // Generate or import wallet
    let wallet;
    let hasMnemonic = false;
    
    if (privateKey) {
      // Use provided private key
      console.log('📥 Importing wallet from private key...');
      wallet = new ethers.Wallet(privateKey);
      console.log('✅ Wallet imported\n');
    } else {
      // Generate new random wallet
      console.log('🎲 Generating random wallet...');
      wallet = ethers.Wallet.createRandom();
      hasMnemonic = true;
      console.log('✅ Wallet generated\n');
    }
    
    // Generate API key
    const apiKey = crypto.randomBytes(32).toString('hex');

    console.log('✅ Merchant Generated:');
    console.log('━'.repeat(80));
    console.log(`Merchant Address:  ${wallet.address}`);
    console.log(`Private Key:       ${wallet.privateKey}`);
    if (hasMnemonic) {
      console.log(`Mnemonic:          ${wallet.mnemonic.phrase}`);
    }
    console.log(`API Key:           ${apiKey}`);
    console.log('━'.repeat(80));
    console.log('');

    // Connect to database
    console.log('📊 Connecting to database...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      database: process.env.DB_NAME || 'x402_facilitator',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });

    console.log('✅ Database connected\n');

    // Insert merchant into database
    console.log('💾 Inserting merchant into database...');
    
    const [result] = await connection.execute(
      `INSERT INTO merchants (merchant_address, private_key, api_key, tier, verify_limit, settle_limit, rate_limit_window, created_at, updated_at)
       VALUES (?, ?, ?, 'free', 60, 20, 60, NOW(), NOW())`,
      [wallet.address.toLowerCase(), wallet.privateKey, apiKey]
    );

    console.log(`✅ Merchant inserted with ID: ${result.insertId}\n`);

    // Verify insertion
    const [rows] = await connection.execute(
      'SELECT id, merchant_address, api_key, tier, verify_limit, settle_limit, created_at FROM merchants WHERE id = ?',
      [result.insertId]
    );

    if (rows.length > 0) {
      console.log('✅ Verification successful:');
      console.log(JSON.stringify(rows[0], null, 2));
      console.log('');
    }

    console.log('━'.repeat(80));
    console.log('⚠️  IMPORTANT - Save these credentials securely:');
    console.log('━'.repeat(80));
    console.log('');
    console.log('Merchant Details:');
    console.log(`  Tier: free (60 verify/min, 20 settle/min)`);
    console.log(`  Address: ${wallet.address}`);
    console.log('');
    console.log('For your merchant demo .env or config:');
    console.log(`API_KEY=${apiKey}`);
    console.log('');
    console.log('For wallet recovery (store securely):');
    console.log(`MERCHANT_ADDRESS=${wallet.address}`);
    console.log(`MERCHANT_PRIVATE_KEY=${wallet.privateKey}`);
    if (hasMnemonic) {
      console.log(`MERCHANT_MNEMONIC="${wallet.mnemonic.phrase}"`);
    }
    console.log('');
    console.log('━'.repeat(80));
    console.log('✨ Merchant generation complete!');
    console.log('');

  } catch (error) {
    console.error('❌ Error generating merchant:', error.message);
    if (error.code === 'ER_DUP_ENTRY') {
      console.error('   This wallet address or API key already exists in the database.');
      console.error('   Run the script again to generate a new one.');
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Get private key from command line argument if provided
const privateKey = process.argv[2];

// Run the script
generateMerchant(privateKey);
