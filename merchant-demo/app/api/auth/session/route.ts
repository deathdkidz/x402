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
 * GET /api/auth/session
 * Get current session info
 */
export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('session_token')?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    const connection = await mysql.createConnection(dbConfig);

    try {
      // Get session
      const [sessions] = await connection.execute<mysql.RowDataPacket[]>(
        `SELECT * FROM merchant_sessions 
         WHERE session_token = ? AND is_active = TRUE AND expires_at > NOW()`,
        [sessionToken]
      );

      if (sessions.length === 0) {
        return NextResponse.json(
          { authenticated: false },
          { status: 401 }
        );
      }

      const session = sessions[0];

      // Update last activity
      await connection.execute(
        'UPDATE merchant_sessions SET last_activity = NOW() WHERE id = ?',
        [session.id]
      );

      // Get merchant info
      const [merchants] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM merchants WHERE id = ? AND is_active = TRUE',
        [session.merchant_id]
      );

      if (merchants.length === 0) {
        return NextResponse.json(
          { authenticated: false },
          { status: 401 }
        );
      }

      const merchant = merchants[0];

      return NextResponse.json({
        authenticated: true,
        merchant: {
          id: merchant.id,
          authAddress: merchant.auth_address,
          businessName: merchant.business_name,
          email: merchant.email,
          profileImageUrl: merchant.profile_image_url,
          tier: merchant.tier,
          verifyLimit: merchant.verify_limit,
          settleLimit: merchant.settle_limit,
          rateLimitWindow: merchant.rate_limit_window,
          webhookUrl: merchant.webhook_url,
          webhookEvents: merchant.webhook_events,
          createdAt: merchant.created_at,
        },
        session: {
          expiresAt: session.expires_at,
          lastActivity: session.last_activity,
        },
      });
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Error getting session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
