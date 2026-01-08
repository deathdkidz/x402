import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Security headers for all responses
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Content Security Policy - Updated for WalletConnect/RainbowKit
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com", // Required for Next.js + Cloudflare
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    // WalletConnect requires many endpoints for wallet discovery and relay
    "connect-src 'self' " + [
      // WalletConnect Core
      "https://*.walletconnect.com",
      "https://*.walletconnect.org", 
      "wss://*.walletconnect.com",
      "wss://*.walletconnect.org",
      // WalletConnect Explorer API (for wallet list)
      "https://explorer-api.walletconnect.com",
      // WalletConnect Verify API
      "https://verify.walletconnect.com",
      "https://verify.walletconnect.org",
      // Coinbase Wallet SDK endpoints
      "https://*.coinbase.com",
      "wss://*.coinbase.com",
      "https://keys.coinbase.com",
      "https://rpc.coinbase.com",
      "https://api.wallet.coinbase.com",
      "wss://ws.wallet.coinbase.com",
      // Blockchain RPCs
      "https://*.infura.io",
      "https://*.alchemy.com",
      "https://*.base.org",
      "https://*.optimism.io",
      "https://mainnet.base.org",
      "https://sepolia.base.org",
      "https://mainnet.optimism.io",
      "https://sepolia.optimism.io",
      // Other services
      "https://api.netpay.id",
      "https://rpc.hyperliquid.xyz",
      "wss://rpc.hyperliquid.xyz",
      // Cloudflare
      "https://*.cloudflare.com",
      "https://static.cloudflareinsights.com",
      "https://cloudflareinsights.com",
      // RainbowKit/WalletConnect additional endpoints
      "https://eth.merkle.io",
      "https://*.merkle.io",
      "https://rpc.walletconnect.com",
      "https://rpc.walletconnect.org",
      "https://pulse.walletconnect.com",
      "https://pulse.walletconnect.org",
      "https://keys.walletconnect.com",
      "https://keys.walletconnect.org",
      "wss://relay.walletconnect.com",
      "wss://relay.walletconnect.org",
      // Reown (WalletConnect rebrand)
      "https://*.reown.com",
      "wss://*.reown.com",
    ].join(' '),
    "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org https://*.coinbase.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  
  response.headers.set('Content-Security-Policy', csp);

  // HSTS for HTTPS
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
