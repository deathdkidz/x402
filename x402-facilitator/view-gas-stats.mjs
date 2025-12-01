#!/usr/bin/env node

/**
 * Gas Statistics Viewer
 * 
 * View gas usage statistics from the gas_tracking table.
 * This script connects directly to the database (not via API).
 * 
 * Usage:
 *   node view-gas-stats.mjs                    # All time stats
 *   node view-gas-stats.mjs --today            # Today's stats
 *   node view-gas-stats.mjs --network base-sepolia
 *   node view-gas-stats.mjs --days 7           # Last 7 days
 *   node view-gas-stats.mjs --merchant 1       # Specific merchant
 */

import mysql from 'mysql2/promise';
import 'dotenv/config';

const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    database: process.env.DB_NAME || 'x402_facilitator',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
};

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
    today: args.includes('--today'),
    network: args.includes('--network') ? args[args.indexOf('--network') + 1] : null,
    days: args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) : null,
    merchant: args.includes('--merchant') ? parseInt(args[args.indexOf('--merchant') + 1]) : null,
    detailed: args.includes('--detailed'),
};

async function getGasStats() {
const connection = await mysql.createConnection(config);

try {
    console.log('📊 GAS USAGE STATISTICS');

    // Build WHERE clause
    const conditions = ['1=1'];
    const params = [];

    if (flags.today) {
        conditions.push('DATE(timestamp) = CURDATE()');
    } else if (flags.days) {
        conditions.push('timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)');
        params.push(flags.days);
    }

    if (flags.network) {
        conditions.push('network = ?');
        params.push(flags.network);
    }

    if (flags.merchant) {
        conditions.push('merchant_id = ?');
        params.push(flags.merchant);
    }

    const whereClause = conditions.join(' AND ');

    // Overall Summary
    const [summary] = await connection.execute(
        `SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'reverted' THEN 1 END) as reverted,
        COALESCE(SUM(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as total_cost,
        COALESCE(AVG(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as avg_cost,
        COALESCE(MIN(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as min_cost,
        COALESCE(MAX(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as max_cost
        FROM gas_tracking
        WHERE ${whereClause}`,
        params
    );

    const stats = summary[0];
    console.log('-'.repeat(110));
    console.log(`|${'📈 OVERALL SUMMARY'.padStart(63)}${' '.repeat(45)}|`);
    console.log('-'.repeat(110));
    console.log(`Total Transactions: ${stats.total_transactions}`);
    console.log(`  ✅ Successful: ${stats.successful}`);
    console.log(`  ❌ Failed: ${stats.failed}`);
    console.log(`  🔄 Reverted: ${stats.reverted}`);
    console.log('');
    
    // By Network
    console.log('-'.repeat(110));
    console.log(`|${'🌐 BY NETWORK'.padStart(60)}${' '.repeat(48)}|`);
    console.log('-'.repeat(110));
    const [byNetwork] = await connection.execute(
        `SELECT 
        network,
        gas_token,
        COUNT(*) as count,
        COALESCE(SUM(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as total_cost,
        COALESCE(AVG(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as avg_cost,
        COALESCE(MIN(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as min_cost,
        COALESCE(MAX(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as max_cost,
        COALESCE(AVG(gas_used), 0) as avg_gas_used
        FROM gas_tracking
        WHERE ${whereClause}
        GROUP BY network, gas_token
        ORDER BY total_cost DESC`,
        params
    );

    if (byNetwork.length === 0) {
        console.log('No data');
    } else {
        byNetwork.forEach(row => {
            console.log(`\n📍 ${row.network} (${row.gas_token})`);
            console.log(`   Transactions: ${row.count}`);
            console.log(`   Total Cost:   ${(parseFloat(row.total_cost) * 1e9).toFixed(2)} gwei (${parseFloat(row.total_cost).toFixed(8)} ${row.gas_token})`);
            console.log(`   Average Cost: ${(parseFloat(row.avg_cost) * 1e9).toFixed(2)} gwei (${parseFloat(row.avg_cost).toFixed(8)} ${row.gas_token})`);
            console.log(`   Min Cost:     ${(parseFloat(row.min_cost) * 1e9).toFixed(2)} gwei`);
            console.log(`   Max Cost:     ${(parseFloat(row.max_cost) * 1e9).toFixed(2)} gwei`);
            console.log(`   Avg Gas Used: ${Math.round(row.avg_gas_used).toLocaleString('en-US')} units`);
            console.log('-'.repeat(110));
        });
    }
    // By Operation Type
    console.log('-'.repeat(110));
    console.log(`|${'🔧 BY OPERATION TYPE'.padStart(64)}${' '.repeat(44)}|`);
    console.log('-'.repeat(110));
    const [byOperation] = await connection.execute(
        `SELECT 
        network,
        operation_type,
        COUNT(*) as count,
        COALESCE(SUM(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as total_cost,
        COALESCE(AVG(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as avg_cost,
        COALESCE(AVG(gas_used), 0) as avg_gas_used
        FROM gas_tracking
        WHERE ${whereClause}
        GROUP BY network, operation_type
        ORDER BY network, total_cost DESC`,
        params
    );

    if (byOperation.length === 0) {
        console.log('No data');
    } else {
        let currentNetwork = null;
        byOperation.forEach(row => {
            if (currentNetwork !== row.network) {
                if (currentNetwork !== null) console.log('');
                console.log(`📍 ${row.network}`);
                currentNetwork = row.network;
            }
            const totalGwei = (parseFloat(row.total_cost) * 1e9).toFixed(2);
            const avgGwei = (parseFloat(row.avg_cost) * 1e9).toFixed(2);
            console.log(`   [${row.operation_type}]`);
            console.log(`   Txs: ${String(row.count).padStart(8)} | Total: ${totalGwei.padStart(8)} gwei | Avg: ${avgGwei.padStart(8)} gwei | Avg Gas: ${Math.round(row.avg_gas_used).toLocaleString('en-US').padStart(8)} units`);
            console.log('-'.repeat(110));
        });
    }
    // By Status
    console.log('-'.repeat(110));
    console.log(`|${'📊 BY STATUS'.padStart(60)}${' '.repeat(48)}|`);
    console.log('-'.repeat(110));
    const [byStatus] = await connection.execute(
        `SELECT 
        network,
        status,
        COUNT(*) as count,
        COALESCE(SUM(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as total_cost,
        COALESCE(AVG(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as avg_cost
        FROM gas_tracking
        WHERE ${whereClause} AND gas_used IS NOT NULL
        GROUP BY network, status
        ORDER BY network, count DESC`,
        params
    );

    if (byStatus.length === 0) {
        console.log('No data');
    } else {
        let currentNetwork = null;
        byStatus.forEach(row => {
            if (currentNetwork !== row.network) {
                if (currentNetwork !== null) console.log('');
                console.log(`📍 ${row.network}`);
                currentNetwork = row.network;
            }
            const icon = row.status === 'success' ? '✅' : row.status === 'reverted' ? '🔄' : '❌';
            const totalGwei = (parseFloat(row.total_cost) * 1e9).toFixed(2);
            const avgGwei = (parseFloat(row.avg_cost) * 1e9).toFixed(2);
            console.log(`   [${icon} ${row.status}]`);
            console.log(`   Txs: ${String(row.count).padStart(8)} | Total: ${totalGwei.padStart(8)} gwei | Avg: ${avgGwei.padStart(8)} gwei`);
            console.log('-'.repeat(110));
        });
    }
    // By Merchant (if not filtered by merchant)
    if (!flags.merchant) {
        console.log('-'.repeat(110));
        console.log(`|${'👥 BY MERCHANT'.padStart(61)}${' '.repeat(47)}|`);
        console.log('-'.repeat(110));
        const [byMerchant] = await connection.execute(
            `SELECT 
            g.network,
            COALESCE(m.merchant_address, 'System/Unknown') as merchant,
            COUNT(g.id) as count,
            COALESCE(SUM(CAST(g.gas_cost_native AS DECIMAL(30,18))), 0) as total_cost,
            COALESCE(AVG(CAST(g.gas_cost_native AS DECIMAL(30,18))), 0) as avg_cost
            FROM gas_tracking g
            LEFT JOIN merchants m ON g.merchant_id = m.id
            WHERE ${whereClause}
            GROUP BY g.network, m.merchant_address
            ORDER BY g.network, total_cost DESC
            LIMIT 10`,
            params
        );

        if (byMerchant.length === 0) {
            console.log('No data');
        } else {
            let currentNetwork = null;
            byMerchant.forEach(row => {
                if (currentNetwork !== row.network) {
                    if (currentNetwork !== null) console.log('');
                    console.log(`📍 ${row.network}`);
                    currentNetwork = row.network;
                }
                const merchantDisplay = row.merchant.substring(0, 20) + (row.merchant.length > 20 ? '...' : '');
                const totalGwei = (parseFloat(row.total_cost) * 1e9).toFixed(2);
                const avgGwei = (parseFloat(row.avg_cost) * 1e9).toFixed(2);
                console.log(`   [${merchantDisplay.padEnd(23)}]`);
                console.log(`   Txs: ${String(row.count).padStart(8)} | Total: ${totalGwei.padStart(8)} gwei | Avg: ${avgGwei.padStart(8)} gwei`);
                console.log('-'.repeat(110));
            });
        }
    }

    // Daily Trend (last 7 days)
    if (!flags.today && !flags.days) {
        console.log('-'.repeat(110));
        console.log(`|${'📅 DAILY TREND (Last 7 Days)'.padStart(68)}${' '.repeat(40)}|`);
        console.log('-'.repeat(110));
        const [dailyTrend] = await connection.execute(
            `SELECT 
            network,
            DATE(timestamp) as date,
            COUNT(*) as count,
            COALESCE(SUM(CAST(gas_cost_native AS DECIMAL(30,18))), 0) as total_cost
            FROM gas_tracking
            WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY network, DATE(timestamp)
            ORDER BY network, date DESC`,
            []
        );

        if (dailyTrend.length === 0) {
            console.log('No data');
        } else {
            let currentNetwork = null;
            dailyTrend.forEach(row => {
                if (currentNetwork !== row.network) {
                    if (currentNetwork !== null) console.log('');
                    console.log(`📍 ${row.network}`);
                    currentNetwork = row.network;
                }
                const totalGwei = (parseFloat(row.total_cost) * 1e9).toFixed(2);
                const dateStr = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
                console.log(`   [${dateStr}]`);
                console.log(`   Txs: ${String(row.count).padStart(8)} | Total: ${totalGwei.padStart(8)} gwei`);
                console.log('-'.repeat(110));
            });
        }
    }

    // Detailed transaction list
    if (flags.detailed) {
        console.log('-'.repeat(110));
        console.log(`|${'📋 DETAILED TRANSACTIONS (Last 20)'.padStart(71)}${' '.repeat(37)}|`);
        console.log('-'.repeat(110));
        const [detailed] = await connection.execute(
            `SELECT 
            timestamp,
            network,
            operation_type,
            transaction_hash,
            gas_used,
            CAST(gas_cost_native AS DECIMAL(30,18)) as cost,
            status
            FROM gas_tracking
            WHERE ${whereClause}
            ORDER BY timestamp DESC
            LIMIT 20`,
            params
        );

        detailed.forEach(row => {
            const txHash = row.transaction_hash ? row.transaction_hash.substring(0, 10) + '...' : 'N/A';
            console.log(`${row.timestamp.toISOString().substring(0, 19)} | ${row.network.padEnd(18)} | ${row.operation_type.padEnd(15)} | ${txHash.padEnd(13)} | ${String(row.gas_used || 'N/A').padStart(8)} | ${parseFloat(row.cost || 0).toFixed(8)} | ${row.status}`);
        });
    }

    // Warnings
    const failedGas = byStatus.find(s => s.status === 'failed' || s.status === 'reverted');
    if (failedGas && parseFloat(failedGas.total_cost) > 0) {
        console.log('⚠️  WARNING: Gas wasted on failed/reverted transactions: ' + parseFloat(failedGas.total_cost).toFixed(8));
        console.log('');
    }

    console.log('='.repeat(110));
    console.log('');
    console.log('💡 TIP: Use --detailed flag to see individual transactions');
    console.log('💡 TIP: Use --network <network> to filter by network');
    console.log('💡 TIP: Use --days <number> to see stats for last N days');
    console.log('💡 TIP: Use --merchant <id> to filter by merchant');
    console.log('');

    } finally {
        await connection.end();
    }
}

// Run
getGasStats().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
