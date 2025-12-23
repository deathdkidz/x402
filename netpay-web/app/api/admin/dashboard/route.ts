import { NextRequest, NextResponse } from 'next/server';
import { getAdminDashboard } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.nextUrl.searchParams.get('sessionToken');

    if (!sessionToken) {
      return NextResponse.json(
        { success: false, error: 'Session token required' },
        { status: 401 }
      );
    }

    // TODO: Validate session token on backend
    const result = await getAdminDashboard();

    if (result.success && result.data) {
      return NextResponse.json({
        success: true,
        data: result.data,
      });
    }

    return NextResponse.json(
      { success: false, error: result.error || 'Failed to get dashboard data' },
      { status: 500 }
    );
  } catch (error) {
    console.error('Admin dashboard error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
