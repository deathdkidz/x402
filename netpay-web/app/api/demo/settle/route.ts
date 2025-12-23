import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'x402_facilitator',
};

const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:8080';
const DEMO_API_KEY = process.env.DEMO_API_KEY || '';
const DAILY_LIMIT = 5;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { xPayment, network, amount, recipient } = body;

    if (!xPayment || !network || !recipient) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Decode xPayment to get payer address
    let payerAddress: string;
    try {
      const decoded = JSON.parse(atob(xPayment));
      payerAddress = decoded.authorization?.from?.toLowerCase();
      if (!payerAddress) {
        throw new Error('No payer address');
      }
    } catch (e) {
      return NextResponse.json({ success: false, error: 'Invalid payment data' }, { status: 400 });
    }

    // Check rate limit
    const connection = await mysql.createConnection(dbConfig);
    
    try {
      // Get or create rate limit record
      const [rows] = await connection.execute<mysql.RowDataPacket[]>(
        `SELECT settle_count, last_reset FROM demo_rate_limits WHERE address = ?`,
        [payerAddress]
      );

      let currentCount = 0;
      
      if (rows.length > 0) {
        const lastReset = new Date(rows[0].last_reset);
        const now = new Date();
        
        // Reset if it's a new day
        if (lastReset.toDateString() !== now.toDateString()) {
          await connection.execute(
            `UPDATE demo_rate_limits SET settle_count = 0, last_reset = NOW() WHERE address = ?`,
            [payerAddress]
          );
          currentCount = 0;
        } else {
          currentCount = rows[0].settle_count;
        }
      } else {
        // Create new record
        await connection.execute(
          `INSERT INTO demo_rate_limits (address, settle_count) VALUES (?, 0)`,
          [payerAddress]
        );
        currentCount = 0;
      }

      // Check if over limit
      if (currentCount >= DAILY_LIMIT) {
        await connection.end();
        return NextResponse.json({
          success: false,
          error: `Daily limit reached (${DAILY_LIMIT} settlements). Try again tomorrow.`
        }, { status: 429 });
      }

      // Call facilitator to settle
      const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': DEMO_API_KEY,
        },
        body: JSON.stringify({
          xPayment,
          paymentRequirements: {
            scheme: 'exact',
            network,
            maxAmountRequired: amount,
            resource: '/demo',
            description: 'NetPay Demo Settlement',
          }
        }),
      });

      const settleResult = await settleResponse.json();

      if (settleResult.success) {
        // Increment rate limit counter
        await connection.execute(
          `UPDATE demo_rate_limits SET settle_count = settle_count + 1 WHERE address = ?`,
          [payerAddress]
        );
      }

      await connection.end();

      return NextResponse.json(settleResult);
    } catch (error) {
      await connection.end();
      throw error;
    }
  } catch (error) {
    console.error('Demo settle error:', error);
    return NextResponse.json({
      success: false,
      error: 'Settlement failed. Please try again.'
    }, { status: 500 });
  }
}
