#!/bin/bash
#
# Credit Management Script for x402 Facilitator
# Add/deduct credits, view ledger, manage balances
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
    echo -e "${CYAN}║           x402 Facilitator - Credit Management                    ║${NC}"
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

# Show all API key balances
show_all_balances() {
    print_header
    echo -e "${BLUE}═══ All API Key Balances ═══${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            id AS ID,
            SUBSTRING(api_key, 1, 20) AS 'API Key',
            COALESCE(email, '-') AS Email,
            FORMAT(mainnet_balance, 6) AS 'Mainnet Balance',
            FORMAT(testnet_balance, 6) AS 'Testnet Balance',
            FORMAT(usd_balance, 6) AS 'USD Balance',
            total_transactions AS 'Total Tx',
            IF(is_active, 'Yes', 'No') AS Active
        FROM api_keys
        ORDER BY mainnet_balance DESC;
    " 2>/dev/null
    
    press_enter
}

# View specific API key balance
view_api_key_balance() {
    print_header
    echo -e "${BLUE}═══ View API Key Balance ═══${NC}"
    echo ""
    
    read -p "Enter API key (or partial): " api_key
    if [ -z "$api_key" ]; then
        print_error "API key is required"
        press_enter
        return
    fi
    
    echo ""
    $MYSQL_TABLE -e "
        SELECT 
            id AS 'ID',
            api_key AS 'API Key',
            COALESCE(email, '-') AS 'Email',
            COALESCE(name, '-') AS 'Name',
            FORMAT(mainnet_balance, 10) AS 'Mainnet Balance (USD)',
            FORMAT(testnet_balance, 10) AS 'Testnet Balance (USD)',
            FORMAT(usd_balance, 10) AS 'USD Balance',
            FORMAT(lifetime_mainnet_purchased, 10) AS 'Lifetime Mainnet Purchased',
            FORMAT(lifetime_testnet_purchased, 10) AS 'Lifetime Testnet Purchased',
            FORMAT(lifetime_mainnet_used, 10) AS 'Lifetime Mainnet Used',
            FORMAT(lifetime_testnet_used, 10) AS 'Lifetime Testnet Used',
            total_transactions AS 'Total Transactions',
            successful_transactions AS 'Successful Transactions',
            failed_transactions AS 'Failed Transactions',
            IF(is_active, 'Yes', 'No') AS 'Is Active',
            created_at AS 'Created At',
            last_used_at AS 'Last Used At'
        FROM api_keys
        WHERE api_key LIKE '%$api_key%'
        LIMIT 1\G
    " 2>/dev/null
    
    press_enter
}

