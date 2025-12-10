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

/**
 * Decode X-PAYMENT header
 */
function decodePaymentHeader(header: string): { payload: any; requirements?: any } | null {
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    return {
      payload: parsed.payload || parsed,
      requirements: parsed.requirements
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
async function verifyPayment(payment: any, requirements: any): Promise<boolean> {
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
        paymentPayload: {
          x402Version: 1,
          payload: payment
        },
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
          payment: payment,
          requirements: requirements
        }, null, 2)
      });
      return false;
    }

    const result = JSON.parse(responseText);
    console.log('📋 Verification response:', result);
    return result.isValid || result.is_valid || false;
  } catch (error) {
    console.error('Payment verification error:', error);
    return false;
  }
}

/**
 * Settle payment with facilitator
 * Waits for blockchain confirmation before returning
 */
async function settlePayment(payment: any, requirements: any): Promise<{ success: boolean; status?: string; message?: string }> {
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
        paymentPayload: {
          x402Version: 1,
          payload: payment
        },
        paymentRequirements: requirements
      })
    });

    if (!response.ok) {
      console.error('Settlement failed:', response.status, await response.text());
      return { success: false };
    }

    const result = await response.json();
    
    // Check both success field and status
    // success: true with status: 'pending' means transaction submitted but not confirmed
    // success: true with status: 'completed' means fully confirmed
    console.log('💰 Settlement response:', result);
    
    return {
      success: result.success || false,
      status: result.status,
      message: result.message || result.errorReason
    };
  } catch (error) {
    console.error('Payment settlement error:', error);
    return { success: false };
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
    const requirements = {
      scheme: defaultConfig.scheme,
      network: protection.network || defaultConfig.network,
      asset: protection.asset || defaultConfig.asset,
      payTo: MERCHANT_ADDRESS,
      maxAmountRequired: protection.amount,
      resource: path,
      description: protection.description,
      mimeType: getContentType(path),
      maxTimeoutSeconds: defaultConfig.maxTimeoutSeconds
    };

    return new NextResponse(
      JSON.stringify({
        error: 'Payment Required',
        paymentRequirements: requirements
      }),
      {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
          'X-402': `version=1 scheme=${requirements.scheme} network=${requirements.network} amount=${protection.amount} resource=${path}`
        }
      }
    );
  }

  // Decode payment
  const paymentData = decodePaymentHeader(xPaymentHeader);
  if (!paymentData || !paymentData.payload) {
    return new NextResponse(
      JSON.stringify({ error: 'Invalid Payment Header' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { payload: payment, requirements: paymentRequirements } = paymentData;

  // Use requirements from payment header if provided, otherwise build from config
  let requirements;
  if (paymentRequirements) {
    // Client sent the exact requirements they signed for
    requirements = paymentRequirements;
    console.log('✅ Using requirements from payment header');
  } else {
    // Fallback: Extract merchant address from the payment authorization
    const merchantAddress = payment.authorization?.to || MERCHANT_ADDRESS;

    // Build payment requirements for verification
    requirements = {
      scheme: defaultConfig.scheme,
      network: protection.network || defaultConfig.network,
      asset: protection.asset || defaultConfig.asset,
      payTo: merchantAddress,
      maxAmountRequired: protection.amount,
      resource: path,
      description: protection.description,
      mimeType: getContentType(path),
      maxTimeoutSeconds: defaultConfig.maxTimeoutSeconds
    };
    console.log('⚠️  Using requirements from config (fallback)');
  }

  // SETTLE - Submit payment to facilitator for blockchain execution
  // The /settle endpoint performs ALL verification internally:
  // ✅ Signature validation (cryptographic check)
  // ✅ Nonce check (prevents double-spending via Redis + on-chain)
  // ✅ Balance verification (ensures payer has funds)
  // ✅ Amount validation (matches requirement)
  // ✅ Time window validation (validAfter/validBefore)
  // ✅ Recipient validation (payTo matches)
  // Then executes the blockchain transaction and waits for confirmation
  console.log('💰 Settling payment on blockchain (includes verification + execution)...');
  console.log('   Network:', requirements.network);
  console.log('   Amount:', requirements.maxAmountRequired);
  console.log('   PayTo:', requirements.payTo);
  
  const settlementResult = await settlePayment(payment, requirements);
  
  if (!settlementResult.success) {
    console.log('❌ Payment rejected by facilitator');
    console.log('   Reason:', settlementResult.message || 'Unknown error');
    return new NextResponse(
      JSON.stringify({ 
        error: 'Payment Failed',
        message: settlementResult.message || 'Settlement rejected by facilitator'
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Settlement successful - funds transferred on blockchain
  if (settlementResult.status === 'completed') {
    console.log('✅ Payment confirmed on blockchain');
  } else if (settlementResult.status === 'pending') {
    console.log('⏳ Transaction submitted to blockchain, awaiting confirmation');
  }

  console.log('🎉 Payment successful - serving protected content');

  // Payment successful - allow access to the resource
  // Add X-PAYMENT-RESPONSE header to indicate successful payment
  const response = NextResponse.next();
  response.headers.set('X-PAYMENT-RESPONSE', JSON.stringify({
    status: 'completed',
    resource: path,
    payer: payment.authorization?.from
  }));

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
