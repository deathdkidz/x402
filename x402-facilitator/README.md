# x402 Facilitator Service

A secure, production-ready x402 payment facilitator service with multi-layer verification and security checks.

##  Features

### Multi-Layer Security
- **7-Layer Payment Verification**
  1. Network validation
  2. Signature verification (EIP-191)
  3. Message reconstruction and validation
  4. Token balance verification
  5. Allowance verification
  6. Amount validation
  7. Time window validation

- **6-Layer Settlement Safety**
  1. Pre-settlement validation
  2. Gas estimation with 20% buffer
  3. Duplicate transaction detection
  4. Merchant authorization validation
  5. Transaction monitoring
  6. Receipt confirmation

### Security Features
- API key authentication (optional)
- Rate limiting (configurable per endpoint)
- Request validation with Joi schemas
- Helmet security headers
- CORS protection
- Comprehensive logging
- Health monitoring

### Production Ready
- TypeScript with strict type checking
- Docker containerization
- Non-root user execution
- Graceful shutdown handling
- Error handling and recovery
- Transaction tracking
- Gas optimization

## 📋 Prerequisites

- Node.js 18+ or Docker
- An RPC endpoint (Alchemy, Infura, etc.)
- A merchant wallet with private key
- USDC contract addresses for your networks

## 🔧 Installation

### Option 1: Docker (Recommended)

1. **Clone and configure**
   
   **Ubuntu/Linux:**
   ```bash
   git clone https://github.com/deathdkidz/x402.git
   cd x402/x402-facilitator
   cp .env.example .env
   ```
   
   **Windows (PowerShell):**
   ```powershell
   git clone https://github.com/deathdkidz/x402.git
   cd x402\x402-facilitator
   copy .env.example .env
   ```

2. **Edit `.env` file with your configuration**
   ```env
   API_KEY=your-secure-api-key-here
   RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY
   MERCHANT_PRIVATE_KEY=your-private-key-here
   NETWORK=base-sepolia
   ```

3. **Install Docker (Ubuntu/Linux)**
   ```bash
   # Install Docker
   sudo apt update
   sudo apt install docker.io docker-compose -y
   sudo systemctl start docker
   sudo systemctl enable docker
   sudo usermod -aG docker $USER
   # Logout and login for group changes to take effect
   ```

4. **Build and run**
   ```bash
   docker-compose up -d
   ```

5. **Check health**
   ```bash
   curl http://localhost:8080/health
   ```

### Option 2: Local Development

1. **Install Node.js (Ubuntu/Linux)**
   ```bash
   # Install Node.js 18.x
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs
   
   # Verify installation
   node --version
   npm --version
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   nano .env  # or use vim, vi, etc.
   ```

4. **Run in development mode**
   ```bash
   npm run dev
   ```

5. **Build for production**
   ```bash
   npm run build
   npm start
   ```

