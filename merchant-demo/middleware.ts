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
function decodePaymentHeader(header: string): { payload: any; raw: any; requirements?: any } | null {
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    return {
      raw: parsed,
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
async function verifyPayment(
  payment: any,
  requirements: any,
  paymentPayloadOverride?: any
): Promise<{ isValid: boolean; payer?: string; raw?: any; reason?: string }> {
  try {
    const paymentPayloadBody = paymentPayloadOverride || {
      payload: payment
    };

    const response = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Connection': 'keep-alive'
      },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload: paymentPayloadBody,
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
          paymentPayload: paymentPayloadBody,
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
  payment: any,
  requirements: any,
  paymentPayloadOverride?: any
): Promise<{ success: boolean; status?: string; message?: string; transaction?: string; flashblockHash?: string; raw?: any }> {
  try {
    const paymentPayloadBody = paymentPayloadOverride || {
      payload: payment
    };

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
        paymentPayload: paymentPayloadBody,
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
  const paymentData = decodePaymentHeader(xPaymentHeader);
  if (!paymentData || !paymentData.payload) {
    return new NextResponse(
      JSON.stringify({ error: 'Invalid Payment Header' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { payload: payment, requirements: paymentRequirements, raw } = paymentData;

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

  // Verify payment before settling to provide immediate feedback
  console.log('🔍 Verifying payment with facilitator...');
  const verificationResult = await verifyPayment(payment, requirements, raw);

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

  const settlementResult = await settlePayment(payment, requirements, raw);

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
    payer: payment.authorization?.from || verificationResult.payer,
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
