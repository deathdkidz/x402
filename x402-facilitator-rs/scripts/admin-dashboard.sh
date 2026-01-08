#!/bin/bash
#
# x402 Facilitator Admin Dashboard
# Unified management interface for all admin operations
#

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Database config
DB_NAME="x402_facilitator"
DB_USER="root"
DB_PASS="setanMERAH@00"

# MySQL commands
MYSQL_CMD="mysql -u $DB_USER -p$DB_PASS $DB_NAME -N -B"
MYSQL_TABLE="mysql -u $DB_USER -p$DB_PASS $DB_NAME"

# Helper functions
print_banner() {
    clear
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════════════╗"
    echo "║                                                                          ║"
    echo "║       ██╗  ██╗██╗  ██╗ ██████╗ ██████╗      █████╗ ██████╗ ███╗   ███╗   ║"
    echo "║       ╚██╗██╔╝██║  ██║██╔═████╗╚════██╗    ██╔══██╗██╔══██╗████╗ ████║   ║"
    echo "║        ╚███╔╝ ███████║██║██╔██║ █████╔╝    ███████║██║  ██║██╔████╔██║   ║"
    echo "║        ██╔██╗ ╚════██║████╔╝██║██╔═══╝     ██╔══██║██║  ██║██║╚██╔╝██║   ║"
    echo "║       ██╔╝ ██╗     ██║╚██████╔╝███████╗    ██║  ██║██████╔╝██║ ╚═╝ ██║   ║"
    echo "║       ╚═╝  ╚═╝     ╚═╝ ╚═════╝ ╚══════╝    ╚═╝  ╚═╝╚═════╝ ╚═╝     ╚═╝   ║"
    echo "║                                                                          ║"
    echo "║                     Facilitator Admin Dashboard                          ║"
    echo "║                                                                          ║"
    echo "╚══════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_header() {
    clear
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║           x402 Facilitator - Admin Dashboard                             ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

press_enter() {
    echo ""
    read -p "Press Enter to continue..."
}

# Quick stats dashboard
show_dashboard() {
    print_header
    echo -e "${WHITE}═══ Quick Stats Dashboard ═══${NC}"
    echo ""
    
    # System status
    echo -e "${MAGENTA}System Status:${NC}"
    if systemctl is-active --quiet x402-facilitator-rs 2>/dev/null; then
        echo -e "  Service: ${GREEN}● Running${NC}"
    else
        echo -e "  Service: ${RED}○ Stopped${NC}"
    fi
    
    # Health check
    health_response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health 2>/dev/null)
    if [ "$health_response" = "200" ]; then
        echo -e "  API Health: ${GREEN}● Healthy${NC}"
    else
        echo -e "  API Health: ${RED}○ Unhealthy (HTTP $health_response)${NC}"
    fi
    
    # Database check
    if mysql -u $DB_USER -p$DB_PASS -e "SELECT 1" $DB_NAME > /dev/null 2>&1; then
        echo -e "  Database: ${GREEN}● Connected${NC}"
    else
        echo -e "  Database: ${RED}○ Disconnected${NC}"
    fi
    
    # Redis check
    if redis-cli ping > /dev/null 2>&1; then
        echo -e "  Redis: ${GREEN}● Connected${NC}"
    else
        echo -e "  Redis: ${RED}○ Disconnected${NC}"
    fi
    
    echo ""
    
    # Key metrics
    echo -e "${MAGENTA}Key Metrics (Last 24 Hours):${NC}"
    $MYSQL_TABLE -e "
        SELECT 
            (SELECT COUNT(*) FROM transactions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS 'Transactions',
            (SELECT COUNT(*) FROM transactions WHERE status = 'completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS 'Successful',
            (SELECT COUNT(*) FROM transactions WHERE status = 'failed' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS 'Failed',
            (SELECT FORMAT(COALESCE(SUM(total_cost_usd), 0), 2) FROM transactions WHERE status = 'completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS 'Fees (USD)',
            (SELECT COUNT(*) FROM credit_purchases WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS 'Purchases';
    " 2>/dev/null
    
    echo ""
    
    # API Key summary
    echo -e "${MAGENTA}API Keys Summary:${NC}"
    $MYSQL_TABLE -e "
        SELECT 
            COUNT(*) AS 'Total',
            SUM(is_active = TRUE) AS 'Active',
            SUM(is_active = FALSE) AS 'Disabled',
            FORMAT(SUM(mainnet_balance), 2) AS 'Total Mainnet Balance',
            FORMAT(SUM(testnet_balance), 2) AS 'Total Testnet Balance'
        FROM api_keys;
    " 2>/dev/null
    
    echo ""
    
    # Recent activity
    echo -e "${MAGENTA}Last 5 Transactions:${NC}"
    $MYSQL_TABLE -e "
        SELECT 
            SUBSTRING(api_key, 1, 12) AS 'API Key',
            network AS 'Network',
            status AS 'Status',
            FORMAT(CAST(amount AS DECIMAL(36,6)) / 1000000, 2) AS 'Amount',
            DATE_FORMAT(created_at, '%H:%i:%s') AS 'Time'
        FROM transactions
        ORDER BY created_at DESC
        LIMIT 5;
    " 2>/dev/null
    
    press_enter
}

# Quick actions menu
quick_actions() {
    print_header
    echo -e "${WHITE}═══ Quick Actions ═══${NC}"
    echo ""
    echo "  1) View API key balance"
    echo "  2) Add credits to API key"
    echo "  3) Check transaction status"
    echo "  4) Create new API key"
    echo "  5) View recent errors"
    echo ""
    echo "  0) Back to main menu"
    echo ""
    read -p "Select action: " choice
    
    case $choice in
        1) 
            read -p "Enter API key: " api_key
            $MYSQL_TABLE -e "
                SELECT api_key AS 'API Key', 
                       FORMAT(mainnet_balance, 4) AS 'Mainnet', 
                       FORMAT(testnet_balance, 4) AS 'Testnet'
                FROM api_keys WHERE api_key LIKE '%$api_key%';
            " 2>/dev/null
            press_enter
            ;;
        2)
            "$SCRIPT_DIR/manage-credits.sh"
            ;;
        3)
            read -p "Enter transaction ID or hash: " input
            if [[ "$input" =~ ^[0-9]+$ ]]; then
                $MYSQL_TABLE -e "
                    SELECT id, status, network, transaction_hash, created_at 
                    FROM transactions WHERE id = $input;
                " 2>/dev/null
            else
                $MYSQL_TABLE -e "
                    SELECT id, status, network, transaction_hash, created_at 
                    FROM transactions WHERE transaction_hash LIKE '%$input%';
                " 2>/dev/null
            fi
            press_enter
            ;;
        4)
            "$SCRIPT_DIR/manage-api-keys.sh"
            ;;
        5)
            echo ""
            echo -e "${MAGENTA}Recent Failed Transactions:${NC}"
            $MYSQL_TABLE -e "
                SELECT id, SUBSTRING(api_key, 1, 15) AS 'API Key', network, 
                       DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS 'Time'
                FROM transactions 
                WHERE status = 'failed'
                ORDER BY created_at DESC LIMIT 10;
            " 2>/dev/null
            press_enter
            ;;
        0) return ;;
        *) print_error "Invalid option" ;;
    esac
}

