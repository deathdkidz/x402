'use client';

import { useState } from 'react';
import { Card, CardHeader, CardContent, Input } from '@/components/ui';
import { CopyIcon, CheckIcon, SearchIcon, ExternalLinkIcon } from '@/components/icons';

const docsSections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    items: [
      { id: 'overview', title: 'Overview', content: 'overview' },
      { id: 'quickstart', title: 'Quick Start Guide', content: 'quickstart' },
      { id: 'authentication', title: 'Authentication', content: 'auth' },
    ],
  },
  {
    id: 'integration',
    title: 'Integration',
    items: [
      { id: 'middleware', title: 'Middleware Setup', content: 'middleware' },
      { id: 'api-reference', title: 'API Reference', content: 'api' },
      { id: 'webhooks', title: 'Webhooks', content: 'webhooks' },
    ],
  },
  {
    id: 'resources',
    title: 'Resources',
    items: [
      { id: 'creating-resources', title: 'Creating Resources', content: 'resources' },
      { id: 'pricing', title: 'Setting Prices', content: 'pricing' },
    ],
  },
  {
    id: 'sdks',
    title: 'SDKs & Libraries',
    items: [
      { id: 'javascript', title: 'JavaScript SDK', content: 'js-sdk' },
      { id: 'python', title: 'Python SDK', content: 'python-sdk' },
    ],
  },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('quickstart');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const CodeBlock = ({ code, language, id }: { code: string; language: string; id: string }) => (
    <div className="relative group">
      <pre className="p-4 bg-gray-950 rounded-lg overflow-x-auto">
        <code className="text-sm text-gray-300">{code}</code>
      </pre>
      <button
        onClick={() => copyToClipboard(code, id)}
        className="absolute top-2 right-2 p-2 bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copiedId === id ? <CheckIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4 text-gray-400" />}
      </button>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Overview</h1>
              <p className="text-gray-400 mt-2">
                x402 enables seamless micropayments for web services using the 402 Payment Required HTTP status code and stablecoins.
              </p>
            </div>
            <div className="prose prose-invert max-w-none">
              <h2 className="text-lg font-semibold text-white">How It Works</h2>
              <ol className="list-decimal list-inside space-y-2 text-gray-400">
                <li>A client makes a request to your protected resource</li>
                <li>Your server returns a 402 status with payment requirements</li>
                <li>The client signs an ERC-3009 authorization for the payment</li>
                <li>The request is retried with the payment header</li>
                <li>x402 facilitator verifies and settles the payment</li>
                <li>Your server returns the protected content</li>
              </ol>
            </div>
            <Card className="border-cyan-400/20 bg-cyan-400/5">
              <CardContent className="p-4">
                <h3 className="text-sm font-medium text-cyan-400">Credit-Based Settlement</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Each settlement consumes 1 credit from your balance. Purchase credits to continue receiving settlements.
                </p>
              </CardContent>
            </Card>
          </div>
        );

      case 'quickstart':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Quick Start Guide</h1>
              <p className="text-gray-400 mt-2">Get started with x402 payments in under 5 minutes.</p>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">1. Install the SDK</h2>
              <CodeBlock
                id="install"
                language="bash"
                code="npm install @x402/middleware"
              />
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">2. Configure the Middleware</h2>
              <CodeBlock
                id="config"
                language="typescript"
                code={`import { x402Middleware } from '@x402/middleware';

const x402 = x402Middleware({
  apiKey: process.env.X402_API_KEY,
  facilitatorUrl: 'https://facilitator.x402.org',
  merchantAddress: '0x...',
});`}
              />
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">3. Protect Your Routes</h2>
              <CodeBlock
                id="protect"
                language="typescript"
                code={`// Express.js example
app.get('/api/premium-data', x402({
  amount: '0.01', // $0.01 in USDC
  currency: 'USDC',
  network: 'base',
}), (req, res) => {
  res.json({ data: 'Premium content here' });
});`}
              />
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">4. Test the Integration</h2>
              <CodeBlock
                id="test"
                language="bash"
                code={`curl -X GET https://your-api.com/api/premium-data \\
  -H "X-Payment: <signed-payment-header>"`}
              />
            </div>

            <Card className="border-green-400/20 bg-green-400/5">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="text-green-400 text-lg">✓</div>
                <div>
                  <h3 className="text-sm font-medium text-green-400">You&apos;re all set!</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Your endpoint is now protected. Payments will be settled automatically to your wallet.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'auth':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Authentication</h1>
              <p className="text-gray-400 mt-2">Secure your API integration with API keys.</p>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">API Keys</h2>
              <p className="text-gray-400">
                API keys are used to authenticate requests to the x402 facilitator. Keep your keys secure and never expose them in client-side code.
              </p>
              <CodeBlock
                id="apikey"
                language="typescript"
                code={`// Server-side only
const x402 = x402Middleware({
  apiKey: process.env.X402_API_KEY, // pk_live_xxxxx
});`}
              />
            </div>

            <Card className="border-yellow-400/20 bg-yellow-400/5">
              <CardContent className="p-4">
                <h3 className="text-sm font-medium text-yellow-400">Security Best Practices</h3>
                <ul className="list-disc list-inside text-sm text-gray-400 mt-2 space-y-1">
                  <li>Store API keys in environment variables</li>
                  <li>Use different keys for development and production</li>
                  <li>Rotate keys periodically</li>
                  <li>Never commit keys to version control</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case 'middleware':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Middleware Setup</h1>
              <p className="text-gray-400 mt-2">Integrate x402 with popular web frameworks.</p>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Next.js Middleware</h2>
              <CodeBlock
                id="nextjs"
                language="typescript"
                code={`// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyPayment } from '@x402/middleware/next';

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/premium')) {
    const paymentResult = await verifyPayment(request, {
      amount: '0.01',
      currency: 'USDC',
      network: 'base',
    });
    
    if (!paymentResult.valid) {
      return new NextResponse(JSON.stringify(paymentResult.paymentRequired), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
  
  return NextResponse.next();
}`}
              />
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Express.js Middleware</h2>
              <CodeBlock
                id="express"
                language="typescript"
                code={`import express from 'express';
import { x402Middleware } from '@x402/middleware';

const app = express();

const x402 = x402Middleware({
  apiKey: process.env.X402_API_KEY,
  facilitatorUrl: 'https://facilitator.x402.org',
});

app.get('/api/premium', x402({ amount: '0.01' }), (req, res) => {
  res.json({ success: true });
});`}
              />
            </div>
          </div>
        );

      case 'api':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">API Reference</h1>
              <p className="text-gray-400 mt-2">Complete reference for the x402 API.</p>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-green-400/20 text-green-400 text-xs font-medium rounded">POST</span>
                  <code className="text-white">/verify</code>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-400 text-sm">Verify a payment header and process the settlement.</p>
                <h4 className="text-sm font-medium text-white">Request Body</h4>
                <CodeBlock
                  id="verify-req"
                  language="json"
                  code={`{
  "x402Version": 1,
  "paymentHeader": "base64-encoded-payment",
  "paymentRequirements": {
    "amount": "10000",
    "currency": "USDC",
    "network": "base",
    "recipient": "0x..."
  }
}`}
                />
                <h4 className="text-sm font-medium text-white">Response</h4>
                <CodeBlock
                  id="verify-res"
                  language="json"
                  code={`{
  "success": true,
  "settlementId": "stl_abc123",
  "txHash": "0x..."
}`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-400/20 text-blue-400 text-xs font-medium rounded">GET</span>
                  <code className="text-white">/settlement/:id</code>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-400 text-sm">Get the status of a settlement.</p>
                <h4 className="text-sm font-medium text-white">Response</h4>
                <CodeBlock
                  id="settlement-res"
                  language="json"
                  code={`{
  "id": "stl_abc123",
  "status": "completed",
  "amount": "10000",
  "txHash": "0x...",
  "completedAt": "2024-12-22T10:30:00Z"
}`}
                />
              </CardContent>
            </Card>
          </div>
        );

      case 'webhooks':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Webhooks</h1>
              <p className="text-gray-400 mt-2">Receive real-time notifications for settlement events.</p>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Webhook Payload</h2>
              <CodeBlock
                id="webhook-payload"
                language="json"
                code={`{
  "event": "settlement.completed",
  "timestamp": "2024-12-22T10:30:00Z",
  "data": {
    "settlementId": "stl_abc123",
    "amount": "10000",
    "currency": "USDC",
    "network": "base",
    "txHash": "0x...",
    "resourceId": "res_xyz"
  }
}`}
              />
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Verifying Webhooks</h2>
              <CodeBlock
                id="webhook-verify"
                language="typescript"
                code={`import { verifyWebhookSignature } from '@x402/middleware';

app.post('/webhooks/x402', (req, res) => {
  const signature = req.headers['x-x402-signature'];
  const isValid = verifyWebhookSignature(
    req.body,
    signature,
    process.env.WEBHOOK_SECRET
  );
  
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process the webhook
  const { event, data } = req.body;
  console.log(\`Received \${event}:\`, data);
  
  res.json({ received: true });
});`}
              />
            </div>
          </div>
        );

      default:
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">{activeSection.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h1>
              <p className="text-gray-400 mt-2">Documentation for this section is coming soon.</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex gap-6">
      {/* Sidebar Navigation */}
      <div className="w-64 shrink-0">
        <div className="sticky top-6 space-y-6">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search docs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <nav className="space-y-6">
            {docsSections.map((section) => (
              <div key={section.id}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {section.title}
                </h3>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => setActiveSection(item.id)}
                        className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors ${
                          activeSection === item.id
                            ? 'bg-cyan-400/10 text-cyan-400'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                      >
                        {item.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <Card className="p-4">
            <h4 className="text-sm font-medium text-white">Need Help?</h4>
            <p className="text-xs text-gray-400 mt-1">
              Check out our GitHub or join our Discord community.
            </p>
            <div className="flex gap-2 mt-3">
              <a
                href="https://github.com/x402"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
              >
                GitHub
                <ExternalLinkIcon className="w-3 h-3" />
              </a>
              <a
                href="https://discord.gg/x402"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
              >
                Discord
                <ExternalLinkIcon className="w-3 h-3" />
              </a>
            </div>
          </Card>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <Card>
          <CardContent className="p-6">
            {renderContent()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
