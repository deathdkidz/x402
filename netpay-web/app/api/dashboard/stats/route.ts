import { NextRequest } from 'next/server';
import { getDashboardStats } from '@/lib/api';
import { withAuth, errorResponse } from '@/lib/security';

export async function GET(request: NextRequest) {
  return withAuth(request, async (merchant) => {
    const result = await getDashboardStats(merchant.id);

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to fetch stats');
    }

    return result.data;
  });
}