# Add credits to API key
add_credits() {
    print_header
    echo -e "${BLUE}═══ Add Credits to API Key ═══${NC}"
    echo ""
    
    read -p "Enter API key: " api_key
    if [ -z "$api_key" ]; then
        print_error "API key is required"
        press_enter
        return
    fi
    
    # Check if API key exists and get current balance
    api_key_data=$($MYSQL_CMD -e "
        SELECT id, api_key, mainnet_balance, testnet_balance 
        FROM api_keys 
        WHERE api_key = '$api_key';" 2>/dev/null)
    
    if [ -z "$api_key_data" ]; then
        print_error "API key not found"
        press_enter
        return
    fi
    
    api_key_id=$(echo "$api_key_data" | cut -f1)
    current_mainnet=$(echo "$api_key_data" | cut -f3)
    current_testnet=$(echo "$api_key_data" | cut -f4)
    
    echo ""
    echo -e "${MAGENTA}Current balances:${NC}"
    echo "  Mainnet: $current_mainnet USD"
    echo "  Testnet: $current_testnet USD"
    echo ""
    
    echo "Select balance type:"
    echo "1) Mainnet"
    echo "2) Testnet"
    read -p "Choice (1-2): " balance_type
    
    case $balance_type in
        1) 
            balance_column="mainnet_balance"
            lifetime_column="lifetime_mainnet_purchased"
            network_type="mainnet"
            current_balance="$current_mainnet"
            ;;
        2) 
            balance_column="testnet_balance"
            lifetime_column="lifetime_testnet_purchased"
            network_type="testnet"
            current_balance="$current_testnet"
            ;;
        *)
            print_error "Invalid choice"
            press_enter
            return
            ;;
    esac
    
    read -p "Amount to add (USD): " amount
    if [ -z "$amount" ]; then
        print_error "Amount is required"
        press_enter
        return
    fi
    
    # Validate amount is a number
    if ! [[ "$amount" =~ ^[0-9]+\.?[0-9]*$ ]]; then
        print_error "Invalid amount format"
        press_enter
        return
    fi
    
    read -p "Description/Reason: " description
    description=${description:-"Manual credit addition by admin"}
    
    echo ""
    print_warning "You are about to add $amount USD to $network_type balance for API key: $api_key"
    read -p "Confirm? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        # Start transaction
        new_balance=$(echo "$current_balance + $amount" | bc)
        
        # Update balance
        $MYSQL_CMD -e "
            START TRANSACTION;
            
            UPDATE api_keys 
            SET $balance_column = $balance_column + $amount,
                $lifetime_column = $lifetime_column + $amount,
                updated_at = NOW()
            WHERE api_key = '$api_key';
            
            INSERT INTO credit_ledger (
                api_key_id, entry_type, network_type, amount, 
                balance_before, balance_after, description, created_at
            ) VALUES (
                $api_key_id, 'adjustment', '$network_type', $amount,
                $current_balance, $new_balance, '$description', NOW()
            );
            
            COMMIT;
        " 2>/dev/null
        
        if [ $? -eq 0 ]; then
            print_success "Added $amount USD to $network_type balance"
            print_success "New balance: $new_balance USD"
        else
            print_error "Failed to add credits"
        fi
    else
        print_warning "Cancelled"
    fi
    
    press_enter
}

# Deduct credits from API key
deduct_credits() {
    print_header
    echo -e "${BLUE}═══ Deduct Credits from API Key ═══${NC}"
    echo ""
    
    read -p "Enter API key: " api_key
    if [ -z "$api_key" ]; then
        print_error "API key is required"
        press_enter
        return
    fi
    
    # Check if API key exists and get current balance
    api_key_data=$($MYSQL_CMD -e "
        SELECT id, api_key, mainnet_balance, testnet_balance 
        FROM api_keys 
        WHERE api_key = '$api_key';" 2>/dev/null)
    
    if [ -z "$api_key_data" ]; then
        print_error "API key not found"
        press_enter
        return
    fi
    
    api_key_id=$(echo "$api_key_data" | cut -f1)
    current_mainnet=$(echo "$api_key_data" | cut -f3)
    current_testnet=$(echo "$api_key_data" | cut -f4)
    
    echo ""
    echo -e "${MAGENTA}Current balances:${NC}"
    echo "  Mainnet: $current_mainnet USD"
    echo "  Testnet: $current_testnet USD"
    echo ""
    
    echo "Select balance type:"
    echo "1) Mainnet"
    echo "2) Testnet"
    read -p "Choice (1-2): " balance_type
    
    case $balance_type in
        1) 
            balance_column="mainnet_balance"
            lifetime_column="lifetime_mainnet_used"
            network_type="mainnet"
            current_balance="$current_mainnet"
            ;;
        2) 
            balance_column="testnet_balance"
            lifetime_column="lifetime_testnet_used"
            network_type="testnet"
            current_balance="$current_testnet"
            ;;
        *)
            print_error "Invalid choice"
            press_enter
            return
            ;;
    esac
    
    read -p "Amount to deduct (USD): " amount
    if [ -z "$amount" ]; then
        print_error "Amount is required"
        press_enter
        return
    fi
    
    # Validate amount is a number
    if ! [[ "$amount" =~ ^[0-9]+\.?[0-9]*$ ]]; then
        print_error "Invalid amount format"
        press_enter
        return
    fi
    
    # Check if enough balance
    if (( $(echo "$amount > $current_balance" | bc -l) )); then
        print_error "Insufficient balance. Current: $current_balance USD"
        press_enter
        return
    fi
    
    read -p "Description/Reason: " description
    description=${description:-"Manual credit deduction by admin"}
    
    echo ""
    print_warning "You are about to deduct $amount USD from $network_type balance for API key: $api_key"
    read -p "Confirm? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        new_balance=$(echo "$current_balance - $amount" | bc)
        
        # Update balance
        $MYSQL_CMD -e "
            START TRANSACTION;
            
            UPDATE api_keys 
            SET $balance_column = $balance_column - $amount,
                $lifetime_column = $lifetime_column + $amount,
                updated_at = NOW()
            WHERE api_key = '$api_key';
            
            INSERT INTO credit_ledger (
                api_key_id, entry_type, network_type, amount, 
                balance_before, balance_after, description, created_at
            ) VALUES (
                $api_key_id, 'adjustment', '$network_type', -$amount,
                $current_balance, $new_balance, '$description', NOW()
            );
            
            COMMIT;
        " 2>/dev/null
        
        if [ $? -eq 0 ]; then
            print_success "Deducted $amount USD from $network_type balance"
            print_success "New balance: $new_balance USD"
        else
            print_error "Failed to deduct credits"
        fi
    else
        print_warning "Cancelled"
    fi
    
    press_enter
}

