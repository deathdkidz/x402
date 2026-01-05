//! Help Endpoint - Plain text documentation
//!
//! Human and AI readable documentation for the x402 payment protocol.
//! Provides complete API reference for integration.

use std::sync::Arc;
use axum::{
    extract::State,
    http::{HeaderMap, header::HeaderValue},
    response::IntoResponse,
    routing::get,
    Router,
};

use crate::routes::AppState;
use crate::types::{X402_VERSION, headers};

/// Create help router
pub fn create_help_router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/help", get(help_handler))
}

/// GET /help - Complete plain text documentation for AI agents and humans
async fn help_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let config = &state.config;
    
    // Build mainnet network list
    let mut mainnet_text = String::new();
    for name in &config.mainnet_networks {
        if let Some(nc) = config.networks.get(name) {
            let usdc = nc.tokens.iter()
                .find(|t| t.symbol.to_uppercase() == "USDC")
                .map(|t| t.address.as_str())
                .unwrap_or("not configured");
            mainnet_text.push_str(&format!(
                "    {} (eip155:{}, chainId: {})\n      USDC: {}\n",
                name, nc.chain_id, nc.chain_id, usdc
            ));
        }
    }
    
    // Build testnet network list
    let mut testnet_text = String::new();
    for name in &config.testnet_networks {
        if let Some(nc) = config.networks.get(name) {
            let usdc = nc.tokens.iter()
                .find(|t| t.symbol.to_uppercase() == "USDC")
                .map(|t| t.address.as_str())
                .unwrap_or("not configured");
            testnet_text.push_str(&format!(
                "    {} (eip155:{}, chainId: {})\n      USDC: {}\n",
                name, nc.chain_id, nc.chain_id, usdc
            ));
        }
    }
    
    let vault_address = config.vault_address.as_deref().unwrap_or("not configured");
    
    let help_text = format!(r#"================================================================================
                     x402 PAYMENT FACILITATOR - COMPLETE API REFERENCE
================================================================================
Version: {version}
Protocol: x402 v2
Base URL: https://api.netpay.id

================================================================================
OVERVIEW
================================================================================

The x402 Facilitator is a trustless payment service that enables gasless 
EIP-3009 (transferWithAuthorization) token transfers. Users sign payment 
authorizations off-chain, and the facilitator submits them on-chain, paying 
gas fees from merchant credit balances.

Key Features:
  - Gasless payments: Users don't need ETH for gas
  - EIP-3009 standard: Secure, nonce-protected transfers
  - EIP-712 signatures: Human-readable signing
  - Multi-network: Supports multiple EVM chains
  - Credit-based: Merchants pre-fund settlement costs

================================================================================
QUICK START FOR AI AGENTS
================================================================================

1. CREATE API KEY:
   POST /account with PAYMENT-SIGNATURE header containing signed USDC transfer
   to vault. Receive API key with credit balance.

2. VERIFY PAYMENT (free):
   POST /verify with Authorization, PAYMENT-SIGNATURE, PAYMENT-REQUIRED headers.
   Returns isValid boolean without spending credits.

3. SETTLE PAYMENT (costs credits):
   POST /settle with same headers as verify.
   Executes on-chain transfer, deducts credits for gas + fee.

================================================================================
VAULT ADDRESS (for credit purchases)
================================================================================

{vault_address}

Send USDC to this address to create/top-up API key balance.
Mainnet payments add to mainnet balance.
Testnet payments add to testnet balance.

================================================================================
SUPPORTED NETWORKS
================================================================================

MAINNET NETWORKS:
{mainnet_networks}
TESTNET NETWORKS:
{testnet_networks}
Network Format Equivalents (all accepted):
  - CAIP-2:   "eip155:84532"
  - Chain ID: "84532" or 84532
  - Name:     "Base Sepolia", "base-sepolia", "BASE_SEPOLIA"

================================================================================
ENDPOINTS - COMPLETE REFERENCE
================================================================================

--------------------------------------------------------------------------------
GET /
--------------------------------------------------------------------------------
Purpose: Service discovery and status
Auth: None required

Response (200):
{{
  "name": "x402 Facilitator",
  "description": "Secure x402 payment facilitator",
  "version": "2.0.0",
  "endpoints": {{...}},
  "mainnetNetworks": ["Base", "OP Mainnet", "HyperEVM"],
  "testnetNetworks": ["Base Sepolia", "OP Sepolia", "HyperEVM Testnet"]
}}

--------------------------------------------------------------------------------
GET /health
--------------------------------------------------------------------------------
Purpose: Health check for load balancers and monitoring
Auth: None required

Response (200):
{{
  "status": "ok",
  "service": "x402-facilitator",
  "timestamp": 1735776000000,
  "uptime": 86400.0
}}

Fields:
  - status: Always "ok" if service is responding
  - timestamp: Unix timestamp in milliseconds
  - uptime: Seconds since service start

--------------------------------------------------------------------------------
GET /networks
--------------------------------------------------------------------------------
Purpose: List all supported networks and token configurations
Auth: None required
Headers Returned: PAYMENT-VERSION: 2

Response (200):
{{
  "success": true,
  "mainnet": [
    {{
      "network": "Base",
      "caip2": "eip155:8453",
      "chainId": 8453,
      "tokens": [
        {{
          "symbol": "USDC",
          "name": "USD Coin",
          "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          "decimals": 6,
          "eip712": {{
            "name": "USD Coin",
            "version": "2",
            "verifyingContract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
          }}
        }}
      ]
    }}
  ],
  "testnet": [...]
}}

--------------------------------------------------------------------------------
GET /help
--------------------------------------------------------------------------------
Purpose: This complete documentation
Auth: None required
Content-Type: text/plain; charset=utf-8
Headers Returned: PAYMENT-VERSION: 2

--------------------------------------------------------------------------------
GET /account
--------------------------------------------------------------------------------
Purpose: Account service instructions (human-readable)
Auth: None required
Content-Type: text/plain; charset=utf-8

Returns instructions for purchasing credits and managing accounts.

--------------------------------------------------------------------------------
POST /account - MODE A: PURCHASE CREDITS (new API key)
--------------------------------------------------------------------------------
Purpose: Create new API key by sending USDC to vault
Auth: PAYMENT-SIGNATURE header (base64 encoded)

Request Headers:
  PAYMENT-SIGNATURE: <base64 encoded JSON>
  PAYMENT-VERSION: 2 (optional, defaults to 2)

PAYMENT-SIGNATURE Content (before base64):
{{
  "authorization": {{
    "from": "0xYourWallet...",
    "to": "{vault_address}",
    "value": "1000000",           // 1 USDC (6 decimals)
    "validAfter": "0",
    "validBefore": "1735776000",  // Unix timestamp
    "nonce": "0x0000...0001"      // 32-byte unique hex
  }},
  "signature": "0x...",           // 65-byte EIP-712 signature
  "network": "Base Sepolia",      // Network name or CAIP-2
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"  // USDC address
}}

Success Response (200):
{{
  "success": true,
  "action": "create",
  "apiKey": "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef12345678",  // SAVE THIS - shown only once!
  "balanceType": "testnet",
  "usdc": "1.000000",
  "transaction": "0x..."
}}

--------------------------------------------------------------------------------
POST /account - MODE A': TOP-UP EXISTING ACCOUNT
--------------------------------------------------------------------------------
Purpose: Add credits to existing API key
Auth: PAYMENT-SIGNATURE + API-KEY headers

Request Headers:
  PAYMENT-SIGNATURE: <base64 encoded JSON>
  API-KEY: a1b2c3d4e5f6...your_64_char_hex_key   // Your existing API key
  PAYMENT-VERSION: 2

Success Response (200):
{{
  "success": true,
  "action": "topup",
  "balanceType": "testnet",
  "usdc": "5.000000",
  "newBalance": "6.000000",
  "transaction": "0x..."
}}

--------------------------------------------------------------------------------
POST /account - MODE B: QUERY BALANCE
--------------------------------------------------------------------------------
Purpose: Check account balance
Auth: Authorization header (Bearer token)

Request:
  Headers:
    Authorization: Bearer a1b2c3d4e5f6...your_64_char_hex_key
    Content-Type: application/json
  Body:
    {{"action": "balance"}}

Response (200):
{{
  "success": true,
  "totalBalance": "10.000000",
  "mainnetBalance": "5.000000",
  "testnetBalance": "5.000000",
  "estimatedMainnetSettlements": 5000,
  "estimatedTestnetSettlements": 5000,
  "isActive": true,
  "expiresAt": null
}}

--------------------------------------------------------------------------------
POST /account - MODE B: QUERY METRICS
--------------------------------------------------------------------------------
Purpose: Get account usage statistics
Auth: Authorization header (Bearer token)

Request:
  Headers:
    Authorization: Bearer a1b2c3d4e5f6...your_64_char_hex_key
    Content-Type: application/json
  Body:
    {{"action": "metrics"}}

Response (200):
{{
  "success": true,
  "usdc": "9.956061",
  "stats": {{
    "totalTransactions": 34,
    "successfulTransactions": 34,
    "failedTransactions": 0,
    "successRate": "100.0%",
    "totalSpent": "0.043939 USDC",
    "totalGasCost": "0.009939 USDC",
    "totalServiceFees": "0.034000 USDC"
  }},
  "createdAt": "2026-01-03 17:38:26 UTC",
  "lastUsed": "2026-01-03 18:55:53 UTC"
}}

--------------------------------------------------------------------------------
POST /verify
--------------------------------------------------------------------------------
Purpose: Verify payment authorization without executing (free)
Auth: Authorization header (Bearer token)

Request Headers:
  Authorization: Bearer a1b2c3d4e5f6...your_64_char_hex_key
  PAYMENT-VERSION: 2
  PAYMENT-SIGNATURE: <base64 encoded JSON>
  PAYMENT-REQUIRED: <base64 encoded JSON>

Alternative: JSON body instead of headers (legacy support):
{{
  "x402Version": 1,
  "paymentPayload": {{...}},
  "paymentRequirements": {{...}}
}}

Response Headers:
  PAYMENT-VERSION: 2

Success Response (200):
{{
  "isValid": true,
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21"
}}

Invalid Response (200):
{{
  "isValid": false,
  "invalidReason": "Insufficient balance: has 500000, needs 1000000"
}}

--------------------------------------------------------------------------------
POST /settle
--------------------------------------------------------------------------------
Purpose: Execute payment settlement on blockchain (costs credits)
Auth: Authorization header (Bearer token)

Request Headers:
  Authorization: Bearer a1b2c3d4e5f6...your_64_char_hex_key
  PAYMENT-VERSION: 2
  PAYMENT-SIGNATURE: <base64 encoded JSON>
  PAYMENT-REQUIRED: <base64 encoded JSON>

Alternative: JSON body instead of headers (legacy support):
{{
  "x402Version": 1,
  "paymentPayload": {{...}},
  "paymentRequirements": {{...}}
}}

Response Headers:
  PAYMENT-VERSION: 2
  PAYMENT-RESPONSE: <base64 encoded result>

Success Response (200):
{{
  "success": true,
  "transaction": "0xabcdef1234567890...",
  "network": "eip155:84532",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
  "status": "completed"
}}

Status Values:
  - "pending": Transaction submitted, awaiting confirmation
  - "preconfirmed": Flashblock preconfirmation (very fast)
  - "completed": Transaction confirmed on-chain
  - "failed": Transaction failed

Cached Response (duplicate request):
{{
  "success": true,
  "transaction": "0x...",
  "network": "base",
  "payer": "0x...",
  "status": "completed",
  "cached": true,
  "message": "Transaction already processed"
}}

Failure Response (200):
{{
  "success": false,
  "network": "base",
  "errorReason": "INSUFFICIENT_CREDITS",
  "status": "failed"
}}

================================================================================
DATA STRUCTURES
================================================================================

PAYMENT-SIGNATURE (base64 encoded JSON):
{{
  "authorization": {{
    "from": "0x...",              // Payer wallet address (token owner)
    "to": "0x...",                // Recipient address (merchant)
    "value": "1000000",           // Amount in token smallest units
    "validAfter": "0",            // Unix timestamp (usually "0")
    "validBefore": "1735776000",  // Unix timestamp (expiry)
    "nonce": "0x0000...0001"      // 32-byte unique hex (prevent replay)
  }},
  "signature": "0x...",           // 65-byte EIP-712 signature (r+s+v)
  "network": "Base Sepolia",      // Network identifier (any format)
  "asset": "0x036CbD..."          // Token contract address (USDC)
}}

PAYMENT-REQUIRED (base64 encoded JSON):
{{
  "scheme": "exact",              // Always "exact" (only scheme supported)
  "network": "eip155:84532",      // CAIP-2 format preferred
  "asset": "0x036CbD...",         // USDC token contract address
  "payTo": "0x8ba1f1...",         // Merchant receiving address
  "maxAmountRequired": "1000000", // Amount in smallest units (6 decimals)
  "resource": "/api/premium",     // Resource being purchased
  "description": "Premium access",// Human-readable description
  "mimeType": "application/json", // Response content type
  "maxTimeoutSeconds": 60,        // Settlement timeout
  "outputSchema": {{}},            // Optional: expected response schema
  "extra": {{}}                    // Optional: additional metadata
}}

PAYMENT-RESPONSE (base64 encoded JSON, returned in header):
{{
  "success": true,
  "transaction": "0x...",
  "network": "eip155:84532",
  "payer": "0x...",
  "error": null
}}

================================================================================
ERROR CODES (STANDARDIZED)
================================================================================

Authentication Errors (HTTP 401):
  UNAUTHORIZED              Missing or invalid Authorization header
  INVALID_API_KEY           API key not found or malformed
  EXPIRED_API_KEY           API key has expired
  INACTIVE_API_KEY          API key is deactivated

Request Errors (HTTP 400):
  MISSING_DATA              No headers or body provided
  MISSING_FIELDS            Required fields missing in payload
  INVALID_HEADER            Header present but unparseable
  DECODE_ERROR              Base64 decoding failed
  PARSE_ERROR               JSON parsing failed
  INVALID_VERSION           x402 version not supported (must be 1 or 2)
  INVALID_ACTION            Unknown action in account query
  MISSING_PARAMETERS        POST /account missing required mode indicators

Validation Errors (HTTP 200, isValid=false or success=false):
  INVALID_SIGNATURE         EIP-712 signature verification failed
  INVALID_ADDRESS           Ethereum address format invalid
  INVALID_NONCE             Nonce format invalid (must be 0x hex)
  INVALID_VALUE             Value format invalid (must be numeric string)
  INVALID_SCHEME            Scheme not "exact"
  AMOUNT_MISMATCH           Authorization value != maxAmountRequired
  RECIPIENT_MISMATCH        Authorization "to" != payTo
  NONCE_ALREADY_USED        Nonce has been consumed on-chain
  AUTHORIZATION_EXPIRED     validBefore timestamp has passed
  AUTHORIZATION_NOT_VALID   validAfter timestamp is in future
  INSUFFICIENT_BALANCE      Payer token balance too low

Settlement Errors (HTTP 200, success=false):
  INSUFFICIENT_CREDITS      Merchant API key has insufficient balance
  UNSUPPORTED_NETWORK       Network not configured on facilitator
  TOKEN_NOT_SUPPORTED       Token not configured for network
  SETTLEMENT_FAILED         On-chain transaction reverted
  TIMEOUT                   Settlement took too long

Configuration Errors (HTTP 400):
  CONFIG_ERROR              Server misconfiguration (e.g., vault not set)
  INTERNAL_ERROR            Unexpected server error

================================================================================
PRICING
================================================================================

Service Fee:     0.001 USDC per settlement
Gas Cost:        Variable (~0.0001-0.01 USDC depending on network)
Minimum Deposit: 1.00 USDC

Estimated settlements per USDC:
  - Base/OP Mainnet: ~800-900 settlements
  - Testnets: ~900-950 settlements (lower gas)

================================================================================
EXAMPLES
================================================================================

EXAMPLE 1: Create API key with 10 USDC (testnet)
------------------------------------------------
# First, sign an EIP-712 transferWithAuthorization in your wallet
# Then base64 encode the signature JSON and send:

curl -X POST https://api.netpay.id/account \
  -H "PAYMENT-VERSION: 2" \
  -H "PAYMENT-SIGNATURE: eyJhdXRob3JpemF0aW9uIjp7ImZyb20iOiIweC4uLiIsInRvIjoiMHguLi4iLCJ2YWx1ZSI6IjEwMDAwMDAwIiwidmFsaWRBZnRlciI6IjAiLCJ2YWxpZEJlZm9yZSI6IjE3MzU3NzYwMDAiLCJub25jZSI6IjB4MDAwMC4uLjAwMDEifSwic2lnbmF0dXJlIjoiMHguLi4iLCJuZXR3b3JrIjoiQmFzZSBTZXBvbGlhIiwiYXNzZXQiOiIweDAwMENiRC4uLiJ9"

EXAMPLE 2: Check balance
------------------------
curl -X POST https://api.netpay.id/account \
  -H "Authorization: Bearer a1b2c3d4e5f6...your_64_char_hex_key" \
  -H "Content-Type: application/json" \
  -d '{{"action": "balance"}}'

EXAMPLE 3: Verify payment (free)
--------------------------------
PAYMENT_SIG=$(echo -n '{{"authorization":{{"from":"0x...","to":"0x...","value":"1000000","validAfter":"0","validBefore":"1735776000","nonce":"0x0001"}},"signature":"0x...","network":"Base Sepolia","asset":"0x036CbD..."}}' | base64 -w0)
PAYMENT_REQ=$(echo -n '{{"scheme":"exact","network":"eip155:84532","asset":"0x036CbD...","payTo":"0x...","maxAmountRequired":"1000000","resource":"/api","description":"test","mimeType":"application/json","maxTimeoutSeconds":60}}' | base64 -w0)

curl -X POST https://api.netpay.id/verify \
  -H "Authorization: Bearer a1b2c3d4e5f6...your_64_char_hex_key" \
  -H "PAYMENT-VERSION: 2" \
  -H "PAYMENT-SIGNATURE: $PAYMENT_SIG" \
  -H "PAYMENT-REQUIRED: $PAYMENT_REQ"

EXAMPLE 4: Settle payment (costs credits)
-----------------------------------------
curl -X POST https://api.netpay.id/settle \
  -H "Authorization: Bearer a1b2c3d4e5f6...your_64_char_hex_key" \
  -H "PAYMENT-VERSION: 2" \
  -H "PAYMENT-SIGNATURE: $PAYMENT_SIG" \
  -H "PAYMENT-REQUIRED: $PAYMENT_REQ"

EXAMPLE 5: Decode base64 header
-------------------------------
echo "eyJzY2hlbWUiOiJleGFjdCJ9" | base64 -d
# Output: {{"scheme":"exact"}}

================================================================================
EIP-712 SIGNING GUIDE
================================================================================

To create a valid payment signature, sign this EIP-712 typed data:

Domain:
{{
  "name": "<USDC token name from /networks>",
  "version": "<USDC version from /networks>",
  "chainId": <chain ID>,
  "verifyingContract": "<USDC contract address>"
}}

Types:
{{
  "TransferWithAuthorization": [
    {{"name": "from", "type": "address"}},
    {{"name": "to", "type": "address"}},
    {{"name": "value", "type": "uint256"}},
    {{"name": "validAfter", "type": "uint256"}},
    {{"name": "validBefore", "type": "uint256"}},
    {{"name": "nonce", "type": "bytes32"}}
  ]
}}

Message:
{{
  "from": "0xYourWalletAddress",
  "to": "0xMerchantAddress",
  "value": "1000000",
  "validAfter": "0",
  "validBefore": "1735776000",
  "nonce": "0x0000000000000000000000000000000000000000000000000000000000000001"
}}

================================================================================
NONCE GENERATION
================================================================================

Nonces must be unique 32-byte hex values. Options:
  1. Random: crypto.randomBytes(32) or similar
  2. Sequential: Increment from last used
  3. Timestamp-based: Include timestamp + random suffix

Example (JavaScript):
  const nonce = '0x' + crypto.randomBytes(32).toString('hex');

================================================================================
INTEGRATION CHECKLIST
================================================================================

[ ] Get USDC on supported network (testnet first)
[ ] Send USDC to vault address via EIP-712 signed transfer
[ ] Receive and securely store API key
[ ] For each payment:
    [ ] Create EIP-3009 authorization with unique nonce
    [ ] Sign with user's wallet (EIP-712)
    [ ] Base64 encode PAYMENT-SIGNATURE and PAYMENT-REQUIRED
    [ ] Call POST /verify to validate (free)
    [ ] Call POST /settle to execute (costs credits)
    [ ] Handle success/failure response
[ ] Monitor balance via POST /account {{"action": "balance"}}
[ ] Top up credits before running out

================================================================================
SUPPORT
================================================================================

For technical support or questions, refer to:
- API Reference: /docs/API_REFERENCE.md
- GitHub Issues: (repository URL)
- Protocol Spec: x402 v2 specification

================================================================================
"#, 
        version = X402_VERSION,
        vault_address = vault_address,
        mainnet_networks = mainnet_text,
        testnet_networks = testnet_text
    );
    
    let mut response_headers = HeaderMap::new();
    response_headers.insert(headers::PAYMENT_VERSION, HeaderValue::from_static(X402_VERSION));
    response_headers.insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8")
    );
    
    (response_headers, help_text)
}
