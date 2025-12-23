import { NextRequest } from 'next/server';
import { getAnalytics } from '@/lib/api';
import { withAuth, sanitizeString } from '@/lib/security';

// Valid period values
const VALID_PERIODS = ['7d', '30d', '90d', '1y'];

export async function GET(request: NextRequest) {
  return withAuth(request, async (merchant) => {
    const { searchParams } = new URL(request.url);
    let period = sanitizeString(searchParams.get('period'), 10) || '30d';
    
    // Validate period against whitelist
    if (!VALID_PERIODS.includes(period)) {
      period = '30d';
    }

    const result = await getAnalytics(merchant.id, period);

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to fetch analytics');
    }

    return result.data;
  });
}
