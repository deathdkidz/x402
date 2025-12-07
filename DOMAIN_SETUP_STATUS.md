# Domain Setup Complete

## ✅ Nginx Configuration Done

Both domains have been configured in Nginx:

### 1. demo.novacasino.xyz → Port 3000 (merchant-demo)
- **Config**: `/etc/nginx/sites-available/demo.novacasino.xyz`
- **SSL**: Already configured with Let's Encrypt
- **Status**: Ready (but getting CloudFlare 521 error - see below)

### 2. dash.novacasino.xyz → Port 3001 (merchant-dashboard)
- **Config**: `/etc/nginx/sites-available/dash.novacasino.xyz`
- **SSL**: Pending (DNS not configured yet)
- **Status**: Nginx configured, waiting for DNS

## 🌐 DNS Configuration Needed

### For dash.novacasino.xyz

You need to add an A record in your DNS settings:

```
Type: A
Name: dash
Value: YOUR_SERVER_IP (same as demo.novacasino.xyz)
TTL: 300 (or Auto)
```

**If using CloudFlare**:
1. Go to CloudFlare dashboard
2. Select novacasino.xyz domain
3. Go to DNS → Records
4. Add new A record:
   - Type: A
   - Name: dash
   - IPv4 address: (your server IP)
   - Proxy status: Proxied (orange cloud)

## 🔒 SSL Certificate for dash.novacasino.xyz

After DNS is configured, run:

```bash
# Wait 5-10 minutes for DNS propagation first
certbot --nginx -d dash.novacasino.xyz --non-interactive --agree-tos --email admin@novacasino.xyz --redirect
```

Or expand existing certificate to include both:

```bash
certbot --nginx -d demo.novacasino.xyz -d dash.novacasino.xyz --expand --non-interactive --agree-tos --email admin@novacasino.xyz --redirect
```

## 🔧 Current Status

### Applications Running
```bash
pm2 list
```

- ✅ merchant-demo (port 3000) - Online
- ✅ merchant-dashboard (port 3001) - Online

### Nginx Configs
```bash
ls -la /etc/nginx/sites-enabled/
```

- ✅ demo.novacasino.xyz → localhost:3000
- ✅ dash.novacasino.xyz → localhost:3001

### Local Access Working
```bash
curl http://localhost:3000  # ✅ Works
curl http://localhost:3001  # ✅ Works
```

## ⚠️ CloudFlare 521 Error for demo.novacasino.xyz

If you're getting a 521 error, it means CloudFlare can't connect to your server.

**Possible causes**:

1. **Firewall blocking CloudFlare IPs**
   ```bash
   # Check if UFW is blocking
   sudo ufw status
   
   # Allow CloudFlare IPs (if needed)
   sudo ufw allow from 173.245.48.0/20
   sudo ufw allow from 103.21.244.0/22
   sudo ufw allow from 103.22.200.0/22
   sudo ufw allow from 103.31.4.0/22
   sudo ufw allow from 141.101.64.0/18
   sudo ufw allow from 108.162.192.0/18
   sudo ufw allow from 190.93.240.0/20
   ```

2. **Nginx not listening correctly**
   ```bash
   # Check Nginx is running
   sudo systemctl status nginx
   
   # Check what's listening on port 80/443
   sudo netstat -tlnp | grep nginx
   ```

3. **SSL/TLS mode in CloudFlare**
   - Go to CloudFlare → SSL/TLS
   - Set mode to "Full" or "Full (strict)"
   - NOT "Flexible"

## ✅ Testing Checklist

### Local Tests (Should work now)
```bash
# Test apps directly
curl -I http://localhost:3000
curl -I http://localhost:3001

# Test through Nginx
curl -I -H "Host: demo.novacasino.xyz" http://localhost
curl -I -H "Host: dash.novacasino.xyz" http://localhost
```

### After DNS Setup for dash.novacasino.xyz
```bash
# Test DNS resolution
nslookup dash.novacasino.xyz

# Test HTTP (before SSL)
curl -I http://dash.novacasino.xyz

# Test HTTPS (after SSL setup)
curl -I https://dash.novacasino.xyz
```

## 📁 Configuration Files

```
/etc/nginx/sites-available/demo.novacasino.xyz
/etc/nginx/sites-available/dash.novacasino.xyz
/etc/nginx/sites-enabled/demo.novacasino.xyz → sites-available/demo.novacasino.xyz
/etc/nginx/sites-enabled/dash.novacasino.xyz → sites-available/dash.novacasino.xyz
```

## 🚀 Next Steps

1. ✅ **Nginx configured** for both domains
2. ⏳ **Add DNS record** for dash.novacasino.xyz
3. ⏳ **Setup SSL** for dash.novacasino.xyz (after DNS)
4. ⏳ **Fix CloudFlare 521** error for demo.novacasino.xyz
5. ⏳ **Test both domains** publicly

## 🛠️ Useful Commands

```bash
# Reload Nginx after config changes
sudo systemctl reload nginx

# Test Nginx config
sudo nginx -t

# View Nginx error logs
sudo tail -f /var/log/nginx/error.log

# View domain-specific logs
sudo tail -f /var/log/nginx/demo.novacasino.xyz-error.log
sudo tail -f /var/log/nginx/dash.novacasino.xyz-error.log

# Check SSL certificates
sudo certbot certificates

# Renew SSL certificates
sudo certbot renew --dry-run
```

## Summary

**Current State**:
- ✅ Both apps running on ports 3000 and 3001
- ✅ Nginx configured for both domains
- ✅ demo.novacasino.xyz has SSL certificate
- ⏳ dash.novacasino.xyz needs DNS A record
- ⏳ Need to fix CloudFlare 521 error

**Access URLs** (after setup):
- Demo Store: https://demo.novacasino.xyz
- Admin Dashboard: https://dash.novacasino.xyz
