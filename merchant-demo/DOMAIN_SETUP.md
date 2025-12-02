# Domain Setup Guide for demo.novacasino.xyz

## Current Status

✅ Nginx configuration created and enabled  
✅ Reverse proxy configured for localhost:3003  
⏳ DNS configuration needed  
⏳ SSL certificate pending (requires DNS first)

## Server Information

- **Server IP (IPv4)**: `62.169.27.7`
- **Server IP (IPv6)**: `2a02:c207:2291:2557::1`
- **App Port**: `3003`
- **Domain**: `demo.novacasino.xyz`

## Next Steps

### 1. Configure DNS

You need to add the following DNS records for `demo.novacasino.xyz`:

**Option A: IPv4 Only**
```
Type: A
Name: demo
Value: 62.169.27.7
TTL: 3600 (or Auto)
```

**Option B: IPv4 + IPv6 (Recommended)**
```
Type: A
Name: demo
Value: 62.169.27.7

Type: AAAA
Name: demo
Value: 2a02:c207:2291:2557::1
```

### 2. Wait for DNS Propagation

After adding the DNS records:
- Wait 5-15 minutes for DNS propagation
- Verify with: `dig demo.novacasino.xyz` or `nslookup demo.novacasino.xyz`

### 3. Install SSL Certificate

Once DNS is pointing to your server, run:

```bash
sudo certbot --nginx -d demo.novacasino.xyz --redirect
```

This will:
- Obtain a free SSL certificate from Let's Encrypt
- Automatically configure nginx for HTTPS
- Set up automatic HTTP to HTTPS redirect
- Enable automatic certificate renewal

### 4. Start Your Application

Make sure your Next.js app is running on port 3003:

```bash
cd /srv/x402/merchant-demo
npm run dev
# or for production:
npm run build && npm start
```

## Testing

After DNS and SSL are configured:

1. **HTTP**: http://demo.novacasino.xyz → Should redirect to HTTPS
2. **HTTPS**: https://demo.novacasino.xyz → Your app should load

## Nginx Configuration

The nginx configuration file is located at:
- `/etc/nginx/sites-available/demo.novacasino.xyz`
- Symlinked to `/etc/nginx/sites-enabled/demo.novacasino.xyz`

### View Configuration
```bash
cat /etc/nginx/sites-available/demo.novacasino.xyz
```

### Test Configuration
```bash
sudo nginx -t
```

### Reload After Changes
```bash
sudo systemctl reload nginx
```

## Troubleshooting

### Check if App is Running
```bash
curl http://localhost:3003
```

### Check Nginx Status
```bash
sudo systemctl status nginx
```

### View Nginx Logs
```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Check DNS Resolution
```bash
dig demo.novacasino.xyz
nslookup demo.novacasino.xyz
```

### Test HTTP Connection
```bash
curl -I http://demo.novacasino.xyz
```

## Production Deployment

For production, consider using PM2 to keep your app running:

```bash
# Install PM2 globally
npm install -g pm2

# Build the app
cd /srv/x402/merchant-demo
npm run build

# Start with PM2
pm2 start npm --name "merchant-demo" -- start

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup
```

## SSL Certificate Renewal

Certbot automatically renews certificates. To test renewal:

```bash
sudo certbot renew --dry-run
```

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify DNS is pointing to `62.169.27.7`
3. Ensure port 80 and 443 are open in your firewall
4. Check application logs and nginx logs