## 🔑 Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `API_KEY` | Secure API key for authentication | `your-secure-random-key` |
| `RPC_URL` | Blockchain RPC endpoint | `https://base-sepolia.g.alchemy.com/v2/KEY` |
| `MERCHANT_PRIVATE_KEY` | Private key for settlement | `0x...` |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `NODE_ENV` | `production` | Environment mode |
| `NETWORK` | `base-sepolia` | Default network |
| `SUPPORTED_NETWORKS` | `base-sepolia,base,ethereum,sepolia` | Comma-separated networks |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (1 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `LOG_LEVEL` | `info` | Logging level |
| `BASE_SEPOLIA_USDC` | `0x036CbD5...` | Base Sepolia USDC address |
| `BASE_USDC` | `0x833589...` | Base USDC address |
| `ETHEREUM_USDC` | `0xA0b869...` | Ethereum USDC address |

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
  "uptime": 3600,
  "network": "base-sepolia"
}
```

### Verify Payment
```http
POST /verify
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY (optional)
```

**Request:**
```json
{
  "x402Version": 1,
  "paymentPayload": {
    "x402Version": 1,
    "payload": {
      "authorization": {
        "from": "0x...",
        "to": "0x...",
        "value": "1000000",
        "validAfter": "0",
        "validBefore": "9999999999",
        "nonce": "0x..."
      },
      "signature": "0x..."
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base-sepolia",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x...",
    "maxAmountRequired": "1000000",
    "resource": "/api/service",
    "description": "Payment for service",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 300
  }
}
```

**Response:**
```json
{
  "isValid": true,
  "payer": "0x..."
}
```

### Settle Payment
```http
POST /settle
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY (optional)
```

**Request:** Same as verify endpoint

**Response:**
```json
{
  "success": true,
  "transaction": "0x...",
  "network": "base-sepolia",
  "payer": "0x..."
}
```

## 🔒 Security Features

### Rate Limiting

- **General endpoints**: 100 requests/minute
- **Verify endpoint**: 30 requests/minute
- **Settle endpoint**: 10 requests/minute

### Authentication

API key authentication is optional but recommended for production. Include the API key in the `Authorization` header:

```
Authorization: Bearer YOUR_API_KEY
```

### Request Validation

All requests are validated using Joi schemas to ensure:
- Required fields are present
- Data types are correct
- Values are within acceptable ranges

### Transaction Security

- Duplicate transaction detection
- Gas estimation with buffer
- Pre-settlement balance checks
- Merchant authorization validation
- Transaction monitoring and confirmation

## 📊 Monitoring

### Logs

Logs are written to:
- Console (colored output)
- `logs/error.log` (errors only)
- `logs/all.log` (all levels)

Log levels: `error`, `warn`, `info`, `http`, `debug`

### Health Checks

The `/health` endpoint provides service status:
- Response time
- Uptime
- Network configuration
- Service availability

Docker health checks run every 30 seconds.

## 🚢 Deployment

### Docker Production Deployment

1. **Build the image**
   ```powershell
   docker build -t x402-facilitator:latest .
   ```

2. **Run with environment file**
   ```powershell
   docker run -d \
     --name x402-facilitator \
     -p 8080:8080 \
     --env-file .env \
     -v ${PWD}/logs:/app/logs \
     x402-facilitator:latest
   ```

3. **Using Docker Compose**
   ```powershell
   docker-compose up -d
   ```

4. **View logs**
   ```powershell
   docker-compose logs -f
   ```

### Security Best Practices

1. **Never commit `.env` file**
2. **Use strong API keys** (32+ characters)
3. **Secure private keys** (use secrets management)
4. **Enable HTTPS** in production (reverse proxy)
5. **Rotate API keys** regularly
6. **Monitor logs** for suspicious activity
7. **Keep dependencies updated**
8. **Use firewall rules** to restrict access

## 🧪 Testing

### Manual Testing

**Verify endpoint:**
```powershell
curl -X POST http://localhost:8080/verify `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer YOUR_API_KEY" `
  -d '{...}'
```

**Settle endpoint:**
```powershell
curl -X POST http://localhost:8080/settle `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer YOUR_API_KEY" `
  -d '{...}'
```

## 🔧 Troubleshooting

### Service Won't Start

**Check:**
1. Required environment variables are set
2. RPC endpoint is accessible
3. Port 8080 is not in use
4. Logs directory is writable

### Verification Fails

**Check:**
1. Network is supported
2. Signature is valid
3. Token contract address is correct
4. Payer has sufficient balance
5. Allowance is approved

### Settlement Fails

**Check:**
1. Merchant has ETH for gas
2. Payer has approved allowance
3. Token balances are sufficient
4. Network connection is stable
5. Gas prices are reasonable

## 📁 Project Structure

```
x402-facilitator/
├── src/
│   ├── config/           # Configuration management
│   ├── middleware/       # Express middleware
│   │   ├── auth.ts      # API key authentication
│   │   ├── rateLimit.ts # Rate limiting
│   │   └── validation.ts # Request validation
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   │   ├── verification.ts # Payment verification
│   │   └── settlement.ts   # Payment settlement
│   ├── types/           # TypeScript types
│   ├── utils/           # Utility functions
│   │   └── logger.ts    # Winston logger
│   └── index.ts         # Application entry point
├── logs/                # Log files
├── Dockerfile          # Docker configuration
├── docker-compose.yml  # Docker Compose
├── package.json        # Node.js dependencies
├── tsconfig.json       # TypeScript configuration
└── .env.example        # Environment template
```

## 📝 License

ISC

## 🤝 Contributing

Contributions are welcome! Please ensure:
- Code follows TypeScript best practices
- All security checks pass
- Documentation is updated
- Tests are included (when implemented)

## 📧 Support

For issues and questions:
- Check the troubleshooting section
- Review logs for error details
- Open an issue on GitHub

---

Built with ❤️ for secure x402 payments