# View credit ledger
view_credit_ledger() {
    print_header
    echo -e "${BLUE}═══ Credit Ledger ═══${NC}"
    echo ""
    
    read -p "Enter API key (leave empty for all): " api_key
    
    if [ -n "$api_key" ]; then
        # Get API key ID
        api_key_id=$($MYSQL_CMD -e "SELECT id FROM api_keys WHERE api_key = '$api_key';" 2>/dev/null)
        if [ -z "$api_key_id" ]; then
            print_error "API key not found"
            press_enter
            return
        fi
        where_clause="WHERE cl.api_key_id = $api_key_id"
    else
        where_clause=""
    fi
    
    echo ""
    $MYSQL_TABLE -e "
        SELECT 
            cl.id AS ID,
            SUBSTRING(ak.api_key, 1, 15) AS 'API Key',
            cl.entry_type AS 'Type',
            cl.network_type AS 'Network',
            FORMAT(cl.amount, 6) AS 'Amount',
            FORMAT(cl.balance_before, 6) AS 'Before',
            FORMAT(cl.balance_after, 6) AS 'After',
            SUBSTRING(cl.description, 1, 30) AS 'Description',
            DATE_FORMAT(cl.created_at, '%Y-%m-%d %H:%i') AS 'Created'
        FROM credit_ledger cl
        JOIN api_keys ak ON cl.api_key_id = ak.id
        $where_clause
        ORDER BY cl.created_at DESC
        LIMIT 100;
    " 2>/dev/null
    
    press_enter
}

# Credit ledger summary
credit_ledger_summary() {
    print_header
    echo -e "${BLUE}═══ Credit Ledger Summary ═══${NC}"
    echo ""
    
    echo -e "${MAGENTA}By Entry Type (All Time):${NC}"
    $MYSQL_TABLE -e "
        SELECT 
            entry_type AS 'Entry Type',
            network_type AS 'Network',
            COUNT(*) AS 'Count',
            FORMAT(SUM(amount), 6) AS 'Total Amount'
        FROM credit_ledger
        GROUP BY entry_type, network_type
        ORDER BY entry_type, network_type;
    " 2>/dev/null
    
    echo ""
    echo -e "${MAGENTA}Last 7 Days Activity:${NC}"
    $MYSQL_TABLE -e "
        SELECT 
            DATE(created_at) AS 'Date',
            entry_type AS 'Type',
            COUNT(*) AS 'Count',
            FORMAT(SUM(amount), 6) AS 'Amount'
        FROM credit_ledger
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(created_at), entry_type
        ORDER BY DATE(created_at) DESC, entry_type;
    " 2>/dev/null
    
    press_enter
}

