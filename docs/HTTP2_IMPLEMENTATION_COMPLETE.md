# Nginx HTTP/2 Implementation - Quick Reference

## ✅ Implementation Complete

Your x402 infrastructure now uses Nginx as a reverse proxy with HTTP/2 support.

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│  Internet (HTTP/2 Clients)                  │
└───────────────┬─────────────────────────────┘
                │
                │ HTTPS (TLS 1.2/1.3, HTTP/2)
                ↓
┌─────────────────────────────────────────────┐
│  Nginx Reverse Proxy                        │
│  - Port 80  → Redirect to HTTPS             │
│  - Port 443 → HTTP/2, SSL termination       │
│  - Rate limiting, caching, compression      │
└───────────────┬─────────────────────────────┘
                │
                │ HTTP/1.1 (localhost only)
                ↓
┌─────────────────────────────────────────────┐
│  Node.js Applications                       │
│  - x402-facilitator: localhost:8080         │
│  - merchant-demo:    localhost:3003         │
│  - netpay-web:       localhost:3000         │
└─────────────────────────────────────────────┘
```

## Key Benefits

1. ✅ **HTTP/2 Support** - Multiplexing, header compression
2. ✅ **SSL Termination** - Nginx handles HTTPS/TLS
3. ✅ **Performance** - Faster than Node.js native HTTPS
4. ✅ **Security** - Modern TLS, security headers, HSTS
5. ✅ **Rate Limiting** - Built-in DDoS protection
6. ✅ **Caching** - Static asset optimization
7. ✅ **Monitoring** - Centralized access/error logs

## Active Configuration

### x402-facilitator (api.netpay.id)
- **Status**: ✅ Active and verified
- **Frontend**: https://api.netpay.id (HTTP/2)
- **Backend**: http://localhost:8080
- **Config**: `/etc/nginx/sites-available/x402-facilitator`
- **Logs**: `/var/log/nginx/x402-facilitator.{access,error}.log`

### merchant-demo (not yet enabled)
- **Config**: `/etc/nginx/sites-available/merchant-demo`
- **Domain**: Update to your domain
- **Backend**: localhost:3003
- **Enable**: `ln -s /etc/nginx/sites-available/merchant-demo /etc/nginx/sites-enabled/`

### netpay-web (not yet enabled)
- **Config**: `/etc/nginx/sites-available/netpay-web`
- **Domain**: Update to your domain
- **Backend**: localhost:3000
- **Enable**: `ln -s /etc/nginx/sites-available/netpay-web /etc/nginx/sites-enabled/`

## Quick Commands

### Nginx Management
```bash
# Reload config (no downtime)
sudo systemctl reload nginx

# Restart Nginx
sudo systemctl restart nginx

# Check status
sudo systemctl status nginx

# Test configuration
sudo nginx -t
```

### View Logs
```bash
# Real-time access logs
sudo tail -f /var/log/nginx/x402-facilitator.access.log

# Real-time error logs
sudo tail -f /var/log/nginx/x402-facilitator.error.log

