import { NextRequest, NextResponse } from 'next/server';

const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:8080';
const DEMO_API_KEY = process.env.DEMO_API_KEY || '';
const DAILY_LIMIT = 5;

// In-memory rate limit store (resets on server restart - fine for demo)
const memoryStore = new Map<string, { count: number; lastReset: Date }>();

function getMemoryCount(address: string): number {
  const record = memoryStore.get(address);
  if (!record) {
    memoryStore.set(address, { count: 0, lastReset: new Date() });
    return 0;
  }
  
  const now = new Date();
  if (record.lastReset.toDateString() !== now.toDateString()) {
    record.count = 0;
    record.lastReset = now;
  }
  return record.count;
}

function incrementMemoryCount(address: string): void {
  const record = memoryStore.get(address);
  if (record) {
    record.count++;
  } else {
    memoryStore.set(address, { count: 1, lastReset: new Date() });
  }
}

async function settleWithFacilitator(xPayment: string, network: string, amount: string) {
  const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEMO_API_KEY}`,
    },
    body: JSON.stringify({
      xPayment,
      paymentRequirements: {
        scheme: 'exact',
        network,
        maxAmountRequired: amount,
        resource: '/demo',
        description: 'NetPay Demo Settlement',
      }
    }),
  });
  return settleResponse.json();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { xPayment, network, amount, recipient } = body;

    if (!xPayment || !network || !recipient) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Decode xPayment to get payer address
    let payerAddress: string;
    try {
      const decoded = JSON.parse(atob(xPayment));
      payerAddress = decoded.authorization?.from?.toLowerCase();
      if (!payerAddress) {
        throw new Error('No payer address');
      }
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid payment data' }, { status: 400 });
    }

    // Check rate limit
    const currentCount = getMemoryCount(payerAddress);
    if (currentCount >= DAILY_LIMIT) {
      return NextResponse.json({
        success: false,
        error: `Daily limit reached (${DAILY_LIMIT} settlements). Try again tomorrow.`
      }, { status: 429 });
    }

    // Call facilitator to settle
    const settleResult = await settleWithFacilitator(xPayment, network, amount);

    if (settleResult.success) {
      incrementMemoryCount(payerAddress);
    }

    return NextResponse.json(settleResult);
  } catch (error) {
    console.error('Demo settle error:', error);
    return NextResponse.json({
      success: false,
      error: 'Settlement failed. Please try again.'
    }, { status: 500 });
  }
}
