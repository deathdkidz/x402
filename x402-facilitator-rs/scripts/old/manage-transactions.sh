#!/bin/bash
#
# Transaction History Management Script for x402 Facilitator
# View and manage settlement/transaction history
#

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Database config
DB_NAME="x402_facilitator"
DB_USER="root"
DB_PASS="setanMERAH@00"

# MySQL commands
MYSQL_CMD="mysql -u $DB_USER -p$DB_PASS $DB_NAME -N -B"
MYSQL_TABLE="mysql -u $DB_USER -p$DB_PASS $DB_NAME"

# Helper functions
print_header() {
    clear
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║           x402 Facilitator - Transaction History                  ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
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

# Show transaction summary stats
show_summary() {
    print_header
    echo -e "${BLUE}═══ Transaction Summary ═══${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            'Total Transactions' AS Metric,
            COUNT(*) AS Value
        FROM transactions
        UNION ALL
        SELECT 
            'Completed',
            COUNT(*)
        FROM transactions WHERE status = 'completed'
        UNION ALL
        SELECT 
            'Failed',
            COUNT(*)
        FROM transactions WHERE status = 'failed'
        UNION ALL
        SELECT 
            'Pending',
            COUNT(*)
        FROM transactions WHERE status = 'pending'
        UNION ALL
        SELECT 
            'Preconfirmed',
            COUNT(*)
        FROM transactions WHERE status = 'preconfirmed'
        UNION ALL
        SELECT 
            'Today''s Transactions',
            COUNT(*)
        FROM transactions WHERE DATE(created_at) = CURDATE()
        UNION ALL
        SELECT 
            'This Week',
            COUNT(*)
        FROM transactions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY);
    " 2>/dev/null
    
    echo ""
    echo -e "${BLUE}═══ Volume by Network (Last 7 Days) ═══${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            network AS Network,
            COUNT(*) AS 'Tx Count',
            COALESCE(SUM(CAST(amount AS DECIMAL(36,6)) / 1000000), 0) AS 'Volume (USDC)',
            COALESCE(SUM(total_cost_usd), 0) AS 'Fees (USD)'
        FROM transactions 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY network
        ORDER BY COUNT(*) DESC;
    " 2>/dev/null
    
    press_enter
}

# List recent transactions
list_recent() {
    print_header
    echo -e "${BLUE}═══ Recent Transactions (Last 50) ═══${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            t.id AS ID,
            SUBSTRING(t.api_key, 1, 15) AS 'API Key',
            t.network AS Network,
            t.status AS Status,
            FORMAT(CAST(t.amount AS DECIMAL(36,6)) / 1000000, 2) AS 'Amount',
            COALESCE(CONCAT(LEFT(t.transaction_hash, 10), '...'), '-') AS 'Tx Hash',
            DATE_FORMAT(t.created_at, '%m-%d %H:%i') AS 'Created'
        FROM transactions t
        ORDER BY t.created_at DESC
        LIMIT 50;
    " 2>/dev/null
    
    press_enter
}

# Search transactions by API key
search_by_api_key() {
    print_header
    echo -e "${BLUE}═══ Search by API Key ═══${NC}"
    echo ""
    
    read -p "Enter API key (or partial): " api_key
    if [ -z "$api_key" ]; then
        print_error "API key is required"
        press_enter
        return
    fi
    
    echo ""
    echo -e "${MAGENTA}Transactions for API key containing '$api_key':${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            t.id AS ID,
            t.api_key AS 'API Key',
            t.network AS Network,
            t.status AS Status,
            FORMAT(CAST(t.amount AS DECIMAL(36,6)) / 1000000, 2) AS 'Amount',
            COALESCE(t.transaction_hash, '-') AS 'Tx Hash',
            DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS 'Created'
        FROM transactions t
        WHERE t.api_key LIKE '%$api_key%'
        ORDER BY t.created_at DESC
        LIMIT 100;
    " 2>/dev/null
    
    press_enter
}

