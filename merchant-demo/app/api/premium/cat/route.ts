import { NextRequest, NextResponse } from 'next/server';
import { handleX402Payment } from '@/middleware/x402Payment';

/**
 * Protected API Route using X-PAYMENT header
 * 
 * Example: GET /api/premium/cat
 * 
 * Client sends:
 *   GET /api/premium/cat
 *   X-PAYMENT: eyJhdXRob3JpemF0aW9uIjp7ImZyb20iOiIweDc0MmQu...
 * 
 * Server responds:
 *   200 OK
 *   X-PAYMENT-RESPONSE: {"status":"completed","transactionHash":"0x..."}
 *   Content-Type: application/json
 *   
 *   {"imageUrl": "...", "description": "..."}
 */
export async function GET(req: NextRequest) {
  // Handle X-402 payment
  const paymentResult = await handleX402Payment(req, {
    resource: '/api/premium/cat',
    amount: '10000', // 0.01 USDC (6 decimals)
    description: 'Premium Cat Image Access',
    mimeType: 'image/jpeg'
  });

  // Payment failed
  if (paymentResult.error) {
    return paymentResult.response;
  }

  // Payment successful - return premium content
  const content = {
    success: true,
    resource: '/api/premium/cat',
    imageUrl: 'https://cataas.com/cat/cute',
    description: 'Exclusive premium cat image',
    payer: paymentResult.payer,
    transactionHash: paymentResult.txHash,
    message: 'Thank you for your payment! Here is your exclusive cat image.'
  };

  return NextResponse.json(content, {
    status: 200,
    headers: paymentResult.headers
  });
}

/**
 * Return payment requirements for this resource
 */
export async function OPTIONS(req: NextRequest) {
  return NextResponse.json({
    resource: '/api/premium/cat',
    paymentRequired: true,
    paymentMethods: ['x402-erc3009'],
    amount: '10000',
    currency: 'USDC',
    network: 'base-sepolia',
    description: 'Premium Cat Image Access'
  });
}
