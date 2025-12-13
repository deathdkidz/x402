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
      isValid: result.isValid || result.is_valid || false,
      payer: result.payer,
      raw: result,
      reason: result.invalidReason || result.invalid_reason
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
): Promise<{ success: boolean; status?: string; message?: string; transaction?: string; flashblockHash?: string; raw?: any }> {
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
      status: result.status || result.state,
      message: result.message || result.errorReason || result.error_reason,
      transaction: result.transaction || result.transactionHash || result.txHash,
      flashblockHash: result.flashblockHash || result.flashblock_id || result.flashblockId,
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

  // Verify payment before settling to provide immediate feedback
  console.log('🔍 Verifying payment with facilitator...');
  const verificationResult = await verifyPayment(paymentPayload, requirements);

  if (!verificationResult.isValid) {
    console.log('❌ Payment verification failed');
    console.log('   Reason:', verificationResult.reason || 'Unknown verification failure');
    return new NextResponse(
      JSON.stringify({
        error: 'Payment Verification Failed',
        message: verificationResult.reason || 'Verification rejected by facilitator'
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log('✅ Verification succeeded. Proceeding to settlement.');
  console.log('💰 Settling payment on blockchain (includes verification + execution)...');
  console.log('   Network:', requirements.network);
  console.log('   Amount:', requirements.maxAmountRequired);
  console.log('   PayTo:', requirements.payTo);

  const settlementResult = await settlePayment(paymentPayload, requirements);

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
    payer: paymentPayload.authorization?.from || verificationResult.payer,
    transactionHash: settlementResult.transaction,
    flashblockHash: settlementResult.flashblockHash
  };

  const response = NextResponse.next();
  response.headers.set('X-PAYMENT-RESPONSE', Buffer.from(JSON.stringify(paymentResponsePayload)).toString('base64'));

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
