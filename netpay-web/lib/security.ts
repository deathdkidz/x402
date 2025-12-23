// Security utilities for API routes
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentMerchant } from './session';
import type { MerchantData } from './api';

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Rate limiter configuration
 */
interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

/**
 * Check rate limit for an identifier (IP or user ID)
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 60 }
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(identifier, { count: 1, resetTime: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetIn: config.windowMs };
  }

  if (record.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetIn: record.resetTime - now };
  }

  record.count++;
  return { allowed: true, remaining: config.maxRequests - record.count, resetIn: record.resetTime - now };
}

/**
 * Get client IP from request
 */
export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  return 'unknown';
}

/**
 * Validate Ethereum address format
 */
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate signature format
 */
export function isValidSignature(signature: string): boolean {
  return /^0x[a-fA-F0-9]{130}$/.test(signature);
}

/**
 * Sanitize string input to prevent injection
 */
export function sanitizeString(input: string | null | undefined, maxLength: number = 1000): string {
  if (input == null || typeof input !== 'string') return '';
  return input
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Remove HTML-like tags
    .trim();
}

/**
 * Sanitize integer input with bounds checking
 */
export function sanitizeInt(
  input: unknown,
  defaultValue: number = 0,
  min?: number,
  max?: number
): number {
  const num = parseInt(String(input), 10);
  let result = isNaN(num) ? defaultValue : num;
  if (min !== undefined) result = Math.max(result, min);
  if (max !== undefined) result = Math.min(result, max);
  return result;
}

/**
 * Create secure response headers
 */
export function secureHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
  };
}

/**
 * Create secure JSON response
 */
export function secureJsonResponse(data: unknown, status: number = 200): NextResponse {
  const response = NextResponse.json(data, { status });
  const headers = secureHeaders();
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

/**
 * Create error response (sanitized - no internal details)
 */
export function errorResponse(message: string, status: number = 400): NextResponse {
  return secureJsonResponse({ error: message }, status);
}

/**
 * Authenticated route handler wrapper
 */
export async function withAuth<T>(
  request: NextRequest,
  handler: (merchant: MerchantData, request: NextRequest) => Promise<T>
): Promise<NextResponse> {
  try {
    // Rate limit check
    const ip = getClientIP(request);
    const rateLimit = checkRateLimit(ip);
    
    if (!rateLimit.allowed) {
      return errorResponse('Too many requests. Please try again later.', 429);
    }

    // Authentication check
    const merchant = await getCurrentMerchant();
    if (!merchant) {
      return errorResponse('Unauthorized', 401);
    }

    // Execute handler
    const result = await handler(merchant, request);
    return secureJsonResponse(result);
  } catch (error) {
    console.error('API error:', error);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * CSRF token validation (for state-changing operations)
 */
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  
  if (!origin) {
    // Allow requests without origin (same-site navigation)
    return true;
  }
  
  try {
    const originUrl = new URL(origin);
    const allowedHosts = [
      host,
      'netpay.id',
      'www.netpay.id',
      'localhost:3000',
      'localhost:3002',
    ].filter(Boolean);
    
    return allowedHosts.some(h => originUrl.host === h);
  } catch {
    return false;
  }
}

/**
 * Validate request method
 */
export function validateMethod(request: NextRequest, allowedMethods: string[]): boolean {
  return allowedMethods.includes(request.method);
}
