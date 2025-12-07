# Merchant Dashboard Domain Setup Guide

## Quick Setup for dash.novacasino.xyz

### 1. Copy Nginx Configuration

```bash
sudo cp /srv/x402/merchant-dashboard/nginx-dash.conf /etc/nginx/sites-available/dash.novacasino.xyz
sudo ln -s /etc/nginx/sites-available/dash.novacasino.xyz /etc/nginx/sites-enabled/
```

### 2. Test Nginx Configuration

```bash
sudo nginx -t
```

### 3. Setup SSL with Certbot

```bash
sudo certbot --nginx -d dash.novacasino.xyz
```

### 4. Reload Nginx

```bash
sudo systemctl reload nginx
```

### 5. Verify Dashboard is Running

```bash
pm2 status merchant-dashboard
curl -I http://localhost:3001
```

### 6. Test via Domain

```bash
curl -I https://dash.novacasino.xyz
```

## Application Status

- **Application**: merchant-dashboard
- **Port**: 3001
- **Domain**: dash.novacasino.xyz
- **PM2 Name**: merchant-dashboard
- **Build Dir**: /srv/x402/merchant-dashboard/.next

## Management Commands

```bash
# View logs
pm2 logs merchant-dashboard

# Restart
pm2 restart merchant-dashboard

# Stop
pm2 stop merchant-dashboard

# Rebuild and restart
cd /srv/x402/merchant-dashboard
npm run build
pm2 restart merchant-dashboard
```

## Login Credentials

- **Username**: admin
- **Password**: (any password - simple auth for demo)

## Both Apps Running

You now have two apps running simultaneously:

1. **Demo Store** (demo.novacasino.xyz) - Port 3000
2. **Merchant Dashboard** (dash.novacasino.xyz) - Port 3001

Check both:
```bash
pm2 status
```

Should show:
- merchant-demo (port 3000)
- merchant-dashboard (port 3001)
