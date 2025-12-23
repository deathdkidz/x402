import { cookies } from 'next/headers';
import { validateSession, type MerchantData } from './api';

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'netpay_session';

/**
 * Get the session token from cookies
 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value || null;
}

/**
 * Set the session cookie
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  });
}

/**
 * Clear the session cookie
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Get the current authenticated merchant from session
 */
export async function getCurrentMerchant(): Promise<MerchantData | null> {
  const token = await getSessionToken();
  if (!token) {
    return null;
  }
  
  const result = await validateSession(token);
  if (!result.success || !result.data) {
    return null;
  }
  
  return result.data.merchant;
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(): Promise<MerchantData> {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    throw new Error('Authentication required');
  }
  return merchant;
}
