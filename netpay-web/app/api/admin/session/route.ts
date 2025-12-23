import { NextResponse } from 'next/server';
import { adminValidateSession } from '@/lib/api';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionToken } = body;

    if (!sessionToken) {
      return NextResponse.json(
        { success: false, error: 'Session token required' },
        { status: 400 }
      );
    }

    const result = await adminValidateSession(sessionToken);

    if (result.success && result.data) {
      return NextResponse.json({
        success: true,
        data: result.data,
      });
    }

    return NextResponse.json(
      { success: false, error: result.error || 'Invalid session' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Admin session validation error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
