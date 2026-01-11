#!/bin/bash
#
# x402 Facilitator Admin Dashboard v2
# Unified management interface - all functions in one script
#

# Load common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"

# ============================================================================
# UI HELPERS
# ============================================================================

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
    local title="${1:-Admin Dashboard}"
    clear
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
    printf "${CYAN}║${NC}  %-72s ${CYAN}║${NC}\n" "$title"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# ============================================================================
# DASHBOARD - SYSTEM STATUS
# ============================================================================

show_dashboard() {
    print_header "Quick Stats Dashboard"
    
    # System status
    echo -e "${MAGENTA}System Status:${NC}"
    
    local service_status=$(check_service_status)
    if [ "$service_status" = "running" ]; then
        echo -e "  Service:  ${GREEN}● Running${NC}"
    else
        echo -e "  Service:  ${RED}○ Stopped${NC}"
    fi
    
    local health=$(check_api_health)
    if [ "$health" = "200" ]; then
        echo -e "  API:      ${GREEN}● Healthy${NC}"
    else
        echo -e "  API:      ${RED}○ Unhealthy (HTTP $health)${NC}"
    fi
    
    if [ "$(check_database)" = "ok" ]; then
        echo -e "  Database: ${GREEN}● Connected${NC}"
    else
        echo -e "  Database: ${RED}○ Disconnected${NC}"
    fi
    
    if [ "$(check_redis)" = "ok" ]; then
        echo -e "  Redis:    ${GREEN}● Connected${NC}"
    else
        echo -e "  Redis:    ${RED}○ Disconnected${NC}"
    fi
    
    echo ""
    
    # Key metrics
    echo -e "${MAGENTA}Key Metrics (Last 24 Hours):${NC}"
    mysql_table -e "
        SELECT 
            (SELECT COUNT(*) FROM transactions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS 'Transactions',
            (SELECT COUNT(*) FROM transactions WHERE status = 'completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS 'Successful',
            (SELECT COUNT(*) FROM transactions WHERE status = 'failed' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS 'Failed',
            (SELECT FORMAT(COALESCE(SUM(total_cost_usd), 0), 4) FROM transactions WHERE status = 'completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS 'Revenue USD',
            (SELECT COUNT(*) FROM credit_purchases WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS 'Purchases';
    "
    
    echo ""
    
    # API Keys
    echo -e "${MAGENTA}API Keys Summary:${NC}"
    mysql_table -e "
        SELECT 
            COUNT(*) AS 'Total',
            SUM(is_active = TRUE) AS 'Active',
            SUM(is_active = FALSE) AS 'Disabled',
            FORMAT(SUM(mainnet_balance), 4) AS 'Mainnet Balance',
            FORMAT(SUM(testnet_balance), 4) AS 'Testnet Balance'
        FROM api_keys;
    "
    
    echo ""
    
    # Recent transactions
    echo -e "${MAGENTA}Last 5 Transactions:${NC}"
    mysql_table -e "
        SELECT 
            SUBSTRING(api_key, 1, 15) AS 'API Key',
            network AS 'Network',
            status AS 'Status',
            FORMAT(CAST(amount AS DECIMAL(36,6)) / 1000000, 2) AS 'Amount',
            DATE_FORMAT(created_at, '%H:%i:%s') AS 'Time'
        FROM transactions
        ORDER BY created_at DESC
        LIMIT 5;
    "
    
    press_enter
}

# ============================================================================
# API KEY MANAGEMENT
# ============================================================================

api_key_menu() {
    while true; do
        print_header "API Key Management"
        echo "  1) List all API keys"
        echo "  2) View API key details"
        echo "  3) Check API key balance"
        echo "  4) Create new API key"
        echo "  5) Enable/Disable API key"
        echo "  6) Delete API key"
        echo ""
        echo "  0) Back to main menu"
        echo ""
        read -p "Select: " choice
        
        case $choice in
            1) list_api_keys ;;
            2) view_api_key_details ;;
            3) check_api_key_balance ;;
            4) create_api_key ;;
            5) toggle_api_key ;;
            6) delete_api_key ;;
            0) return ;;
            *) print_error "Invalid option" ;;
        esac
    done
}

