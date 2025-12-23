import { NextRequest } from 'next/server';
import { getCredits } from '@/lib/api';
import { withAuth } from '@/lib/security';

export async function GET(request: NextRequest) {
  return withAuth(request, async (merchant) => {
    const result = await getCredits(merchant.id);

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to fetch credits');
    }

    return result.data;
  });
}
