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
use crate::types::X402_VERSION;

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

NOTE: All facilitator API calls use JSON body. The x402 protocol headers
(PAYMENT-REQUIRED, PAYMENT-SIGNATURE, etc.) are used between merchants and
buyers, NOT for facilitator API calls.

================================================================================
QUICK START FOR AI AGENTS
================================================================================

1. CREATE API KEY:
   POST /account with JSON body containing paymentSignature (signed USDC transfer
   to vault). Receive API key with credit balance.

2. VERIFY PAYMENT (free):
   POST /verify with Authorization header + JSON body containing paymentPayload
   and paymentRequirements. Returns isValid boolean without spending credits.

3. SETTLE PAYMENT (costs credits):
   POST /settle with same format as verify.
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
  "name": "NetPay x402 Facilitator",
  "description": "Secure & fast x402 payment facilitator",
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

--------------------------------------------------------------------------------
GET /networks
--------------------------------------------------------------------------------
Purpose: List all supported networks and token configurations
Auth: None required

Response (200):
{{
  "success": true,
  "mainnet": [...],
  "testnet": [...]
}}

--------------------------------------------------------------------------------
GET /help
--------------------------------------------------------------------------------
Purpose: This complete documentation
Auth: None required
Content-Type: text/plain; charset=utf-8

--------------------------------------------------------------------------------
GET /account
--------------------------------------------------------------------------------
Purpose: Account service instructions (human-readable)
Auth: None required
Content-Type: text/plain; charset=utf-8

--------------------------------------------------------------------------------
POST /account - PURCHASE CREDITS (new API key)
--------------------------------------------------------------------------------
Purpose: Create new API key by sending USDC to vault
Auth: None (payment signature in body)

Request:
  Content-Type: application/json
  Body:
{{
  "paymentSignature": {{
    "authorization": {{
      "from": "0xYourWallet...",
      "to": "{vault_address}",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1735776000",
      "nonce": "0x0000...0001"
    }},
    "signature": "0x...",
    "network": "Base Sepolia",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  }}
}}

Success Response (200):
{{
  "success": true,
  "action": "create",
  "apiKey": "a1b2c3d4...64_char_hex",
  "balanceType": "testnet",
  "usdc": "1.000000",
  "transaction": "0x...",
  "message": "API key created. SAVE THIS KEY - it will not be shown again!"
}}

--------------------------------------------------------------------------------
POST /account - TOP-UP EXISTING ACCOUNT
--------------------------------------------------------------------------------
Purpose: Add credits to existing API key
Auth: None (API key in body)

Request Body:
{{
  "paymentSignature": {{...}},
  "apiKey": "your_existing_64_char_hex_key"
}}

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
POST /account - QUERY BALANCE
--------------------------------------------------------------------------------
Purpose: Check account balance
Auth: Authorization header (Bearer token)

Request:
  Headers: Authorization: Bearer <api_key>
  Body: {{"action": "balance"}}

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
POST /account - QUERY METRICS
--------------------------------------------------------------------------------
Purpose: Get account usage statistics
Auth: Authorization header (Bearer token)

Request:
  Headers: Authorization: Bearer <api_key>
  Body: {{"action": "metrics"}}

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

Request:
  Headers: Authorization: Bearer <api_key>
  Content-Type: application/json
  Body:
{{
  "paymentPayload": {{
    "authorization": {{
      "from": "0x...",
      "to": "0x...",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1735776000",
      "nonce": "0x0000...0001"
    }},
    "signature": "0x..."
  }},
  "paymentRequirements": {{
    "scheme": "exact",
    "network": "eip155:84532",
    "asset": "0x036CbD...",
    "payTo": "0x8ba1f1...",
    "maxAmountRequired": "1000000",
    "resource": "/api/premium",
    "description": "Premium access",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 60
  }}
}}

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

Request: (same as /verify)
  Headers: Authorization: Bearer <api_key>
  Body: {{"paymentPayload": {{...}}, "paymentRequirements": {{...}}}}

Success Response (200):
{{
  "success": true,
  "transaction": "0xabcdef1234567890...",
  "network": "eip155:84532",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
  "status": "completed",
  "fees": {{
    "serviceFee": "0.001000",
    "gasCost": "0.000012",
    "totalFees": "0.001012",
    "balanceAfter": "0.999988",
    "balanceType": "testnet"
  }}
}}

