import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'x402_facilitator',
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address')?.toLowerCase();

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 });
  }

  try {
    const connection = await mysql.createConnection(dbConfig);
    
    // Get or create rate limit record
    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT settle_count, last_reset FROM demo_rate_limits WHERE address = ?`,
      [address]
    );

    let count = 0;
    
    if (rows.length > 0) {
      const lastReset = new Date(rows[0].last_reset);
      const now = new Date();
      
      // Reset if it's a new day
      if (lastReset.toDateString() !== now.toDateString()) {
        await connection.execute(
          `UPDATE demo_rate_limits SET settle_count = 0, last_reset = NOW() WHERE address = ?`,
          [address]
        );
        count = 0;
      } else {
        count = rows[0].settle_count;
      }
    }

    await connection.end();

    return NextResponse.json({ count });
  } catch (error) {
    console.error('Rate limit check error:', error);
    return NextResponse.json({ count: 0 });
  }
}