# Server management
server_management() {
    print_header
    echo -e "${WHITE}═══ Server Management ═══${NC}"
    echo ""
    echo "  1) Start service"
    echo "  2) Stop service"
    echo "  3) Restart service"
    echo "  4) View service status"
    echo "  5) View live logs (journalctl)"
    echo "  6) View log file (tail -f)"
    echo "  7) View last 100 log lines"
    echo "  8) Check health endpoint"
    echo ""
    echo "  0) Back to main menu"
    echo ""
    read -p "Select action: " choice
    
    case $choice in
        1)
            sudo systemctl start x402-facilitator-rs
            print_success "Service started"
            press_enter
            ;;
        2)
            sudo systemctl stop x402-facilitator-rs
            print_success "Service stopped"
            press_enter
            ;;
        3)
            sudo systemctl restart x402-facilitator-rs
            print_success "Service restarted"
            press_enter
            ;;
        4)
            sudo systemctl status x402-facilitator-rs
            press_enter
            ;;
        5)
            echo "Press Ctrl+C to exit..."
            sleep 1
            sudo journalctl -u x402-facilitator-rs -f
            ;;
        6)
            echo "Press Ctrl+C to exit..."
            sleep 1
            tail -f /srv/x402/x402-facilitator-rs/logs/x402-facilitator.log
            ;;
        7)
            sudo journalctl -u x402-facilitator-rs -n 100 --no-pager
            press_enter
            ;;
        8)
            echo ""
            curl -s http://localhost:8080/health | jq . 2>/dev/null || curl -s http://localhost:8080/health
            press_enter
            ;;
        0) return ;;
        *) print_error "Invalid option" ;;
    esac
}

