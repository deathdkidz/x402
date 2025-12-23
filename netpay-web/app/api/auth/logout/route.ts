import { NextRequest } from 'next/server';
import { logoutSession } from '@/lib/api';
import { getSessionToken, clearSessionCookie } from '@/lib/session';
import { secureJsonResponse, validateOrigin, errorResponse } from '@/lib/security';

export async function POST(request: NextRequest) {
  try {
    // Validate origin for state-changing operation
    if (!validateOrigin(request)) {
      return errorResponse('Invalid origin', 403);
    }

    const token = await getSessionToken();

    if (token) {
      // Invalidate session on server (fire and forget)
      logoutSession(token).catch(console.error);
    }

    // Always clear cookie
    await clearSessionCookie();

    return secureJsonResponse({ success: true });
  } catch (error) {
    console.error('[API] Logout error:', error);
    
    // Still clear cookie even if error
    await clearSessionCookie();
    
    return secureJsonResponse({ success: true });
  }
}
