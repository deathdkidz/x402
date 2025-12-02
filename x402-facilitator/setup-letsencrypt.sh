#!/bin/bash

# Setup Let's Encrypt SSL for x402 Facilitator
# This script will install certbot and generate a trusted SSL certificate

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}===========================================================${NC}"
echo -e "${GREEN}x402 Facilitator - Let's Encrypt SSL Setup${NC}"
echo -e "${GREEN}===========================================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: Please run as root (use sudo)${NC}"
    exit 1
fi

# Get domain name
read -p "Enter your domain name (e.g., api.example.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo -e "${RED}Error: Domain name is required${NC}"
    exit 1
fi

# Get email
read -p "Enter your email for Let's Encrypt notifications: " EMAIL
if [ -z "$EMAIL" ]; then
    echo -e "${RED}Error: Email is required${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Installing Certbot...${NC}"

# Install certbot
if ! command -v certbot &> /dev/null; then
    apt update
    apt install -y certbot
    echo -e "${GREEN}✓ Certbot installed${NC}"
else
    echo -e "${GREEN}✓ Certbot already installed${NC}"
fi

echo ""
echo -e "${YELLOW}Obtaining SSL certificate...${NC}"
echo -e "${YELLOW}Note: Make sure port 80 is open and $DOMAIN points to this server${NC}"
echo ""

# Stop x402 service if running
pkill -f "node dist/index.js" 2>/dev/null || true

# Open port 80 for certbot
ufw allow 80/tcp comment 'HTTP for Lets Encrypt' 2>/dev/null || true

# Get certificate using standalone mode
certbot certonly --standalone \
    --preferred-challenges http \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d "$DOMAIN"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ SSL certificate obtained successfully${NC}"
    
    # Update .env file
    ENV_FILE="/srv/x402/x402-facilitator/.env"
    
    echo ""
    echo -e "${YELLOW}Updating .env configuration...${NC}"
    
    # Backup .env
    cp "$ENV_FILE" "$ENV_FILE.backup"
    
    # Update SSL paths
    sed -i "s|^SSL_CERT_PATH=.*|SSL_CERT_PATH=/etc/letsencrypt/live/$DOMAIN/fullchain.pem|" "$ENV_FILE"
    sed -i "s|^SSL_KEY_PATH=.*|SSL_KEY_PATH=/etc/letsencrypt/live/$DOMAIN/privkey.pem|" "$ENV_FILE"
    sed -i "s|^USE_HTTPS=.*|USE_HTTPS=true|" "$ENV_FILE"
    
    echo -e "${GREEN}✓ Configuration updated${NC}"
    
    # Setup auto-renewal
    echo ""
    echo -e "${YELLOW}Setting up automatic renewal...${NC}"
    
    # Create renewal hook script
    cat > /etc/letsencrypt/renewal-hooks/post/restart-x402.sh << 'EOF'
#!/bin/bash
# Restart x402 facilitator after certificate renewal
systemctl restart x402-facilitator 2>/dev/null || pkill -HUP -f "node dist/index.js"
EOF
    
    chmod +x /etc/letsencrypt/renewal-hooks/post/restart-x402.sh
    
    echo -e "${GREEN}✓ Auto-renewal configured${NC}"
    
    # Close port 80 if you don't need HTTP
    read -p "Close port 80? (y/n, recommended if HTTPS-only): " CLOSE_80
    if [[ $CLOSE_80 =~ ^[Yy]$ ]]; then
        ufw delete allow 80/tcp 2>/dev/null || true
        echo -e "${GREEN}✓ Port 80 closed${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}===========================================================${NC}"
    echo -e "${GREEN}SSL Setup Complete!${NC}"
    echo -e "${GREEN}===========================================================${NC}"
    echo ""
    echo -e "Certificate: ${GREEN}/etc/letsencrypt/live/$DOMAIN/fullchain.pem${NC}"
    echo -e "Private Key: ${GREEN}/etc/letsencrypt/live/$DOMAIN/privkey.pem${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "1. Rebuild and restart your service:"
    echo -e "   ${GREEN}cd /srv/x402/x402-facilitator${NC}"
    echo -e "   ${GREEN}npm run build${NC}"
    echo -e "   ${GREEN}npm start${NC}"
    echo ""
    echo -e "2. Test your HTTPS endpoint:"
    echo -e "   ${GREEN}curl https://$DOMAIN:8443/health${NC}"
    echo ""
    echo -e "3. Certificate will auto-renew every 60 days"
    echo ""
    
else
    echo -e "${RED}✗ Failed to obtain certificate${NC}"
    echo ""
    echo -e "${YELLOW}Common issues:${NC}"
    echo "1. Domain doesn't point to this server"
    echo "2. Port 80 is blocked by firewall"
    echo "3. Another service is using port 80"
    echo ""
    echo -e "Check the error above and try again"
    exit 1
fi
