import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

// Database connection config
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME || 'x402_facilitator',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

/**
 * Middleware to verify session
 */
async function verifySession(request: NextRequest) {
  const sessionToken = request.cookies.get('session_token')?.value;

  if (!sessionToken) {
    return null;
  }

  const connection = await mysql.createConnection(dbConfig);

  try {
    const [sessions] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT * FROM merchant_sessions 
       WHERE session_token = ? AND is_active = TRUE AND expires_at > NOW()`,
      [sessionToken]
    );

    if (sessions.length === 0) {
      return null;
    }

    return sessions[0].merchant_id;
  } finally {
    await connection.end();
  }
}

/**
 * GET /api/dashboard/transactions
 * Get merchant transactions
 */
export async function GET(request: NextRequest) {
  try {
    const merchantId = await verifySession(request);

    if (!merchantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const connection = await mysql.createConnection(dbConfig);

    try {
      // Get merchant auth address
      const [merchants] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT auth_address FROM merchants WHERE id = ? AND is_active = TRUE',
        [merchantId]
      );

      if (merchants.length === 0) {
        return NextResponse.json(
          { error: 'Merchant not found' },
          { status: 404 }
        );
      }

      const authAddress = merchants[0].auth_address;

      // Get query parameters
      const url = new URL(request.url);
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
      const status = url.searchParams.get('status');
      const offset = (page - 1) * limit;

      // Build query
      let query = 'SELECT * FROM transactions WHERE recipient_address = ?';
      const params: any[] = [authAddress];

      if (status && ['pending', 'completed', 'failed'].includes(status)) {
        query += ' AND status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      // Get transactions
      const [transactions] = await connection.execute<mysql.RowDataPacket[]>(
        query,
        params
      );

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM transactions WHERE recipient_address = ?';
      const countParams: any[] = [authAddress];

      if (status && ['pending', 'completed', 'failed'].includes(status)) {
        countQuery += ' AND status = ?';
        countParams.push(status);
      }

      const [countResult] = await connection.execute<mysql.RowDataPacket[]>(
        countQuery,
        countParams
      );

      const total = countResult[0].total;

      return NextResponse.json({
        success: true,
        transactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Error getting transactions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
