import { NextRequest } from 'next/server';
import { verifySiwe } from '@/lib/api';
import { setSessionCookie } from '@/lib/session';
import {
  secureJsonResponse,
  errorResponse,
  checkRateLimit,
  getClientIP,
  isValidSignature,
  validateOrigin,
} from '@/lib/security';

export async function POST(request: NextRequest) {
  try {
    // Validate origin
    if (!validateOrigin(request)) {
      return errorResponse('Invalid origin', 403);
    }

    // Strict rate limiting for auth endpoint (10 attempts per minute)
    const ip = getClientIP(request);
    const rateLimit = checkRateLimit(`siwe-verify:${ip}`, { windowMs: 60000, maxRequests: 10 });
    if (!rateLimit.allowed) {
      return errorResponse('Too many login attempts. Please try again later.', 429);
    }

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body', 400);
    }

    const { message, signature } = body;

    // Validate required fields
    if (!message || !signature) {
      return errorResponse('Missing required fields', 400);
    }

    // Validate signature format
    if (!isValidSignature(signature)) {
      return errorResponse('Invalid signature format', 400);
    }

    // Validate message length (SIWE messages shouldn't be too long)
    if (message.length > 5000) {
      return errorResponse('Message too long', 400);
    }

    // Call facilitator API to verify SIWE
    const result = await verifySiwe(message, signature);

    if (!result.success || !result.data) {
      return errorResponse(result.error || 'Authentication failed', 401);
    }

    const { merchant, sessionToken, isNewUser, isAdmin, adminRole } = result.data;

    // Set secure session cookie
    await setSessionCookie(sessionToken);

    // Return minimal merchant data (no sensitive fields)
    return secureJsonResponse({
      success: true,
      merchant: {
        id: merchant.id,
        businessName: merchant.businessName,
        creditBalance: merchant.creditBalance,
        status: merchant.status,
      },
      isNewUser,
      isAdmin: isAdmin || false,
      adminRole: adminRole || null,
    });
  } catch (error) {
    console.error('SIWE auth error:', error);
    return errorResponse('Authentication failed', 500);
  }
}
