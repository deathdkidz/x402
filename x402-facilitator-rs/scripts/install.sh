#!/bin/bash
# =============================================================================
# x402 Facilitator (Rust) - Auto Install Script
# =============================================================================
#
# This script automatically installs and configures the x402 Facilitator
# on a fresh VPS (Ubuntu 22.04+).
#
# Usage:
#   chmod +x install.sh
#   sudo ./install.sh
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/srv/x402/x402-facilitator-rs"
SERVICE_NAME="x402-facilitator-rs"
DB_NAME="x402_facilitator"
DB_USER="x402_user"
RUST_MIN_VERSION="1.75"

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

prompt_input() {
    local prompt="$1"
    local default="$2"
    local result
    
    if [ -n "$default" ]; then
        read -p "$prompt [$default]: " result
        result="${result:-$default}"
    else
        read -p "$prompt: " result
    fi
    
    echo "$result"
}

prompt_password() {
    local prompt="$1"
    local result
    
    read -sp "$prompt: " result
    echo
    echo "$result"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# =============================================================================
# Installation Functions
# =============================================================================

install_system_packages() {
    log_info "Updating system packages..."
    apt update && apt upgrade -y
    
    log_info "Installing required packages..."
    apt install -y \
        build-essential \
        pkg-config \
        libssl-dev \
        curl \
        git \
        nginx \
        certbot \
        python3-certbot-nginx \
        mysql-server \
        redis-server
    
    log_success "System packages installed"
}

install_rust() {
    log_info "Checking Rust installation..."
    
    if command -v rustc &> /dev/null; then
        local rust_version=$(rustc --version | cut -d' ' -f2)
        log_info "Rust $rust_version is already installed"
    else
        log_info "Installing Rust..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
        log_success "Rust installed"
    fi
    
    # Ensure cargo is in PATH
    export PATH="$HOME/.cargo/bin:$PATH"
}

setup_mysql() {
    log_info "Setting up MySQL..."
    
    # Start MySQL if not running
    systemctl start mysql
    systemctl enable mysql
    
    # Generate a secure password if not provided
    if [ -z "$DB_PASSWORD" ]; then
        DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
        log_warn "Generated MySQL password for $DB_USER: $DB_PASSWORD"
        log_warn "Please save this password securely!"
    fi
    
    # Create database and user
    log_info "Creating database and user..."
    mysql -u root <<EOF
CREATE DATABASE IF NOT EXISTS ${DB_NAME}
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF
    
    log_success "MySQL database '${DB_NAME}' created"
    
    # Run schema
    if [ -f "${INSTALL_DIR}/scripts/schema.sql" ]; then
        log_info "Running database schema..."
        # Update password in schema file temporarily
        sed -i "s/your_secure_password/${DB_PASSWORD}/g" "${INSTALL_DIR}/scripts/schema.sql"
        mysql -u root < "${INSTALL_DIR}/scripts/schema.sql"
        log_success "Database schema applied"
    fi
}

setup_redis() {
    log_info "Setting up Redis..."
    
    # Configure Redis
    cat > /etc/redis/redis.conf.d/x402.conf 2>/dev/null <<EOF || true
# x402 Facilitator Redis Configuration
maxmemory 256mb
maxmemory-policy allkeys-lru
EOF
    
    # Start Redis
    systemctl start redis-server
    systemctl enable redis-server
    
    # Test connection
    if redis-cli ping | grep -q "PONG"; then
        log_success "Redis is running"
    else
        log_error "Redis failed to start"
        exit 1
    fi
}

create_env_file() {
    log_info "Creating environment configuration..."
    
    if [ -f "${INSTALL_DIR}/.env" ]; then
        log_warn ".env file already exists, backing up to .env.backup"
        cp "${INSTALL_DIR}/.env" "${INSTALL_DIR}/.env.backup"
    fi
    
    # Prompt for required configuration
    echo
    log_info "=== Environment Configuration ==="
    echo
    
    # Database password
    if [ -z "$DB_PASSWORD" ]; then
        DB_PASSWORD=$(prompt_password "Enter MySQL password for $DB_USER")
    fi
    
    # Paymaster private keys
    echo
    log_warn "Paymaster wallets pay gas fees for settlements."
    log_warn "You need at least one funded wallet private key."
    echo
    PAYMASTER_KEYS=$(prompt_input "Enter paymaster private keys (comma-separated)" "")
    
    if [ -z "$PAYMASTER_KEYS" ]; then
        log_error "At least one paymaster private key is required!"
        exit 1
    fi
    
    # RPC endpoints
    echo
    log_info "RPC Endpoints (use Alchemy, Infura, or similar)"
    echo
    
    ALCHEMY_API_KEY=$(prompt_input "Enter Alchemy API key (or press Enter to skip)" "")
    
    if [ -n "$ALCHEMY_API_KEY" ]; then
        BASE_RPC="wss://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}"
        BASE_SEPOLIA_RPC="wss://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}"
        ETHEREUM_RPC="wss://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}"
        ETHEREUM_SEPOLIA_RPC="wss://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}"
        OP_MAINNET_RPC="wss://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}"
        OP_SEPOLIA_RPC="wss://opt-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}"
    else
        BASE_RPC=$(prompt_input "Base Mainnet RPC URL" "https://mainnet.base.org")
        BASE_SEPOLIA_RPC=$(prompt_input "Base Sepolia RPC URL" "https://sepolia.base.org")
        ETHEREUM_RPC=$(prompt_input "Ethereum Mainnet RPC URL" "https://eth.llamarpc.com")
        ETHEREUM_SEPOLIA_RPC=$(prompt_input "Ethereum Sepolia RPC URL" "https://rpc.sepolia.org")
        OP_MAINNET_RPC=$(prompt_input "Optimism Mainnet RPC URL" "https://mainnet.optimism.io")
        OP_SEPOLIA_RPC=$(prompt_input "OP Sepolia RPC URL" "https://sepolia.optimism.io")
    fi
    
    # Create .env file
    cat > "${INSTALL_DIR}/.env" <<EOF
# =====================================================
# x402 Facilitator (Rust) - Environment Configuration
# Generated by install.sh on $(date)
# =====================================================

# Server Configuration
PORT=8080
LOG_LEVEL=info

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_CONNECTION_LIMIT=50

# Redis Configuration
REDIS_URL=redis://localhost:6379

# =====================================================
# Network Configuration
# =====================================================
TESTNET_NETWORKS="Base Sepolia,Ethereum Sepolia,OP Sepolia"
MAINNET_NETWORKS="Base,Ethereum,OP Mainnet"

# =====================================================
# RPC Endpoints
# =====================================================
# Testnet RPCs
BASE_SEPOLIA_RPC=${BASE_SEPOLIA_RPC}
ETHEREUM_SEPOLIA_RPC=${ETHEREUM_SEPOLIA_RPC}
OP_SEPOLIA_RPC=${OP_SEPOLIA_RPC}

# Mainnet RPCs
BASE_RPC=${BASE_RPC}
ETHEREUM_RPC=${ETHEREUM_RPC}
OP_MAINNET_RPC=${OP_MAINNET_RPC}

# =====================================================
# Paymaster Configuration
# =====================================================
# Multi-paymaster support for parallel settlement processing
# ⚠️ IMPORTANT: Fund these wallets with gas tokens (ETH) on each network
PAYMASTER_PRIVATE_KEYS=${PAYMASTER_KEYS}

# =====================================================
# Security Configuration
# =====================================================
SECURITY_BAN_THRESHOLD=100
SECURITY_BAN_DURATION_MS=3600000
SECURITY_CLEANUP_INTERVAL_MS=600000

# =====================================================
# Transaction Monitoring
# =====================================================
TRANSACTION_MONITOR_INTERVAL_MS=20000
EOF
    
    # Secure the .env file
    chmod 600 "${INSTALL_DIR}/.env"
    
    log_success "Environment configuration created"
}

build_application() {
    log_info "Building x402 Facilitator..."
    
    cd "${INSTALL_DIR}"
    
    # Source cargo environment
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    fi
    
    # Build release binary
    cargo build --release
    
    log_success "Application built successfully"
}

setup_systemd() {
    log_info "Setting up systemd service..."
    
    # Create service file
    cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=x402 Facilitator Service (Rust)
After=network.target mysql.service redis.service
Requires=mysql.service redis.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/target/release/x402-facilitator
Restart=always
RestartSec=5
Environment=RUST_LOG=info

# Logging
StandardOutput=append:${INSTALL_DIR}/logs/server.log
StandardError=append:${INSTALL_DIR}/logs/error.log

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${INSTALL_DIR}/logs

[Install]
WantedBy=multi-user.target
EOF
    
    # Create logs directory
    mkdir -p "${INSTALL_DIR}/logs"
    
    # Reload systemd
    systemctl daemon-reload
    systemctl enable ${SERVICE_NAME}
    
    log_success "Systemd service configured"
}

setup_nginx() {
    log_info "Setting up Nginx reverse proxy..."
    
    # Prompt for domain
    echo
    DOMAIN=$(prompt_input "Enter your domain name (e.g., api.example.com)" "")
    
    if [ -z "$DOMAIN" ]; then
        log_warn "No domain provided, skipping Nginx setup"
        return
    fi
    
    # Create Nginx config
    cat > /etc/nginx/sites-available/x402-facilitator <<EOF
upstream x402_facilitator {
    server 127.0.0.1:8080;
    keepalive 32;
}

server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://x402_facilitator;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffering
        proxy_buffering off;
    }

    # Block metrics endpoint from public access
    location /metrics {
        deny all;
        return 403;
    }
}
EOF
    
    # Enable site
    ln -sf /etc/nginx/sites-available/x402-facilitator /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    
    # Test and reload Nginx
    nginx -t && systemctl reload nginx
    
    log_success "Nginx configured for ${DOMAIN}"
    
    # Offer to setup SSL
    echo
    SETUP_SSL=$(prompt_input "Setup SSL certificate with Let's Encrypt? (y/n)" "y")
    
    if [ "$SETUP_SSL" = "y" ] || [ "$SETUP_SSL" = "Y" ]; then
        log_info "Setting up SSL certificate..."
        certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --email admin@${DOMAIN} || {
            log_warn "SSL setup failed. You can run manually: sudo certbot --nginx -d ${DOMAIN}"
        }
    fi
}

