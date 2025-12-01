# Security Architecture

## 🛡️ Multi-Layer Security Overview

The x402 Facilitator implements defense-in-depth security with multiple independent verification layers.

## 🔍 Verification Layers

### Layer 1: Network Validation
**Purpose**: Ensure the payment is for a supported network
- Validates against whitelist of supported networks
- Prevents attacks on unsupported chains
- Configurable via `SUPPORTED_NETWORKS` environment variable

**Attack Prevention**: Network spoofing, cross-chain attacks

### Layer 2: Payload Structure Validation
**Purpose**: Ensure payment data is correctly formatted
- Validates JSON schema with Joi
- Checks required fields presence
- Verifies data types
- Extracts payer address safely

**Attack Prevention**: Malformed payloads, injection attacks

### Layer 3: Cryptographic Signature Verification
**Purpose**: Verify the payment was signed by the claimed payer
- Reconstructs signed message
- Recovers signer address from signature (EIP-191)
- Compares recovered address with claimed payer
- Validates signature format

**Attack Prevention**: Signature forgery, replay attacks, man-in-the-middle

### Layer 4: Time Window Validation
**Purpose**: Ensure payment authorization is currently valid
- Checks `validAfter` timestamp
- Checks `validBefore` timestamp
- Prevents use of expired authorizations

**Attack Prevention**: Replay attacks, time-based attacks

### Layer 5: Token Balance Verification
**Purpose**: Verify payer has sufficient tokens
- Calls `balanceOf()` on-chain
- Compares balance to required amount
- Real-time blockchain query

**Attack Prevention**: Insufficient funds, double-spending attempts

### Layer 6: Allowance Verification
**Purpose**: Verify merchant is approved to transfer tokens
- Calls `allowance()` on-chain
- Verifies payer approved merchant
- Checks approval amount is sufficient

**Attack Prevention**: Unauthorized transfers, approval attacks

### Layer 7: Amount Validation
**Purpose**: Verify amounts match across all fields
- Compares authorization amount
- Compares required amount
- Ensures no amount manipulation

**Attack Prevention**: Amount tampering, precision attacks

## 🔐 Settlement Safety Checks

### Safety Check 1: Payer Extraction
- Validates payload structure
- Extracts payer address safely
- Handles missing/invalid data

### Safety Check 2: Merchant Authorization
- Verifies merchant address matches
- Prevents settlement to wrong address
- Validates merchant wallet is configured

### Safety Check 3: Duplicate Detection
- Tracks pending transactions
- Uses nonce-based tracking
- Prevents duplicate settlements
- Clears completed transactions

### Safety Check 4: Pre-Settlement Validation
- Re-checks balance at settlement time
- Re-checks allowance at settlement time
- Prevents race conditions
- Catches balance changes

### Safety Check 5: Gas Estimation
- Estimates gas before execution
- Adds 20% safety buffer
- Prevents out-of-gas failures
- Protects against gas price attacks

### Safety Check 6: Transaction Monitoring
- Waits for transaction confirmation
- 3-minute timeout protection
- Validates transaction receipt
- Confirms successful execution

## 🔒 Application Security

### Rate Limiting
**General API**: 100 requests/minute per IP
- Prevents DoS attacks
- Protects server resources
- Configurable limits

**Verify Endpoint**: 30 requests/minute
- Stricter limits for verification
- Prevents verification spam
- Reduces blockchain RPC load

**Settle Endpoint**: 10 requests/minute
- Very strict limits
- Prevents settlement spam
- Protects gas funds
- Reduces blockchain congestion

### API Key Authentication
- Optional but recommended
- Bearer token authentication
- Validates on protected endpoints
- Configurable requirement

**Best Practices**:
- Use 32+ character random keys
- Rotate keys regularly
- Use secrets management in production
- Never commit keys to version control

### Request Validation
- Joi schema validation
- Type checking
- Required field validation
- Format validation
- Size limits (1MB max payload)

### Security Headers (Helmet)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (HTTPS)
- Content Security Policy

