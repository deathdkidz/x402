# Automated VPS Setup for x402 Facilitator

This script automates the complete setup of x402-facilitator on a fresh Ubuntu VPS.

## What It Does

The script automatically:

1. ✅ Updates system packages
2. ✅ Installs Node.js 20
3. ✅ Installs and configures PM2
4. ✅ Installs and secures MySQL
5. ✅ Installs Redis
6. ✅ Installs Nginx with HTTP/2
7. ✅ Installs Certbot for SSL
8. ✅ Configures firewall (UFW)
9. ✅ Sets up project files
10. ✅ Configures environment variables
11. ✅ Runs database migrations
12. ✅ Builds the project
13. ✅ Configures Nginx reverse proxy
14. ✅ Sets up Let's Encrypt SSL
15. ✅ Starts facilitator with PM2
16. ✅ Verifies installation

## Prerequisites

- Fresh Ubuntu 22.04 or 24.04 VPS
- Root access (or sudo)
- Domain pointing to VPS IP
- Email for SSL certificates
- Required credentials:
  - Database passwords
  - Paymaster private key
  - RPC endpoints

## Quick Start

### Method 1: Direct Download and Run

```bash
# Download script
curl -O https://raw.githubusercontent.com/YOUR_REPO/main/scripts/setup-vps.sh

# Make executable
chmod +x setup-vps.sh

# Run as root
sudo ./setup-vps.sh
```

### Method 2: From Existing Installation

```bash
# Copy script to new VPS
scp /srv/x402/x402-facilitator/scripts/setup-vps.sh root@NEW_VPS_IP:/root/

# SSH to new VPS
ssh root@NEW_VPS_IP

# Run script
cd /root
chmod +x setup-vps.sh
./setup-vps.sh
```

### Method 3: All-in-One Command

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/scripts/setup-vps.sh | sudo bash
```

## What You'll Be Asked

The script will prompt you for:

1. **Domain**: Your API domain (e.g., api.example.com)
2. **Email**: For SSL certificate notifications
3. **Database Info**:
   - Root password (for MySQL setup)
   - Database name (default: x402_facilitator)
   - Database user (default: x402user)
   - Database password
4. **Paymaster Private Key**: With 0x prefix
5. **RPC Endpoints**:
   - Base Sepolia RPC
   - Ethereum Sepolia RPC
   - Base Mainnet RPC
   - Ethereum Mainnet RPC

## Example Run

```bash
$ sudo ./setup-vps.sh

==========================================
  x402 Facilitator - Automated VPS Setup
==========================================

[INFO] Running pre-flight checks...
[SUCCESS] Pre-flight checks passed

=== Configuration Setup ===

Enter your domain (e.g., api.example.com): api.myproject.com
Enter your email for SSL certificates: admin@myproject.com
MySQL root password (will be set): ********
Database name [x402_facilitator]: 
Database user [x402user]: 
Database password: ********
Paymaster private key (with 0x prefix): ********

