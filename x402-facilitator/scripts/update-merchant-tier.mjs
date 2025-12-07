import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const TIER_PRESETS = {
  free: {
    verifyLimit: 60,
    settleLimit: 20,
    window: 60,
  },
  basic: {
    verifyLimit: 120,
    settleLimit: 40,
    window: 60,
  },
  pro: {
    verifyLimit: 300,
    settleLimit: 100,
    window: 60,
  },
  enterprise: {
    verifyLimit: 1000,
    settleLimit: 500,
    window: 60,
  },
};

async function updateMerchantTier() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: npm run update-tier <auth_address> <tier> [verify_limit] [settle_limit] [window]');
    console.log('\nAvailable tiers:');
    console.log('  free       - 60 verify/min, 20 settle/min');
    console.log('  basic      - 120 verify/min, 40 settle/min');
    console.log('  pro        - 300 verify/min, 100 settle/min');
    console.log('  enterprise - 1000 verify/min, 500 settle/min');
    console.log('  custom     - Specify custom limits');
    console.log('\nExamples:');
    console.log('  npm run update-tier 0x123...abc pro');
    console.log('  npm run update-tier 0x123...abc custom 500 200 60');
    process.exit(1);
  }

  const authAddress = args[0];
  const tier = args[1];
  
  let verifyLimit, settleLimit, window;

  if (tier === 'custom') {
    if (args.length < 5) {
      console.error('Custom tier requires verify_limit, settle_limit, and window');
      process.exit(1);
    }
    verifyLimit = parseInt(args[2]);
    settleLimit = parseInt(args[3]);
    window = parseInt(args[4]);
  } else if (TIER_PRESETS[tier]) {
    verifyLimit = TIER_PRESETS[tier].verifyLimit;
    settleLimit = TIER_PRESETS[tier].settleLimit;
    window = TIER_PRESETS[tier].window;
  } else {
    console.error(`Invalid tier: ${tier}`);
    console.error('Available tiers: free, basic, pro, enterprise, custom');
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    database: process.env.DB_NAME || 'x402_facilitator',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    // Check if merchant exists
    const [merchants] = await connection.execute(
      'SELECT auth_address, tier, verify_limit, settle_limit FROM merchants WHERE auth_address = ?',
      [authAddress.toLowerCase()]
    );

    if (merchants.length === 0) {
      console.error(`Merchant not found: ${authAddress}`);
      process.exit(1);
    }

    const oldMerchant = merchants[0];
    console.log('\n📊 Current Settings:');
    console.log(`   Merchant: ${oldMerchant.auth_address}`);
    console.log(`   Tier: ${oldMerchant.tier}`);
    console.log(`   Verify Limit: ${oldMerchant.verify_limit}/min`);
    console.log(`   Settle Limit: ${oldMerchant.settle_limit}/min`);

    // Update merchant tier and limits
    await connection.execute(
      `UPDATE merchants 
       SET tier = ?, verify_limit = ?, settle_limit = ?, rate_limit_window = ? 
       WHERE auth_address = ?`,
      [tier, verifyLimit, settleLimit, window, authAddress.toLowerCase()]
    );

    console.log('\n✅ Updated Settings:');
    console.log(`   Merchant: ${authAddress}`);
    console.log(`   Tier: ${tier}`);
    console.log(`   Verify Limit: ${verifyLimit}/min`);
    console.log(`   Settle Limit: ${settleLimit}/min`);
    console.log(`   Window: ${window} seconds`);
    console.log('\n🔄 Note: Rate limit cache will refresh within 1 hour');
    console.log('   To clear cache immediately, restart the facilitator or run:');
    console.log(`   redis-cli DEL "ratelimits:${authAddress.toLowerCase()}"`);

  } catch (error) {
    console.error('Error updating merchant tier:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

updateMerchantTier();
