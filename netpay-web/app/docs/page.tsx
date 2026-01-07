import Link from 'next/link';

export const metadata = {
  title: 'API Documentation - NetPay',
  description: 'Complete guide to integrating NetPay x402 payment protocol',
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Header */}
      <header className="border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="site-logo rounded-lg flex items-center justify-center overflow-hidden">
              <img src="/logo.svg" alt="NetPay" />
            </div>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/" className="text-sm text-neutral-400 hover:text-white transition-colors">
              Home
            </Link>
            <span className="text-sm text-amber-500 font-medium">API Docs</span>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">API Documentation</h1>
          <p className="text-lg text-neutral-400">
            Everything you need to integrate gasless USDC payments into your application.
          </p>
        </div>

        {/* Quick Links */}
        <div className="grid md:grid-cols-3 gap-4 mb-12">
          <a href="#overview" className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl hover:border-amber-500/50 transition-colors">
            <h3 className="font-semibold mb-1">Overview</h3>
            <p className="text-sm text-neutral-400">How x402 payments work</p>
          </a>
          <a href="#quick-start" className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl hover:border-amber-500/50 transition-colors">
            <h3 className="font-semibold mb-1">Quick Start</h3>
            <p className="text-sm text-neutral-400">Get started in 5 minutes</p>
          </a>
          <a href="#endpoints" className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl hover:border-amber-500/50 transition-colors">
            <h3 className="font-semibold mb-1">API Reference</h3>
            <p className="text-sm text-neutral-400">Complete endpoint docs</p>
          </a>
        </div>

        {/* Overview Section */}
        <section id="overview" className="mb-16 scroll-mt-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center text-amber-500 text-sm">1</span>
            Overview
          </h2>
          
          <div className="prose prose-invert max-w-none">
            <p className="text-neutral-300 mb-6">
              NetPay is a <strong>trustless payment facilitator</strong> that enables gasless USDC payments using the x402 protocol. 
              Users sign payment authorizations off-chain using EIP-712, and we submit them on-chain, paying gas fees from your credit balance.
            </p>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
                <h4 className="font-semibold mb-2 text-amber-500">For Merchants</h4>
                <ul className="text-sm text-neutral-400 space-y-1">
                  <li>• Pre-fund settlement costs with USDC</li>
                  <li>• ~0.001 USDC per settlement (gas + fee)</li>
                  <li>• Receive payments directly to your wallet</li>
                  <li>• No custody of user funds</li>
                </ul>
              </div>
              <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
                <h4 className="font-semibold mb-2 text-amber-500">For Users</h4>
                <ul className="text-sm text-neutral-400 space-y-1">
                  <li>• No ETH needed for gas</li>
                  <li>• Simple signature-based approval</li>
                  <li>• Human-readable signing prompts</li>
                  <li>• Direct wallet-to-wallet transfers</li>
                </ul>
              </div>
            </div>

            <h3 className="text-lg font-semibold mb-3">How It Works</h3>
            <div className="flex flex-col gap-3 mb-6">
              <div className="flex gap-4 items-start p-3 bg-neutral-900/50 rounded-lg">
                <span className="w-6 h-6 bg-amber-500 rounded text-black text-sm font-bold flex items-center justify-center flex-shrink-0">1</span>
                <div>
                  <p className="font-medium">User Signs Authorization</p>
                  <p className="text-sm text-neutral-400">User signs EIP-3009 transferWithAuthorization in their wallet (no gas needed)</p>
                </div>
              </div>
              <div className="flex gap-4 items-start p-3 bg-neutral-900/50 rounded-lg">
                <span className="w-6 h-6 bg-amber-500 rounded text-black text-sm font-bold flex items-center justify-center flex-shrink-0">2</span>
                <div>
                  <p className="font-medium">You Submit to API</p>
                  <p className="text-sm text-neutral-400">Send the signed authorization to our /settle endpoint with your API key</p>
                </div>
              </div>
              <div className="flex gap-4 items-start p-3 bg-neutral-900/50 rounded-lg">
                <span className="w-6 h-6 bg-amber-500 rounded text-black text-sm font-bold flex items-center justify-center flex-shrink-0">3</span>
                <div>
                  <p className="font-medium">We Execute On-Chain</p>
                  <p className="text-sm text-neutral-400">We submit the transaction, pay gas from your credits, USDC transfers directly to your wallet</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Start Section */}
        <section id="quick-start" className="mb-16 scroll-mt-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center text-amber-500 text-sm">2</span>
            Quick Start
          </h2>

          <div className="space-y-6">
            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="font-semibold mb-3">Step 1: Get an API Key</h4>
              <p className="text-sm text-neutral-400 mb-3">
                Purchase credits on our <Link href="/" className="text-amber-500 hover:text-amber-400">home page</Link> by sending USDC to our vault. You&apos;ll receive an API key immediately.
              </p>
              <div className="p-3 bg-neutral-950 rounded-lg">
                <p className="text-xs text-neutral-500 mb-1">Vault Address</p>
                <code className="text-sm text-amber-500 break-all">0xaEc38404154C8EA2b9cfcCcF6c0E42A39ee30d54</code>
              </div>
            </div>

            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="font-semibold mb-3">Step 2: Get User Signature</h4>
              <p className="text-sm text-neutral-400 mb-3">
                Have your user sign an EIP-712 typed data message for <code className="text-amber-500">TransferWithAuthorization</code>:
              </p>
              <pre className="p-3 bg-neutral-950 rounded-lg overflow-x-auto text-xs text-neutral-300">
{`// EIP-712 Domain
{
  name: "USD Coin",
  version: "2",
  chainId: 84532, // Base Sepolia
  verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
}

// Message to sign
{
  from: userAddress,
  to: yourMerchantAddress,
  value: "1000000", // 1 USDC (6 decimals)
  validAfter: "0",
  validBefore: Math.floor(Date.now()/1000) + 3600,
  nonce: crypto.randomBytes(32).toString('hex')
}`}</pre>
            </div>

            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="font-semibold mb-3">Step 3: Call /settle</h4>
              <p className="text-sm text-neutral-400 mb-3">
                Submit the signed authorization to our API using JSON body:
              </p>
              <pre className="p-3 bg-neutral-950 rounded-lg overflow-x-auto text-xs text-neutral-300">
{`// Build JSON request body
const paymentPayload = {
  authorization: {
    from: userAddress,
    to: merchantAddress,
    value: "1000000",
    validAfter: "0",
    validBefore: "1735776000",
    nonce: "0x..."
  },
  signature: userSignature
};

const paymentRequirements = {
  scheme: "exact",
  network: "eip155:84532",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  payTo: merchantAddress,
  maxAmountRequired: "1000000",
  resource: "/api/premium",
  description: "Premium access"
};

// Call API with JSON body
const response = await fetch("https://api.netpay.id/settle", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY"
  },
  body: JSON.stringify({
    paymentPayload,
    paymentRequirements
  })
});

const result = await response.json();
// { success: true, transaction: "0x...", network: "eip155:84532" }`}</pre>
            </div>
          </div>
        </section>

        {/* Supported Networks */}
        <section id="networks" className="mb-16 scroll-mt-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center text-amber-500 text-sm">3</span>
            Supported Networks
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="font-semibold mb-3 text-green-400">Mainnet</h4>
              <div className="space-y-3 text-sm">
                <div className="p-2 bg-neutral-950 rounded">
                  <p className="font-medium">Base</p>
                  <p className="text-neutral-500 text-xs">Chain ID: 8453</p>
                  <code className="text-xs text-neutral-400 break-all">USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913</code>
                </div>
                <div className="p-2 bg-neutral-950 rounded">
                  <p className="font-medium">OP Mainnet</p>
                  <p className="text-neutral-500 text-xs">Chain ID: 10</p>
                  <code className="text-xs text-neutral-400 break-all">USDC: 0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85</code>
                </div>
                <div className="p-2 bg-neutral-950 rounded">
                  <p className="font-medium">HyperEVM</p>
                  <p className="text-neutral-500 text-xs">Chain ID: 999</p>
                  <code className="text-xs text-neutral-400 break-all">USDC: 0xb88339CB7199b77E23DB6E890353E22632Ba630f</code>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="font-semibold mb-3 text-blue-400">Testnet</h4>
              <div className="space-y-3 text-sm">
                <div className="p-2 bg-neutral-950 rounded">
                  <p className="font-medium">Base Sepolia</p>
                  <p className="text-neutral-500 text-xs">Chain ID: 84532</p>
                  <code className="text-xs text-neutral-400 break-all">USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e</code>
                </div>
                <div className="p-2 bg-neutral-950 rounded">
                  <p className="font-medium">OP Sepolia</p>
                  <p className="text-neutral-500 text-xs">Chain ID: 11155420</p>
                  <code className="text-xs text-neutral-400 break-all">USDC: 0x5fd84259d66Cd46123540766Be93DFE6D43130D7</code>
                </div>
                <div className="p-2 bg-neutral-950 rounded">
                  <p className="font-medium">HyperEVM Testnet</p>
                  <p className="text-neutral-500 text-xs">Chain ID: 1999</p>
                  <code className="text-xs text-neutral-400 break-all">USDC: 0x2B3370eE501B4a559b57D449569354196457D8Ab</code>
                </div>
              </div>
            </div>
          </div>
          
          <p className="text-sm text-neutral-500 mt-4">
            Get the full list dynamically from <code className="text-amber-500">GET /supported</code>
          </p>
        </section>

        {/* API Endpoints */}
        <section id="endpoints" className="mb-16 scroll-mt-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center text-amber-500 text-sm">4</span>
            API Endpoints
          </h2>

          <p className="text-neutral-400 mb-6">Base URL: <code className="text-amber-500">https://api.netpay.id</code></p>

          <div className="space-y-4">
            {/* GET /supported */}
            <div className="border border-neutral-800 rounded-xl overflow-hidden">
              <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center gap-3">
                <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-mono rounded">GET</span>
                <code className="text-sm">/supported</code>
                <span className="text-xs text-neutral-500 ml-auto">No auth required</span>
              </div>
              <div className="p-4">
                <p className="text-sm text-neutral-400 mb-3">Get all supported networks and token configurations</p>
                <pre className="p-3 bg-neutral-950 rounded-lg overflow-x-auto text-xs text-neutral-300">
{`// Response
{
  "success": true,
  "mainnet": [
    {
      "network": "Base",
      "caip2": "eip155:8453",
      "chainId": 8453,
      "tokens": [{ "symbol": "USDC", "address": "0x...", "decimals": 6 }]
    }
  ],
  "testnet": [...]
}`}</pre>
              </div>
            </div>

            {/* POST /account */}
            <div className="border border-neutral-800 rounded-xl overflow-hidden">
              <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center gap-3">
                <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-mono rounded">POST</span>
                <code className="text-sm">/account</code>
                <span className="text-xs text-neutral-500 ml-auto">JSON body</span>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Mode A: Create API Key (with payment)</p>
                  <p className="text-xs text-neutral-400 mb-2">Send payment signature in JSON body to create account</p>
                  <pre className="p-3 bg-neutral-950 rounded-lg overflow-x-auto text-xs text-neutral-300">
{`// Request body
{
  "paymentSignature": {
    "authorization": { ... },
    "signature": "0x..."
  }
}

// Response
{
  "success": true,
  "action": "create",
  "apiKey": "a1b2c3d4e5f67890abc...", // SAVE THIS!
  "usdc": "10.000000",
  "transaction": "0x..."
}`}</pre>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Mode B: Top-up Existing Account</p>
                  <p className="text-xs text-neutral-400 mb-2">Add credits to existing API key (no auth header needed)</p>
                  <pre className="p-3 bg-neutral-950 rounded-lg overflow-x-auto text-xs text-neutral-300">
{`// Request body
{
  "paymentSignature": {
    "authorization": { ... },
    "signature": "0x..."
  },
  "apiKey": "your_existing_64_char_hex_key"
}

// Response
{
  "success": true,
  "action": "topup",
  "balanceType": "testnet",
  "usdc": "5.000000",
  "newBalance": "6.000000",
  "transaction": "0x..."
}`}</pre>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Mode C: Check Balance</p>
                  <p className="text-xs text-neutral-400 mb-2">Header: <code className="text-amber-500">Authorization: Bearer &lt;api_key&gt;</code></p>
                  <pre className="p-3 bg-neutral-950 rounded-lg overflow-x-auto text-xs text-neutral-300">
{`// Request body
{ "action": "balance" }

// Response
{
  "success": true,
  "totalBalance": "10.000000",
  "mainnetBalance": "5.000000",
  "testnetBalance": "5.000000",
  "estimatedMainnetSettlements": 5000
}`}</pre>
                </div>
              </div>
            </div>

            {/* POST /verify */}
            <div className="border border-neutral-800 rounded-xl overflow-hidden">
              <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center gap-3">
                <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-mono rounded">POST</span>
                <code className="text-sm">/verify</code>
                <span className="text-xs text-green-400 ml-auto">Free</span>
              </div>
              <div className="p-4">
                <p className="text-sm text-neutral-400 mb-3">Verify payment authorization without executing (no credits spent)</p>
                <p className="text-xs text-neutral-500 mb-2">Header: <code className="text-amber-500">Authorization: Bearer &lt;api_key&gt;</code></p>
                <pre className="p-3 bg-neutral-950 rounded-lg overflow-x-auto text-xs text-neutral-300">
{`// Request body
{
  "paymentPayload": {
    "authorization": { ... },
    "signature": "0x..."
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "eip155:84532",
    "asset": "0x...",
    "payTo": "0x...",
    "maxAmountRequired": "1000000"
  }
}

// Success response
{ "isValid": true, "payer": "0x..." }

// Invalid response
{ "isValid": false, "invalidReason": "Insufficient balance" }`}</pre>
              </div>
            </div>

            {/* POST /settle */}
            <div className="border border-neutral-800 rounded-xl overflow-hidden">
              <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center gap-3">
                <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-mono rounded">POST</span>
                <code className="text-sm">/settle</code>
                <span className="text-xs text-amber-400 ml-auto">Costs credits</span>
              </div>
              <div className="p-4">
                <p className="text-sm text-neutral-400 mb-3">Execute payment settlement on blockchain</p>
                <p className="text-xs text-neutral-500 mb-2">Header: <code className="text-amber-500">Authorization: Bearer &lt;api_key&gt;</code></p>
                <pre className="p-3 bg-neutral-950 rounded-lg overflow-x-auto text-xs text-neutral-300">
{`// Request body
{
  "paymentPayload": {
    "authorization": {
      "from": "0x...",
      "to": "0x...",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1735776000",
      "nonce": "0x..."
    },
    "signature": "0x..."
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x...",
    "maxAmountRequired": "1000000",
    "resource": "/api/premium",
    "description": "Premium access"
  }
}

// Success response
{
  "success": true,
  "transaction": "0xabcdef...",
  "network": "eip155:84532",
  "payer": "0x...",
  "status": "completed",
  "fees": {
    "serviceFee": "0.001000",     // Platform fee in USDC
    "gasCost": "0.000012",        // Gas cost in USDC
    "totalFees": "0.001012",      // Total deducted from balance
    "balanceAfter": "0.999988",   // Remaining credit balance
    "balanceType": "testnet"      // Which balance was charged
  }
}

// Failure response
{
  "success": false,
  "errorReason": "INSUFFICIENT_CREDITS",
  "status": "failed"
}
`}</pre>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mb-16 scroll-mt-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center text-amber-500 text-sm">5</span>
            Pricing
          </h2>

          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-3xl font-bold text-amber-500">~0.001</p>
                <p className="text-neutral-400 text-sm">USDC per settlement</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-amber-500">~900</p>
                <p className="text-neutral-400 text-sm">settlements per USDC</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-amber-500">1 USDC</p>
                <p className="text-neutral-400 text-sm">minimum deposit</p>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-neutral-800">
              <p className="text-sm text-neutral-400">
                Settlement cost = <strong>Service fee (0.001 USDC)</strong> + <strong>Gas cost (~0.0001-0.01 USDC)</strong>
              </p>
              <p className="text-sm text-neutral-500 mt-2">
                Gas costs vary by network congestion. Base and Optimism typically have the lowest gas costs.
              </p>
            </div>
          </div>
        </section>

        {/* Error Codes */}
        <section id="errors" className="mb-16 scroll-mt-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center text-amber-500 text-sm">6</span>
            Error Codes
          </h2>

          <div className="space-y-4">
            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="font-semibold mb-3 text-red-400">Authentication Errors (401)</h4>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between p-2 bg-neutral-950 rounded">
                  <code className="text-neutral-300">UNAUTHORIZED</code>
                  <span className="text-neutral-500">Missing Authorization header</span>
                </div>
                <div className="flex justify-between p-2 bg-neutral-950 rounded">
                  <code className="text-neutral-300">INVALID_API_KEY</code>
                  <span className="text-neutral-500">API key not found</span>
                </div>
                <div className="flex justify-between p-2 bg-neutral-950 rounded">
                  <code className="text-neutral-300">EXPIRED_API_KEY</code>
                  <span className="text-neutral-500">API key expired</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="font-semibold mb-3 text-yellow-400">Validation Errors (200 with success=false)</h4>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between p-2 bg-neutral-950 rounded">
                  <code className="text-neutral-300">INVALID_SIGNATURE</code>
                  <span className="text-neutral-500">EIP-712 signature verification failed</span>
                </div>
                <div className="flex justify-between p-2 bg-neutral-950 rounded">
                  <code className="text-neutral-300">INSUFFICIENT_BALANCE</code>
                  <span className="text-neutral-500">Payer doesn&apos;t have enough USDC</span>
                </div>
                <div className="flex justify-between p-2 bg-neutral-950 rounded">
                  <code className="text-neutral-300">NONCE_ALREADY_USED</code>
                  <span className="text-neutral-500">Nonce consumed on-chain</span>
                </div>
                <div className="flex justify-between p-2 bg-neutral-950 rounded">
                  <code className="text-neutral-300">AUTHORIZATION_EXPIRED</code>
                  <span className="text-neutral-500">validBefore timestamp passed</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="font-semibold mb-3 text-orange-400">Settlement Errors</h4>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between p-2 bg-neutral-950 rounded">
                  <code className="text-neutral-300">INSUFFICIENT_CREDITS</code>
                  <span className="text-neutral-500">Your API key balance is too low</span>
                </div>
                <div className="flex justify-between p-2 bg-neutral-950 rounded">
                  <code className="text-neutral-300">UNSUPPORTED_NETWORK</code>
                  <span className="text-neutral-500">Network not configured</span>
                </div>
                <div className="flex justify-between p-2 bg-neutral-950 rounded">
                  <code className="text-neutral-300">SETTLEMENT_FAILED</code>
                  <span className="text-neutral-500">On-chain transaction reverted</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Full API Reference */}
        <section className="mb-16">
          <div className="p-6 bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/20 rounded-xl">
            <h3 className="text-lg font-semibold mb-2">Need More Details?</h3>
            <p className="text-neutral-400 mb-4">
              View the complete API specification with all parameters, headers, and response schemas.
            </p>
            <a 
              href="https://api.netpay.id/help" 
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-medium rounded-lg transition-colors"
            >
              Full API Reference
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-neutral-400 mb-6">
            Purchase credits and start accepting gasless USDC payments in minutes.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/"
              className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors"
            >
              Purchase Credits
            </Link>
            <Link
              href="/demo"
              className="px-6 py-3 border border-neutral-700 text-neutral-300 hover:border-amber-500 hover:text-white rounded-lg font-semibold transition-colors"
            >
              Try Demo
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800 bg-neutral-900/30 mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-amber-500 rounded flex items-center justify-center">
                <span className="text-black font-bold text-xs">N</span>
              </div>
              <span className="text-neutral-400 text-sm">NetPay © 2026</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
