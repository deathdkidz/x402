/**
 * Global X-402 Payment Middleware
 * 
 * Intercepts all requests and checks if they match protected resources.
 * Returns HTTP 402 Payment Required for unpaid access, or allows access after payment verification.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { protectedResources, defaultConfig } from './config/protected-resources';

const FACILITATOR_URL = process.env.NEXT_PUBLIC_FACILITATOR_URL || 'https://api.novacasino.xyz';
const API_KEY = process.env.X402_API_KEY || '';
const MERCHANT_ADDRESS = process.env.NEXT_PUBLIC_MERCHANT_ADDRESS || '';

// Cache for network data (5 minute TTL)
let cachedNetworks: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedNetworks(): Promise<any[]> {
  const now = Date.now();
  
  // Return cached if still valid
  if (cachedNetworks && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedNetworks;
  }
  
  try {
    const response = await fetch(`${FACILITATOR_URL}/networks`, {
      headers: { 'Connection': 'keep-alive' },
      keepalive: true
    });
    
    if (response.ok) {
      const data = await response.json();
      cachedNetworks = [...(data.testnet || []), ...(data.mainnet || [])];
      cacheTimestamp = now;
      return cachedNetworks;
    }
  } catch (error) {
    console.error('Failed to fetch networks:', error);
  }
  
  // Return empty or stale cache on error
  return cachedNetworks || [];
}

/**
 * Decode X-PAYMENT header
 * Client sends: { authorization: {...}, signature: "...", network: "...", asset: "..." }
 */
function decodePaymentHeader(header: string): { authorization: any; signature: string; network?: string; asset?: string } | null {
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    
    // Client should send authorization and signature directly
    if (!parsed.authorization || !parsed.signature) {
      console.error('Invalid X-PAYMENT structure: missing authorization or signature');
      return null;
    }
    
    return {
      authorization: parsed.authorization,
      signature: parsed.signature,
      network: parsed.network,
      asset: parsed.asset
    };
  } catch (error) {
    console.error('Failed to decode X-PAYMENT header:', error);
    return null;
  }
}

/**
 * Get content type based on file extension
 */
function getContentType(path: string): string {
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.gif')) return 'image/gif';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

/**
 * Verify payment with facilitator
 * Uses HTTP keep-alive for faster connections
 */
async function verifyPayment(
  paymentPayload: { authorization: any; signature: string },
  requirements: any
): Promise<{ isValid: boolean; payer?: string; raw?: any; reason?: string }> {
  try {
    const response = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Connection': 'keep-alive'
      },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload: paymentPayload,
        paymentRequirements: requirements
      }),
      // Enable HTTP keep-alive for connection reuse
      keepalive: true
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('❌ Verification failed:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
        sentPayload: JSON.stringify({
          x402Version: 1,
          paymentPayload: paymentPayload,
          paymentRequirements: requirements
        }, null, 2)
      });
      return { isValid: false, reason: `HTTP ${response.status}` };
    }

    const result = JSON.parse(responseText);
    console.log('📋 Verification response:', result);
    return {
      isValid: result.isValid || false,
      payer: result.payer,
      raw: result,
      reason: result.invalidReason
    };
  } catch (error) {
    console.error('Payment verification error:', error);
    return { isValid: false, reason: error instanceof Error ? error.message : 'Unknown verification error' };
  }
}

/**
 * Settle payment with facilitator
 * Waits for blockchain confirmation before returning
 */
