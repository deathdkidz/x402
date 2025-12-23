import { NextRequest } from 'next/server';
import { authenticateWallet } from '@/lib/api';
import { setSessionCookie } from '@/lib/session';
import {
  secureJsonResponse,
  errorResponse,
  checkRateLimit,
  getClientIP,
  isValidEthereumAddress,
  isValidSignature,
  sanitizeString,
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
    const rateLimit = checkRateLimit(`auth:${ip}`, { windowMs: 60000, maxRequests: 10 });
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

    const { address, message, signature } = body;

    // Validate required fields
    if (!address || !message || !signature) {
      return errorResponse('Missing required fields', 400);
    }

    // Validate address format
    if (!isValidEthereumAddress(address)) {
      return errorResponse('Invalid wallet address format', 400);
    }

    // Validate signature format
    if (!isValidSignature(signature)) {
      return errorResponse('Invalid signature format', 400);
    }

    // Sanitize message (prevent injection)
    const sanitizedMessage = sanitizeString(message, 2000);
    if (!sanitizedMessage) {
      return errorResponse('Invalid message', 400);
    }

    // Call facilitator API to authenticate (server-side only)
    const result = await authenticateWallet(address.toLowerCase(), sanitizedMessage, signature);

    if (!result.success || !result.data) {
      return errorResponse(result.error || 'Authentication failed', 401);
    }

    const { merchant, sessionToken, isNewUser, isAdmin, adminRole } = result.data;

    // Set secure session cookie
    await setSessionCookie(sessionToken);

    // If user is admin, also store admin session
    if (isAdmin) {
      // Store admin session token in a separate cookie or the same one
      // The session can be used for both merchant and admin access
    }

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
    console.error('Auth error:', error);
    return errorResponse('Authentication failed', 500);
  }
}
