# x402 Facilitator Service

A secure, production-ready x402 payment facilitator service with multi-layer verification, WebSocket support, and multi-paymaster architecture.

## 🚀 Key Features

### Multi-Layer Security
- **7-Layer Payment Verification**
  1. Network validation (testnet/mainnet separation)
  2. Signature verification (EIP-191)
  3. Message reconstruction and validation
  4. Token balance verification
  5. Allowance verification
  6. Amount validation
  7. Time window validation

- **6-Layer Settlement Safety**
  1. Pre-settlement validation
  2. Gas estimation with 20% buffer
  3. Duplicate transaction detection (nonce tracking)
  4. Merchant authorization validation
  5. Transaction monitoring with webhooks
  6. Receipt confirmation

### Advanced Architecture
- **WebSocket Support**: Auto-detection of `wss://` vs `https://` RPC endpoints for 2x faster blockchain queries
- **Multi-Paymaster System**: 4 parallel paymaster wallets with round-robin distribution for high throughput
- **Network Separation**: Distinct testnet and mainnet configurations with independent RPC endpoints
- **Webhook Integration**: Real-time transaction status updates to merchant endpoints with retry logic
- **Gas Tracking**: Comprehensive gas usage monitoring and optimization per network
- **Tier-based Rate Limiting**: Configurable rate limits per merchant tier (free/pro/enterprise)

### Security Features
- API key authentication with merchant-specific keys
- Request validation with Joi schemas
- Helmet security headers
- CORS protection
- Comprehensive audit logging
- Health monitoring with uptime tracking
- Nonce management for replay attack prevention

### Production Ready
- TypeScript with strict type checking
- Docker containerization with non-root user
- PM2 process management with ecosystem config
- Graceful shutdown handling
- Error recovery and transaction queue
- Redis caching for transaction status
- MySQL with consolidated migrations

## 📋 Prerequisites

- Node.js 18+ or Docker
- MySQL 8.0+ (for transaction and merchant data)
- Redis (optional, for caching and rate limiting)
- RPC endpoints for your target networks (supports WebSocket for better performance)
- Merchant wallet private key(s)
- USDC contract addresses for your networks

## 🔧 Quick Start

### 1. Clone and Configure

```bash
git clone https://github.com/deathdkidz/x402.git
cd x402/x402-facilitator
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=8080
NODE_ENV=production
SSL_CERT=/path/to/fullchain.pem
SSL_KEY=/path/to/privkey.pem

# Database
DB_HOST=localhost
DB_USER=x402_user
DB_PASSWORD=your_secure_password
DB_NAME=x402_facilitator

# Redis (optional but recommended)
REDIS_HOST=localhost
REDIS_PORT=6379

# Networks (comma-separated)
TESTNET_NETWORKS=Base Sepolia,Ethereum Sepolia
MAINNET_NETWORKS=Base,Ethereum

# RPC Endpoints (WebSocket wss:// preferred for 2x speed)
BASE_SEPOLIA_RPC=wss://base-sepolia.g.alchemy.com/v2/YOUR_KEY
ETHEREUM_SEPOLIA_RPC=wss://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
BASE_RPC=wss://base-mainnet.g.alchemy.com/v2/YOUR_KEY
ETHEREUM_RPC=wss://eth-mainnet.g.alchemy.com/v2/YOUR_KEY

# USDC Contracts
BASE_SEPOLIA_USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e
ETHEREUM_SEPOLIA_USDC=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
BASE_USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
ETHEREUM_USDC=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48

# Paymaster Configuration (multi-wallet support)
PAYMASTER_PRIVATE_KEY=your_paymaster_key_1
PAYMASTER_PRIVATE_KEY_2=your_paymaster_key_2
PAYMASTER_PRIVATE_KEY_3=your_paymaster_key_3
PAYMASTER_PRIVATE_KEY_4=your_paymaster_key_4
```

### 2. Setup Database

```bash
# Create database
mysql -u root -p -e "CREATE DATABASE x402_facilitator;"

# Run consolidated migration
mysql -u root -p x402_facilitator < migrations/consolidated_migration.sql
```

### 3. Install and Run