create_test_merchant() {
    log_info "Creating test merchant..."
    
    # Generate API key
    API_KEY=$(openssl rand -hex 32)
    
    # Insert test merchant
    mysql -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} <<EOF
INSERT INTO merchants (
    auth_address, 
    business_name, 
    api_key, 
    credit_balance, 
    lifetime_credits_purchased,
    status,
    webhook_events
) VALUES (
    '0x0000000000000000000000000000000000000001',
    'Test Merchant',
    '${API_KEY}',
    10000,
    10000,
    'active',
    'settlement.completed,settlement.failed'
);
EOF
    
    log_success "Test merchant created"
    echo
    log_warn "Test Merchant API Key: ${API_KEY}"
    log_warn "Please save this API key securely!"
    echo
}

start_service() {
    log_info "Starting x402 Facilitator service..."
    
    systemctl start ${SERVICE_NAME}
    
    # Wait for service to start
    sleep 3
    
    if systemctl is-active --quiet ${SERVICE_NAME}; then
        log_success "Service started successfully"
    else
        log_error "Service failed to start. Check logs:"
        echo "  sudo journalctl -u ${SERVICE_NAME} -f"
        exit 1
    fi
}

print_summary() {
    echo
    echo "=============================================="
    echo -e "${GREEN}x402 Facilitator Installation Complete!${NC}"
    echo "=============================================="
    echo
    echo "Service Status:"
    systemctl status ${SERVICE_NAME} --no-pager | head -5
    echo
    echo "Useful Commands:"
    echo "  Start:   sudo systemctl start ${SERVICE_NAME}"
    echo "  Stop:    sudo systemctl stop ${SERVICE_NAME}"
    echo "  Restart: sudo systemctl restart ${SERVICE_NAME}"
    echo "  Logs:    sudo journalctl -u ${SERVICE_NAME} -f"
    echo "  Status:  sudo systemctl status ${SERVICE_NAME}"
    echo
    echo "Test Endpoints:"
    echo "  Health:   curl http://localhost:8080/health"
    echo "  Networks: curl http://localhost:8080/networks"
    echo
    echo "Configuration Files:"
    echo "  Env:      ${INSTALL_DIR}/.env"
    echo "  Service:  /etc/systemd/system/${SERVICE_NAME}.service"
    echo "  Logs:     ${INSTALL_DIR}/logs/"
    echo
    echo "Next Steps:"
    echo "  1. Fund paymaster wallets with ETH on each network"
    echo "  2. Create merchant accounts in the database"
    echo "  3. Configure webhooks for your merchants"
    echo
}

# =============================================================================
# Main Installation Flow
# =============================================================================

main() {
    echo
    echo "=============================================="
    echo "  x402 Facilitator (Rust) - Auto Installer"
    echo "=============================================="
    echo
    
    check_root
    
    # Check if we're in the right directory
    if [ ! -f "${INSTALL_DIR}/Cargo.toml" ]; then
        log_error "Please run this script from the x402-facilitator-rs directory"
        log_error "Expected: ${INSTALL_DIR}/Cargo.toml"
        exit 1
    fi
    
    # Installation steps
    install_system_packages
    install_rust
    setup_redis
    create_env_file
    setup_mysql
    build_application
    setup_systemd
    setup_nginx
    create_test_merchant
    start_service
    print_summary
}

# Run main function
main "$@"
