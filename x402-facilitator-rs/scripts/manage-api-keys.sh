#!/bin/bash
#
# API Key Management Script for x402 Facilitator
# Create, list, enable/disable, delete API keys
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
    echo -e "${CYAN}║           x402 Facilitator - API Key Management                   ║${NC}"
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

# Generate a random API key
generate_api_key() {
    local env_type=$1
    local random_part=$(openssl rand -hex 24)
    if [ "$env_type" = "live" ]; then
        echo "x402_live_${random_part}"
    else
        echo "x402_test_${random_part}"
    fi
}

# List all API keys
list_api_keys() {
    print_header
    echo -e "${BLUE}═══ All API Keys ═══${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            id AS ID,
            SUBSTRING(api_key, 1, 25) AS 'API Key',
            COALESCE(name, '-') AS 'Name',
            COALESCE(email, '-') AS 'Email',
            FORMAT(mainnet_balance, 2) AS 'Mainnet',
            FORMAT(testnet_balance, 2) AS 'Testnet',
            total_transactions AS 'Tx',
            IF(is_active, 'Yes', 'No') AS 'Active',
            DATE_FORMAT(created_at, '%Y-%m-%d') AS 'Created'
        FROM api_keys
        ORDER BY created_at DESC;
    " 2>/dev/null
    
    press_enter
}

# View API key details
view_api_key() {
    print_header
    echo -e "${BLUE}═══ View API Key Details ═══${NC}"
    echo ""
    
    read -p "Enter API key or ID: " input
    if [ -z "$input" ]; then
        print_error "Input is required"
        press_enter
        return
    fi
    
    # Check if input is numeric (ID) or string (API key)
    if [[ "$input" =~ ^[0-9]+$ ]]; then
        where_clause="WHERE id = $input"
    else
        where_clause="WHERE api_key LIKE '%$input%'"
    fi
    
    echo ""
    $MYSQL_TABLE -e "
        SELECT 
            id AS 'ID',
            api_key AS 'API Key',
            COALESCE(name, '-') AS 'Name',
            COALESCE(email, '-') AS 'Email',
            FORMAT(usd_balance, 10) AS 'USD Balance',
            FORMAT(mainnet_balance, 10) AS 'Mainnet Balance',
            FORMAT(testnet_balance, 10) AS 'Testnet Balance',
            FORMAT(lifetime_credits_purchased, 10) AS 'Lifetime Purchased',
            FORMAT(lifetime_credits_used, 10) AS 'Lifetime Used',
            FORMAT(lifetime_mainnet_purchased, 10) AS 'Mainnet Purchased',
            FORMAT(lifetime_mainnet_used, 10) AS 'Mainnet Used',
            FORMAT(lifetime_testnet_purchased, 10) AS 'Testnet Purchased',
            FORMAT(lifetime_testnet_used, 10) AS 'Testnet Used',
            total_transactions AS 'Total Transactions',
            successful_transactions AS 'Successful',
            failed_transactions AS 'Failed',
            IF(is_active, 'Yes', 'No') AS 'Is Active',
            created_at AS 'Created At',
            updated_at AS 'Updated At',
            last_used_at AS 'Last Used At',
            expires_at AS 'Expires At'
        FROM api_keys
        $where_clause
        LIMIT 1\G
    " 2>/dev/null
    
    press_enter
}

# Create new API key
create_api_key() {
    print_header
    echo -e "${BLUE}═══ Create New API Key ═══${NC}"
    echo ""
    
    # Environment type
    echo "Select environment:"
    echo "1) Live (mainnet)"
    echo "2) Test (testnet)"
    read -p "Choice (1-2): " env_choice
    
    case $env_choice in
        1) env_type="live" ;;
        2) env_type="test" ;;
        *)
            print_error "Invalid choice"
            press_enter
            return
            ;;
    esac
    
    # Name
    read -p "Name (optional): " name
    
    # Email
    read -p "Email (optional): " email
    
    # Initial balance
    read -p "Initial balance (USD, default 0): " initial_balance
    initial_balance=${initial_balance:-0}
    
    # Validate balance is a number
    if ! [[ "$initial_balance" =~ ^[0-9]+\.?[0-9]*$ ]]; then
        print_error "Invalid balance format"
        press_enter
        return
    fi
    
    # Generate API key
    api_key=$(generate_api_key "$env_type")
    
    echo ""
    echo -e "${MAGENTA}New API Key Details:${NC}"
    echo "  API Key: $api_key"
    echo "  Name: ${name:-<none>}"
    echo "  Email: ${email:-<none>}"
    echo "  Initial Balance: $initial_balance USD"
    echo "  Environment: $env_type"
    echo ""
    
    read -p "Create this API key? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        # Determine which balance to set
        if [ "$env_type" = "live" ]; then
            balance_column="mainnet_balance"
            lifetime_column="lifetime_mainnet_purchased"
        else
            balance_column="testnet_balance"
            lifetime_column="lifetime_testnet_purchased"
        fi
        
        # Insert API key
        $MYSQL_CMD -e "
            INSERT INTO api_keys (
                api_key, name, email, 
                $balance_column, $lifetime_column,
                is_active, created_at, updated_at
            ) VALUES (
                '$api_key', 
                $([ -n "$name" ] && echo "'$name'" || echo "NULL"),
                $([ -n "$email" ] && echo "'$email'" || echo "NULL"),
                $initial_balance, $initial_balance,
                TRUE, NOW(), NOW()
            );
        " 2>/dev/null
        
        if [ $? -eq 0 ]; then
            print_success "API key created successfully!"
            echo ""
            echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
            echo -e "${GREEN}║  API Key: $api_key  ║${NC}"
            echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
            echo ""
            print_warning "Save this API key securely - it cannot be recovered!"
        else
            print_error "Failed to create API key"
        fi
    else
        print_warning "Cancelled"
    fi
    
    press_enter
}