**Using PM2 (Production):**
```bash
npm install
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

**Using Docker:**
```bash
docker-compose up -d
```

**Development Mode:**
```bash
npm install
npm run dev
```

### 4. Verify Health

```bash
curl https://api.netpay.id/health
# or
curl http://localhost:8080/health
```

## 🔑 Environment Configuration

### Network Configuration

The service supports separate testnet and mainnet networks:

| Variable | Description | Example |
|----------|-------------|---------|
| `TESTNET_NETWORKS` | Comma-separated testnet names | `Base Sepolia,Ethereum Sepolia` |
| `MAINNET_NETWORKS` | Comma-separated mainnet names | `Base,Ethereum` |

### RPC Endpoints

**WebSocket vs HTTP:**
- Use `wss://` for WebSocket (2x faster, recommended)
- Falls back to `https://` automatically
- Provider selection based on benchmarks:
  - Base/Ethereum: Alchemy WebSocket (~17-34ms)
  - BSC: Binance official endpoint (Alchemy has reliability issues)

**Format:** `{NETWORK_NAME_UPPERCASE_UNDERSCORED}_RPC`

Examples:
- `BASE_SEPOLIA_RPC=wss://base-sepolia.g.alchemy.com/v2/KEY`
- `ETHEREUM_SEPOLIA_RPC=wss://eth-sepolia.g.alchemy.com/v2/KEY`
- `BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545`

### USDC Contract Addresses

**Format:** `{NETWORK_NAME_UPPERCASE_UNDERSCORED}_USDC`

Examples:
- `BASE_SEPOLIA_USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- `ETHEREUM_USDC=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`

### Paymaster Wallets

The service supports up to 4 paymaster wallets for load distribution:

```env
PAYMASTER_PRIVATE_KEY=0x...     # Required
PAYMASTER_PRIVATE_KEY_2=0x...   # Optional
PAYMASTER_PRIVATE_KEY_3=0x...   # Optional  
PAYMASTER_PRIVATE_KEY_4=0x...   # Optional
```

### Rate Limiting

Configure per-merchant tier in database or use defaults:

```env
RATE_LIMIT_WINDOW_MS=60000        # 1 minute window
RATE_LIMIT_MAX_REQUESTS=100       # General endpoints
```

Tiers (configured in database):
- **Free**: 60 verify/min, 20 settle/min
- **Pro**: 300 verify/min, 100 settle/min
- **Enterprise**: 1000 verify/min, 500 settle/min

## 📡 API Endpoints

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "x402-facilitator",
  "timestamp": 1234567890,
  "uptime": 3600
}
```

### Network Information
```http
GET /networks
```

**Response:**
```json
{
  "testnet": ["Base Sepolia", "Ethereum Sepolia"],
  "mainnet": ["Base", "Ethereum"]
}
```

### Service Information
```http
GET /
```

**Response:**
```json
{
  "service": "x402-facilitator",
  "version": "1.0.0",
  "description": "Secure payment verification and settlement",
  "testnetNetworks": ["Base Sepolia", "Ethereum Sepolia"],
  "mainnetNetworks": ["Base", "Ethereum"],
  "endpoints": {
    "health": "GET /health",
    "networks": "GET /networks",
    "verify": "POST /verify",
    "settle": "POST /settle",
    "merchants": "GET /merchants (admin)"
  }
}
```

### Verify Payment
```http
POST /verify
Content-Type: application/json
x-api-key: YOUR_MERCHANT_API_KEY
```

**Request:**
```json
{
  "x402Version": 1,
  "paymentPayload": {
    "authorization": {
      "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "to": "0xYourMerchantAddress",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "9999999999",
      "nonce": "0x1234..."
    },
    "signature": "0x..."
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "Base Sepolia",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0xYourMerchantAddress",
    "maxAmountRequired": "1000000",
    "resource": "/api/premium/content",
    "description": "Premium content access",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 300
  }
}
```

**Response:**
```json
{
  "isValid": true,
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

### Settle Payment
```http
POST /settle
Content-Type: application/json
x-api-key: YOUR_MERCHANT_API_KEY
```

**Request:** Same format as `/verify`

**Response:**
```json
{
  "success": true,
  "transaction": "0xabcd1234...",
  "network": "Base Sepolia",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "amount": "1000000",
  "resource": "/api/premium/content"
}
```

**Error Response:**
```json
{
  "error": "Insufficient balance",
  "details": "Payer has 500000 but requires 1000000"
}
```

## 🔒 Security & Authentication

### Merchant API Keys

Each merchant has a unique API key stored in the database. Include it in requests:

```http
x-api-key: YOUR_MERCHANT_API_KEY
```

### Rate Limiting (Tier-Based)

Limits are enforced per merchant based on their tier:

| Tier | Verify (per min) | Settle (per min) | Window |
|------|------------------|------------------|--------|
| **Free** | 60 | 20 | 60s |
| **Pro** | 300 | 100 | 60s |
| **Enterprise** | 1000 | 500 | 60s |

### Transaction Security

- **Nonce Tracking**: Prevents replay attacks with unique transaction nonces
- **Duplicate Detection**: Checks `payer_address + nonce` uniqueness in database
- **Signature Verification**: EIP-191 personal sign validation
- **Balance & Allowance**: Pre-flight checks before settlement
- **Gas Estimation**: 20% buffer to prevent out-of-gas failures
- **Time Windows**: Enforces `validAfter` and `validBefore` timestamps
- **Webhook Signatures**: HMAC verification for webhook authenticity

### Request Validation

All endpoints use Joi schema validation:
- Network names match configured networks
- Ethereum addresses are valid (42 chars, 0x prefix)
- Amounts are numeric strings
- Required fields are present

## 🔧 Management Scripts

### Generate Merchant

Create a new merchant account:

```bash
node scripts/generate-merchant.mjs
```

**Output:**
```
Merchant created successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Merchant Address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
API Key: sk_live_abc123xyz789...
Private Key: 0x1234... (keep secure!)
Tier: free
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Update Merchant Tier