# Search by transaction hash
search_by_tx_hash() {
    print_header
    echo -e "${BLUE}═══ Search by Transaction Hash ═══${NC}"
    echo ""
    
    read -p "Enter transaction hash (full or partial): " tx_hash
    if [ -z "$tx_hash" ]; then
        print_error "Transaction hash is required"
        press_enter
        return
    fi
    
    echo ""
    $MYSQL_TABLE -e "
        SELECT 
            t.id AS ID,
            t.api_key AS 'API Key',
            t.network AS Network,
            t.token_symbol AS Token,
            t.status AS Status,
            FORMAT(CAST(t.amount AS DECIMAL(36,6)) / 1000000, 6) AS 'Amount',
            t.transaction_hash AS 'Tx Hash',
            t.payer_address AS 'Payer',
            t.recipient_address AS 'Recipient',
            t.gas_used AS 'Gas Used',
            t.gas_cost_usd AS 'Gas Cost (USD)',
            t.total_cost_usd AS 'Total Cost (USD)',
            DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS 'Created'
        FROM transactions t
        WHERE t.transaction_hash LIKE '%$tx_hash%'
        LIMIT 10;
    " 2>/dev/null
    
    press_enter
}

# View transaction details
view_transaction_details() {
    print_header
    echo -e "${BLUE}═══ Transaction Details ═══${NC}"
    echo ""
    
    read -p "Enter transaction ID: " tx_id
    if [ -z "$tx_id" ]; then
        print_error "Transaction ID is required"
        press_enter
        return
    fi
    
    echo ""
    $MYSQL_TABLE -e "
        SELECT 
            t.id AS 'Transaction ID',
            t.api_key AS 'API Key',
            t.network AS 'Network',
            t.token_symbol AS 'Token',
            t.transfer_type AS 'Transfer Type',
            t.status AS 'Status',
            t.deduction_status AS 'Deduction Status',
            FORMAT(CAST(t.amount AS DECIMAL(36,6)) / 1000000, 6) AS 'Amount',
            t.payer_address AS 'Payer Address',
            t.recipient_address AS 'Recipient Address',
            t.transaction_hash AS 'Transaction Hash',
            t.nonce AS 'Nonce',
            FROM_UNIXTIME(t.valid_after) AS 'Valid After',
            FROM_UNIXTIME(t.valid_before) AS 'Valid Before',
            t.gas_used AS 'Gas Used',
            t.effective_gas_price_wei AS 'Gas Price (Wei)',
            t.gas_cost_native AS 'Gas Cost (Native)',
            t.gas_cost_usd AS 'Gas Cost (USD)',
            t.service_fee_usd AS 'Service Fee (USD)',
            t.total_cost_usd AS 'Total Cost (USD)',
            t.total_usd_deducted AS 'USD Deducted',
            t.resource AS 'Resource',
            t.description AS 'Description',
            t.created_at AS 'Created At',
            t.updated_at AS 'Updated At',
            t.deducted_at AS 'Deducted At'
        FROM transactions t
        WHERE t.id = $tx_id\G
    " 2>/dev/null
    
    press_enter
}

# Filter by status
filter_by_status() {
    print_header
    echo -e "${BLUE}═══ Filter by Status ═══${NC}"
    echo ""
    echo "1) Pending"
    echo "2) Preconfirmed"
    echo "3) Completed"
    echo "4) Failed"
    echo "5) Expired"
    echo ""
    read -p "Select status (1-5): " choice
    
    case $choice in
        1) status="pending" ;;
        2) status="preconfirmed" ;;
        3) status="completed" ;;
        4) status="failed" ;;
        5) status="expired" ;;
        *) print_error "Invalid choice"; press_enter; return ;;
    esac
    
    echo ""
    echo -e "${MAGENTA}Transactions with status '$status':${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            t.id AS ID,
            SUBSTRING(t.api_key, 1, 15) AS 'API Key',
            t.network AS Network,
            FORMAT(CAST(t.amount AS DECIMAL(36,6)) / 1000000, 2) AS 'Amount',
            COALESCE(CONCAT(LEFT(t.transaction_hash, 10), '...'), '-') AS 'Tx Hash',
            DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i') AS 'Created'
        FROM transactions t
        WHERE t.status = '$status'
        ORDER BY t.created_at DESC
        LIMIT 100;
    " 2>/dev/null
    
    press_enter
}