[INFO] RPC Configuration
Base Sepolia RPC [wss://base-sepolia.g.alchemy.com/v2/YOUR_KEY]: wss://...
...

[INFO] Starting installation...
[INFO] Updating system packages...
[SUCCESS] System updated
...
```

## After Installation

The script will create:

```
/srv/x402/
└── x402-facilitator/
    ├── .env                 # Generated configuration
    ├── dist/                # Built JavaScript
    ├── node_modules/        # Dependencies
    ├── logs/                # PM2 logs
    └── ...
```

Configuration files:
- `.env` - Environment variables
- `/etc/nginx/sites-available/x402-facilitator` - Nginx config
- `/etc/letsencrypt/live/YOUR_DOMAIN/` - SSL certificates

## Transferring Project Files

The script needs your project files. You have options:

### Option 1: Clone from Git

```bash
# Before running script, or when prompted:
cd /srv/x402
git clone https://github.com/YOUR_REPO/x402-facilitator.git
```

### Option 2: SCP from Existing Server

```bash
# From your current server
cd /srv/x402
tar -czf x402-facilitator.tar.gz x402-facilitator/
scp x402-facilitator.tar.gz root@NEW_VPS_IP:/srv/x402/

# On new VPS
cd /srv/x402
tar -xzf x402-facilitator.tar.gz
```

### Option 3: RSYNC (Recommended)

```bash
# From your current server
rsync -avz --exclude 'node_modules' --exclude '.env' \
  /srv/x402/x402-facilitator/ root@NEW_VPS_IP:/srv/x402/x402-facilitator/
```

## Verification

After installation, check:

```bash
# Service status
pm2 status
systemctl status nginx
systemctl status mysql
systemctl status redis

# Test endpoints
curl http://localhost:8080/health
curl https://api.your-domain.com/health

# View logs
pm2 logs x402-facilitator
tail -f /var/log/nginx/x402-facilitator.access.log
```

## Post-Installation Tasks

1. **Configure Merchants**:
```bash
cd /srv/x402/x402-facilitator
node scripts/generate-merchant-v2.mjs
```

2. **Add Additional Paymaster Wallets** (optional):
```bash
nano /srv/x402/x402-facilitator/.env
# Add PAYMASTER_PRIVATE_KEY_2, _3, etc.
pm2 restart x402-facilitator
```

3. **Setup Monitoring**:
```bash
cd /srv/x402/x402-facilitator
bash scripts/setup-monitoring.sh
```

4. **Configure Backups**:
```bash
# Database backup cron
crontab -e
# Add: 0 2 * * * mysqldump -u root -p'PASSWORD' x402_facilitator > /backup/db-$(date +\%Y\%m\%d).sql
```

## Troubleshooting

### SSL Certificate Failed
```bash
# Manual SSL setup
certbot --nginx -d api.your-domain.com
systemctl reload nginx
```

### Facilitator Won't Start
```bash
# Check logs
pm2 logs x402-facilitator

# Check environment
cd /srv/x402/x402-facilitator
cat .env

# Rebuild
npm run build
pm2 restart x402-facilitator
```

### Database Connection Error
```bash
# Test connection
mysql -u x402user -p x402_facilitator

# Check credentials in .env
nano /srv/x402/x402-facilitator/.env
```

### Port Already in Use
```bash
# Check what's using port 8080
ss -tlnp | grep :8080

# Kill if needed
pkill -f "node.*8080"
```

## Security Notes

⚠️ **Important Security Steps After Installation:**

1. **Change Default Passwords**: Update all database passwords
2. **Backup Private Keys**: Store paymaster keys securely
3. **Setup Firewall Rules**: Only allow necessary ports
4. **Enable Fail2Ban**: Protect against brute force
5. **Regular Updates**: Keep system packages updated
6. **Monitor Logs**: Set up log monitoring and alerts

## Customization

To customize the installation, edit the script variables:

```bash
# At the top of setup-vps.sh
PROJECT_DIR="/srv/x402"              # Change install location
NODE_VERSION="20"                     # Change Node.js version
FACILITATOR_DIR="$PROJECT_DIR/..."   # Change app directory
```

## Uninstall

To remove everything:

```bash
# Stop services
pm2 delete x402-facilitator
systemctl stop nginx

# Remove files
rm -rf /srv/x402
rm /etc/nginx/sites-enabled/x402-facilitator
rm /etc/nginx/sites-available/x402-facilitator

# Remove packages (optional)
apt remove nginx mysql-server redis-server
```

## Support

If you encounter issues:

1. Check the log files in `/var/log/nginx/` and `pm2 logs`
2. Verify DNS is pointing to your VPS
3. Ensure all ports (80, 443, 8080) are accessible
4. Check firewall rules: `ufw status`
5. Test backend directly: `curl http://localhost:8080/health`

## Environment Variables Reference

The script creates an `.env` file with these variables:

```env
SERVICE_NAME="x402 Facilitator"
SERVICE_DESCRIPTION="Secure x402 payment facilitator"
PORT=8080                           # Backend port
USE_HTTPS=false                      # Nginx handles SSL
NODE_ENV=production

DB_HOST=localhost
DB_PORT=3306
DB_NAME=x402_facilitator            # Your database name
DB_USER=x402user                     # Your database user
DB_PASSWORD=***                      # Your database password
DB_CONNECTION_LIMIT=200
DB_QUEUE_LIMIT=200

REDIS_URL=redis://localhost:6379

TESTNET_NETWORKS="Base Sepolia,Ethereum Sepolia"
MAINNET_NETWORKS="Base,Ethereum"

BASE_SEPOLIA_RPC=wss://...          # Your RPC URLs
ETHEREUM_SEPOLIA_RPC=wss://...
BASE_RPC=wss://...
ETHEREUM_RPC=wss://...

PAYMASTER_PRIVATE_KEY=0x***         # Your paymaster key

BASE_SEPOLIA_USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e
ETHEREUM_SEPOLIA_USDC=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
BASE_USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
ETHEREUM_USDC=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
```

## Typical Installation Time

- Fresh VPS setup: ~10-15 minutes
- With existing project files: ~5-8 minutes
- Network speed dependent for downloads

## Requirements

**Minimum VPS Specs:**
- 2 CPU cores
- 4GB RAM
- 40GB SSD
- Ubuntu 22.04 or 24.04

**Recommended VPS Specs:**
- 4 CPU cores
- 8GB RAM
- 80GB SSD
- Ubuntu 24.04 LTS

## License

Same as x402-facilitator project