Change merchant rate limits:

```bash
node scripts/update-merchant-tier.mjs <merchant_address> <tier>
```

**Example:**
```bash
node scripts/update-merchant-tier.mjs 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb pro
```

### Check Paymaster Balances

Monitor paymaster wallet balances across all networks:

```bash
node scripts/balance-paymaster.mjs
```

**Output:**
```
Checking balances for all paymasters across all networks...

Network: Base Sepolia
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Paymaster 1 (0x1234...):
  ETH: 0.15
  USDC: 100.00

Network: Ethereum Sepolia
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
...
```

### Fetch Token Metadata

Get ERC-20 and EIP-712 metadata for any token:

```bash
node scripts/get-token-metadata.mjs <token_address> <network>
```

**Example:**
```bash
node scripts/get-token-metadata.mjs 0x036CbD53842c5426634e7929541eC2318f3dCF7e "Base Sepolia"
```

**Output:**
```json
{
  "name": "USD Coin",
  "symbol": "USDC",
  "decimals": 6,
  "eip712": {
    "supported": true,
    "name": "USD Coin",
    "version": "2"
  }
}

# Add to .env:
BASE_SEPOLIA_USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

## 📊 Monitoring & Logs

### Log Locations

- **Console**: Colored real-time output
- **logs/error.log**: Errors only
- **logs/all.log**: All log levels
- **PM2 logs**: `pm2 logs x402-facilitator`

### Log Levels

Set via `LOG_LEVEL` environment variable:
- `error`: Critical errors only
- `warn`: Warnings and errors
- `info`: General information (default)
- `http`: HTTP request logging
- `debug`: Detailed debugging

### Health Monitoring

```bash
# Check service health
curl https://api.netpay.id/health

# Check network configuration
curl https://api.netpay.id/networks

# View PM2 status
pm2 status
pm2 monit
```

### Gas Usage Tracking

Gas costs are tracked in the `gas_tracking` table:

```sql
SELECT 
  network,
  operation_type,
  COUNT(*) as tx_count,
  AVG(gas_cost_native) as avg_cost,
  SUM(gas_cost_native) as total_cost
FROM gas_tracking
WHERE timestamp > DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY network, operation_type;
```

View stats:
```bash
node view-gas-stats.mjs
```

## 🚀 Production Deployment

### Prerequisites

1. **Server Requirements**
   - Ubuntu 20.04+ or similar Linux distribution
   - 2GB+ RAM
   - 20GB+ storage
   - Public IP address
   - Domain name (optional but recommended)

2. **Software Setup**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install Node.js 18
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs
   
   # Install MySQL
   sudo apt install -y mysql-server
   sudo mysql_secure_installation
   
   # Install Redis (optional)
   sudo apt install -y redis-server
   sudo systemctl enable redis-server
   
   # Install PM2
   sudo npm install -g pm2
   ```

3. **SSL Certificates**
   ```bash
   # Install certbot
   sudo apt install -y certbot
   
   # Get certificate (stop any services on port 80/443 first)
   sudo certbot certonly --standalone -d api.yourdomain.com
   ```

### Deployment Steps

1. **Clone and Configure**
   ```bash
   cd /srv
   git clone https://github.com/yourusername/x402.git
   cd x402/x402-facilitator
   cp .env.example .env
   nano .env  # Edit with your configuration
   ```

2. **Database Setup**
   ```bash
   # Create database and user
   mysql -u root -p
   ```
   ```sql
   CREATE DATABASE x402_facilitator;
   CREATE USER 'x402_user'@'localhost' IDENTIFIED BY 'secure_password';
   GRANT ALL PRIVILEGES ON x402_facilitator.* TO 'x402_user'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```
   
   ```bash
   # Run migrations
   mysql -u x402_user -p x402_facilitator < migrations/consolidated_migration.sql
   ```