# Enable/Disable API key
toggle_api_key() {
    print_header
    echo -e "${BLUE}═══ Enable/Disable API Key ═══${NC}"
    echo ""
    
    read -p "Enter API key or ID: " input
    if [ -z "$input" ]; then
        print_error "Input is required"
        press_enter
        return
    fi
    
    # Check if input is numeric (ID) or string (API key)
    if [[ "$input" =~ ^[0-9]+$ ]]; then
        where_clause="WHERE id = $input"
    else
        where_clause="WHERE api_key = '$input'"
    fi
    
    # Get current status
    current_data=$($MYSQL_CMD -e "
        SELECT id, api_key, is_active 
        FROM api_keys $where_clause;" 2>/dev/null)
    
    if [ -z "$current_data" ]; then
        print_error "API key not found"
        press_enter
        return
    fi
    
    api_key_id=$(echo "$current_data" | cut -f1)
    api_key=$(echo "$current_data" | cut -f2)
    is_active=$(echo "$current_data" | cut -f3)
    
    if [ "$is_active" = "1" ]; then
        action="disable"
        new_status="FALSE"
        current_status="Active"
    else
        action="enable"
        new_status="TRUE"
        current_status="Disabled"
    fi
    
    echo ""
    echo "API Key: $api_key"
    echo "Current Status: $current_status"
    echo ""
    read -p "Do you want to $action this API key? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        $MYSQL_CMD -e "
            UPDATE api_keys 
            SET is_active = $new_status, updated_at = NOW() 
            WHERE id = $api_key_id;
        " 2>/dev/null
        
        if [ $? -eq 0 ]; then
            print_success "API key ${action}d successfully"
        else
            print_error "Failed to $action API key"
        fi
    else
        print_warning "Cancelled"
    fi
    
    press_enter
}

# Delete API key
delete_api_key() {
    print_header
    echo -e "${BLUE}═══ Delete API Key ═══${NC}"
    echo ""
    
    print_warning "This action is PERMANENT and cannot be undone!"
    echo ""
    
    read -p "Enter API key or ID: " input
    if [ -z "$input" ]; then
        print_error "Input is required"
        press_enter
        return
    fi
    
    # Check if input is numeric (ID) or string (API key)
    if [[ "$input" =~ ^[0-9]+$ ]]; then
        where_clause="WHERE id = $input"
    else
        where_clause="WHERE api_key = '$input'"
    fi
    
    # Get API key details
    api_key_data=$($MYSQL_CMD -e "
        SELECT id, api_key, name, email, total_transactions, mainnet_balance, testnet_balance 
        FROM api_keys $where_clause;" 2>/dev/null)
    
    if [ -z "$api_key_data" ]; then
        print_error "API key not found"
        press_enter
        return
    fi
    
    api_key_id=$(echo "$api_key_data" | cut -f1)
    api_key=$(echo "$api_key_data" | cut -f2)
    name=$(echo "$api_key_data" | cut -f3)
    email=$(echo "$api_key_data" | cut -f4)
    total_tx=$(echo "$api_key_data" | cut -f5)
    mainnet_bal=$(echo "$api_key_data" | cut -f6)
    testnet_bal=$(echo "$api_key_data" | cut -f7)
    
    echo ""
    echo -e "${MAGENTA}API Key to Delete:${NC}"
    echo "  ID: $api_key_id"
    echo "  API Key: $api_key"
    echo "  Name: ${name:-<none>}"
    echo "  Email: ${email:-<none>}"
    echo "  Total Transactions: $total_tx"
    echo "  Mainnet Balance: $mainnet_bal USD"
    echo "  Testnet Balance: $testnet_bal USD"
    echo ""
    
    if [ "$total_tx" -gt 0 ]; then
        print_warning "This API key has $total_tx transactions. Related data will be orphaned."
    fi
    
    read -p "Type 'DELETE' to confirm deletion: " confirm
    
    if [ "$confirm" = "DELETE" ]; then
        # Delete related records first
        $MYSQL_CMD -e "
            START TRANSACTION;
            DELETE FROM credit_ledger WHERE api_key_id = $api_key_id;
            DELETE FROM credit_purchases WHERE api_key = '$api_key';
            DELETE FROM api_keys WHERE id = $api_key_id;
            COMMIT;
        " 2>/dev/null
        
        if [ $? -eq 0 ]; then
            print_success "API key deleted successfully"
        else
            print_error "Failed to delete API key"
        fi
    else
        print_warning "Deletion cancelled"
    fi
    
    press_enter
}

# Update API key details
update_api_key() {
    print_header
    echo -e "${BLUE}═══ Update API Key Details ═══${NC}"
    echo ""
    
    read -p "Enter API key or ID: " input
    if [ -z "$input" ]; then
        print_error "Input is required"
        press_enter
        return
    fi
    
    # Check if input is numeric (ID) or string (API key)
    if [[ "$input" =~ ^[0-9]+$ ]]; then
        where_clause="WHERE id = $input"
    else
        where_clause="WHERE api_key = '$input'"
    fi
    
    # Get current details
    current_data=$($MYSQL_CMD -e "
        SELECT id, api_key, name, email 
        FROM api_keys $where_clause;" 2>/dev/null)
    
    if [ -z "$current_data" ]; then
        print_error "API key not found"
        press_enter
        return
    fi
    
    api_key_id=$(echo "$current_data" | cut -f1)
    api_key=$(echo "$current_data" | cut -f2)
    current_name=$(echo "$current_data" | cut -f3)
    current_email=$(echo "$current_data" | cut -f4)
    
    echo ""
    echo "Current details:"
    echo "  API Key: $api_key"
    echo "  Name: ${current_name:-<none>}"
    echo "  Email: ${current_email:-<none>}"
    echo ""
    echo "Enter new values (leave empty to keep current):"
    echo ""
    
    read -p "New name [$current_name]: " new_name
    new_name=${new_name:-$current_name}
    
    read -p "New email [$current_email]: " new_email
    new_email=${new_email:-$current_email}
    
    echo ""
    read -p "Save changes? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        $MYSQL_CMD -e "
            UPDATE api_keys 
            SET name = $([ -n "$new_name" ] && echo "'$new_name'" || echo "NULL"),
                email = $([ -n "$new_email" ] && echo "'$new_email'" || echo "NULL"),
                updated_at = NOW()
            WHERE id = $api_key_id;
        " 2>/dev/null
        
        if [ $? -eq 0 ]; then
            print_success "API key updated successfully"
        else
            print_error "Failed to update API key"
        fi
    else
        print_warning "Cancelled"
    fi
    
    press_enter
}

# Search API keys
search_api_keys() {
    print_header
    echo -e "${BLUE}═══ Search API Keys ═══${NC}"
    echo ""
    
    echo "Search by:"
    echo "1) Email"
    echo "2) Name"
    echo "3) API key (partial)"
    echo ""
    read -p "Choice (1-3): " choice
    
    case $choice in
        1)
            read -p "Enter email (partial): " search_term
            where_clause="WHERE email LIKE '%$search_term%'"
            ;;
        2)
            read -p "Enter name (partial): " search_term
            where_clause="WHERE name LIKE '%$search_term%'"
            ;;
        3)
            read -p "Enter API key (partial): " search_term
            where_clause="WHERE api_key LIKE '%$search_term%'"
            ;;
        *)
            print_error "Invalid choice"
            press_enter
            return
            ;;
    esac
    
    echo ""
    $MYSQL_TABLE -e "
        SELECT 
            id AS ID,
            SUBSTRING(api_key, 1, 25) AS 'API Key',
            COALESCE(name, '-') AS 'Name',
            COALESCE(email, '-') AS 'Email',
            FORMAT(mainnet_balance, 2) AS 'Mainnet',
            IF(is_active, 'Yes', 'No') AS 'Active',
            DATE_FORMAT(created_at, '%Y-%m-%d') AS 'Created'
        FROM api_keys
        $where_clause
        ORDER BY created_at DESC
        LIMIT 50;
    " 2>/dev/null
    
    press_enter
}