list_api_keys() {
    print_header "All API Keys"
    mysql_table -e "
        SELECT 
            id AS ID,
            SUBSTRING(api_key, 1, 25) AS 'API Key',
            COALESCE(name, '-') AS 'Name',
            FORMAT(mainnet_balance, 4) AS 'Mainnet',
            FORMAT(testnet_balance, 4) AS 'Testnet',
            total_transactions AS 'Tx',
            IF(is_active, 'Yes', 'No') AS 'Active'
        FROM api_keys
        ORDER BY created_at DESC;
    "
    press_enter
}

view_api_key_details() {
    print_header "API Key Details"
    read -p "Enter API key or ID: " input
    
    if [ -z "$input" ]; then
        print_error "Input required"
        press_enter
        return
    fi
    
    local api_key_id=$(get_api_key_id "$input")
    if [ -z "$api_key_id" ]; then
        print_error "API key not found"
        press_enter
        return
    fi
    
    echo ""
    mysql_table -e "
        SELECT 
            id AS 'ID',
            api_key AS 'API Key',
            COALESCE(name, '-') AS 'Name',
            COALESCE(email, '-') AS 'Email',
            FORMAT(mainnet_balance, 6) AS 'Mainnet Balance',
            FORMAT(testnet_balance, 6) AS 'Testnet Balance',
            total_transactions AS 'Total Tx',
            successful_transactions AS 'Success',
            failed_transactions AS 'Failed',
            IF(is_active, 'Yes', 'No') AS 'Active',
            created_at AS 'Created',
            last_used_at AS 'Last Used'
        FROM api_keys WHERE id = $api_key_id\G
    "
    press_enter
}

check_api_key_balance() {
    print_header "Check API Key Balance"
    read -p "Enter API key (full or partial): " input
    
    if [ -z "$input" ]; then
        print_error "API key required"
        press_enter
        return
    fi
    
    echo ""
    echo -e "${MAGENTA}Matching API keys:${NC}"
    mysql_table -e "
        SELECT 
            id AS 'ID',
            SUBSTRING(api_key, 1, 30) AS 'API Key',
            COALESCE(name, '-') AS 'Name',
            FORMAT(mainnet_balance, 6) AS 'Mainnet (USD)',
            FORMAT(testnet_balance, 6) AS 'Testnet (USD)',
            FORMAT(mainnet_balance + testnet_balance, 6) AS 'Total (USD)'
        FROM api_keys 
        WHERE api_key LIKE '%$input%' OR name LIKE '%$input%' OR email LIKE '%$input%';
    "
    press_enter
}

create_api_key() {
    print_header "Create New API Key"
    
    echo "Environment type:"
    echo "  1) Live (mainnet)"
    echo "  2) Test (testnet)"
    read -p "Select [1]: " env_choice
    env_choice=${env_choice:-1}
    
    local env_type="live"
    [ "$env_choice" = "2" ] && env_type="test"
    
    read -p "Name (optional): " name
    read -p "Email (optional): " email
    read -p "Initial mainnet balance [0]: " mainnet_bal
    read -p "Initial testnet balance [0]: " testnet_bal
    
    mainnet_bal=${mainnet_bal:-0}
    testnet_bal=${testnet_bal:-0}
    
    local new_key=$(generate_api_key "$env_type")
    
    echo ""
    echo -e "${YELLOW}Creating API key:${NC}"
    echo "  Key: $new_key"
    echo "  Name: ${name:-N/A}"
    echo "  Email: ${email:-N/A}"
    echo "  Mainnet: $mainnet_bal USD"
    echo "  Testnet: $testnet_bal USD"
    echo ""
    read -p "Confirm? (y/n) [y]: " confirm
    confirm=${confirm:-y}
    
    if [[ "$confirm" =~ ^[Yy] ]]; then
        mysql_query -e "
            INSERT INTO api_keys (api_key, name, email, mainnet_balance, testnet_balance, is_active)
            VALUES ('$new_key', NULLIF('$name',''), NULLIF('$email',''), $mainnet_bal, $testnet_bal, TRUE);
        "
        if [ $? -eq 0 ]; then
            print_success "API key created!"
            echo ""
            echo -e "${GREEN}New API Key: $new_key${NC}"
        else
            print_error "Failed to create API key"
        fi
    else
        print_warning "Cancelled"
    fi
    press_enter
}

