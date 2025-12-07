/**
 * X-402 Payment Middleware
 * 
 * Implements the X-402 payment protocol using X-PAYMENT headers
 * This middleware sits between client and content APIs to handle payments
 * 
 * Complete Flow with Raw Data:
 * 
 * 1. CLIENT → SERVER
 *    GET /api/premium/cat HTTP/1.1
 *    X-PAYMENT: eyJhdXRob3JpemF0aW9uIjp7ImZyb20iOiIweDc0MmQu...
 *    
 *    Decoded X-PAYMENT:
 *    {
 *      "authorization": {
 *        "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
 *        "to": "0xMerchantAddress...",
 *        "value": "10000",
 *        "validAfter": "1701619200",
 *        "validBefore": "1701622800",
 *        "nonce": "0x1234..."
 *      },
 *      "signature": "0xabcd1234..."
 *    }
 * 
 * 2. SERVER → FACILITATOR (Verify)
 *    POST http://localhost/verify
 *    Authorization: Bearer merchant_api_key_123
 *    Content-Type: application/json
 *    
 *    Body:
 *    {
 *      "x402Version": 1,
 *      "paymentPayload": {
 *        "x402Version": 1,
 *        "payload": { ...decoded X-PAYMENT... }
 *      },
 *      "paymentRequirements": {
 *        "scheme": "erc3009",
 *        "network": "base-sepolia",
 *        "asset": "USDC",
 *        "payTo": "0xMerchantAddress...",
 *        "maxAmountRequired": "10000",
 *        "resource": "/api/premium/cat",
 *        "description": "Premium Cat Image",
 *        "mimeType": "image/jpeg",
 *        "maxTimeoutSeconds": 300
 *      }
 *    }
 * 
 * 3. FACILITATOR → SERVER (Verify Response)
 *    HTTP/1.1 200 OK
 *    Content-Type: application/json
 *    
 *    Body:
 *    {
 *      "isValid": true,
 *      "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *    }
 * 
 * 4. SERVER → FACILITATOR (Settle)
 *    POST http://localhost:8080/settle
 *    Authorization: Bearer merchant_api_key_123
 *    Content-Type: application/json
 *    
 *    Body: (same as verify)
 * 
 * 5. FACILITATOR → SERVER (Settle Response)
 *    HTTP/1.1 200 OK
 *    Content-Type: application/json
 *    
 *    Body:
 *    {
 *      "success": true,
 *      "transaction": "0xabcdef1234567890...",
 *      "status": "completed"
 *    }
 * 
 * 6. SERVER → CLIENT (Success)
 *    HTTP/1.1 200 OK
 *    Content-Type: application/json
 *    X-PAYMENT-RESPONSE: eyJzdGF0dXMiOiJjb21wbGV0ZWQiLCJ0cmFuc2FjdGlvbkhhc2giOiIweDEyMyJ9
 *    
 *    Decoded X-PAYMENT-RESPONSE:
 *    {
 *      "status": "completed",
 *      "transactionHash": "0xabcdef1234567890...",
 *      "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *    }
 *    
 *    Body:
 *    {
 *      "success": true,
 *      "imageUrl": "https://...",
 *      "description": "Premium content"
 *    }
 */

import { NextRequest, NextResponse } from 'next/server';

interface PaymentAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

interface PaymentPayload {
  authorization: PaymentAuthorization;
  signature: string;
}

interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
}

const FACILITATOR_URL = process.env.NEXT_PUBLIC_FACILITATOR_URL || 'http://localhost:8080';
const API_KEY = process.env.X402_API_KEY || '';
const MERCHANT_ADDRESS = process.env.X402_MERCHANT_ADDRESS || '';

/**
 * Decode X-PAYMENT header
 */
function decodePaymentHeader(header: string): PaymentPayload | null {
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Failed to decode X-PAYMENT header:', error);
    return null;
  }
}

/**
 * Verify payment with facilitator
 */
