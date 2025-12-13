# Nginx HTTP/2 Configuration for x402 Project

This document describes the Nginx reverse proxy setup with HTTP/2 support for the x402 payment infrastructure.

## Architecture

```
Internet (HTTP/2) 
    ↓
Nginx (Port 443, HTTP/2)
    ↓ (HTTP/1.1)
Node.js Applications (localhost:8080, 3000, 3003)
```

## Benefits

1. **HTTP/2 Support**: Multiplexing, header compression, server push
2. **SSL Termination**: Nginx handles HTTPS, apps run on HTTP internally
3. **Performance**: Faster than Node.js native HTTPS
4. **Security**: Better SSL/TLS configuration, security headers
5. **Load Balancing**: Can easily add multiple backend servers
6. **Caching**: Static asset caching for Next.js
7. **Rate Limiting**: Built-in DDoS protection

## Configured Services

### 1. x402-facilitator (api.netpay.id)
- **Frontend**: HTTPS/HTTP2 on port 443
- **Backend**: HTTP on localhost:8080
- **Features**: Rate limiting, WebSocket support, health check optimization

### 2. merchant-demo (merchant.netpay.id)
- **Frontend**: HTTPS/HTTP2 on port 443
- **Backend**: HTTP on localhost:3003
- **Features**: Next.js optimization, static asset caching

### 3. netpay-web (netpay.id)
- **Frontend**: HTTPS/HTTP2 on port 443
- **Backend**: HTTP on localhost:3000
- **Features**: Next.js optimization, static asset caching

## Configuration Files

- `/etc/nginx/sites-available/x402-facilitator` - Main API config
- `/etc/nginx/sites-available/merchant-demo` - Merchant demo config
- `/etc/nginx/sites-available/netpay-web` - Web app config

## SSL Certificates

Certificates are managed by Let's Encrypt and automatically renewed:
- `api.netpay.id`: `/etc/letsencrypt/live/api.netpay.id/`
- Update other domains as needed

## Management Commands

### Start/Stop Nginx
```bash
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl reload nginx  # Reload config without downtime
```

### Test Configuration
```bash
sudo nginx -t
```

### Check Status
```bash
sudo systemctl status nginx
```

### View Logs
```bash
# Access logs
sudo tail -f /var/log/nginx/x402-facilitator.access.log

# Error logs
sudo tail -f /var/log/nginx/x402-facilitator.error.log
```

### Enable/Disable Sites
```bash
# Enable
sudo ln -s /etc/nginx/sites-available/SITE_NAME /etc/nginx/sites-enabled/

# Disable
sudo rm /etc/nginx/sites-enabled/SITE_NAME

# Reload after changes
sudo systemctl reload nginx
```

## Application Updates

When updating the x402-facilitator or Next.js apps:

1. Update application code
2. Rebuild application
3. Restart PM2 process (Nginx stays running)
4. No Nginx changes needed unless config changes

```bash
cd /srv/x402/x402-facilitator
npm run build
pm2 restart x402-facilitator
```

## Port Configuration

### Before (Direct Node.js HTTPS)
- x402-facilitator: Ports 80, 443 (direct)

### After (Nginx Proxy)
- **Nginx**: Ports 80 (redirect), 443 (HTTPS/HTTP2)
- **x402-facilitator**: Port 8080 (localhost only)
- **merchant-demo**: Port 3003 (localhost only)
- **netpay-web**: Port 3000 (localhost only)

## Security Features

1. **TLS 1.2/1.3 Only**: No old SSL/TLS versions
2. **Strong Ciphers**: Modern cipher suites
3. **HSTS**: Strict Transport Security header
4. **Security Headers**: XSS, frame options, content type
5. **Rate Limiting**: DDoS protection
6. **Connection Limits**: Prevent resource exhaustion

## Performance Optimizations

1. **HTTP/2**: Multiple requests over single connection
2. **Gzip Compression**: Reduced bandwidth
3. **Keep-Alive**: Connection reuse
4. **Static Caching**: Next.js assets cached
5. **Buffering**: Optimized proxy buffers

## SSL Certificate Renewal

Certificates auto-renew via certbot. To manually renew:

```bash
sudo certbot renew
sudo systemctl reload nginx
```

## Troubleshooting

### Port 80/443 Already in Use
```bash
# Stop x402-facilitator temporarily
pm2 stop x402-facilitator

# Start Nginx
sudo systemctl start nginx

# Update .env to use port 8080
# Restart facilitator
pm2 restart x402-facilitator
```

### Check HTTP/2 Support
```bash
curl -I --http2 https://api.netpay.id
# Look for "HTTP/2 200" in response
```

### Test from Client
```bash
# Check HTTP/2
curl -I --http2 -s https://api.netpay.id | head -1

# Check headers
curl -I https://api.netpay.id
```

## Adding New Domains

1. Get SSL certificate:
```bash
sudo certbot certonly --nginx -d newdomain.com
```

2. Create Nginx config:
```bash
sudo nano /etc/nginx/sites-available/newdomain
```

3. Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/newdomain /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Monitoring

### Check Nginx Status
```bash
# Process status
ps aux | grep nginx

# Listen ports
ss -tlnp | grep nginx

# Active connections
sudo nginx -V 2>&1 | grep -o with-http_stub_status_module
curl http://localhost/nginx_status  # If enabled
```

### Performance Testing
```bash
# HTTP/2 test
curl --http2 -I https://api.netpay.id

# Load test with HTTP/2
h2load -n 1000 -c 10 https://api.netpay.id/health
```

## References

- [Nginx HTTP/2 Module](http://nginx.org/en/docs/http/ngx_http_v2_module.html)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Let's Encrypt](https://letsencrypt.org/)
