import { NextRequest } from 'next/server';
import { getTopupPackages } from '@/lib/api';
import { withAuth } from '@/lib/security';

export async function GET(request: NextRequest) {
  return withAuth(request, async (merchant, _req, sessionToken) => {
    const result = await getTopupPackages(merchant.id, sessionToken);

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to fetch packages');
    }

    return { packages: result.data };
  });
}
