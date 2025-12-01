# Quick Start Guide

## 🚀 Get Running in 5 Minutes

### Step 1: Install Dependencies

```powershell
npm install
```

### Step 2: Configure Environment

Copy the example environment file:
```powershell
cp .env.example .env
```

Edit `.env` and set these required values:
```env
API_KEY=generate-a-secure-random-key-here
RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
MERCHANT_PRIVATE_KEY=your-wallet-private-key
```

**Security Note**: Never commit your `.env` file or share your private key!

### Step 3: Start the Service

**Development mode** (with hot reload):
```powershell
npm run dev
```

**Production mode**:
```powershell
npm run build
npm start
```

**Docker** (recommended for production):
```powershell
docker-compose up -d
```

### Step 4: Test It Works

```powershell
curl http://localhost:8080/health
```

You should see:
```json
{
  "status": "ok",
  "service": "x402-facilitator",
  ...
}
```

## 🔑 Get Your API Keys

### Alchemy RPC URL
1. Go to [alchemy.com](https://alchemy.com)
2. Create a free account
3. Create a new app for "Base Sepolia"
4. Copy the HTTPS URL
5. Paste into `RPC_URL` in your `.env`

### Generate API Key
```powershell
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

Or use any secure random string generator.

### Get Testnet USDC

For Base Sepolia testing:
1. Get testnet ETH from [Base Sepolia Faucet](https://faucet.quicknode.com/base/sepolia)
2. Use testnet USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## 📡 Test the Endpoints

### Test Verification

```powershell
curl -X POST http://localhost:8080/verify `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer YOUR_API_KEY" `
  -d '{
    "x402Version": 1,
    "paymentPayload": { ... },
    "paymentRequirements": { ... }
  }'
```

### Test Settlement

```powershell
curl -X POST http://localhost:8080/settle `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer YOUR_API_KEY" `
  -d '{
    "x402Version": 1,
    "paymentPayload": { ... },
    "paymentRequirements": { ... }
  }'
```

## 🐛 Common Issues

### "Cannot find module 'dotenv'"
Run `npm install` to install dependencies.

### "Missing required environment variables"
Check your `.env` file has all required variables set.

### "Connection refused"
Ensure your RPC_URL is correct and accessible.

### Port already in use
Change the port in `.env`:
```env
PORT=3000
```

## 📖 Next Steps

- Read the [full README](README.md) for detailed documentation
- Configure additional networks and tokens
- Set up production deployment with Docker
- Enable monitoring and alerting
- Review security best practices

## 🔒 Security Checklist

- [ ] Generated strong API key (32+ characters)
- [ ] Private key stored securely (not in code)
- [ ] `.env` file added to `.gitignore`
- [ ] Rate limiting configured
- [ ] HTTPS enabled (production)
- [ ] Logs monitoring set up

---

Need help? Check the troubleshooting section in the main README.