toggle_api_key() {
    print_header "Enable/Disable API Key"
    read -p "Enter API key or ID: " input
    
    local api_key_id=$(get_api_key_id "$input")
    if [ -z "$api_key_id" ]; then
        print_error "API key not found"
        press_enter
        return
    fi
    
    local current_status=$(mysql_query -e "SELECT is_active FROM api_keys WHERE id = $api_key_id;")
    local new_status="TRUE"
    local action="Enable"
    if [ "$current_status" = "1" ]; then
        new_status="FALSE"
        action="Disable"
    fi
    
    read -p "$action this API key? (y/n) [y]: " confirm
    confirm=${confirm:-y}
    
    if [[ "$confirm" =~ ^[Yy] ]]; then
        mysql_query -e "UPDATE api_keys SET is_active = $new_status WHERE id = $api_key_id;"
        print_success "API key ${action}d"
    fi
    press_enter
}

delete_api_key() {
    print_header "Delete API Key"
    print_warning "This action cannot be undone!"
    echo ""
    read -p "Enter API key or ID: " input
    
    local api_key_id=$(get_api_key_id "$input")
    if [ -z "$api_key_id" ]; then
        print_error "API key not found"
        press_enter
        return
    fi
    
    local api_key=$(get_full_api_key "$input")
    echo ""
    echo -e "${RED}Will delete: $api_key${NC}"
    read -p "Type 'DELETE' to confirm: " confirm
    
    if [ "$confirm" = "DELETE" ]; then
        mysql_query -e "DELETE FROM api_keys WHERE id = $api_key_id;"
        print_success "API key deleted"
    else
        print_warning "Cancelled"
    fi
    press_enter
}

# ============================================================================
# CREDIT MANAGEMENT
# ============================================================================

credit_menu() {
    while true; do
        print_header "Credit Management"
        echo "  1) View all balances"
        echo "  2) Check specific API key balance"
        echo "  3) Add credits"
        echo "  4) Deduct credits"
        echo "  5) View credit ledger"
        echo "  6) View purchases"
        echo ""
        echo "  0) Back to main menu"
        echo ""
        read -p "Select: " choice
        
        case $choice in
            1) view_all_balances ;;
            2) check_api_key_balance ;;
            3) add_credits ;;
            4) deduct_credits ;;
            5) view_credit_ledger ;;
            6) view_purchases ;;
            0) return ;;
            *) print_error "Invalid option" ;;
        esac
    done
}

view_all_balances() {
    print_header "All API Key Balances"
    mysql_table -e "
        SELECT 
            id AS ID,
            SUBSTRING(api_key, 1, 20) AS 'API Key',
            COALESCE(name, '-') AS Name,
            FORMAT(mainnet_balance, 6) AS 'Mainnet',
            FORMAT(testnet_balance, 6) AS 'Testnet',
            FORMAT(mainnet_balance + testnet_balance, 6) AS 'Total',
            total_transactions AS 'Tx'
        FROM api_keys
        ORDER BY (mainnet_balance + testnet_balance) DESC;
    "
    press_enter
}