async function settlePayment(
  paymentPayload: { authorization: any; signature: string },
  requirements: any
): Promise<{ success: boolean; status?: string; message?: string; transaction?: string; flashblockHash?: string; payer?: string; raw?: any }> {
  try {
    const response = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Connection': 'keep-alive'
      },
      // Enable HTTP keep-alive for connection reuse
      keepalive: true,
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload: paymentPayload,
        paymentRequirements: requirements
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Settlement failed:', response.status, errorText);
      return { success: false, message: `HTTP ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    
    // Check both success field and status
    // success: true with status: 'pending' means transaction submitted but not confirmed
    // success: true with status: 'completed' means fully confirmed
    console.log('💰 Settlement response:', result);
    
    return {
      success: result.success || false,
      status: result.status,
      message: result.message || result.errorReason,
      transaction: result.transaction,
      flashblockHash: result.flashblockHash,
      payer: result.payer,
      raw: result
    };
  } catch (error) {
    console.error('Payment settlement error:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Unknown settlement error' };
  }
}

/**
 * Main middleware function
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  // Check if this path is protected
  const protection = protectedResources[path];
  
  if (!protection) {
    // Not protected - allow normal access
    return NextResponse.next();
  }

  // Resource is protected - check for payment
  const xPaymentHeader = request.headers.get('x-payment');
  
  if (!xPaymentHeader) {
    // No payment provided - return 402 Payment Required
    // Use cached networks for faster response
    const allNetworks = await getCachedNetworks();
    
    // Build payment options for each supported network/token combination
    let paymentOptions = allNetworks.flatMap((network: any) => 
      (network.tokens || [])
        .filter((token: any) => token.address && token.eip712)
        .map((token: any) => ({
          scheme: defaultConfig.scheme,
          network: network.network,
          chainId: network.chainId,
          asset: token.address,
          assetSymbol: token.symbol,
          assetName: token.name,
          decimals: token.decimals,
          eip712: token.eip712,
          payTo: MERCHANT_ADDRESS,
          maxAmountRequired: protection.amount,
          resource: path,
          description: protection.description,
          mimeType: getContentType(path),
          maxTimeoutSeconds: defaultConfig.maxTimeoutSeconds
        }))
    );
    
    // Fallback to default if no networks fetched
    if (paymentOptions.length === 0) {
      paymentOptions = [{
        scheme: defaultConfig.scheme,
        network: protection.network || defaultConfig.network,
        asset: protection.asset || defaultConfig.asset,
        payTo: MERCHANT_ADDRESS,
        maxAmountRequired: protection.amount,
        resource: path,
        description: protection.description,
        mimeType: getContentType(path),
        maxTimeoutSeconds: defaultConfig.maxTimeoutSeconds
      }];
    }

    // Encode requirements as base64 for X-PAYMENT-REQUIRED header
    const encodedRequirements = Buffer.from(JSON.stringify({ paymentOptions })).toString('base64');

    return new NextResponse(
      JSON.stringify({
        error: 'Payment Required',
        paymentOptions
      }),
      {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
          'X-PAYMENT-REQUIRED': encodedRequirements
        }
      }
    );
  }

  // Decode payment
  const paymentPayload = decodePaymentHeader(xPaymentHeader);
  if (!paymentPayload || !paymentPayload.authorization || !paymentPayload.signature) {
    return new NextResponse(
      JSON.stringify({ error: 'Invalid Payment Header' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Build payment requirements from payment payload and config
  // Extract merchant address from the payment authorization (who should receive the payment)
  const merchantAddress = paymentPayload.authorization?.to || MERCHANT_ADDRESS;

  // Use network and asset from payment payload, fallback to config if not provided
  const requirements = {
    scheme: defaultConfig.scheme,
    network: paymentPayload.network || protection.network || defaultConfig.network,
    asset: paymentPayload.asset || protection.asset || defaultConfig.asset,
    payTo: merchantAddress,
    maxAmountRequired: protection.amount,
    resource: path,
    description: protection.description,
    mimeType: getContentType(path),
    maxTimeoutSeconds: defaultConfig.maxTimeoutSeconds
  };

  // Settle payment (includes verification + execution)
  const settleStart = Date.now();
  console.log('💰 Settling payment on blockchain...');
  console.log('   Network:', requirements.network);
  console.log('   Amount:', requirements.maxAmountRequired);
  console.log('   PayTo:', requirements.payTo);

  const settlementResult = await settlePayment(paymentPayload, requirements);
  console.log(`   Settlement took: ${Date.now() - settleStart}ms`);

  if (!settlementResult.success) {
    console.log('❌ Payment rejected by facilitator during settlement');
    console.log('   Reason:', settlementResult.message || 'Unknown error');
    return new NextResponse(
      JSON.stringify({ 
        error: 'Payment Failed',
        message: settlementResult.message || 'Settlement rejected by facilitator'
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const settlementStatus = (settlementResult.status || '').toLowerCase();
  if (settlementStatus === 'completed' || settlementStatus === 'settled' || settlementStatus === 'confirmed') {
    console.log('✅ Payment confirmed on blockchain');
  } else if (settlementStatus === 'preconfirmed') {
    console.log('⚡ Flashblock preconfirmation received. Await final confirmation for irreversible settlement.');
  } else {
    console.log('⏳ Settlement in progress. Status:', settlementResult.status);
  }

  console.log('🎉 Payment accepted - serving protected content');

  const paymentResponsePayload = {
    status: settlementResult.status || (settlementResult.success ? 'completed' : 'pending'),
    resource: path,
    payer: paymentPayload.authorization?.from || settlementResult.payer,
    transactionHash: settlementResult.transaction,
    flashblockHash: settlementResult.flashblockHash
  };

  const encodedPaymentResponse = Buffer.from(JSON.stringify(paymentResponsePayload)).toString('base64');

  // Use rewrite to serve static files - this is faster than NextResponse.next()
  // because it goes directly to the static file handler
  const response = NextResponse.rewrite(request.nextUrl);
  response.headers.set('X-PAYMENT-RESPONSE', encodedPaymentResponse);
  response.headers.set('Cache-Control', 'no-store');

  return response;
}

/**
 * Configure which paths the middleware runs on
 */
export const config = {
  matcher: [
    // Match all paths except Next.js internals and build files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