3. **Install and Build**
   ```bash
   npm install
   npm run build
   ```

4. **Start with PM2**
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup  # Follow instructions to enable startup on boot
   ```

5. **Configure Nginx (Reverse Proxy)**
   ```bash
   sudo apt install -y nginx
   ```
   
   Create `/etc/nginx/sites-available/x402`:
   ```nginx
   server {
       listen 443 ssl http2;
       server_name api.yourdomain.com;
       
       ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
       
       location / {
           proxy_pass http://localhost:8080;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   
   server {
       listen 80;
       server_name api.yourdomain.com;
       return 301 https://$server_name$request_uri;
   }
   ```
   
   ```bash
   sudo ln -s /etc/nginx/sites-available/x402 /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

6. **Firewall Configuration**
   ```bash
   sudo ufw allow 22/tcp   # SSH
   sudo ufw allow 80/tcp   # HTTP
   sudo ufw allow 443/tcp  # HTTPS
   sudo ufw enable
   ```

7. **Verify Deployment**
   ```bash
   curl https://api.yourdomain.com/health
   pm2 logs
   ```

### Load Balancing (Optional)

For high-availability setups with multiple servers:

**Recommended Architecture: Active-Passive**

1. **Primary Server**: Handles all traffic
2. **Secondary Server**: Standby for failover
3. **Shared Database**: Both connect to same MySQL instance
4. **Health Checks**: Automatic failover on primary failure

**Why Active-Passive?**
- Avoids blockchain nonce conflicts
- Simpler state management
- No shared Redis required for coordination

**Implementation:**
```bash
# On secondary server
pm2 start ecosystem.config.cjs --name x402-facilitator-standby

# Configure Cloudflare or load balancer:
# - Primary: 156.67.29.85 (main traffic)
# - Secondary: 47.129.181.229 (failover only)
# - Health check: GET /health every 30s
# - Failover threshold: 3 consecutive failures
```

### Maintenance

**Update deployment:**
```bash
cd /srv/x402/x402-facilitator
git pull
npm install
npm run build
pm2 restart x402-facilitator
```

**Backup database:**
```bash
mysqldump -u x402_user -p x402_facilitator > backup_$(date +%Y%m%d).sql
```

**Monitor resources:**
```bash
pm2 monit
htop
```

**SSL renewal (automatic with certbot):**
```bash
sudo certbot renew --dry-run  # Test renewal
# Certbot automatically renews via cron/systemd timer
```
## 🔧 Troubleshooting

### Service Won't Start

**Symptoms:**
- PM2 shows error state
- Port binding fails
- Database connection refused

**Solutions:**
```bash
# Check if port is in use
sudo lsof -i :8080

# Verify database connection
mysql -u x402_user -p x402_facilitator -e "SELECT 1;"

# Check environment variables
pm2 env 0

# View detailed logs
pm2 logs x402-facilitator --lines 100
```

### Verification Fails

**Common Issues:**

1. **Invalid signature**
   - Ensure EIP-191 personal sign format
   - Check wallet implementation (MetaMask, WalletConnect, etc.)
   - Verify message reconstruction matches exactly

2. **Insufficient balance**
   - Payer needs enough USDC for amount
   - Check token contract address is correct
   - Verify network name matches (case-sensitive: "Base Sepolia" not "base-sepolia")

3. **Allowance not approved**
   - Payer must approve merchant address for USDC spending
   - Check allowance with `token.allowance(payer, merchant)`

4. **Nonce already used**
   - Database enforces unique `payer_address + nonce`
   - Generate fresh random nonce for each payment

### Settlement Fails

**Common Issues:**

1. **Paymaster out of gas**
   ```bash
   # Check paymaster balances
   node scripts/balance-paymaster.mjs
   
   # Fund paymasters if needed
   # Send ETH to paymaster addresses shown in startup logs
   ```

2. **Transaction timeout**
   - Network congestion (check gas prices)
   - RPC endpoint slow (try WebSocket endpoint)
   - Increase `maxTimeoutSeconds` in payment requirements

3. **RPC errors**
   ```bash
   # Test RPC connectivity
   curl -X POST https://base-sepolia.g.alchemy.com/v2/YOUR_KEY \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
   
   # Switch to backup RPC if needed (edit .env)
   ```

### WebSocket Connection Issues

**Symptoms:**
- "WebSocket connection closed" errors
- Slow transaction monitoring

**Solutions:**
```bash
# Test WebSocket connectivity
node -e "const WebSocket = require('ws'); const ws = new WebSocket('wss://base-sepolia.g.alchemy.com/v2/YOUR_KEY'); ws.on('open', () => console.log('Connected')); ws.on('error', (e) => console.error(e));"

# Fallback to HTTP if WebSocket unavailable
# In .env, change wss:// to https://
BASE_SEPOLIA_RPC=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
```

### Rate Limit Exceeded

**Symptoms:**
- HTTP 429 responses
- "Rate limit exceeded" errors

**Solutions:**
```bash
# Check merchant tier
node scripts/update-merchant-tier.mjs <merchant_address> pro

# Or adjust limits in database:
mysql -u x402_user -p x402_facilitator
UPDATE merchants SET verify_limit = 300, settle_limit = 100 WHERE merchant_address = '0x...';
```

### Database Issues

**Migration failures:**
```bash
# Check existing schema
mysql -u x402_user -p x402_facilitator -e "SHOW TABLES;"

# Re-run consolidated migration (safe, uses IF NOT EXISTS)
mysql -u x402_user -p x402_facilitator < migrations/consolidated_migration.sql
```

**Connection pool exhausted:**
```env
# In .env, increase pool size
DB_CONNECTION_LIMIT=20
```

## 📁 Project Structure

```
x402-facilitator/
├── src/
│   ├── config/
│   │   └── index.ts           # Config + WebSocket auto-detection
│   ├── middleware/
│   │   ├── auth.ts            # Merchant API key authentication
│   │   ├── rateLimit.ts       # Tier-based rate limiting
│   │   ├── security.ts        # Helmet, CORS configuration
│   │   └── validation.ts      # Joi request schemas
│   ├── routes/
│   │   ├── index.ts           # Main endpoints (health, verify, settle)
│   │   └── merchants.ts       # Merchant management (admin)
│   ├── services/
│   │   ├── database.ts        # MySQL connection pool
│   │   ├── redis.ts           # Redis caching
│   │   ├── verification.ts    # 7-layer payment validation
│   │   ├── settlement.ts      # ERC-3009 settlement + monitoring
│   │   ├── webhook.ts         # Webhook delivery with retries
│   │   ├── transactionMonitor.ts  # Background tx monitoring
│   │   └── transactionQueue.ts    # Queue management
│   ├── types/
│   │   └── index.ts           # TypeScript interfaces
│   ├── utils/
│   │   └── logger.ts          # Winston logging
│   └── index.ts               # Application entry + multi-paymaster init
├── scripts/
│   ├── generate-merchant.mjs      # Create new merchant
│   ├── update-merchant-tier.mjs   # Change merchant tier
│   ├── balance-paymaster.mjs      # Check paymaster balances
│   └── get-token-metadata.mjs     # Fetch ERC-20/EIP-712 info
├── migrations/
│   ├── consolidated_migration.sql  # All-in-one database setup
│   └── 006_webhook_deliveries.sql  # (consolidated into main file)
├── logs/                      # Winston log files
├── ecosystem.config.cjs       # PM2 configuration
├── Dockerfile                 # Docker container
├── docker-compose.yml         # Docker Compose
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
└── .env                       # Environment variables (not in git)
```

## 🧪 Testing

### Local Testing

```bash
# Start in dev mode
npm run dev

# Test health endpoint
curl http://localhost:8080/health

# Test network configuration
curl http://localhost:8080/networks
```

### Integration Testing

Use the merchant demo app in `../merchant-demo`:

```bash
cd ../merchant-demo
npm install
npm run dev
# Open http://localhost:3000
```

## 🌐 API Reference

Full documentation: [QUICKSTART.md](./QUICKSTART.md)

Additional guides:
- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - Detailed setup instructions
- [SECURITY.md](./SECURITY.md) - Security audit and best practices
- [WEBHOOK_RESOURCE_TRACKING.md](./WEBHOOK_RESOURCE_TRACKING.md) - Webhook configuration
- [GAS_TRACKING.md](./GAS_TRACKING.md) - Gas optimization strategies
- [RATE_LIMITING.md](./RATE_LIMITING.md) - Rate limit configuration

## 📝 License

ISC

## 🤝 Contributing

Contributions welcome! Please ensure:
- TypeScript strict mode compliance
- All security checks maintained
- Documentation updated
- No sensitive data in commits

## 📧 Support

- **Issues**: GitHub Issues
- **Documentation**: Check guides in root directory
- **Logs**: `pm2 logs x402-facilitator` for troubleshooting

---

**Production Ready** • **ERC-3009 Settlement** • **Multi-Paymaster** • **WebSocket Optimized**
