import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';
import crypto from 'crypto';

// Database connection config
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME || 'x402_facilitator',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

/**
 * POST /api/auth/nonce
 * Request a nonce for wallet authentication
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { authAddress } = body;

    if (!authAddress || typeof authAddress !== 'string') {
      return NextResponse.json(
        { error: 'Invalid auth address' },
        { status: 400 }
      );
    }

    // Validate Ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(authAddress)) {
      return NextResponse.json(
        { error: 'Invalid Ethereum address format' },
        { status: 400 }
      );
    }

    const connection = await mysql.createConnection(dbConfig);

    try {
      // Check if merchant exists with this auth address
      const [merchants] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT id, auth_address, business_name FROM merchants WHERE auth_address = ? AND is_active = TRUE',
        [authAddress.toLowerCase()]
      );

      if (merchants.length === 0) {
        return NextResponse.json(
          { error: 'No merchant account found for this wallet address' },
          { status: 404 }
        );
      }

      // Generate nonce
      const nonce = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Save nonce to database
      await connection.execute(
        `INSERT INTO auth_nonces (auth_address, nonce, expires_at) 
         VALUES (?, ?, ?)`,
        [authAddress.toLowerCase(), nonce, expiresAt]
      );

      return NextResponse.json({
        success: true,
        nonce,
        message: `Sign this message to authenticate: ${nonce}`,
        expiresAt: expiresAt.toISOString(),
      });
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Error generating nonce:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