add_credits() {
    print_header "Add Credits"
    read -p "Enter API key: " input
    
    local api_key_id=$(get_api_key_id "$input")
    if [ -z "$api_key_id" ]; then
        print_error "API key not found"
        press_enter
        return
    fi
    
    local api_key=$(get_full_api_key "$input")
    local current=$(mysql_query -e "SELECT mainnet_balance, testnet_balance FROM api_keys WHERE id = $api_key_id;")
    local mainnet=$(echo "$current" | cut -f1)
    local testnet=$(echo "$current" | cut -f2)
    
    echo ""
    echo -e "${MAGENTA}Current balance:${NC} Mainnet: \$${mainnet}, Testnet: \$${testnet}"
    echo ""
    echo "Add to which balance?"
    echo "  1) Mainnet"
    echo "  2) Testnet"
    read -p "Select [1]: " balance_type
    balance_type=${balance_type:-1}
    
    read -p "Amount (USD): " amount
    if ! [[ "$amount" =~ ^[0-9]+\.?[0-9]*$ ]]; then
        print_error "Invalid amount"
        press_enter
        return
    fi
    
    read -p "Reason: " reason
    
    local field="mainnet_balance"
    local lifetime_field="lifetime_mainnet_purchased"
    local balance_name="mainnet"
    if [ "$balance_type" = "2" ]; then
        field="testnet_balance"
        lifetime_field="lifetime_testnet_purchased"
        balance_name="testnet"
    fi
    
    echo ""
    echo -e "${YELLOW}Will add \$${amount} to ${balance_name} balance${NC}"
    read -p "Confirm? (y/n) [y]: " confirm
    confirm=${confirm:-y}
    
    if [[ "$confirm" =~ ^[Yy] ]]; then
        mysql_query -e "
            UPDATE api_keys 
            SET $field = $field + $amount,
                $lifetime_field = $lifetime_field + $amount
            WHERE id = $api_key_id;
        "
        
        # Log to ledger
        mysql_query -e "
            INSERT INTO credit_ledger (api_key_id, amount, balance_type, operation_type, description, balance_before, balance_after)
            SELECT $api_key_id, $amount, '$balance_name', 'admin_credit', '$reason',
                   $field - $amount, $field
            FROM api_keys WHERE id = $api_key_id;
        "
        
        # Invalidate Redis cache so facilitator sees updated balance immediately
        invalidate_api_key_cache "$api_key"
        
        print_success "Added \$${amount} to ${balance_name} balance"
    fi
    press_enter
}

deduct_credits() {
    print_header "Deduct Credits"
    read -p "Enter API key: " input
    
    local api_key_id=$(get_api_key_id "$input")
    if [ -z "$api_key_id" ]; then
        print_error "API key not found"
        press_enter
        return
    fi
    
    local current=$(mysql_query -e "SELECT mainnet_balance, testnet_balance FROM api_keys WHERE id = $api_key_id;")
    local mainnet=$(echo "$current" | cut -f1)
    local testnet=$(echo "$current" | cut -f2)
    
    echo ""
    echo -e "${MAGENTA}Current balance:${NC} Mainnet: \$${mainnet}, Testnet: \$${testnet}"
    echo ""
    echo "Deduct from which balance?"
    echo "  1) Mainnet"
    echo "  2) Testnet"
    read -p "Select [1]: " balance_type
    balance_type=${balance_type:-1}
    
    read -p "Amount (USD): " amount
    read -p "Reason: " reason
    
    local field="mainnet_balance"
    local balance_name="mainnet"
    if [ "$balance_type" = "2" ]; then
        field="testnet_balance"
        balance_name="testnet"
    fi
    
    local api_key=$(get_full_api_key "$input")
    
    mysql_query -e "
        UPDATE api_keys 
        SET $field = GREATEST($field - $amount, 0)
        WHERE id = $api_key_id;
    "
    
    # Invalidate Redis cache so facilitator sees updated balance immediately
    invalidate_api_key_cache "$api_key"
    
    print_success "Deducted \$${amount} from ${balance_name} balance"
    press_enter
}

view_credit_ledger() {
    print_header "Credit Ledger (Last 50)"
    read -p "API key (leave blank for all): " input
    
    local where_clause=""
    if [ -n "$input" ]; then
        local api_key_id=$(get_api_key_id "$input")
        if [ -n "$api_key_id" ]; then
            where_clause="WHERE cl.api_key_id = $api_key_id"
        fi
    fi
    
    mysql_table -e "
        SELECT 
            cl.id AS ID,
            SUBSTRING(a.api_key, 1, 15) AS 'API Key',
            cl.balance_type AS 'Type',
            cl.operation_type AS 'Operation',
            FORMAT(cl.amount, 6) AS 'Amount',
            FORMAT(cl.balance_after, 6) AS 'Balance',
            DATE_FORMAT(cl.created_at, '%m-%d %H:%i') AS 'Time'
        FROM credit_ledger cl
        JOIN api_keys a ON cl.api_key_id = a.id
        $where_clause
        ORDER BY cl.created_at DESC
        LIMIT 50;
    "
    press_enter
}

