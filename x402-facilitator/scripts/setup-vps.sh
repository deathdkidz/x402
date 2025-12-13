#!/bin/bash
#######################################
# x402 Facilitator - Automated VPS Setup
# One-command installation for Ubuntu 22.04/24.04
#######################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/srv/x402"
FACILITATOR_DIR="$PROJECT_DIR/x402-facilitator"
NODE_VERSION="20"

# Function to print colored messages
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to prompt for input with default
prompt_input() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    
    if [ -n "$default" ]; then
        read -p "$prompt [$default]: " input
        eval "$var_name=\${input:-$default}"
    else
        read -p "$prompt: " input
        eval "$var_name=\$input"
    fi
}

# Function to prompt for password
prompt_password() {
    local prompt="$1"
    local var_name="$2"
    
    read -sp "$prompt: " input
    echo
    eval "$var_name=\$input"
}

#######################################
# STEP 0: Pre-flight checks
#######################################
preflight_checks() {
    log_info "Running pre-flight checks..."
    
    # Check if running as root
    if [ "$EUID" -ne 0 ]; then 
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
    
    # Check OS
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        if [[ "$ID" != "ubuntu" ]]; then
            log_warning "This script is designed for Ubuntu. Detected: $ID"
            read -p "Continue anyway? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    fi
    
    log_success "Pre-flight checks passed"
}

#######################################
# STEP 1: Collect configuration
#######################################
collect_config() {
    log_info "=== Configuration Setup ==="
    echo ""
    
    # Domain configuration
    prompt_input "Enter your domain (e.g., api.example.com)" "" DOMAIN
    prompt_input "Enter your email for SSL certificates" "" EMAIL
    
    # Database configuration
    prompt_input "MySQL root password (will be set)" "" DB_ROOT_PASSWORD
    prompt_input "Database name" "x402_facilitator" DB_NAME
    prompt_input "Database user" "x402user" DB_USER
    prompt_password "Database password" DB_PASSWORD
    
    # Facilitator configuration
    prompt_password "Paymaster private key (with 0x prefix)" PAYMASTER_PRIVATE_KEY
    
    # RPC endpoints
    echo ""
    log_info "RPC Configuration (you can use free providers or your own)"
    prompt_input "Base Sepolia RPC (WebSocket recommended)" "wss://base-sepolia.g.alchemy.com/v2/YOUR_KEY" BASE_SEPOLIA_RPC
    prompt_input "Ethereum Sepolia RPC" "wss://eth-sepolia.g.alchemy.com/v2/YOUR_KEY" ETHEREUM_SEPOLIA_RPC
    prompt_input "Base Mainnet RPC" "wss://base-mainnet.g.alchemy.com/v2/YOUR_KEY" BASE_RPC
    prompt_input "Ethereum Mainnet RPC" "wss://eth-mainnet.g.alchemy.com/v2/YOUR_KEY" ETHEREUM_RPC
    
    echo ""
    log_success "Configuration collected"
}

#######################################
# STEP 2: System updates and basic tools
#######################################
update_system() {
    log_info "Updating system packages..."
    apt update
    apt upgrade -y
    apt install -y curl wget git build-essential ufw
    log_success "System updated"
}

#######################################
# STEP 3: Install Node.js
#######################################
install_nodejs() {
    log_info "Installing Node.js $NODE_VERSION..."
    
    if command_exists node; then
        log_warning "Node.js already installed: $(node -v)"
        return
    fi
    
    curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION.x | bash -
    apt install -y nodejs
    
    log_success "Node.js installed: $(node -v)"
}

#######################################
# STEP 4: Install PM2
#######################################
install_pm2() {
    log_info "Installing PM2..."
    
    if command_exists pm2; then
        log_warning "PM2 already installed"
        return
    fi
    
    npm install -g pm2
    pm2 startup systemd -u root --hp /root
    
    log_success "PM2 installed"
}

#######################################
# STEP 5: Install and configure MySQL
#######################################
install_mysql() {
    log_info "Installing MySQL..."
    
    if command_exists mysql; then
        log_warning "MySQL already installed"
    else
        DEBIAN_FRONTEND=noninteractive apt install -y mysql-server
    fi
    
    # Secure MySQL
    log_info "Configuring MySQL..."
    mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '$DB_ROOT_PASSWORD';" || true
    mysql -u root -p"$DB_ROOT_PASSWORD" -e "DELETE FROM mysql.user WHERE User='';" || true
    mysql -u root -p"$DB_ROOT_PASSWORD" -e "DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');" || true
    mysql -u root -p"$DB_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS test;" || true
    mysql -u root -p"$DB_ROOT_PASSWORD" -e "FLUSH PRIVILEGES;" || true
    
    # Create database and user
    log_info "Creating database and user..."
    mysql -u root -p"$DB_ROOT_PASSWORD" << EOF
CREATE DATABASE IF NOT EXISTS $DB_NAME;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
EOF
    
    log_success "MySQL configured"
}

