#!/bin/bash
# Quick setup script for Nginx HTTP/2 configuration
# Run this after setting up SSL certificates for new domains

set -e

echo "🔧 Nginx HTTP/2 Quick Setup"
echo "================================"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root (sudo)"
    exit 1
fi

# Function to setup a new site
setup_site() {
    local SITE_NAME=$1
    local DOMAIN=$2
    local BACKEND_PORT=$3

    echo ""
    echo "📝 Setting up $SITE_NAME"
    echo "   Domain: $DOMAIN"
    echo "   Backend: localhost:$BACKEND_PORT"

    # Check if certificate exists
    if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        echo "⚠️  SSL certificate not found for $DOMAIN"
        echo "   Run: certbot certonly --nginx -d $DOMAIN"
        return 1
    fi

    # Enable site if config exists
    if [ -f "/etc/nginx/sites-available/$SITE_NAME" ]; then
        ln -sf "/etc/nginx/sites-available/$SITE_NAME" "/etc/nginx/sites-enabled/$SITE_NAME"
        echo "✅ Enabled $SITE_NAME"
    else
        echo "⚠️  Configuration not found: /etc/nginx/sites-available/$SITE_NAME"
    fi
}

# Test Nginx configuration
echo ""
echo "🧪 Testing Nginx configuration..."
if nginx -t 2>&1 | grep -q "successful"; then
    echo "✅ Configuration is valid"
else
    echo "❌ Configuration has errors"
    nginx -t
    exit 1
fi

# Reload Nginx
echo ""
echo "🔄 Reloading Nginx..."
systemctl reload nginx
echo "✅ Nginx reloaded"

# Check HTTP/2 support
echo ""
echo "🔍 Verifying HTTP/2..."
if curl -I --http2 -s https://api.netpay.id/health 2>&1 | grep -q "HTTP/2"; then
    echo "✅ HTTP/2 is working on api.netpay.id"
else
    echo "⚠️  HTTP/2 might not be working properly"
fi

# Show status
echo ""
echo "📊 Nginx Status:"
systemctl status nginx --no-pager -l | head -15

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Useful commands:"
echo "  - Test config:    sudo nginx -t"
echo "  - Reload Nginx:   sudo systemctl reload nginx"
echo "  - View logs:      sudo tail -f /var/log/nginx/*.log"
echo "  - Check HTTP/2:   curl -I --http2 https://api.netpay.id"