view_purchases() {
    print_header "Credit Purchases (Last 50)"
    mysql_table -e "
        SELECT 
            cp.id AS ID,
            SUBSTRING(a.api_key, 1, 15) AS 'API Key',
            cp.balance_type AS 'Type',
            FORMAT(cp.usd_amount, 2) AS 'USD',
            FORMAT(cp.token_amount / 1000000, 2) AS 'Tokens',
            cp.status AS 'Status',
            DATE_FORMAT(cp.created_at, '%m-%d %H:%i') AS 'Time'
        FROM credit_purchases cp
        JOIN api_keys a ON cp.api_key_id = a.id
        ORDER BY cp.created_at DESC
        LIMIT 50;
    "
    press_enter
}

# ============================================================================
# TRANSACTION MANAGEMENT
# ============================================================================

transaction_menu() {
    while true; do
        print_header "Transaction Management"
        echo "  1) View recent transactions"
        echo "  2) Search transaction"
        echo "  3) View by API key"
        echo "  4) View failed transactions"
        echo "  5) Transaction stats"
        echo ""
        echo "  0) Back to main menu"
        echo ""
        read -p "Select: " choice
        
        case $choice in
            1) view_recent_transactions ;;
            2) search_transaction ;;
            3) view_by_api_key ;;
            4) view_failed_transactions ;;
            5) transaction_stats ;;
            0) return ;;
            *) print_error "Invalid option" ;;
        esac
    done
}

view_recent_transactions() {
    print_header "Recent Transactions (Last 50)"
    mysql_table -e "
        SELECT 
            id AS ID,
            SUBSTRING(api_key, 1, 15) AS 'API Key',
            network AS 'Network',
            status AS 'Status',
            FORMAT(CAST(amount AS DECIMAL(36,6)) / 1000000, 2) AS 'Amount',
            FORMAT(total_cost_usd, 6) AS 'Fee',
            DATE_FORMAT(created_at, '%m-%d %H:%i:%s') AS 'Time'
        FROM transactions
        ORDER BY created_at DESC
        LIMIT 50;
    "
    press_enter
}

search_transaction() {
    print_header "Search Transaction"
    read -p "Enter TX ID or hash: " input
    
    if [ -z "$input" ]; then
        print_error "Input required"
        press_enter
        return
    fi
    
    echo ""
    if [[ "$input" =~ ^[0-9]+$ ]]; then
        mysql_table -e "SELECT * FROM transactions WHERE id = $input\G"
    else
        mysql_table -e "SELECT * FROM transactions WHERE transaction_hash LIKE '%$input%'\G"
    fi
    press_enter
}

view_by_api_key() {
    print_header "Transactions by API Key"
    read -p "Enter API key: " input
    
    local api_key=$(get_full_api_key "$input")
    if [ -z "$api_key" ]; then
        print_error "API key not found"
        press_enter
        return
    fi
    
    echo ""
    mysql_table -e "
        SELECT 
            id AS ID,
            network AS 'Network',
            status AS 'Status',
            FORMAT(CAST(amount AS DECIMAL(36,6)) / 1000000, 2) AS 'Amount',
            SUBSTRING(transaction_hash, 1, 20) AS 'TX Hash',
            DATE_FORMAT(created_at, '%m-%d %H:%i') AS 'Time'
        FROM transactions
        WHERE api_key = '$api_key'
        ORDER BY created_at DESC
        LIMIT 30;
    "
    press_enter
}

view_failed_transactions() {
    print_header "Failed Transactions (Last 7 Days)"
    mysql_table -e "
        SELECT 
            id AS ID,
            SUBSTRING(api_key, 1, 15) AS 'API Key',
            network AS 'Network',
            DATE_FORMAT(created_at, '%m-%d %H:%i') AS 'Time'
        FROM transactions
        WHERE status = 'failed'
          AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY created_at DESC
        LIMIT 30;
    "
    press_enter
}