# API key statistics
api_key_stats() {
    print_header
    echo -e "${BLUE}═══ API Key Statistics ═══${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            'Total API Keys' AS Metric,
            COUNT(*) AS Value
        FROM api_keys
        UNION ALL
        SELECT 
            'Active API Keys',
            COUNT(*)
        FROM api_keys WHERE is_active = TRUE
        UNION ALL
        SELECT 
            'Disabled API Keys',
            COUNT(*)
        FROM api_keys WHERE is_active = FALSE
        UNION ALL
        SELECT 
            'Live Keys (mainnet)',
            COUNT(*)
        FROM api_keys WHERE api_key LIKE 'x402_live_%'
        UNION ALL
        SELECT 
            'Test Keys (testnet)',
            COUNT(*)
        FROM api_keys WHERE api_key LIKE 'x402_test_%'
        UNION ALL
        SELECT 
            'Keys with transactions',
            COUNT(*)
        FROM api_keys WHERE total_transactions > 0
        UNION ALL
        SELECT 
            'Created this week',
            COUNT(*)
        FROM api_keys WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY);
    " 2>/dev/null
    
    echo ""
    echo -e "${MAGENTA}Top 10 by Transaction Count:${NC}"
    $MYSQL_TABLE -e "
        SELECT 
            SUBSTRING(api_key, 1, 20) AS 'API Key',
            COALESCE(name, '-') AS 'Name',
            total_transactions AS 'Transactions',
            successful_transactions AS 'Successful',
            FORMAT(mainnet_balance, 2) AS 'Mainnet Balance'
        FROM api_keys
        ORDER BY total_transactions DESC
        LIMIT 10;
    " 2>/dev/null
    
    press_enter
}