# All Nginx logs
sudo tail -f /var/log/nginx/*.log
```

### Test HTTP/2
```bash
# Check HTTP/2 support
curl -I --http2 https://api.netpay.id/health

# Should show: HTTP/2 200

# Verbose test
curl -v --http2 https://api.netpay.id 2>&1 | grep "HTTP/2"
```

### Application Management
```bash
# Applications run independently of Nginx
pm2 list
pm2 restart x402-facilitator
pm2 logs x402-facilitator
```

## Configuration Changes Made

### 1. Environment (.env)
```diff
- PORT=80
- HTTPS_PORT=443
- USE_HTTPS=true
+ PORT=8080
+ USE_HTTPS=false  # Nginx handles HTTPS now
```

### 2. Port Bindings
- **Before**: Node.js on ports 80, 443
- **After**: Nginx on 80, 443 → Node.js on 8080

## Verification Results

```bash
$ curl -I --http2 https://api.netpay.id/health
HTTP/2 200 
server: nginx/1.24.0 (Ubuntu)
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-frame-options: SAMEORIGIN
x-content-type-options: nosniff
```

✅ HTTP/2 is working
✅ Security headers are active
✅ SSL/TLS is properly configured

## Performance Features Enabled

1. **HTTP/2 Multiplexing** - Multiple requests over single connection
2. **Gzip Compression** - Reduced bandwidth usage
3. **Keep-Alive** - Connection reuse between Nginx ↔ Node.js
4. **Rate Limiting** - 100 req/s with burst support
5. **Connection Limits** - Max 50 connections per IP
6. **Static Caching** - Next.js assets cached (when enabled)

## Security Features

1. **TLS 1.2/1.3** - Modern encryption only
2. **Strong Ciphers** - ECDHE, AES-GCM, ChaCha20
3. **HSTS** - 2 years with preload
4. **Security Headers** - XSS, frame, content-type protection
5. **Rate Limiting** - DDoS mitigation
6. **SSL Stapling** - Faster certificate validation

## Monitoring

### Check System Status
```bash
# All services
pm2 list
sudo systemctl status nginx

# Port bindings
ss -tlnp | grep -E ':(80|443|8080)'

# Nginx workers
ps aux | grep nginx
```

### Log Analysis
```bash
# Count requests by status code
sudo awk '{print $9}' /var/log/nginx/x402-facilitator.access.log | sort | uniq -c

# Top 10 IPs
sudo awk '{print $1}' /var/log/nginx/x402-facilitator.access.log | sort | uniq -c | sort -rn | head

# Recent errors
sudo tail -50 /var/log/nginx/x402-facilitator.error.log
```

## Adding New Domains

1. **Get SSL certificate**:
```bash
sudo certbot certonly --nginx -d newdomain.com
```

2. **Create Nginx config** (copy from templates)
3. **Enable site**:
```bash
sudo ln -s /etc/nginx/sites-available/newdomain /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Troubleshooting

### Port Already in Use
```bash
# Find what's using port 80/443
sudo ss -tlnp | grep -E ':(80|443)'

# Stop conflicting service
pm2 stop x402-facilitator  # if needed
sudo systemctl stop nginx  # if needed
```

### Configuration Error
```bash
# Test config
sudo nginx -t

# Check detailed error
sudo nginx -t 2>&1 | less
```

### HTTP/2 Not Working
```bash
# Verify SSL is configured
openssl s_client -connect api.netpay.id:443 -alpn h2

# Should show: "ALPN protocol: h2"
```

### Backend Not Responding
```bash
# Check app is running
pm2 list

# Test backend directly
curl http://localhost:8080/health

# Check Nginx upstream
sudo tail -f /var/log/nginx/x402-facilitator.error.log
```

## Documentation

- Full setup guide: `/srv/x402/docs/NGINX_HTTP2_SETUP.md`
- Nginx configs: `/etc/nginx/sites-available/`
- Setup script: `/srv/x402/scripts/setup-nginx-http2.sh`

## Next Steps (Optional)

1. **Enable merchant-demo and netpay-web** once domains are configured
2. **Set up monitoring** with Prometheus/Grafana
3. **Configure SSL certificate auto-renewal** (already done with certbot)
4. **Add HTTP/2 Server Push** for critical assets (if needed)
5. **Enable Nginx cache** for API responses (if appropriate)

## Support

For issues or questions:
1. Check logs: `/var/log/nginx/*.log`
2. Test config: `sudo nginx -t`
3. Verify HTTP/2: `curl -I --http2 https://api.netpay.id`

---

**Status**: ✅ Production Ready
**HTTP/2**: ✅ Enabled
**SSL/TLS**: ✅ Active
**Performance**: ✅ Optimized
**Security**: ✅ Hardened
