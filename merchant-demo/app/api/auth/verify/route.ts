import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import { ethers } from 'ethers';

// Database connection config
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME || 'x402_facilitator',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

/**
 * POST /api/auth/verify
 * Verify signature and create session
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { authAddress, nonce, signature } = body;

    if (!authAddress || !nonce || !signature) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const connection = await mysql.createConnection(dbConfig);

    try {
      // Verify nonce exists and is valid
      const [nonceRows] = await connection.execute<mysql.RowDataPacket[]>(
        `SELECT * FROM auth_nonces 
         WHERE nonce = ? AND auth_address = ? AND used = FALSE AND expires_at > NOW()`,
        [nonce, authAddress.toLowerCase()]
      );

      if (nonceRows.length === 0) {
        return NextResponse.json(
          { error: 'Invalid or expired nonce' },
          { status: 401 }
        );
      }

      // Verify signature
      const message = nonce;
      const recoveredAddress = ethers.verifyMessage(message, signature);

      if (recoveredAddress.toLowerCase() !== authAddress.toLowerCase()) {
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }

      // Mark nonce as used
      await connection.execute(
        'UPDATE auth_nonces SET used = TRUE WHERE nonce = ?',
        [nonce]
      );

      // Get merchant
      const [merchants] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM merchants WHERE auth_address = ? AND is_active = TRUE',
        [authAddress.toLowerCase()]
      );

      if (merchants.length === 0) {
        return NextResponse.json(
          { error: 'Merchant not found' },
          { status: 404 }
        );
      }

      const merchant = merchants[0];

      // Create session
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      // Get IP and User-Agent
      const ipAddress = request.headers.get('x-forwarded-for') || 
                        request.headers.get('x-real-ip') || 
                        'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      await connection.execute(
        `INSERT INTO merchant_sessions 
         (merchant_id, session_token, auth_address, nonce, signature, expires_at, ip_address, user_agent) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          merchant.id,
          sessionToken,
          authAddress.toLowerCase(),
          nonce,
          signature,
          expiresAt,
          ipAddress,
          userAgent,
        ]
      );

      // Return session token and merchant info
      const response = NextResponse.json({
        success: true,
        sessionToken,
        merchant: {
          id: merchant.id,
          authAddress: merchant.auth_address,
          businessName: merchant.business_name,
          email: merchant.email,
          profileImageUrl: merchant.profile_image_url,
          tier: merchant.tier,
        },
        expiresAt: expiresAt.toISOString(),
      });

      // Set session cookie
      response.cookies.set('session_token', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
      });

      return response;
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Error verifying signature:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