#######################################
# STEP 6: Install Redis
#######################################
install_redis() {
    log_info "Installing Redis..."
    
    if command_exists redis-server; then
        log_warning "Redis already installed"
        return
    fi
    
    apt install -y redis-server
    systemctl enable redis-server
    systemctl start redis-server
    
    log_success "Redis installed and running"
}

#######################################
# STEP 7: Install Nginx
#######################################
install_nginx() {
    log_info "Installing Nginx..."
    
    if command_exists nginx; then
        log_warning "Nginx already installed"
        return
    fi
    
    apt install -y nginx
    systemctl enable nginx
    
    # Don't start yet, will configure first
    log_success "Nginx installed"
}

#######################################
# STEP 8: Install Certbot
#######################################
install_certbot() {
    log_info "Installing Certbot..."
    
    if command_exists certbot; then
        log_warning "Certbot already installed"
        return
    fi
    
    apt install -y certbot python3-certbot-nginx
    log_success "Certbot installed"
}

#######################################
# STEP 9: Clone/Setup project
#######################################
setup_project() {
    log_info "Setting up project..."
    
    # Create project directory
    mkdir -p "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    
    if [ -d "$FACILITATOR_DIR" ]; then
        log_warning "Project directory exists. Backing up..."
        mv "$FACILITATOR_DIR" "${FACILITATOR_DIR}.backup.$(date +%s)"
    fi
    
    # Option 1: Clone from git (if available)
    # Option 2: Copy from current installation
    # For now, we'll assume copying from current installation
    
    log_info "Please provide the project files in $FACILITATOR_DIR"
    log_info "You can:"
    log_info "  1. Clone from git: git clone YOUR_REPO $FACILITATOR_DIR"
    log_info "  2. Upload files via SCP/SFTP to $FACILITATOR_DIR"
    log_info "  3. Copy from another server"
    
    read -p "Press Enter when project files are in place, or 'skip' to continue without files: " response
    
    if [ "$response" = "skip" ]; then
        log_warning "Skipping project setup. You'll need to add files manually."
        return
    fi
    
    # Verify project exists
    if [ ! -d "$FACILITATOR_DIR" ]; then
        log_error "Project directory not found at $FACILITATOR_DIR"
        exit 1
    fi
    
    log_success "Project files ready"
}

#######################################
# STEP 10: Configure environment
#######################################
configure_env() {
    log_info "Configuring environment..."
    
    if [ ! -d "$FACILITATOR_DIR" ]; then
        log_warning "Facilitator directory not found, skipping env setup"
        return
    fi
    
    cd "$FACILITATOR_DIR"
    
    # Create .env file
    cat > .env << EOF
# =====================================================
# x402 Facilitator - Environment Configuration
# Generated by automated setup on $(date)
# =====================================================

# Server Configuration
SERVICE_NAME="x402 Facilitator"
SERVICE_DESCRIPTION="Secure x402 payment facilitator"
PORT=8080
USE_HTTPS=false
NODE_ENV=production

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_CONNECTION_LIMIT=200
DB_QUEUE_LIMIT=200

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Network Configuration
TESTNET_NETWORKS="Base Sepolia,Ethereum Sepolia"
MAINNET_NETWORKS="Base,Ethereum"

# RPC Endpoints
BASE_SEPOLIA_RPC=$BASE_SEPOLIA_RPC
ETHEREUM_SEPOLIA_RPC=$ETHEREUM_SEPOLIA_RPC
BASE_RPC=$BASE_RPC
ETHEREUM_RPC=$ETHEREUM_RPC

# Paymaster Configuration
PAYMASTER_PRIVATE_KEY=$PAYMASTER_PRIVATE_KEY

# USDC Token Addresses
BASE_SEPOLIA_USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e
ETHEREUM_SEPOLIA_USDC=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
BASE_USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
ETHEREUM_USDC=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
EOF

    log_success "Environment configured"
}