# Database utilities
database_utilities() {
    print_header
    echo -e "${WHITE}═══ Database Utilities ═══${NC}"
    echo ""
    echo "  1) Show table sizes"
    echo "  2) Show database stats"
    echo "  3) Check for orphaned records"
    echo "  4) Backup database"
    echo "  5) Execute custom query"
    echo "  6) Show slow queries"
    echo ""
    echo "  0) Back to main menu"
    echo ""
    read -p "Select action: " choice
    
    case $choice in
        1)
            echo ""
            $MYSQL_TABLE -e "
                SELECT 
                    TABLE_NAME AS 'Table',
                    TABLE_ROWS AS 'Rows',
                    ROUND(DATA_LENGTH / 1024 / 1024, 2) AS 'Data (MB)',
                    ROUND(INDEX_LENGTH / 1024 / 1024, 2) AS 'Index (MB)'
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = '$DB_NAME'
                ORDER BY TABLE_ROWS DESC;
            " 2>/dev/null
            press_enter
            ;;
        2)
            echo ""
            echo -e "${MAGENTA}Record Counts:${NC}"
            $MYSQL_TABLE -e "
                SELECT 'API Keys' AS 'Table', COUNT(*) AS 'Count' FROM api_keys
                UNION ALL
                SELECT 'Transactions', COUNT(*) FROM transactions
                UNION ALL
                SELECT 'Credit Ledger', COUNT(*) FROM credit_ledger
                UNION ALL
                SELECT 'Credit Purchases', COUNT(*) FROM credit_purchases
                UNION ALL
                SELECT 'Admin Users', COUNT(*) FROM admin_users;
            " 2>/dev/null
            press_enter
            ;;
        3)
            echo ""
            echo -e "${MAGENTA}Transactions without valid API key:${NC}"
            $MYSQL_CMD -e "
                SELECT COUNT(*) FROM transactions t
                LEFT JOIN api_keys a ON t.api_key = a.api_key
                WHERE a.id IS NULL;
            " 2>/dev/null
            echo ""
            echo -e "${MAGENTA}Credit ledger entries without valid API key:${NC}"
            $MYSQL_CMD -e "
                SELECT COUNT(*) FROM credit_ledger cl
                LEFT JOIN api_keys a ON cl.api_key_id = a.id
                WHERE a.id IS NULL;
            " 2>/dev/null
            press_enter
            ;;
        4)
            filename="/tmp/x402_backup_$(date +%Y%m%d_%H%M%S).sql"
            echo "Backing up to $filename..."
            mysqldump -u $DB_USER -p$DB_PASS $DB_NAME > "$filename" 2>/dev/null
            if [ -f "$filename" ]; then
                print_success "Backup created: $filename"
                ls -lh "$filename"
            else
                print_error "Backup failed"
            fi
            press_enter
            ;;
        5)
            echo ""
            print_warning "Be careful with custom queries!"
            read -p "Enter SQL query: " query
            echo ""
            $MYSQL_TABLE -e "$query" 2>&1
            press_enter
            ;;
        6)
            echo ""
            # Check if slow query log is enabled
            $MYSQL_TABLE -e "SHOW VARIABLES LIKE 'slow_query%';" 2>/dev/null
            press_enter
            ;;
        0) return ;;
        *) print_error "Invalid option" ;;
    esac
}