# Set balance directly
set_balance() {
    print_header
    echo -e "${BLUE}═══ Set Balance Directly ═══${NC}"
    echo ""
    
    print_warning "This will set the balance to an exact value (use with caution)"
    echo ""
    
    read -p "Enter API key: " api_key
    if [ -z "$api_key" ]; then
        print_error "API key is required"
        press_enter
        return
    fi
    
    # Check if API key exists
    api_key_data=$($MYSQL_CMD -e "
        SELECT id, api_key, mainnet_balance, testnet_balance 
        FROM api_keys 
        WHERE api_key = '$api_key';" 2>/dev/null)
    
    if [ -z "$api_key_data" ]; then
        print_error "API key not found"
        press_enter
        return
    fi
    
    api_key_id=$(echo "$api_key_data" | cut -f1)
    current_mainnet=$(echo "$api_key_data" | cut -f3)
    current_testnet=$(echo "$api_key_data" | cut -f4)
    
    echo ""
    echo -e "${MAGENTA}Current balances:${NC}"
    echo "  Mainnet: $current_mainnet USD"
    echo "  Testnet: $current_testnet USD"
    echo ""
    
    echo "Select balance type:"
    echo "1) Mainnet"
    echo "2) Testnet"
    read -p "Choice (1-2): " balance_type
    
    case $balance_type in
        1) 
            balance_column="mainnet_balance"
            network_type="mainnet"
            current_balance="$current_mainnet"
            ;;
        2) 
            balance_column="testnet_balance"
            network_type="testnet"
            current_balance="$current_testnet"
            ;;
        *)
            print_error "Invalid choice"
            press_enter
            return
            ;;
    esac
    
    read -p "New balance (USD): " new_balance
    if [ -z "$new_balance" ]; then
        print_error "New balance is required"
        press_enter
        return
    fi
    
    # Validate amount is a number
    if ! [[ "$new_balance" =~ ^[0-9]+\.?[0-9]*$ ]]; then
        print_error "Invalid amount format"
        press_enter
        return
    fi
    
    read -p "Reason for change: " description
    description=${description:-"Balance set by admin"}
    
    echo ""
    print_warning "Changing $network_type balance from $current_balance to $new_balance USD"
    read -p "Confirm? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        amount_diff=$(echo "$new_balance - $current_balance" | bc)
        
        $MYSQL_CMD -e "
            START TRANSACTION;
            
            UPDATE api_keys 
            SET $balance_column = $new_balance,
                updated_at = NOW()
            WHERE api_key = '$api_key';
            
            INSERT INTO credit_ledger (
                api_key_id, entry_type, network_type, amount, 
                balance_before, balance_after, description, created_at
            ) VALUES (
                $api_key_id, 'adjustment', '$network_type', $amount_diff,
                $current_balance, $new_balance, '$description', NOW()
            );
            
            COMMIT;
        " 2>/dev/null
        
        if [ $? -eq 0 ]; then
            print_success "Balance set to $new_balance USD"
        else
            print_error "Failed to set balance"
        fi
    else
        print_warning "Cancelled"
    fi
    
    press_enter
}

