import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.X402_API_KEY;
    const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL;

    if (!apiKey || !facilitatorUrl) {
      return NextResponse.json(
        { error: 'Missing configuration' },
        { status: 500 }
      );
    }

    const response = await fetch(`${facilitatorUrl}/merchant`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch merchant info' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching merchant info:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
