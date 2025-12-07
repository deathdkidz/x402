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
 * POST /api/auth/logout
 * Logout and invalidate session
 */
export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('session_token')?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'No active session' },
        { status: 401 }
      );
    }

    const connection = await mysql.createConnection(dbConfig);

    try {
      // Invalidate session
      await connection.execute(
        'UPDATE merchant_sessions SET is_active = FALSE WHERE session_token = ?',
        [sessionToken]
      );

      const response = NextResponse.json({
        success: true,
        message: 'Logged out successfully',
      });

      // Clear session cookie
      response.cookies.delete('session_token');

      return response;
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Error logging out:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
