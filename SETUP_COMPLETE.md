# X-402 Dual Application Setup Complete

## ✅ Applications Running

Both applications are now running simultaneously on your server:

### 1. Merchant Demo Store
- **Domain**: demo.novacasino.xyz
- **Port**: 3000
- **PM2 Name**: merchant-demo
- **Purpose**: Customer-facing demo store with X-402 paywall
- **Directory**: `/srv/x402/merchant-demo`

### 2. Merchant Dashboard
- **Domain**: dash.novacasino.xyz
- **Port**: 3001
- **PM2 Name**: merchant-dashboard
- **Purpose**: Admin dashboard for monitoring transactions
- **Directory**: `/srv/x402/merchant-dashboard`

## 📋 Quick Commands

### View All Apps
```bash
pm2 list
```

### View Logs
```bash
pm2 logs merchant-demo
pm2 logs merchant-dashboard
pm2 logs  # View both
```

### Restart Apps
```bash
pm2 restart merchant-demo
pm2 restart merchant-dashboard
pm2 restart all
```

### Stop/Start
```bash
pm2 stop merchant-demo
pm2 start merchant-demo
```

## 🌐 Domain Configuration

### For dash.novacasino.xyz (Dashboard)

1. **Copy Nginx config**:
```bash
sudo cp /srv/x402/merchant-dashboard/nginx-dash.conf /etc/nginx/sites-available/dash.novacasino.xyz
sudo ln -s /etc/nginx/sites-available/dash.novacasino.xyz /etc/nginx/sites-enabled/
```

2. **Setup SSL**:
```bash
sudo certbot --nginx -d dash.novacasino.xyz
```

3. **Reload Nginx**:
```bash
sudo systemctl reload nginx
```

### For demo.novacasino.xyz (Demo Store)

Already configured! If you need to reconfigure, see `/srv/x402/merchant-demo/DOMAIN_SETUP.md`

## 🔑 Dashboard Access

- **URL**: https://dash.novacasino.xyz (after DNS/Nginx setup)
- **Username**: admin
- **Password**: (any password - simple auth)

## 📊 Features

### Merchant Dashboard Features:
- ✅ Simple authentication
- ✅ Merchant information display
- ✅ Transaction statistics (Total, Pending, Completed, Failed)
- ✅ Revenue tracking
- ✅ Recent transactions table
- ✅ Link to demo store
- ✅ Responsive design

### Demo Store Features:
- ✅ Home page with merchant status
- ✅ Interactive tutorial
- ✅ API documentation
- ✅ Demo paywall (cat GIF)
- ✅ Test page for API testing
- ✅ Full X-402 payment flow

## 🔄 Update Workflow

### Update Merchant Demo:
```bash
cd /srv/x402/merchant-demo
# Make your changes
npm run build
pm2 restart merchant-demo
```

### Update Merchant Dashboard:
```bash
cd /srv/x402/merchant-dashboard
# Make your changes
npm run build
pm2 restart merchant-dashboard
```

## 🚀 Auto-Start on Reboot

Both applications are configured to start automatically on server reboot via PM2.

Test with:
```bash
pm2 startup  # Already configured
pm2 save     # Already saved
```

## 📁 Directory Structure

```
/srv/x402/
├── merchant-demo/          # Demo store (port 3000)
│   ├── app/
│   ├── .env.local
│   ├── ecosystem.config.js
│   └── logs/
│
├── merchant-dashboard/     # Admin dashboard (port 3001)
│   ├── app/
│   ├── .env.local
│   ├── ecosystem.config.js
│   ├── nginx-dash.conf
│   ├── DOMAIN_SETUP.md
│   └── logs/
│
└── x402-facilitator/      # Backend API (port 8080)
    └── (facilitator service)
```

## 🔐 Environment Variables

Both apps use the same facilitator configuration:

- `NEXT_PUBLIC_FACILITATOR_URL=https://api.novacasino.xyz`
- `X402_API_KEY=df120001...` (server-side only)
- `NEXT_PUBLIC_MERCHANT_ADDRESS=0x530f81f36d55118d8e829a1f8b15a4d910f43b6e`

## 📈 Next Steps

1. **Configure DNS** for dash.novacasino.xyz to point to your server
2. **Setup Nginx** for dash.novacasino.xyz (see DOMAIN_SETUP.md)
3. **Setup SSL** with certbot
4. **Test both domains** are accessible
5. **Implement real transaction data** (currently mock data in dashboard)

## 🛠️ Troubleshooting

### Check if apps are running:
```bash
pm2 status
curl -I http://localhost:3000  # Demo
curl -I http://localhost:3001  # Dashboard
```

### Check logs for errors:
```bash
pm2 logs merchant-demo --lines 50
pm2 logs merchant-dashboard --lines 50
```

### Restart all apps:
```bash
pm2 restart all
```

### Check Nginx:
```bash
sudo nginx -t
sudo systemctl status nginx
```

## ✨ Summary

You now have a complete X-402 payment system with:
1. **Customer-facing demo store** with payment integration
2. **Merchant admin dashboard** for monitoring
3. **Both running simultaneously** on different ports
4. **Auto-restart on server reboot**
5. **Ready for domain configuration**

🎉 Setup complete!
