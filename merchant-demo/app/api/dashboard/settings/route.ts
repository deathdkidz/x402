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

    // Update last activity
    await connection.execute(
      'UPDATE merchant_sessions SET last_activity = NOW() WHERE id = ?',
      [sessions[0].id]
    );

    return sessions[0].merchant_id;
  } finally {
    await connection.end();
  }
}

/**
 * GET /api/dashboard/settings
 * Get merchant settings
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
      const [merchants] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM merchants WHERE id = ? AND is_active = TRUE',
        [merchantId]
      );

      if (merchants.length === 0) {
        return NextResponse.json(
          { error: 'Merchant not found' },
          { status: 404 }
        );
      }

      const merchant = merchants[0];

      return NextResponse.json({
        success: true,
        settings: {
          authAddress: merchant.auth_address,
          businessName: merchant.business_name,
          email: merchant.email,
          profileImageUrl: merchant.profile_image_url,
          apiKey: merchant.api_key,
          tier: merchant.tier,
          verifyLimit: merchant.verify_limit,
          settleLimit: merchant.settle_limit,
          rateLimitWindow: merchant.rate_limit_window,
          webhookUrl: merchant.webhook_url,
          webhookSecret: merchant.webhook_secret,
          webhookEvents: merchant.webhook_events,
        },
      });
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Error getting settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/dashboard/settings
 * Update merchant settings
 */
export async function PATCH(request: NextRequest) {
  try {
    const merchantId = await verifySession(request);

    if (!merchantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      businessName,
      email,
      profileImageUrl,
      webhookUrl,
      webhookSecret,
      webhookEvents,
    } = body;

    const connection = await mysql.createConnection(dbConfig);

    try {
      const updates: string[] = [];
      const params: any[] = [];

      if (businessName !== undefined) {
        updates.push('business_name = ?');
        params.push(businessName);
      }

      if (email !== undefined) {
        updates.push('email = ?');
        params.push(email);
      }

      if (profileImageUrl !== undefined) {
        updates.push('profile_image_url = ?');
        params.push(profileImageUrl);
      }

      if (webhookUrl !== undefined) {
        updates.push('webhook_url = ?');
        params.push(webhookUrl);
      }

      if (webhookSecret !== undefined) {
        updates.push('webhook_secret = ?');
        params.push(webhookSecret);
      }

      if (webhookEvents !== undefined) {
        updates.push('webhook_events = ?');
        params.push(webhookEvents);
      }

      if (updates.length === 0) {
        return NextResponse.json(
          { error: 'No fields to update' },
          { status: 400 }
        );
      }

      params.push(merchantId);

      await connection.execute(
        `UPDATE merchants SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
        params
      );

      return NextResponse.json({
        success: true,
        message: 'Settings updated successfully',
      });
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