#######################################
# STEP 11: Initialize database
#######################################
init_database() {
    log_info "Initializing database..."
    
    if [ ! -d "$FACILITATOR_DIR" ]; then
        log_warning "Facilitator directory not found, skipping database init"
        return
    fi
    
    cd "$FACILITATOR_DIR"
    
    # Run migrations if they exist
    if [ -d "migrations" ]; then
        for migration in migrations/*.sql; do
            if [ -f "$migration" ]; then
                log_info "Running migration: $(basename $migration)"
                mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$migration"
            fi
        done
        log_success "Database migrations completed"
    else
        log_warning "No migrations folder found"
    fi
}

#######################################
# STEP 12: Install dependencies and build
#######################################
build_project() {
    log_info "Installing dependencies and building..."
    
    if [ ! -d "$FACILITATOR_DIR" ]; then
        log_warning "Facilitator directory not found, skipping build"
        return
    fi
    
    cd "$FACILITATOR_DIR"
    
    if [ ! -f "package.json" ]; then
        log_error "package.json not found"
        return
    fi
    
    npm install
    npm run build
    
    log_success "Project built"
}

#######################################
# STEP 13: Configure Nginx
#######################################
configure_nginx() {
    log_info "Configuring Nginx..."
    
    # Create Nginx config
    cat > /etc/nginx/sites-available/x402-facilitator << EOF
# x402 Facilitator - Nginx Configuration with HTTP/2
# Domain: $DOMAIN

# Rate limiting zones
limit_req_zone \$binary_remote_addr zone=api_limit:10m rate=100r/s;
limit_req_zone \$binary_remote_addr zone=api_burst:10m rate=200r/s;
limit_conn_zone \$binary_remote_addr zone=addr:10m;

# Upstream to x402-facilitator
upstream x402_backend {
    server 127.0.0.1:8080 max_fails=3 fail_timeout=30s;
    keepalive 64;
}

# HTTP -> HTTPS Redirect
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS with HTTP/2 (will be enabled after SSL setup)
# Uncomment after running certbot
#server {
#    listen 443 ssl http2;
#    listen [::]:443 ssl http2;
#    server_name $DOMAIN;
#
#    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
#    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
#    
#    ssl_protocols TLSv1.2 TLSv1.3;
#    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
#    ssl_prefer_server_ciphers off;
#    ssl_session_cache shared:SSL:10m;
#    ssl_session_timeout 10m;
#    
#    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
#    add_header X-Frame-Options "SAMEORIGIN" always;
#    add_header X-Content-Type-Options "nosniff" always;
#    
#    gzip on;
#    gzip_vary on;
#    gzip_types text/plain text/css application/json application/javascript;
#
#    access_log /var/log/nginx/x402-facilitator.access.log;
#    error_log /var/log/nginx/x402-facilitator.error.log;
#
#    limit_conn addr 50;
#
#    location / {
#        limit_req zone=api_limit burst=20 nodelay;
#        
#        proxy_pass http://x402_backend;
#        proxy_http_version 1.1;
#        proxy_set_header Host \$host;
#        proxy_set_header X-Real-IP \$remote_addr;
#        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
#        proxy_set_header X-Forwarded-Proto \$scheme;
#        proxy_set_header Connection "";
#        
#        proxy_connect_timeout 60s;
#        proxy_send_timeout 60s;
#        proxy_read_timeout 60s;
#    }
#
#    location = /health {
#        proxy_pass http://x402_backend;
#        proxy_http_version 1.1;
#        proxy_set_header Host \$host;
#        access_log off;
#    }
#}
EOF

    # Enable site
    ln -sf /etc/nginx/sites-available/x402-facilitator /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Test config
    nginx -t
    
    # Start Nginx
    systemctl start nginx
    
    log_success "Nginx configured"
}

#######################################
# STEP 14: Setup SSL with Let's Encrypt
#######################################
setup_ssl() {
    log_info "Setting up SSL certificate..."
    
    # Get SSL certificate
    certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL"
    
    if [ $? -eq 0 ]; then
        log_success "SSL certificate obtained"
        
        # Uncomment HTTPS server block
        sed -i 's/^#server {$/server {/' /etc/nginx/sites-available/x402-facilitator
        sed -i 's/^#    /    /' /etc/nginx/sites-available/x402-facilitator
        sed -i 's/^#}$/}/' /etc/nginx/sites-available/x402-facilitator
        
        # Reload Nginx
        nginx -t && systemctl reload nginx
        
        log_success "HTTPS enabled"
    else
        log_error "Failed to obtain SSL certificate"
        log_warning "You can manually run: certbot --nginx -d $DOMAIN"
    fi
}

#######################################
# STEP 15: Setup firewall
#######################################
setup_firewall() {
    log_info "Configuring firewall..."
    
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
    
    log_success "Firewall configured"
}

#######################################
# STEP 16: Start facilitator with PM2
#######################################
start_facilitator() {
    log_info "Starting x402-facilitator..."
    
    if [ ! -d "$FACILITATOR_DIR" ]; then
        log_warning "Facilitator directory not found, skipping start"
        return
    fi
    
    cd "$FACILITATOR_DIR"
    
    # Stop if already running
    pm2 delete x402-facilitator 2>/dev/null || true
    
    # Start with PM2
    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js
    else
        pm2 start dist/index.js --name x402-facilitator
    fi
    
    pm2 save
    
    log_success "Facilitator started"
}

#######################################
# STEP 17: Final verification
#######################################
verify_installation() {
    log_info "Verifying installation..."
    
    echo ""
    log_info "Checking services..."
    
    # Check MySQL
    if systemctl is-active --quiet mysql; then
        log_success "MySQL is running"
    else
        log_error "MySQL is not running"
    fi
    
    # Check Redis
    if systemctl is-active --quiet redis-server; then
        log_success "Redis is running"
    else
        log_error "Redis is not running"
    fi
    
    # Check Nginx
    if systemctl is-active --quiet nginx; then
        log_success "Nginx is running"
    else
        log_error "Nginx is not running"
    fi
    
    # Check PM2
    if pm2 list | grep -q "x402-facilitator"; then
        log_success "x402-facilitator is running"
    else
        log_warning "x402-facilitator is not running"
    fi
    
    echo ""
    log_info "Testing endpoints..."
    sleep 3
    
    # Test HTTP
    if curl -s http://localhost:8080/health > /dev/null; then
        log_success "Backend health check passed (localhost:8080)"
    else
        log_warning "Backend health check failed"
    fi
    
    # Test HTTPS (if SSL is set up)
    if curl -k -s https://$DOMAIN/health > /dev/null 2>&1; then
        log_success "HTTPS health check passed"
    else
        log_warning "HTTPS health check failed (might be normal if SSL not yet configured)"
    fi
}

#######################################
# STEP 18: Print summary
#######################################
print_summary() {
    echo ""
    echo "=========================================="
    log_success "Installation Complete!"
    echo "=========================================="
    echo ""
    echo "📋 Configuration Summary:"
    echo "  Domain:        $DOMAIN"
    echo "  Project Dir:   $FACILITATOR_DIR"
    echo "  Database:      $DB_NAME"
    echo "  Backend Port:  8080 (localhost)"
    echo "  Frontend Port: 443 (HTTPS)"
    echo ""
    echo "🔧 Useful Commands:"
    echo "  View logs:     pm2 logs x402-facilitator"
    echo "  Restart:       pm2 restart x402-facilitator"
    echo "  Status:        pm2 status"
    echo "  Nginx logs:    tail -f /var/log/nginx/x402-facilitator.*.log"
    echo "  Reload Nginx:  systemctl reload nginx"
    echo ""
    echo "🌐 Access Your Facilitator:"
    echo "  https://$DOMAIN"
    echo "  https://$DOMAIN/health"
    echo ""
    echo "📝 Next Steps:"
    echo "  1. Add additional paymaster wallets to .env if needed"
    echo "  2. Configure merchant accounts in database"
    echo "  3. Set up monitoring and alerts"
    echo "  4. Configure backup strategy"
    echo ""
    echo "📚 Documentation:"
    echo "  $FACILITATOR_DIR/docs/"
    echo ""
}

#######################################
# Main execution
#######################################
main() {
    clear
    echo "=========================================="
    echo "  x402 Facilitator - Automated VPS Setup"
    echo "=========================================="
    echo ""
    
    preflight_checks
    collect_config
    
    log_info "Starting installation..."
    echo ""
    
    update_system
    install_nodejs
    install_pm2
    install_mysql
    install_redis
    install_nginx
    install_certbot
    setup_firewall
    setup_project
    configure_env
    init_database
    build_project
    configure_nginx
    setup_ssl
    start_facilitator
    verify_installation
    print_summary
    
    log_success "All done! 🎉"
}

# Run main function
main
