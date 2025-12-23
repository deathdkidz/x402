import { NextRequest } from 'next/server';
import { getSiweNonce } from '@/lib/api';
import { secureJsonResponse, errorResponse, checkRateLimit, getClientIP } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    // Rate limit nonce generation (30 per minute per IP)
    const ip = getClientIP(request);
    const rateLimit = checkRateLimit(`siwe-nonce:${ip}`, { windowMs: 60000, maxRequests: 30 });
    if (!rateLimit.allowed) {
      return errorResponse('Too many requests. Please try again later.', 429);
    }

    // Get nonce from facilitator
    const result = await getSiweNonce();

    if (!result.success || !result.data) {
      return errorResponse(result.error || 'Failed to generate nonce', 500);
    }

    return secureJsonResponse({
      nonce: result.data.nonce,
    });
  } catch (error) {
    console.error('SIWE nonce error:', error);
    return errorResponse('Failed to generate nonce', 500);
  }
}