# Filter by network
filter_by_network() {
    print_header
    echo -e "${BLUE}═══ Filter by Network ═══${NC}"
    echo ""
    
    echo "Available networks:"
    $MYSQL_CMD -e "SELECT DISTINCT network FROM transactions ORDER BY network;" 2>/dev/null
    
    echo ""
    read -p "Enter network name: " network
    if [ -z "$network" ]; then
        print_error "Network is required"
        press_enter
        return
    fi
    
    echo ""
    echo -e "${MAGENTA}Transactions on '$network':${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            t.id AS ID,
            SUBSTRING(t.api_key, 1, 15) AS 'API Key',
            t.status AS Status,
            FORMAT(CAST(t.amount AS DECIMAL(36,6)) / 1000000, 2) AS 'Amount',
            COALESCE(CONCAT(LEFT(t.transaction_hash, 10), '...'), '-') AS 'Tx Hash',
            DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i') AS 'Created'
        FROM transactions t
        WHERE t.network = '$network'
        ORDER BY t.created_at DESC
        LIMIT 100;
    " 2>/dev/null
    
    press_enter
}

# Filter by date range
filter_by_date() {
    print_header
    echo -e "${BLUE}═══ Filter by Date Range ═══${NC}"
    echo ""
    
    echo "Quick options:"
    echo "1) Today"
    echo "2) Yesterday"
    echo "3) Last 7 days"
    echo "4) Last 30 days"
    echo "5) Custom range"
    echo ""
    read -p "Select option (1-5): " choice
    
    case $choice in
        1) 
            start_date="CURDATE()"
            end_date="NOW()"
            label="Today"
            ;;
        2)
            start_date="DATE_SUB(CURDATE(), INTERVAL 1 DAY)"
            end_date="CURDATE()"
            label="Yesterday"
            ;;
        3)
            start_date="DATE_SUB(NOW(), INTERVAL 7 DAY)"
            end_date="NOW()"
            label="Last 7 days"
            ;;
        4)
            start_date="DATE_SUB(NOW(), INTERVAL 30 DAY)"
            end_date="NOW()"
            label="Last 30 days"
            ;;
        5)
            read -p "Start date (YYYY-MM-DD): " start_input
            read -p "End date (YYYY-MM-DD): " end_input
            start_date="'$start_input'"
            end_date="'$end_input 23:59:59'"
            label="$start_input to $end_input"
            ;;
        *)
            print_error "Invalid choice"
            press_enter
            return
            ;;
    esac
    
    echo ""
    echo -e "${MAGENTA}Transactions for $label:${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            t.id AS ID,
            SUBSTRING(t.api_key, 1, 15) AS 'API Key',
            t.network AS Network,
            t.status AS Status,
            FORMAT(CAST(t.amount AS DECIMAL(36,6)) / 1000000, 2) AS 'Amount',
            COALESCE(CONCAT(LEFT(t.transaction_hash, 10), '...'), '-') AS 'Tx Hash',
            DATE_FORMAT(t.created_at, '%m-%d %H:%i') AS 'Created'
        FROM transactions t
        WHERE t.created_at BETWEEN $start_date AND $end_date
        ORDER BY t.created_at DESC
        LIMIT 200;
    " 2>/dev/null
    
    # Show summary
    echo ""
    echo -e "${BLUE}Summary:${NC}"
    $MYSQL_TABLE -e "
        SELECT 
            COUNT(*) AS 'Total',
            SUM(status = 'completed') AS 'Completed',
            SUM(status = 'failed') AS 'Failed',
            COALESCE(SUM(total_cost_usd), 0) AS 'Total Fees (USD)'
        FROM transactions
        WHERE created_at BETWEEN $start_date AND $end_date;
    " 2>/dev/null
    
    press_enter
}

# Show gas costs analysis
gas_costs_analysis() {
    print_header
    echo -e "${BLUE}═══ Gas Costs Analysis (Last 7 Days) ═══${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            network AS Network,
            COUNT(*) AS 'Tx Count',
            FORMAT(AVG(gas_used), 0) AS 'Avg Gas Used',
            FORMAT(AVG(gas_cost_usd), 6) AS 'Avg Gas Cost (USD)',
            FORMAT(SUM(gas_cost_usd), 4) AS 'Total Gas Cost (USD)',
            FORMAT(AVG(total_cost_usd), 6) AS 'Avg Total Cost (USD)'
        FROM transactions
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          AND status = 'completed'
          AND gas_used IS NOT NULL
        GROUP BY network
        ORDER BY SUM(gas_cost_usd) DESC;
    " 2>/dev/null
    
    press_enter
}

