import { NextRequest } from 'next/server';
import { createTopupOrder } from '@/lib/api';
import { withAuth } from '@/lib/security';

export async function POST(request: NextRequest) {
  return withAuth(request, async (merchant, req, sessionToken) => {
    const body = await req.json();
    const { packageId, customAmount, network } = body;

    const result = await createTopupOrder(
      merchant.id,
      packageId,
      customAmount,
      network,
      sessionToken
    );

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to create order');
    }

    return result.data;
  });
}
