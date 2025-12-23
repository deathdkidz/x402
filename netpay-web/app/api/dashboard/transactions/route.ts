import { NextRequest } from 'next/server';
import { getTransactions } from '@/lib/api';
import { withAuth, sanitizeString, sanitizeInt } from '@/lib/security';

export async function GET(request: NextRequest) {
  return withAuth(request, async (merchant) => {
    const { searchParams } = new URL(request.url);
    
    // Sanitize all query parameters
    const params = {
      page: sanitizeInt(searchParams.get('page'), 1, 1, 1000),
      limit: sanitizeInt(searchParams.get('limit'), 20, 1, 100),
      status: sanitizeString(searchParams.get('status'), 50),
      network: sanitizeString(searchParams.get('network'), 50),
      search: sanitizeString(searchParams.get('search'), 200),
    };

    const result = await getTransactions(merchant.id, params);

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to fetch transactions');
    }

    return result.data;
  });
}