# Bulk add credits (bonus to all)
bulk_add_credits() {
    print_header
    echo -e "${BLUE}═══ Bulk Add Credits (Bonus) ═══${NC}"
    echo ""
    
    print_warning "This will add credits to ALL active API keys"
    echo ""
    
    echo "Select balance type:"
    echo "1) Mainnet"
    echo "2) Testnet"
    read -p "Choice (1-2): " balance_type
    
    case $balance_type in
        1) 
            balance_column="mainnet_balance"
            lifetime_column="lifetime_mainnet_purchased"
            network_type="mainnet"
            ;;
        2) 
            balance_column="testnet_balance"
            lifetime_column="lifetime_testnet_purchased"
            network_type="testnet"
            ;;
        *)
            print_error "Invalid choice"
            press_enter
            return
            ;;
    esac
    
    read -p "Amount to add to each API key (USD): " amount
    if [ -z "$amount" ]; then
        print_error "Amount is required"
        press_enter
        return
    fi
    
    # Validate amount is a number
    if ! [[ "$amount" =~ ^[0-9]+\.?[0-9]*$ ]]; then
        print_error "Invalid amount format"
        press_enter
        return
    fi
    
    # Get count of active API keys
    count=$($MYSQL_CMD -e "SELECT COUNT(*) FROM api_keys WHERE is_active = TRUE;" 2>/dev/null)
    
    read -p "Description/Reason: " description
    description=${description:-"Bulk bonus credit addition"}
    
    echo ""
    print_warning "You are about to add $amount USD to $count active API keys"
    print_warning "Total credits to be added: $(echo "$amount * $count" | bc) USD"
    read -p "Confirm? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        # Add credits to all active API keys
        $MYSQL_CMD -e "
            UPDATE api_keys 
            SET $balance_column = $balance_column + $amount,
                $lifetime_column = $lifetime_column + $amount,
                updated_at = NOW()
            WHERE is_active = TRUE;
        " 2>/dev/null
        
        # Log to credit ledger for each
        $MYSQL_CMD -e "
            INSERT INTO credit_ledger (api_key_id, entry_type, network_type, amount, balance_before, balance_after, description, created_at)
            SELECT 
                id,
                'bonus',
                '$network_type',
                $amount,
                $balance_column - $amount,
                $balance_column,
                '$description',
                NOW()
            FROM api_keys
            WHERE is_active = TRUE;
        " 2>/dev/null
        
        print_success "Added $amount USD to $count API keys"
    else
        print_warning "Cancelled"
    fi
    
    press_enter
}

# Low balance alert
low_balance_alert() {
    print_header
    echo -e "${BLUE}═══ Low Balance API Keys ═══${NC}"
    echo ""
    
    read -p "Threshold (USD, default 1.0): " threshold
    threshold=${threshold:-1.0}
    
    echo ""
    echo -e "${MAGENTA}API keys with mainnet balance below $threshold USD:${NC}"
    $MYSQL_TABLE -e "
        SELECT 
            id AS ID,
            SUBSTRING(api_key, 1, 20) AS 'API Key',
            COALESCE(email, '-') AS Email,
            FORMAT(mainnet_balance, 6) AS 'Mainnet Balance',
            total_transactions AS 'Total Tx',
            DATE_FORMAT(last_used_at, '%Y-%m-%d') AS 'Last Used'
        FROM api_keys
        WHERE mainnet_balance < $threshold
          AND is_active = TRUE
        ORDER BY mainnet_balance ASC;
    " 2>/dev/null
    
    press_enter
}

# Main menu
main_menu() {
    while true; do
        print_header
        echo -e "${YELLOW}Main Menu:${NC}"
        echo ""
        echo "  ${GREEN}View:${NC}"
        echo "    1) All API Key Balances"
        echo "    2) View Specific API Key Balance"
        echo "    3) Credit Ledger"
        echo "    4) Credit Ledger Summary"
        echo "    5) Low Balance Alert"
        echo ""
        echo "  ${GREEN}Manage:${NC}"
        echo "    6) Add Credits"
        echo "    7) Deduct Credits"
        echo "    8) Set Balance Directly"
        echo "    9) Bulk Add Credits (Bonus)"
        echo ""
        echo "    0) Exit"
        echo ""
        read -p "Select option: " choice
        
        case $choice in
            1) show_all_balances ;;
            2) view_api_key_balance ;;
            3) view_credit_ledger ;;
            4) credit_ledger_summary ;;
            5) low_balance_alert ;;
            6) add_credits ;;
            7) deduct_credits ;;
            8) set_balance ;;
            9) bulk_add_credits ;;
            0) echo "Goodbye!"; exit 0 ;;
            *) print_error "Invalid option" ;;
        esac
    done
}

# Run
main_menu