async function verifyPayment(
  payment: PaymentPayload,
  requirements: PaymentRequirements
): Promise<{ isValid: boolean; payer?: string; reason?: string }> {
  try {
    const response = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
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
      return { isValid: false, reason: 'Verification request failed' };
    }

    const result = await response.json();
    return {
      isValid: result.isValid || result.is_valid,
      payer: result.payer,
      reason: result.invalidReason || result.invalid_reason
    };
  } catch (error) {
    console.error('Payment verification error:', error);
    return { isValid: false, reason: 'Verification service unavailable' };
  }
}

/**
 * Settle payment with facilitator
 */
async function settlePayment(
  payment: PaymentPayload,
  requirements: PaymentRequirements
): Promise<{ success: boolean; txHash?: string; status?: string; reason?: string }> {
  try {
    const response = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
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
      return { success: false, reason: 'Settlement request failed' };
    }

    const result = await response.json();
    return {
      success: result.success,
      txHash: result.transaction || result.transactionHash,
      status: result.status,
      reason: result.errorReason || result.error_reason
    };
  } catch (error) {
    console.error('Payment settlement error:', error);
    return { success: false, reason: 'Settlement service unavailable' };
  }
}

/**
 * X-402 Payment Middleware
 * 
 * Usage in API route:
 * 
 * export async function GET(req: NextRequest) {
 *   const paymentResult = await handleX402Payment(req, {
 *     resource: '/api/premium/article',
 *     amount: '10000',
 *     description: 'Premium Article Access'
 *   });
 *   
 *   if (paymentResult.error) {
 *     return paymentResult.response;
 *   }
 *   
 *   // Payment successful, return content
 *   return NextResponse.json(
 *     { content: '...' },
 *     { headers: paymentResult.headers }
 *   );
 * }
 */
export async function handleX402Payment(
  req: NextRequest,
  config: {
    resource: string;
    amount: string;
    description: string;
    network?: string;
    asset?: string;
    mimeType?: string;
  }
) {
  // Get X-PAYMENT header
  const xPaymentHeader = req.headers.get('x-payment');
  
  if (!xPaymentHeader) {
    return {
      error: true,
      response: new NextResponse(
        JSON.stringify({
          error: 'Payment Required',
          message: 'Missing X-PAYMENT header',
          acceptedMethods: ['x402-erc3009']
        }),
        {
          status: 402,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'X-402'
          }
        }
      )
    };
  }

  // Decode payment
  const payment = decodePaymentHeader(xPaymentHeader);
  if (!payment) {
    return {
      error: true,
      response: new NextResponse(
        JSON.stringify({
          error: 'Invalid Payment',
          message: 'Malformed X-PAYMENT header'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    };
  }

  // Build payment requirements
  const requirements: PaymentRequirements = {
    scheme: 'erc3009',
    network: config.network || 'Base Sepolia', // Must match facilitator's network name exactly
    asset: config.asset || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    payTo: MERCHANT_ADDRESS,
    maxAmountRequired: config.amount,
    resource: config.resource,
    description: config.description,
    mimeType: config.mimeType || 'application/json',
    maxTimeoutSeconds: 3600
  };

  // Verify payment
  const verification = await verifyPayment(payment, requirements);
  if (!verification.isValid) {
    return {
      error: true,
      response: new NextResponse(
        JSON.stringify({
          error: 'Payment Verification Failed',
          message: verification.reason || 'Invalid payment signature or insufficient funds'
        }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      )
    };
  }

  // Settle payment
  const settlement = await settlePayment(payment, requirements);
  if (!settlement.success) {
    return {
      error: true,
      response: new NextResponse(
        JSON.stringify({
          error: 'Payment Settlement Failed',
          message: settlement.reason || 'Failed to execute payment on blockchain'
        }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      )
    };
  }

  // Payment successful!
  // Return headers to include in success response
  return {
    error: false,
    payer: verification.payer,
    txHash: settlement.txHash,
    headers: {
      'X-PAYMENT-RESPONSE': JSON.stringify({
        status: settlement.status || 'completed',
        transactionHash: settlement.txHash,
        payer: verification.payer,
        network: requirements.network
      })
    }
  };
}

export { decodePaymentHeader, verifyPayment, settlePayment };
