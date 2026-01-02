'use client';

import { useState } from 'react';
import { Card, CardHeader, CardContent, Input } from '@/components/ui';
import { CopyIcon, CheckIcon, SearchIcon } from '@/components/icons';

const docsSections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    items: [
      { id: 'overview', title: 'Overview' },
      { id: 'quickstart', title: 'Quick Start' },
      { id: 'how-it-works', title: 'How It Works' },
    ],
  },
  {
    id: 'integration',
    title: 'Integration',
    items: [
      { id: 'nextjs', title: 'Next.js' },
      { id: 'express', title: 'Express.js' },
      { id: 'any-backend', title: 'Any Backend' },
    ],
  },
  {
    id: 'api-reference',
    title: 'API Reference',
    items: [
      { id: 'verify', title: 'Verify Payment' },
      { id: 'settle', title: 'Settle Payment' },
      { id: 'networks', title: 'Networks' },
    ],
  },
  {
    id: 'guides',
    title: 'Guides',
    items: [
      { id: 'testing', title: 'Testing Payments' },
      { id: 'credits', title: 'Credit System' },
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
                NetPay enables instant USDC micropayments for web APIs using the HTTP 402 Payment Required protocol.
              </p>
            </div>
            
            <div className="prose prose-invert max-w-none">
              <h2 className="text-lg font-semibold text-white">What is NetPay?</h2>
              <p className="text-gray-400">
                NetPay is a payment facilitator that allows you to monetize any API endpoint with USDC stablecoin payments.
                Payments are verified and settled on-chain within seconds, with support for multiple EVM networks.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-cyan-400/20">
                <CardContent className="p-4">
                  <h3 className="font-medium text-cyan-400">⚡ Instant</h3>
                  <p className="text-sm text-gray-400 mt-1">Payments settle in under 1 second on supported networks</p>
                </CardContent>
              </Card>
              <Card className="border-green-400/20">
                <CardContent className="p-4">
                  <h3 className="font-medium text-green-400">💰 Low Cost</h3>
                  <p className="text-sm text-gray-400 mt-1">1 credit per settlement, as low as $0.01</p>
                </CardContent>
              </Card>
              <Card className="border-purple-400/20">
                <CardContent className="p-4">
                  <h3 className="font-medium text-purple-400">🔒 Secure</h3>
                  <p className="text-sm text-gray-400 mt-1">EIP-712 signed authorizations, no custody required</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-cyan-400/20 bg-cyan-400/5">
              <CardContent className="p-4">
                <h3 className="text-sm font-medium text-cyan-400">Supported Networks</h3>
                <p className="text-sm text-gray-400 mt-1">
                  <strong>Mainnet:</strong> Base, Ethereum, Optimism<br/>
                  <strong>Testnet:</strong> Base Sepolia, Ethereum Sepolia, OP Sepolia
                </p>
              </CardContent>
            </Card>
          </div>
        );

      case 'quickstart':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Quick Start</h1>
              <p className="text-gray-400 mt-2">Get started with NetPay payments in 5 minutes.</p>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">1. Get Your API Key</h2>
              <p className="text-gray-400">Your API key is available in the Settings page:</p>
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <code className="text-cyan-400 font-mono">pk_live_xxxxxxxxxxxxxxxx</code>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">2. Add the Payment Middleware</h2>
              <p className="text-gray-400">Create a middleware that checks for the X-PAYMENT header:</p>
              <CodeBlock
                id="middleware"
                language="typescript"
                code={`// middleware/payment.ts
const FACILITATOR_URL = 'https://api.netpay.id';
const API_KEY = process.env.NETPAY_API_KEY;

export async function verifyPayment(request: Request, config: {
  amount: string;      // Amount in USDC (e.g., "0.01")
  recipient: string;   // Your wallet address
  network?: string;    // "base" | "ethereum" | "base-sepolia"
  resource?: string;   // Resource identifier for tracking
}) {
  const paymentHeader = request.headers.get('X-PAYMENT');
  
  if (!paymentHeader) {
    // Return 402 with payment requirements
    return {
      valid: false,
      response: createPaymentRequiredResponse(config)
    };
  }
  
  // Verify payment with facilitator
  const result = await fetch(\`\${FACILITATOR_URL}/settle\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${API_KEY}\`,
    },
    body: JSON.stringify({
      xPayment: paymentHeader,
      paymentRequirements: {
        scheme: 'exact',
        network: config.network || 'base',
        maxAmountRequired: Math.floor(parseFloat(config.amount) * 1_000_000).toString(),
        resource: config.resource,
        description: 'API Payment',
      }
    }),
  });
  
  const data = await result.json();
  return { valid: data.success, txHash: data.transactionHash };
}`}
              />
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">3. Protect Your Endpoint</h2>
              <CodeBlock
                id="protect"
                language="typescript"
                code={`// app/api/premium/route.ts
import { verifyPayment } from '@/middleware/payment';

export async function GET(request: Request) {
  const payment = await verifyPayment(request, {
    amount: '0.01',
    recipient: '0xYourWalletAddress',
    network: 'base',
    resource: '/api/premium',
  });
  
  if (!payment.valid) {
    return payment.response;
  }
  
  // Payment verified! Return premium content
  return Response.json({ 
    success: true,
    data: 'Premium content here',
    txHash: payment.txHash 
  });
}`}
              />
            </div>

            <Card className="border-green-400/20 bg-green-400/5">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="text-green-400 text-lg">✓</div>
                <div>
                  <h3 className="text-sm font-medium text-green-400">That&apos;s it!</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Your endpoint is now protected. Each successful payment consumes 1 credit and the USDC is sent directly to your specified recipient wallet.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'how-it-works':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">How It Works</h1>
              <p className="text-gray-400 mt-2">Understanding the NetPay payment flow.</p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gray-800/50 rounded-lg">
                <h3 className="font-medium text-white mb-3">Payment Flow</h3>
                <ol className="space-y-3 text-sm text-gray-400">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-cyan-400/20 text-cyan-400 rounded-full flex items-center justify-center text-xs">1</span>
                    <span>Client requests your protected endpoint without payment header</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-cyan-400/20 text-cyan-400 rounded-full flex items-center justify-center text-xs">2</span>
                    <span>Your server returns HTTP 402 with payment requirements</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-cyan-400/20 text-cyan-400 rounded-full flex items-center justify-center text-xs">3</span>
                    <span>Client signs an ERC-3009 TransferWithAuthorization message</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-cyan-400/20 text-cyan-400 rounded-full flex items-center justify-center text-xs">4</span>
                    <span>Client retries request with X-PAYMENT header containing the signed authorization</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-cyan-400/20 text-cyan-400 rounded-full flex items-center justify-center text-xs">5</span>
                    <span>Your server calls NetPay facilitator to verify and settle the payment</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-cyan-400/20 text-cyan-400 rounded-full flex items-center justify-center text-xs">6</span>
                    <span>NetPay executes the on-chain transfer and returns transaction hash</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-green-400/20 text-green-400 rounded-full flex items-center justify-center text-xs">✓</span>
                    <span>Your server returns the protected content</span>
                  </li>
                </ol>
              </div>
            </div>

            <Card className="border-yellow-400/20 bg-yellow-400/5">
              <CardContent className="p-4">
                <h3 className="text-sm font-medium text-yellow-400">Important: No Custody</h3>
                <p className="text-sm text-gray-400 mt-1">
                  NetPay never holds your funds. Payments go directly from the payer&apos;s wallet to your specified recipient address. 
                  The facilitator only submits the pre-signed authorization on-chain.
                </p>
              </CardContent>
            </Card>
          </div>
        );

      case 'nextjs':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Next.js Integration</h1>
              <p className="text-gray-400 mt-2">Complete example for Next.js App Router.</p>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Create Payment Utility</h2>
              <CodeBlock
                id="nextjs-util"
                language="typescript"
                code={`// lib/netpay.ts
const FACILITATOR_URL = 'https://api.netpay.id';

export interface PaymentConfig {
  amount: string;
  recipient: string;
  network?: string;
  resource?: string;
}

export async function createPaymentRequiredResponse(config: PaymentConfig) {
  // Fetch available networks
  const networksRes = await fetch(\`\${FACILITATOR_URL}/networks\`);
  const networks = await networksRes.json();
  
  const network = config.network || 'base';
  const networkConfig = [...networks.mainnet, ...networks.testnet]
    .find(n => n.network.toLowerCase() === network.toLowerCase());
  
  const amountInMicro = Math.floor(parseFloat(config.amount) * 1_000_000).toString();
  
  const paymentRequirements = {
    scheme: 'exact',
    network: networkConfig?.network || network,
    maxAmountRequired: amountInMicro,
    resource: config.resource,
    description: 'API Payment',
    maxTimeoutSeconds: 3600,
    asset: networkConfig?.tokens[0]?.address,
    payTo: config.recipient,
  };
  
  return new Response(JSON.stringify(paymentRequirements), {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Required': 'true',
    },
  });
}

export async function settlePayment(xPayment: string, config: PaymentConfig) {
  const amountInMicro = Math.floor(parseFloat(config.amount) * 1_000_000).toString();
  
  const response = await fetch(\`\${FACILITATOR_URL}/settle\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${process.env.NETPAY_API_KEY}\`,
    },
    body: JSON.stringify({
      xPayment,
      paymentRequirements: {
        scheme: 'exact',
        network: config.network || 'base',
        maxAmountRequired: amountInMicro,
        resource: config.resource,
      },
    }),
  });
  
  return response.json();
}`}
              />
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Protected API Route</h2>
              <CodeBlock
                id="nextjs-route"
                language="typescript"
                code={`// app/api/premium-data/route.ts
import { createPaymentRequiredResponse, settlePayment } from '@/lib/netpay';

const PAYMENT_CONFIG = {
  amount: '0.01',        // $0.01 USDC
  recipient: '0x...',    // Your wallet address
  network: 'base',
  resource: '/api/premium-data',
};

export async function GET(request: Request) {
  const xPayment = request.headers.get('X-PAYMENT');
  
  if (!xPayment) {
    return createPaymentRequiredResponse(PAYMENT_CONFIG);
  }
  
  const result = await settlePayment(xPayment, PAYMENT_CONFIG);
  
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 402 });
  }
  
  // Payment successful! Return your premium content
  return Response.json({
    success: true,
    data: { /* your premium data */ },
    payment: {
      txHash: result.transactionHash,
      network: result.network,
    },
  });
}`}
              />
            </div>
          </div>
        );

      case 'express':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Express.js Integration</h1>
              <p className="text-gray-400 mt-2">Middleware-based integration for Express.</p>
            </div>

            <CodeBlock
              id="express-full"
              language="typescript"
              code={`import express from 'express';

const app = express();
const FACILITATOR_URL = 'https://api.netpay.id';
const API_KEY = process.env.NETPAY_API_KEY;

// Payment middleware factory
function requirePayment(config: { amount: string; recipient: string; network?: string }) {
  return async (req, res, next) => {
    const xPayment = req.headers['x-payment'];
    
    if (!xPayment) {
      // Return 402 with payment requirements
      const amountInMicro = Math.floor(parseFloat(config.amount) * 1_000_000);
      return res.status(402).json({
        scheme: 'exact',
        network: config.network || 'base',
        maxAmountRequired: amountInMicro.toString(),
        payTo: config.recipient,
        description: 'API Payment',
      });
    }
    
    // Settle payment
    const response = await fetch(\`\${FACILITATOR_URL}/settle\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${API_KEY}\`,
      },
      body: JSON.stringify({
        xPayment,
        paymentRequirements: {
          scheme: 'exact',
          network: config.network || 'base',
          maxAmountRequired: Math.floor(parseFloat(config.amount) * 1_000_000).toString(),
        },
      }),
    });
    
    const result = await response.json();
    
    if (!result.success) {
      return res.status(402).json({ error: result.error });
    }
    
    req.payment = result;
    next();
  };
}

// Protected route
app.get('/api/premium', requirePayment({
  amount: '0.01',
  recipient: '0xYourWallet',
  network: 'base',
}), (req, res) => {
  res.json({
    success: true,
    data: 'Premium content',
    txHash: req.payment.transactionHash,
  });
});

app.listen(3000);`}
            />
          </div>
        );

      case 'any-backend':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Any Backend</h1>
              <p className="text-gray-400 mt-2">Generic integration guide for any language/framework.</p>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Step 1: Check for X-PAYMENT Header</h2>
              <p className="text-gray-400">
                When a request comes in without an X-PAYMENT header, return HTTP 402 with payment requirements:
              </p>
              <CodeBlock
                id="any-402"
                language="json"
                code={`HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "scheme": "exact",
  "network": "base",
  "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "payTo": "0xYourWalletAddress",
  "maxAmountRequired": "10000",
  "description": "API access fee",
  "maxTimeoutSeconds": 3600
}`}
              />
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Step 2: Settle Payment</h2>
              <p className="text-gray-400">
                When X-PAYMENT header is present, call the facilitator to settle:
              </p>
              <CodeBlock
                id="any-settle"
                language="bash"
                code={`curl -X POST https://api.netpay.id/settle \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer pk_live_xxxxx" \\
  -d '{
    "x402Version": 1,
    "paymentPayload": {
      "authorization": {...},
      "signature": "0x..."
    },
    "paymentRequirements": {
      "scheme": "exact",
      "network": "base",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0xYourWalletAddress",
      "maxAmountRequired": "10000",
      "resource": "https://api.example.com/data",
      "description": "API access",
      "mimeType": "application/json",
      "maxTimeoutSeconds": 60
    }
  }'`}
              />
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Step 3: Check Response</h2>
              <CodeBlock
                id="any-response"
                language="json"
                code={`// Success
{
  "success": true,
  "transaction": "0xabcdef1234567890...",
  "transactionHash": "0xabcdef1234567890...",
  "transactionStatus": "completed",
  "network": "base",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
  "status": "completed"
}

// Failure
{
  "success": false,
  "network": "base",
  "errorReason": "Insufficient credits",
  "status": "failed"
}`}
              />
            </div>
          </div>
        );

      case 'verify':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">POST /verify</h1>
              <p className="text-gray-400 mt-2">Verify a payment without settling (useful for validation).</p>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-green-400/20 text-green-400 text-xs font-medium rounded">POST</span>
                  <code className="text-white">https://api.netpay.id/verify</code>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <h4 className="text-sm font-medium text-white">Headers</h4>
                <CodeBlock
                  id="verify-headers"
                  language="text"
                  code={`Content-Type: application/json
Authorization: Bearer pk_live_xxxxx`}
                />

                <h4 className="text-sm font-medium text-white">Request Body</h4>
                <CodeBlock
                  id="verify-body"
                  language="json"
                  code={`{
  "x402Version": 1,
  "paymentPayload": {
    "authorization": {
      "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
      "to": "0x8ba1f109551bD432803012645Ac136ddd64DBa72",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1735776000",
      "nonce": "0x00000000000000000000000000000001"
    },
    "signature": "0x..."
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0x8ba1f109551bD432803012645Ac136ddd64DBa72",
    "maxAmountRequired": "1000000",
    "resource": "https://api.example.com/data",
    "description": "API access",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 60
  }
}`}
                />

                <h4 className="text-sm font-medium text-white">Response</h4>
                <CodeBlock
                  id="verify-response"
                  language="json"
                  code={`// Valid
{
  "isValid": true,
  "is_valid": true,
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21"
}

// Invalid
{
  "isValid": false,
  "is_valid": false,
  "invalidReason": "Insufficient balance: has 500000, needs 1000000",
  "invalid_reason": "Insufficient balance: has 500000, needs 1000000"
}`}
                />
              </CardContent>
            </Card>
          </div>
        );

      case 'settle':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">POST /settle</h1>
              <p className="text-gray-400 mt-2">Verify and execute the on-chain payment settlement.</p>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-green-400/20 text-green-400 text-xs font-medium rounded">POST</span>
                  <code className="text-white">https://api.netpay.id/settle</code>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <h4 className="text-sm font-medium text-white">Headers</h4>
                <CodeBlock
                  id="settle-headers"
                  language="text"
                  code={`Content-Type: application/json
Authorization: Bearer pk_live_xxxxx`}
                />

                <h4 className="text-sm font-medium text-white">Request Body</h4>
                <CodeBlock
                  id="settle-body"
                  language="json"
                  code={`{
  "x402Version": 1,
  "paymentPayload": {
    "authorization": {
      "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
      "to": "0x8ba1f109551bD432803012645Ac136ddd64DBa72",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1735776000",
      "nonce": "0x00000000000000000000000000000001"
    },
    "signature": "0x..."
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0x8ba1f109551bD432803012645Ac136ddd64DBa72",
    "maxAmountRequired": "1000000",
    "resource": "https://api.example.com/data",
    "description": "API access",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 60
  }
}`}
                />

                <h4 className="text-sm font-medium text-white">Success Response</h4>
                <CodeBlock
                  id="settle-success"
                  language="json"
                  code={`{
  "success": true,
  "transaction": "0xabcdef1234567890...",
  "transactionHash": "0xabcdef1234567890...",
  "transactionStatus": "completed",
  "network": "base",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
  "status": "completed"
}

// Preconfirmed (flashblock)
{
  "success": true,
  "transaction": "0xabcdef1234567890...",
  "transactionHash": "0xabcdef1234567890...",
  "transactionStatus": "preconfirmed",
  "status": "preconfirmed",
  "message": "Transaction preconfirmed via flashblock"
}

// Failure
{
  "success": false,
  "network": "base",
  "errorReason": "Insufficient credits",
  "status": "failed"
}`}
                />

                <Card className="border-yellow-400/20 bg-yellow-400/5">
                  <CardContent className="p-3">
                    <p className="text-sm text-yellow-400">
                      <strong>Note:</strong> Each successful settlement consumes 1 credit from your balance.
                    </p>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </div>
        );

      case 'networks':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">GET /networks</h1>
              <p className="text-gray-400 mt-2">Get available networks and token configurations.</p>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-400/20 text-blue-400 text-xs font-medium rounded">GET</span>
                  <code className="text-white">https://api.netpay.id/networks</code>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <h4 className="text-sm font-medium text-white">Response</h4>
                <CodeBlock
                  id="networks-response"
                  language="json"
                  code={`{
  "success": true,
  "mainnet": [
    {
      "network": "base",
      "chainId": 8453,
      "tokens": [{
        "symbol": "USDC",
        "name": "USD Coin",
        "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "decimals": 6,
        "eip712": {
          "name": "USD Coin",
          "version": "2",
          "verifyingContract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        }
      }]
    },
    {
      "network": "ethereum",
      "chainId": 1,
      "tokens": [...]
    },
    {
      "network": "optimism",
      "chainId": 10,
      "tokens": [...]
    }
  ],
  "testnet": [
    {
      "network": "base-sepolia",
      "chainId": 84532,
      "tokens": [...]
    },
    {
      "network": "sepolia",
      "chainId": 11155111,
      "tokens": [...]
    }
  ]
}`}
                />
              </CardContent>
            </Card>
          </div>
        );

      case 'testing':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Testing Payments</h1>
              <p className="text-gray-400 mt-2">How to test payments using testnet networks.</p>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">1. Use Testnet Networks</h2>
              <p className="text-gray-400">
                Set your network to a testnet for development:
              </p>
              <ul className="list-disc list-inside text-gray-400 space-y-1">
                <li>base-sepolia (chainId: 84532)</li>
                <li>sepolia (chainId: 11155111)</li>
              </ul>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">2. Get Test USDC</h2>
              <p className="text-gray-400">
                Mint test USDC from the faucet contract or use these resources:
              </p>
              <ul className="list-disc list-inside text-gray-400 space-y-1">
                <li>Circle USDC Faucet for Sepolia</li>
                <li>Base Sepolia Bridge from Ethereum Sepolia</li>
              </ul>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">3. Free Testnet Credits</h2>
              <p className="text-gray-400">
                You receive 1,000 free testnet credits monthly for testing. Check your balance in the Credits page.
              </p>
            </div>

            <Card className="border-cyan-400/20 bg-cyan-400/5">
              <CardContent className="p-4">
                <h3 className="text-sm font-medium text-cyan-400">Testnet vs Mainnet</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Testnet settlements use your free monthly testnet credits. 
                  Mainnet settlements require purchased credits.
                </p>
              </CardContent>
            </Card>
          </div>
        );

      case 'credits':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Credit System</h1>
              <p className="text-gray-400 mt-2">Understanding how credits work.</p>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">How Credits Work</h2>
              <ul className="list-disc list-inside text-gray-400 space-y-2">
                <li>Each successful settlement consumes 1 credit</li>
                <li>Mainnet settlements require purchased credits</li>
                <li>Testnet settlements use free monthly credits (1,000/month)</li>
                <li>Credits never expire once purchased</li>
              </ul>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Credit Pricing</h2>
              <div className="p-4 bg-gray-800/50 rounded-lg">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-cyan-400">$10</p>
                    <p className="text-sm text-gray-400">1,000 credits</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-cyan-400">$50</p>
                    <p className="text-sm text-gray-400">5,500 credits</p>
                    <p className="text-xs text-green-400">+10% bonus</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-cyan-400">$100</p>
                    <p className="text-sm text-gray-400">12,000 credits</p>
                    <p className="text-xs text-green-400">+20% bonus</p>
                  </div>
                </div>
              </div>
            </div>

            <Card className="border-green-400/20 bg-green-400/5">
              <CardContent className="p-4">
                <h3 className="text-sm font-medium text-green-400">Purchase Credits</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Visit the <a href="/dashboard/credits" className="text-cyan-400 underline">Credits page</a> to purchase credits with USDC on Base or Ethereum.
                </p>
              </CardContent>
            </Card>
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
            <h4 className="text-sm font-medium text-white">API Base URL</h4>
            <code className="text-xs text-cyan-400 mt-1 block">https://api.netpay.id</code>
            <p className="text-xs text-gray-500 mt-2">
              All API requests should be made to this URL.
            </p>
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