# Export transactions to CSV
export_to_csv() {
    print_header
    echo -e "${BLUE}═══ Export Transactions to CSV ═══${NC}"
    echo ""
    
    read -p "Number of days to export (default 30): " days
    days=${days:-30}
    
    filename="/tmp/transactions_export_$(date +%Y%m%d_%H%M%S).csv"
    
    $MYSQL_CMD -e "
        SELECT 
            'ID', 'API Key', 'Network', 'Token', 'Status', 'Amount', 
            'Tx Hash', 'Payer', 'Recipient', 'Gas Used', 'Gas Cost USD', 
            'Total Cost USD', 'Created At'
        UNION ALL
        SELECT 
            t.id,
            t.api_key,
            t.network,
            t.token_symbol,
            t.status,
            CAST(t.amount AS DECIMAL(36,6)) / 1000000,
            COALESCE(t.transaction_hash, ''),
            t.payer_address,
            t.recipient_address,
            COALESCE(t.gas_used, ''),
            COALESCE(t.gas_cost_usd, ''),
            COALESCE(t.total_cost_usd, ''),
            t.created_at
        FROM transactions t
        WHERE t.created_at >= DATE_SUB(NOW(), INTERVAL $days DAY)
        ORDER BY t.created_at DESC;
    " 2>/dev/null | sed 's/\t/,/g' > "$filename"
    
    if [ -f "$filename" ]; then
        print_success "Exported to: $filename"
        wc -l "$filename" | awk '{print $1-1 " transactions exported"}'
    else
        print_error "Export failed"
    fi
    
    press_enter
}

# Retry failed transaction (mark as pending for re-processing)
retry_failed_transaction() {
    print_header
    echo -e "${BLUE}═══ Retry Failed Transaction ═══${NC}"
    echo ""
    
    print_warning "This will mark a failed transaction as pending for re-processing"
    echo ""
    
    read -p "Enter transaction ID: " tx_id
    if [ -z "$tx_id" ]; then
        print_error "Transaction ID is required"
        press_enter
        return
    fi
    
    # Check current status
    current_status=$($MYSQL_CMD -e "SELECT status FROM transactions WHERE id = $tx_id;" 2>/dev/null)
    
    if [ "$current_status" != "failed" ] && [ "$current_status" != "expired" ]; then
        print_error "Transaction is not in failed/expired status (current: $current_status)"
        press_enter
        return
    fi
    
    read -p "Are you sure you want to retry this transaction? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
        $MYSQL_CMD -e "
            UPDATE transactions 
            SET status = 'pending', 
                updated_at = NOW() 
            WHERE id = $tx_id;
        " 2>/dev/null
        print_success "Transaction $tx_id marked as pending"
    else
        print_warning "Cancelled"
    fi
    
    press_enter
}

# Main menu
main_menu() {
    while true; do
        print_header
        echo -e "${YELLOW}Main Menu:${NC}"
        echo ""
        echo "  ${GREEN}View:${NC}"
        echo "    1) Transaction Summary"
        echo "    2) Recent Transactions"
        echo "    3) View Transaction Details"
        echo ""
        echo "  ${GREEN}Search:${NC}"
        echo "    4) Search by API Key"
        echo "    5) Search by Transaction Hash"
        echo ""
        echo "  ${GREEN}Filter:${NC}"
        echo "    6) Filter by Status"
        echo "    7) Filter by Network"
        echo "    8) Filter by Date Range"
        echo ""
        echo "  ${GREEN}Analysis:${NC}"
        echo "    9) Gas Costs Analysis"
        echo ""
        echo "  ${GREEN}Actions:${NC}"
        echo "    10) Export to CSV"
        echo "    11) Retry Failed Transaction"
        echo ""
        echo "    0) Exit"
        echo ""
        read -p "Select option: " choice
        
        case $choice in
            1) show_summary ;;
            2) list_recent ;;
            3) view_transaction_details ;;
            4) search_by_api_key ;;
            5) search_by_tx_hash ;;
            6) filter_by_status ;;
            7) filter_by_network ;;
            8) filter_by_date ;;
            9) gas_costs_analysis ;;
            10) export_to_csv ;;
            11) retry_failed_transaction ;;
            0) echo "Goodbye!"; exit 0 ;;
            *) print_error "Invalid option" ;;
        esac
    done
}

# Run
main_menu
