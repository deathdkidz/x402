# X-402 Dual Application Setup Complete

## Applications Running

### 1. Merchant Demo Store
- **Directory**: `/srv/x402/merchant-demo`
- **Port**: 3000
- **Domain**: demo.novacasino.xyz
- **PM2 Name**: merchant-demo
- **Purpose**: Customer-facing demo store with X-402 payment integration

### 2. Merchant Dashboard
- **Directory**: `/srv/x402/merchant-dashboard`
- **Port**: 3001
- **Domain**: dash.novacasino.xyz
- **PM2 Name**: merchant-dashboard
- **Purpose**: Admin dashboard for monitoring transactions and merchant info

## Current Status

```bash
pm2 list
```

Both applications are:
- ✅ Built and optimized for production
- ✅ Running via PM2 process manager
- ✅ Configured for auto-restart on failure
- ✅ Set to start on system reboot
- ✅ Logging to dedicated log files

## Quick Commands

### View Status
```bash
pm2 list
pm2 monit
```

### View Logs
```bash
# All logs
pm2 logs

# Specific app
pm2 logs merchant-demo
pm2 logs merchant-dashboard
```

### Restart Apps
```bash
# Restart all
pm2 restart all

# Restart specific
pm2 restart merchant-demo
pm2 restart merchant-dashboard
```

### Stop/Start
```bash
pm2 stop merchant-demo
pm2 start merchant-demo
```

## Testing Locally

```bash
# Test demo store
curl http://localhost:3000

# Test dashboard
curl http://localhost:3001
```

## Domain Configuration

### For demo.novacasino.xyz (Port 3000)
Already configured - points to merchant-demo

### For dash.novacasino.xyz (Port 3001)
Setup nginx configuration:

```bash
sudo cp /srv/x402/merchant-dashboard/nginx-dash.conf /etc/nginx/sites-available/dash.novacasino.xyz
sudo ln -s /etc/nginx/sites-available/dash.novacasino.xyz /etc/nginx/sites-enabled/
sudo nginx -t
sudo certbot --nginx -d dash.novacasino.xyz
sudo systemctl reload nginx
```

## Application Access

### Demo Store (demo.novacasino.xyz)
- Public access
- X-402 payment demo
- Tutorial and documentation

### Dashboard (dash.novacasino.xyz)
- Login required
- Username: `admin`
- Password: (any password - simple auth)
- Transaction monitoring
- Revenue analytics
- Merchant information

## Environment Variables

Both apps use `.env.local` files:

**merchant-demo/.env.local**:
```env
NEXT_PUBLIC_MERCHANT_ADDRESS=0x530f81f36d55118d8e829a1f8b15a4d910f43b6e
X402_API_KEY=df120001...
NEXT_PUBLIC_FACILITATOR_URL=https://api.novacasino.xyz
```

**merchant-dashboard/.env.local**:
```env
NEXT_PUBLIC_FACILITATOR_URL=https://api.novacasino.xyz
X402_API_KEY=df120001...
NEXT_PUBLIC_MERCHANT_ADDRESS=0x530f81f36d55118d8e829a1f8b15a4d910f43b6e
```

## Rebuild After Changes

```bash
# Demo store
cd /srv/x402/merchant-demo
npm run build
pm2 restart merchant-demo

# Dashboard
cd /srv/x402/merchant-dashboard
npm run build
pm2 restart merchant-dashboard
```

## PM2 Ecosystem Files

Both apps have `ecosystem.config.js` files for PM2 configuration.

**Key settings**:
- Auto-restart enabled
- 1G memory limit
- Dedicated log files
- Production environment

## Next Steps

1. ✅ Both apps built and running
2. ✅ PM2 configured for auto-start
3. ⏳ Configure nginx for dash.novacasino.xyz
4. ⏳ Setup SSL certificate for dashboard domain
5. ⏳ Test both domains publicly

## Troubleshooting

**If an app won't start**:
```bash
# Check logs
pm2 logs merchant-demo --err

# Check if port is in use
netstat -tlnp | grep 3000
netstat -tlnp | grep 3001

# Rebuild and restart
cd /srv/x402/merchant-demo  # or merchant-dashboard
npm run build
pm2 restart merchant-demo   # or merchant-dashboard
```

**If apps don't auto-start after reboot**:
```bash
pm2 startup
pm2 save
```

## Success Indicators

- ✅ `pm2 list` shows both apps as "online"
- ✅ No rapid restarts (↺ count stays at 0)
- ✅ Memory usage stable (~150-200MB each)
- ✅ HTTP requests return 200 OK
- ✅ Logs show no errors
