import { NextResponse } from 'next/server';
import { adminLogin } from '@/lib/api';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, totpCode } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password required' },
        { status: 400 }
      );
    }

    const result = await adminLogin(username, password, totpCode);

    if (result.success && result.data) {
      return NextResponse.json({
        success: true,
        data: result.data,
      });
    }

    return NextResponse.json(
      { success: false, error: result.error || 'Login failed' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
