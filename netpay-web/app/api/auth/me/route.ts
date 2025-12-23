import { NextRequest } from 'next/server';
import { getCurrentMerchant } from '@/lib/session';
import { secureJsonResponse, checkRateLimit, getClientIP } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    // Rate limit check
    const ip = getClientIP(request);
    const rateLimit = checkRateLimit(`me:${ip}`, { windowMs: 60000, maxRequests: 30 });
    if (!rateLimit.allowed) {
      return secureJsonResponse({ authenticated: false, error: 'Too many requests' }, 429);
    }

    const merchant = await getCurrentMerchant();

    if (!merchant) {
      return secureJsonResponse({ authenticated: false }, 401);
    }

    // Return minimal data (no API key or sensitive info)
    return secureJsonResponse({
      authenticated: true,
      merchant: {
        id: merchant.id,
        address: merchant.authAddress,
        businessName: merchant.businessName,
        creditBalance: merchant.creditBalance,
        status: merchant.status,
        createdAt: merchant.createdAt,
      },
    });
  } catch (error) {
    console.error('[API] Get me error:', error);
    return secureJsonResponse({ authenticated: false }, 500);
  }
}