# Regenerate API key
regenerate_api_key() {
    print_header
    echo -e "${BLUE}═══ Regenerate API Key ═══${NC}"
    echo ""
    
    print_warning "This will generate a NEW API key and invalidate the old one!"
    echo ""
    
    read -p "Enter current API key or ID: " input
    if [ -z "$input" ]; then
        print_error "Input is required"
        press_enter
        return
    fi
    
    # Check if input is numeric (ID) or string (API key)
    if [[ "$input" =~ ^[0-9]+$ ]]; then
        where_clause="WHERE id = $input"
    else
        where_clause="WHERE api_key = '$input'"
    fi
    
    # Get current details
    current_data=$($MYSQL_CMD -e "
        SELECT id, api_key, name 
        FROM api_keys $where_clause;" 2>/dev/null)
    
    if [ -z "$current_data" ]; then
        print_error "API key not found"
        press_enter
        return
    fi
    
    api_key_id=$(echo "$current_data" | cut -f1)
    old_api_key=$(echo "$current_data" | cut -f2)
    name=$(echo "$current_data" | cut -f3)
    
    # Determine environment type from old key
    if [[ "$old_api_key" == x402_live_* ]]; then
        env_type="live"
    else
        env_type="test"
    fi
    
    new_api_key=$(generate_api_key "$env_type")
    
    echo ""
    echo "Current API Key: $old_api_key"
    echo "Name: ${name:-<none>}"
    echo "New API Key: $new_api_key"
    echo ""
    
    read -p "Generate new key and invalidate old one? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        $MYSQL_CMD -e "
            UPDATE api_keys 
            SET api_key = '$new_api_key', updated_at = NOW() 
            WHERE id = $api_key_id;
        " 2>/dev/null
        
        if [ $? -eq 0 ]; then
            print_success "API key regenerated successfully!"
            echo ""
            echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
            echo -e "${GREEN}║  New API Key: $new_api_key  ║${NC}"
            echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
            echo ""
            print_warning "Save this API key securely - the old key is now invalid!"
        else
            print_error "Failed to regenerate API key"
        fi
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
        echo "    1) List All API Keys"
        echo "    2) View API Key Details"
        echo "    3) Search API Keys"
        echo "    4) API Key Statistics"
        echo ""
        echo "  ${GREEN}Manage:${NC}"
        echo "    5) Create New API Key"
        echo "    6) Update API Key Details"
        echo "    7) Enable/Disable API Key"
        echo "    8) Regenerate API Key"
        echo "    9) Delete API Key"
        echo ""
        echo "    0) Exit"
        echo ""
        read -p "Select option: " choice
        
        case $choice in
            1) list_api_keys ;;
            2) view_api_key ;;
            3) search_api_keys ;;
            4) api_key_stats ;;
            5) create_api_key ;;
            6) update_api_key ;;
            7) toggle_api_key ;;
            8) regenerate_api_key ;;
            9) delete_api_key ;;
            0) echo "Goodbye!"; exit 0 ;;
            *) print_error "Invalid option" ;;
        esac
    done
}

# Run
main_menu