transaction_stats() {
    print_header "Transaction Statistics"
    
    echo -e "${MAGENTA}Daily Stats (Last 7 Days):${NC}"
    mysql_table -e "
        SELECT 
            DATE(created_at) AS 'Date',
            COUNT(*) AS 'Total',
            SUM(status = 'completed') AS 'Success',
            SUM(status = 'failed') AS 'Failed',
            ROUND(SUM(status = 'completed') * 100.0 / COUNT(*), 1) AS 'Success %',
            FORMAT(SUM(total_cost_usd), 4) AS 'Revenue'
        FROM transactions
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at) DESC;
    "
    
    echo ""
    echo -e "${MAGENTA}Network Breakdown:${NC}"
    mysql_table -e "
        SELECT 
            network AS 'Network',
            COUNT(*) AS 'Total',
            SUM(status = 'completed') AS 'Success',
            FORMAT(AVG(CASE WHEN status = 'completed' THEN gas_cost_usd END), 6) AS 'Avg Gas'
        FROM transactions
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY network
        ORDER BY COUNT(*) DESC;
    "
    press_enter
}

# ============================================================================
# SERVER MANAGEMENT
# ============================================================================

server_menu() {
    while true; do
        print_header "Server Management"
        echo "  1) Start service"
        echo "  2) Stop service"
        echo "  3) Restart service"
        echo "  4) View status"
        echo "  5) View live logs"
        echo "  6) View last 100 lines"
        echo "  7) Health check"
        echo ""
        echo "  0) Back to main menu"
        echo ""
        read -p "Select: " choice
        
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
                sudo journalctl -u x402-facilitator-rs -n 100 --no-pager
                press_enter
                ;;
            7)
                echo ""
                curl -s http://localhost:8080/health | jq . 2>/dev/null || curl -s http://localhost:8080/health
                press_enter
                ;;
            0) return ;;
            *) print_error "Invalid option" ;;
        esac
    done
}

# ============================================================================
# REPORTS
# ============================================================================

reports_menu() {
    while true; do
        print_header "Reports"
        echo "  1) Daily transaction report"
        echo "  2) Top API keys by volume"
        echo "  3) Network usage"
        echo "  4) Revenue summary"
        echo ""
        echo "  0) Back to main menu"
        echo ""
        read -p "Select: " choice
        
        case $choice in
            1)
                print_header "Daily Report (Last 7 Days)"
                mysql_table -e "
                    SELECT 
                        DATE(created_at) AS 'Date',
                        COUNT(*) AS 'Total',
                        SUM(status = 'completed') AS 'Success',
                        SUM(status = 'failed') AS 'Failed',
                        FORMAT(SUM(total_cost_usd), 4) AS 'Revenue'
                    FROM transactions
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    GROUP BY DATE(created_at)
                    ORDER BY DATE(created_at) DESC;
                "
                press_enter
                ;;
            2)
                print_header "Top API Keys (Last 30 Days)"
                mysql_table -e "
                    SELECT 
                        SUBSTRING(t.api_key, 1, 20) AS 'API Key',
                        COALESCE(a.name, '-') AS 'Name',
                        COUNT(*) AS 'Tx',
                        FORMAT(SUM(CAST(t.amount AS DECIMAL(36,6)) / 1000000), 2) AS 'Volume',
                        FORMAT(SUM(t.total_cost_usd), 4) AS 'Fees'
                    FROM transactions t
                    LEFT JOIN api_keys a ON t.api_key = a.api_key
                    WHERE t.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                      AND t.status = 'completed'
                    GROUP BY t.api_key
                    ORDER BY SUM(CAST(t.amount AS DECIMAL(36,6))) DESC
                    LIMIT 10;
                "
                press_enter
                ;;
            3)
                print_header "Network Usage (Last 30 Days)"
                mysql_table -e "
                    SELECT 
                        network AS 'Network',
                        COUNT(*) AS 'Tx',
                        FORMAT(SUM(CAST(amount AS DECIMAL(36,6)) / 1000000), 2) AS 'Volume',
                        FORMAT(AVG(gas_cost_usd), 6) AS 'Avg Gas',
                        FORMAT(SUM(total_cost_usd), 4) AS 'Revenue'
                    FROM transactions
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                      AND status = 'completed'
                    GROUP BY network
                    ORDER BY COUNT(*) DESC;
                "
                press_enter
                ;;
            4)
                print_header "Revenue Summary"
                echo -e "${MAGENTA}Transaction Fees:${NC}"
                mysql_table -e "
                    SELECT 
                        DATE_FORMAT(created_at, '%Y-%m') AS 'Month',
                        COUNT(*) AS 'Tx',
                        FORMAT(SUM(total_cost_usd), 4) AS 'Revenue'
                    FROM transactions
                    WHERE status = 'completed'
                      AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
                    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
                    ORDER BY DATE_FORMAT(created_at, '%Y-%m') DESC;
                "
                echo ""
                echo -e "${MAGENTA}Credit Purchases:${NC}"
                mysql_table -e "
                    SELECT 
                        DATE_FORMAT(created_at, '%Y-%m') AS 'Month',
                        COUNT(*) AS 'Purchases',
                        FORMAT(SUM(usd_amount), 2) AS 'Total USD'
                    FROM credit_purchases
                    WHERE status = 'completed'
                      AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
                    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
                    ORDER BY DATE_FORMAT(created_at, '%Y-%m') DESC;
                "
                press_enter
                ;;
            0) return ;;
            *) print_error "Invalid option" ;;
        esac
    done
}