# Reports menu
reports_menu() {
    print_header
    echo -e "${WHITE}═══ Reports ═══${NC}"
    echo ""
    echo "  1) Daily transaction report"
    echo "  2) Weekly summary"
    echo "  3) Monthly revenue report"
    echo "  4) Top API keys by volume"
    echo "  5) Network usage breakdown"
    echo "  6) Failed transactions analysis"
    echo ""
    echo "  0) Back to main menu"
    echo ""
    read -p "Select report: " choice
    
    case $choice in
        1)
            echo ""
            echo -e "${MAGENTA}Daily Transaction Report (Last 7 Days):${NC}"
            $MYSQL_TABLE -e "
                SELECT 
                    DATE(created_at) AS 'Date',
                    COUNT(*) AS 'Total',
                    SUM(status = 'completed') AS 'Success',
                    SUM(status = 'failed') AS 'Failed',
                    FORMAT(AVG(CASE WHEN status = 'completed' THEN CAST(amount AS DECIMAL(36,6)) / 1000000 END), 2) AS 'Avg Amount',
                    FORMAT(SUM(CASE WHEN status = 'completed' THEN total_cost_usd END), 2) AS 'Revenue'
                FROM transactions
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                GROUP BY DATE(created_at)
                ORDER BY DATE(created_at) DESC;
            " 2>/dev/null
            press_enter
            ;;
        2)
            echo ""
            echo -e "${MAGENTA}Weekly Summary (Last 4 Weeks):${NC}"
            $MYSQL_TABLE -e "
                SELECT 
                    YEARWEEK(created_at) AS 'Week',
                    COUNT(*) AS 'Transactions',
                    COUNT(DISTINCT api_key) AS 'Active Users',
                    FORMAT(SUM(CASE WHEN status = 'completed' THEN CAST(amount AS DECIMAL(36,6)) / 1000000 END), 2) AS 'Volume',
                    FORMAT(SUM(total_cost_usd), 2) AS 'Revenue'
                FROM transactions
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 4 WEEK)
                GROUP BY YEARWEEK(created_at)
                ORDER BY YEARWEEK(created_at) DESC;
            " 2>/dev/null
            press_enter
            ;;
        3)
            echo ""
            echo -e "${MAGENTA}Monthly Revenue Report (Last 6 Months):${NC}"
            $MYSQL_TABLE -e "
                SELECT 
                    DATE_FORMAT(created_at, '%Y-%m') AS 'Month',
                    COUNT(*) AS 'Transactions',
                    FORMAT(SUM(CASE WHEN status = 'completed' THEN total_cost_usd END), 2) AS 'Tx Fees',
                    (SELECT FORMAT(SUM(usd_amount), 2) FROM credit_purchases 
                     WHERE status = 'completed' 
                     AND DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(t.created_at, '%Y-%m')) AS 'Purchases'
                FROM transactions t
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
                GROUP BY DATE_FORMAT(created_at, '%Y-%m')
                ORDER BY DATE_FORMAT(created_at, '%Y-%m') DESC;
            " 2>/dev/null
            press_enter
            ;;
        4)
            echo ""
            echo -e "${MAGENTA}Top 10 API Keys by Volume (Last 30 Days):${NC}"
            $MYSQL_TABLE -e "
                SELECT 
                    SUBSTRING(t.api_key, 1, 20) AS 'API Key',
                    COALESCE(a.name, '-') AS 'Name',
                    COUNT(*) AS 'Tx Count',
                    FORMAT(SUM(CAST(t.amount AS DECIMAL(36,6)) / 1000000), 2) AS 'Volume (USDC)',
                    FORMAT(SUM(t.total_cost_usd), 2) AS 'Fees Paid'
                FROM transactions t
                LEFT JOIN api_keys a ON t.api_key = a.api_key
                WHERE t.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                  AND t.status = 'completed'
                GROUP BY t.api_key
                ORDER BY SUM(CAST(t.amount AS DECIMAL(36,6))) DESC
                LIMIT 10;
            " 2>/dev/null
            press_enter
            ;;
        5)
            echo ""
            echo -e "${MAGENTA}Network Usage Breakdown (Last 30 Days):${NC}"
            $MYSQL_TABLE -e "
                SELECT 
                    network AS 'Network',
                    COUNT(*) AS 'Transactions',
                    FORMAT(SUM(CAST(amount AS DECIMAL(36,6)) / 1000000), 2) AS 'Volume (USDC)',
                    FORMAT(AVG(gas_cost_usd), 6) AS 'Avg Gas Cost',
                    FORMAT(SUM(total_cost_usd), 2) AS 'Total Fees'
                FROM transactions
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                  AND status = 'completed'
                GROUP BY network
                ORDER BY COUNT(*) DESC;
            " 2>/dev/null
            press_enter
            ;;
        6)
            echo ""
            echo -e "${MAGENTA}Failed Transactions Analysis (Last 7 Days):${NC}"
            $MYSQL_TABLE -e "
                SELECT 
                    network AS 'Network',
                    COUNT(*) AS 'Failed Count',
                    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM transactions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND network = t.network), 1) AS 'Fail Rate %'
                FROM transactions t
                WHERE status = 'failed'
                  AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                GROUP BY network
                ORDER BY COUNT(*) DESC;
            " 2>/dev/null
            press_enter
            ;;
        0) return ;;
        *) print_error "Invalid option" ;;
    esac
}