Status Values:
  - "pending": Transaction submitted, awaiting confirmation
  - "preconfirmed": Flashblock preconfirmation (very fast)
  - "completed": Transaction confirmed on-chain
  - "failed": Transaction failed

================================================================================
DATA STRUCTURES
================================================================================

paymentPayload (JSON object):
{{
  "authorization": {{
    "from": "0x...",
    "to": "0x...",
    "value": "1000000",
    "validAfter": "0",
    "validBefore": "1735776000",
    "nonce": "0x0000...0001"
  }},
  "signature": "0x..."
}}

paymentRequirements (JSON object):
{{
  "scheme": "exact",
  "network": "eip155:84532",
  "asset": "0x036CbD...",
  "payTo": "0x8ba1f1...",
  "maxAmountRequired": "1000000",
  "resource": "/api/premium",
  "description": "Premium access",
  "mimeType": "application/json",
  "maxTimeoutSeconds": 60
}}

paymentSignature (for /account):
{{
  "authorization": {{...}},
  "signature": "0x...",
  "network": "Base Sepolia",
  "asset": "0x036CbD..."
}}

================================================================================
ERROR CODES
================================================================================

Authentication Errors (HTTP 401):
  UNAUTHORIZED, INVALID_API_KEY, EXPIRED_API_KEY, INACTIVE_API_KEY

Request Errors (HTTP 400):
  MISSING_DATA, MISSING_FIELDS, INVALID_REQUEST, PARSE_ERROR, INVALID_ACTION

Validation Errors (HTTP 200, isValid=false or success=false):
  INVALID_SIGNATURE, INVALID_ADDRESS, INVALID_NONCE, INVALID_VALUE,
  AMOUNT_MISMATCH, RECIPIENT_MISMATCH, NONCE_ALREADY_USED,
  AUTHORIZATION_EXPIRED, INSUFFICIENT_BALANCE

Settlement Errors (HTTP 200, success=false):
  INSUFFICIENT_CREDITS, UNSUPPORTED_NETWORK, TOKEN_NOT_SUPPORTED,
  SETTLEMENT_FAILED, TIMEOUT

================================================================================
PRICING
================================================================================

Service Fee:     0.001 USDC per settlement
Gas Cost:        Variable (~0.0001-0.01 USDC depending on network)
Minimum Deposit: 1.00 USDC

================================================================================
EXAMPLES
================================================================================

EXAMPLE 1: Create API key
-------------------------
curl -X POST https://api.netpay.id/account \
  -H "Content-Type: application/json" \
  -d '{{"paymentSignature": {{"authorization": {{...}}, "signature": "0x...", "network": "Base Sepolia", "asset": "0x..."}}}}'

EXAMPLE 2: Check balance
------------------------
curl -X POST https://api.netpay.id/account \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{{"action": "balance"}}'

EXAMPLE 3: Verify payment
-------------------------
curl -X POST https://api.netpay.id/verify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{{"paymentPayload": {{...}}, "paymentRequirements": {{...}}}}'

EXAMPLE 4: Settle payment
-------------------------
curl -X POST https://api.netpay.id/settle \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{{"paymentPayload": {{...}}, "paymentRequirements": {{...}}}}'

================================================================================
EIP-712 SIGNING GUIDE
================================================================================

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

================================================================================
INTEGRATION CHECKLIST
================================================================================

[ ] Get USDC on supported network (testnet first)
[ ] POST /account with paymentSignature to vault address
[ ] Receive and securely store API key
[ ] For each payment:
    [ ] Create EIP-3009 authorization with unique nonce
    [ ] Sign with user's wallet (EIP-712)
    [ ] Call POST /verify with JSON body to validate (free)
    [ ] Call POST /settle with JSON body to execute (costs credits)
[ ] Monitor balance via POST /account {{"action": "balance"}}
[ ] Top up credits before running out

================================================================================
"#, 
        version = X402_VERSION,
        vault_address = vault_address,
        mainnet_networks = mainnet_text,
        testnet_networks = testnet_text
    );
    
    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8")
    );
    
    (response_headers, help_text)
}