### CORS Protection
- Configurable origins
- Method restrictions
- Header whitelisting
- Credentials handling

## 🔐 Cryptographic Security

### Signature Verification (EIP-191)
```
message = keccak256("\x19Ethereum Signed Message:\n" + len(message) + message)
signer = ecrecover(message_hash, signature)
```

**Security Properties**:
- Non-malleable signatures
- Prevents signature forgery
- Domain separation
- Replay attack protection

### Private Key Security
- Never logged or exposed
- Stored in environment variables
- Used only for signing transactions
- Recommend hardware wallet in production

## 🛡️ Smart Contract Security

### ERC20 Token Safety
- Uses standard ERC20 ABI
- Validates contract addresses
- Checks return values
- Handles reverting transactions

### TransferFrom Safety
- Requires prior approval
- Checks allowance before transfer
- Validates transfer amount
- Monitors transaction receipt

## 📊 Monitoring & Logging

### Security Event Logging
- All verification attempts
- All settlement attempts
- Authentication failures
- Rate limit violations
- Validation errors
- Transaction failures

### Log Levels
- `ERROR`: Critical failures, security issues
- `WARN`: Authentication failures, validation errors
- `INFO`: Successful operations, transaction details
- `HTTP`: All HTTP requests
- `DEBUG`: Detailed debugging information

### Log Storage
- `logs/error.log`: Errors only
- `logs/all.log`: All log levels
- Console: Colored output for development
- Rotation recommended for production

## 🚨 Attack Prevention

### Replay Attack Prevention
1. Time window validation (`validAfter`, `validBefore`)
2. Nonce tracking in authorization
3. Transaction hash tracking
4. Duplicate detection

### Double-Spending Prevention
1. Real-time balance checking
2. Allowance verification
3. Transaction monitoring
4. Receipt confirmation

### Front-Running Prevention
1. Gas price management
2. Transaction nonce management
3. MEV protection considerations
4. Private RPC recommended

### DoS Prevention
1. Rate limiting per IP
2. Request size limits
3. Timeout protection
4. Resource monitoring

### Injection Attack Prevention
1. Input validation with Joi
2. Type checking
3. SQL injection N/A (no database)
4. Command injection protection

## 🔧 Security Configuration

### Environment Variables
```env
# Strong API key (32+ characters)
API_KEY=generate-secure-random-key

# Secure RPC (private or authenticated)
RPC_URL=https://your-private-rpc.com

# Private key (NEVER commit)
MERCHANT_PRIVATE_KEY=0x...

# Rate limiting
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
```

### Production Recommendations

1. **Use HTTPS**
   - TLS 1.3
   - Valid certificates
   - HSTS enabled

2. **Private RPC**
   - Authenticated endpoints
   - Rate limit protection
   - Dedicated node recommended

3. **Secrets Management**
   - AWS Secrets Manager
   - HashiCorp Vault
   - Azure Key Vault
   - Never in code/env files

4. **Network Security**
   - Firewall rules
   - IP whitelisting
   - DDoS protection
   - WAF recommended

5. **Monitoring**
   - Real-time alerts
   - Anomaly detection
   - Transaction monitoring
   - Error tracking

6. **Incident Response**
   - Documented procedures
   - Emergency contacts
   - Backup merchant wallet
   - Failover plan

## 🔍 Security Auditing

### Regular Checks
- [ ] Review logs for suspicious activity
- [ ] Monitor rate limit violations
- [ ] Check failed verifications
- [ ] Review transaction failures
- [ ] Update dependencies
- [ ] Rotate API keys
- [ ] Review access logs

### Security Updates
- Monitor npm security advisories
- Update dependencies regularly
- Test updates in staging
- Review changelog for security fixes

## 📞 Security Reporting

If you discover a security vulnerability:
1. **Do NOT** open a public issue
2. Email security details privately
3. Include steps to reproduce
4. Allow time for patching before disclosure

---

**Security is a continuous process. Stay vigilant!** 🛡️