# ============================================================================
# DATABASE UTILITIES
# ============================================================================

database_menu() {
    while true; do
        print_header "Database Utilities"
        echo "  1) Table sizes"
        echo "  2) Record counts"
        echo "  3) Backup database"
        echo "  4) Run custom query"
        echo ""
        echo "  0) Back to main menu"
        echo ""
        read -p "Select: " choice
        
        case $choice in
            1)
                mysql_table -e "
                    SELECT 
                        TABLE_NAME AS 'Table',
                        TABLE_ROWS AS 'Rows',
                        ROUND(DATA_LENGTH / 1024 / 1024, 2) AS 'Data MB'
                    FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_SCHEMA = '$DB_NAME'
                    ORDER BY TABLE_ROWS DESC;
                "
                press_enter
                ;;
            2)
                mysql_table -e "
                    SELECT 'API Keys' AS 'Table', COUNT(*) AS 'Count' FROM api_keys
                    UNION ALL SELECT 'Transactions', COUNT(*) FROM transactions
                    UNION ALL SELECT 'Credit Ledger', COUNT(*) FROM credit_ledger
                    UNION ALL SELECT 'Purchases', COUNT(*) FROM credit_purchases;
                "
                press_enter
                ;;
            3)
                local filename="/tmp/x402_backup_$(date +%Y%m%d_%H%M%S).sql"
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
            4)
                print_warning "Be careful!"
                read -p "SQL: " query
                mysql_table -e "$query" 2>&1
                press_enter
                ;;
            0) return ;;
            *) print_error "Invalid option" ;;
        esac
    done
}

# ============================================================================
# MAIN MENU
# ============================================================================

main_menu() {
    while true; do
        print_banner
        echo -e "${YELLOW}Main Menu:${NC}"
        echo ""
        echo "  ${GREEN}Dashboard${NC}"
        echo "    1) Quick Stats"
        echo ""
        echo "  ${GREEN}Management${NC}"
        echo "    2) API Keys"
        echo "    3) Credits"
        echo "    4) Transactions"
        echo ""
        echo "  ${GREEN}Operations${NC}"
        echo "    5) Server"
        echo "    6) Reports"
        echo "    7) Database"
        echo ""
        echo "    0) Exit"
        echo ""
        read -p "Select: " choice
        
        case $choice in
            1) show_dashboard ;;
            2) api_key_menu ;;
            3) credit_menu ;;
            4) transaction_menu ;;
            5) server_menu ;;
            6) reports_menu ;;
            7) database_menu ;;
            0) 
                echo ""
                echo -e "${CYAN}Goodbye!${NC}"
                exit 0 
                ;;
            *) print_error "Invalid option" ;;
        esac
    done
}

# ============================================================================
# RUN
# ============================================================================

# Check dependencies
if ! command -v mysql &> /dev/null; then
    print_error "mysql client not found"
    exit 1
fi

main_menu
