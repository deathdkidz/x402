import { NextRequest, NextResponse } from 'next/server';

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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address')?.toLowerCase();

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 });
  }

  const count = getMemoryCount(address);
  return NextResponse.json({ count });
}