# Main menu
main_menu() {
    while true; do
        print_banner
        echo -e "${YELLOW}Main Menu:${NC}"
        echo ""
        echo "  ${GREEN}Dashboard:${NC}"
        echo "    1) Quick Stats Dashboard"
        echo "    2) Quick Actions"
        echo ""
        echo "  ${GREEN}Management:${NC}"
        echo "    3) API Key Management"
        echo "    4) Credit Management"
        echo "    5) Transaction History"
        echo "    6) Purchase History"
        echo "    7) Admin User Management"
        echo ""
        echo "  ${GREEN}Operations:${NC}"
        echo "    8) Server Management"
        echo "    9) Database Utilities"
        echo "    10) Reports"
        echo ""
        echo "    0) Exit"
        echo ""
        read -p "Select option: " choice
        
        case $choice in
            1) show_dashboard ;;
            2) quick_actions ;;
            3) "$SCRIPT_DIR/manage-api-keys.sh" ;;
            4) "$SCRIPT_DIR/manage-credits.sh" ;;
            5) "$SCRIPT_DIR/manage-transactions.sh" ;;
            6) "$SCRIPT_DIR/manage-purchases.sh" ;;
            7) "$SCRIPT_DIR/manage-admin.sh" ;;
            8) server_management ;;
            9) database_utilities ;;
            10) reports_menu ;;
            0) 
                echo ""
                echo -e "${CYAN}Goodbye!${NC}"
                exit 0 
                ;;
            *) print_error "Invalid option" ;;
        esac
    done
}

# Check for required dependencies
check_dependencies() {
    local missing=0
    
    if ! command -v mysql &> /dev/null; then
        print_error "mysql client not found"
        missing=1
    fi
    
    if ! command -v curl &> /dev/null; then
        print_error "curl not found"
        missing=1
    fi
    
    if [ $missing -eq 1 ]; then
        echo ""
        print_warning "Some dependencies are missing. Some features may not work."
        press_enter
    fi
}

# Run
check_dependencies
main_menu
