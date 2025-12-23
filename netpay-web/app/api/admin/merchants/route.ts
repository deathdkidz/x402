import { NextRequest, NextResponse } from 'next/server';
import { getAdminMerchants, updateAdminMerchant, banMerchant, unbanMerchant, adjustMerchantCredits } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionToken = searchParams.get('sessionToken');
    
    if (!sessionToken) {
      return NextResponse.json(
        { success: false, error: 'Session token required' },
        { status: 401 }
      );
    }

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;

    const result = await getAdminMerchants({ page, limit, status, search });

    if (result.success && result.data) {
      return NextResponse.json({
        success: true,
        data: result.data,
      });
    }

    return NextResponse.json(
      { success: false, error: result.error || 'Failed to get merchants' },
      { status: 500 }
    );
  } catch (error) {
    console.error('Admin merchants error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionToken, merchantId, action, ...data } = body;

    if (!sessionToken) {
      return NextResponse.json(
        { success: false, error: 'Session token required' },
        { status: 401 }
      );
    }

    if (!merchantId) {
      return NextResponse.json(
        { success: false, error: 'Merchant ID required' },
        { status: 400 }
      );
    }

    let result;

    switch (action) {
      case 'ban':
        result = await banMerchant(merchantId, data.reason || 'No reason provided');
        break;
      case 'unban':
        result = await unbanMerchant(merchantId);
        break;
      case 'adjustCredits':
        result = await adjustMerchantCredits(merchantId, data.amount, data.type, data.reason);
        break;
      case 'update':
      default:
        result = await updateAdminMerchant(merchantId, data);
        break;
    }

    if (result.success) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: result.error || 'Operation failed' },
      { status: 500 }
    );
  } catch (error) {
    console.error('Admin merchant update error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
