#!/bin/bash
#
# Purchase History Management Script for x402 Facilitator
# View credit purchase history and manage purchases
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
    echo -e "${CYAN}║           x402 Facilitator - Purchase History                     ║${NC}"
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

# Show purchase summary
show_summary() {
    print_header
    echo -e "${BLUE}═══ Purchase Summary ═══${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            'Total Purchases' AS Metric,
            COUNT(*) AS Value
        FROM credit_purchases
        UNION ALL
        SELECT 
            'Completed Purchases',
            COUNT(*)
        FROM credit_purchases WHERE status = 'completed'
        UNION ALL
        SELECT 
            'Pending Purchases',
            COUNT(*)
        FROM credit_purchases WHERE status = 'pending'
        UNION ALL
        SELECT 
            'Failed Purchases',
            COUNT(*)
        FROM credit_purchases WHERE status = 'failed'
        UNION ALL
        SELECT 
            'Today''s Purchases',
            COUNT(*)
        FROM credit_purchases WHERE DATE(created_at) = CURDATE()
        UNION ALL
        SELECT 
            'This Month',
            COUNT(*)
        FROM credit_purchases WHERE created_at >= DATE_FORMAT(NOW(), '%Y-%m-01');
    " 2>/dev/null
    
    echo ""
    echo -e "${MAGENTA}Revenue by Payment Method (All Time):${NC}"
    $MYSQL_TABLE -e "
        SELECT 
            payment_method AS 'Payment Method',
            COUNT(*) AS 'Count',
            FORMAT(SUM(usd_amount), 2) AS 'Total USD'
        FROM credit_purchases
        WHERE status = 'completed'
        GROUP BY payment_method
        ORDER BY SUM(usd_amount) DESC;
    " 2>/dev/null
    
    echo ""
    echo -e "${MAGENTA}Revenue by Month (Last 12 Months):${NC}"
    $MYSQL_TABLE -e "
        SELECT 
            DATE_FORMAT(created_at, '%Y-%m') AS 'Month',
            COUNT(*) AS 'Purchases',
            FORMAT(SUM(usd_amount), 2) AS 'Total USD'
        FROM credit_purchases
        WHERE status = 'completed'
          AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ORDER BY DATE_FORMAT(created_at, '%Y-%m') DESC;
    " 2>/dev/null
    
    press_enter
}

# List recent purchases
list_recent() {
    print_header
    echo -e "${BLUE}═══ Recent Purchases (Last 50) ═══${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            cp.id AS ID,
            SUBSTRING(cp.api_key, 1, 15) AS 'API Key',
            FORMAT(cp.usd_amount, 2) AS 'Amount',
            cp.payment_method AS 'Method',
            cp.status AS 'Status',
            IF(cp.is_testnet, 'Test', 'Main') AS 'Network',
            COALESCE(CONCAT(LEFT(cp.transaction_hash, 10), '...'), '-') AS 'Tx Hash',
            DATE_FORMAT(cp.created_at, '%Y-%m-%d %H:%i') AS 'Created'
        FROM credit_purchases cp
        ORDER BY cp.created_at DESC
        LIMIT 50;
    " 2>/dev/null
    
    press_enter
}

# Search by API key
search_by_api_key() {
    print_header
    echo -e "${BLUE}═══ Search Purchases by API Key ═══${NC}"
    echo ""
    
    read -p "Enter API key (or partial): " api_key
    if [ -z "$api_key" ]; then
        print_error "API key is required"
        press_enter
        return
    fi
    
    echo ""
    echo -e "${MAGENTA}Purchases for API key containing '$api_key':${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            cp.id AS ID,
            cp.api_key AS 'API Key',
            FORMAT(cp.usd_amount, 2) AS 'Amount USD',
            cp.payment_method AS 'Method',
            cp.status AS 'Status',
            IF(cp.is_testnet, 'Testnet', 'Mainnet') AS 'Network',
            COALESCE(cp.payment_reference, '-') AS 'Reference',
            COALESCE(cp.transaction_hash, '-') AS 'Tx Hash',
            DATE_FORMAT(cp.created_at, '%Y-%m-%d %H:%i:%s') AS 'Created'
        FROM credit_purchases cp
        WHERE cp.api_key LIKE '%$api_key%'
        ORDER BY cp.created_at DESC
        LIMIT 100;
    " 2>/dev/null
    
    # Show totals
    echo ""
    $MYSQL_TABLE -e "
        SELECT 
            COUNT(*) AS 'Total Purchases',
            FORMAT(SUM(CASE WHEN status = 'completed' THEN usd_amount ELSE 0 END), 2) AS 'Total Completed USD'
        FROM credit_purchases
        WHERE api_key LIKE '%$api_key%';
    " 2>/dev/null
    
    press_enter
}

# View purchase details
view_purchase_details() {
    print_header
    echo -e "${BLUE}═══ Purchase Details ═══${NC}"
    echo ""
    
    read -p "Enter purchase ID: " purchase_id
    if [ -z "$purchase_id" ]; then
        print_error "Purchase ID is required"
        press_enter
        return
    fi
    
    echo ""
    $MYSQL_TABLE -e "
        SELECT 
            cp.id AS 'Purchase ID',
            cp.api_key AS 'API Key',
            FORMAT(cp.usd_amount, 6) AS 'USD Amount',
            cp.payment_method AS 'Payment Method',
            cp.payment_reference AS 'Payment Reference',
            cp.network AS 'Network (if crypto)',
            IF(cp.is_testnet, 'Yes', 'No') AS 'Is Testnet',
            cp.payer_address AS 'Payer Address',
            cp.transaction_hash AS 'Transaction Hash',
            cp.status AS 'Status',
            cp.created_at AS 'Created At',
            cp.completed_at AS 'Completed At'
        FROM credit_purchases cp
        WHERE cp.id = $purchase_id\G
    " 2>/dev/null
    
    press_enter
}

# Filter by status
filter_by_status() {
    print_header
    echo -e "${BLUE}═══ Filter by Status ═══${NC}"
    echo ""
    
    echo "1) Pending"
    echo "2) Completed"
    echo "3) Failed"
    echo "4) Refunded"
    echo ""
    read -p "Select status (1-4): " choice
    
    case $choice in
        1) status="pending" ;;
        2) status="completed" ;;
        3) status="failed" ;;
        4) status="refunded" ;;
        *) print_error "Invalid choice"; press_enter; return ;;
    esac
    
    echo ""
    echo -e "${MAGENTA}Purchases with status '$status':${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            cp.id AS ID,
            SUBSTRING(cp.api_key, 1, 15) AS 'API Key',
            FORMAT(cp.usd_amount, 2) AS 'Amount',
            cp.payment_method AS 'Method',
            IF(cp.is_testnet, 'Test', 'Main') AS 'Network',
            DATE_FORMAT(cp.created_at, '%Y-%m-%d %H:%i') AS 'Created'
        FROM credit_purchases cp
        WHERE cp.status = '$status'
        ORDER BY cp.created_at DESC
        LIMIT 100;
    " 2>/dev/null
    
    press_enter
}

# Filter by payment method
filter_by_method() {
    print_header
    echo -e "${BLUE}═══ Filter by Payment Method ═══${NC}"
    echo ""
    
    echo "1) Stripe"
    echo "2) Crypto"
    echo "3) Manual"
    echo "4) Referral"
    echo "5) Bonus"
    echo ""
    read -p "Select method (1-5): " choice
    
    case $choice in
        1) method="stripe" ;;
        2) method="crypto" ;;
        3) method="manual" ;;
        4) method="referral" ;;
        5) method="bonus" ;;
        *) print_error "Invalid choice"; press_enter; return ;;
    esac
    
    echo ""
    echo -e "${MAGENTA}Purchases via '$method':${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            cp.id AS ID,
            SUBSTRING(cp.api_key, 1, 15) AS 'API Key',
            FORMAT(cp.usd_amount, 2) AS 'Amount',
            cp.status AS 'Status',
            IF(cp.is_testnet, 'Test', 'Main') AS 'Network',
            COALESCE(cp.payment_reference, '-') AS 'Reference',
            DATE_FORMAT(cp.created_at, '%Y-%m-%d %H:%i') AS 'Created'
        FROM credit_purchases cp
        WHERE cp.payment_method = '$method'
        ORDER BY cp.created_at DESC
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
    echo "5) This month"
    echo "6) Custom range"
    echo ""
    read -p "Select option (1-6): " choice
    
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
            start_date="DATE_FORMAT(NOW(), '%Y-%m-01')"
            end_date="NOW()"
            label="This month"
            ;;
        6)
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
    echo -e "${MAGENTA}Purchases for $label:${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            cp.id AS ID,
            SUBSTRING(cp.api_key, 1, 15) AS 'API Key',
            FORMAT(cp.usd_amount, 2) AS 'Amount',
            cp.payment_method AS 'Method',
            cp.status AS 'Status',
            IF(cp.is_testnet, 'Test', 'Main') AS 'Network',
            DATE_FORMAT(cp.created_at, '%Y-%m-%d %H:%i') AS 'Created'
        FROM credit_purchases cp
        WHERE cp.created_at BETWEEN $start_date AND $end_date
        ORDER BY cp.created_at DESC
        LIMIT 200;
    " 2>/dev/null
    
    # Show summary
    echo ""
    echo -e "${BLUE}Summary:${NC}"
    $MYSQL_TABLE -e "
        SELECT 
            COUNT(*) AS 'Total',
            SUM(status = 'completed') AS 'Completed',
            SUM(status = 'pending') AS 'Pending',
            SUM(status = 'failed') AS 'Failed',
            FORMAT(SUM(CASE WHEN status = 'completed' THEN usd_amount ELSE 0 END), 2) AS 'Revenue (USD)'
        FROM credit_purchases
        WHERE created_at BETWEEN $start_date AND $end_date;
    " 2>/dev/null
    
    press_enter
}

# Create manual purchase
create_manual_purchase() {
    print_header
    echo -e "${BLUE}═══ Create Manual Purchase ═══${NC}"
    echo ""
    
    print_info "Use this to record manual/offline credit purchases"
    echo ""
    
    read -p "Enter API key: " api_key
    if [ -z "$api_key" ]; then
        print_error "API key is required"
        press_enter
        return
    fi
    
    # Check if API key exists
    api_key_exists=$($MYSQL_CMD -e "SELECT COUNT(*) FROM api_keys WHERE api_key = '$api_key';" 2>/dev/null)
    if [ "$api_key_exists" = "0" ]; then
        print_error "API key not found"
        press_enter
        return
    fi
    
    read -p "Amount (USD): " amount
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
    
    echo ""
    echo "Network type:"
    echo "1) Mainnet"
    echo "2) Testnet"
    read -p "Choice (1-2): " network_choice
    
    case $network_choice in
        1) is_testnet="FALSE"; network_type="mainnet" ;;
        2) is_testnet="TRUE"; network_type="testnet" ;;
        *)
            print_error "Invalid choice"
            press_enter
            return
            ;;
    esac
    
    read -p "Payment reference (optional): " reference
    
    echo ""
    echo -e "${MAGENTA}Manual Purchase Details:${NC}"
    echo "  API Key: $api_key"
    echo "  Amount: $amount USD"
    echo "  Network: $network_type"
    echo "  Reference: ${reference:-<none>}"
    echo ""
    
    read -p "Create purchase and add credits? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        # Get API key ID and current balance
        api_key_data=$($MYSQL_CMD -e "
            SELECT id, mainnet_balance, testnet_balance 
            FROM api_keys WHERE api_key = '$api_key';" 2>/dev/null)
        
        api_key_id=$(echo "$api_key_data" | cut -f1)
        
        if [ "$network_type" = "mainnet" ]; then
            current_balance=$(echo "$api_key_data" | cut -f2)
            balance_column="mainnet_balance"
            lifetime_column="lifetime_mainnet_purchased"
        else
            current_balance=$(echo "$api_key_data" | cut -f3)
            balance_column="testnet_balance"
            lifetime_column="lifetime_testnet_purchased"
        fi
        
        new_balance=$(echo "$current_balance + $amount" | bc)
        
        # Create purchase and update balance in transaction
        $MYSQL_CMD -e "
            START TRANSACTION;
            
            INSERT INTO credit_purchases (
                api_key, usd_amount, payment_method, payment_reference,
                is_testnet, status, created_at, completed_at
            ) VALUES (
                '$api_key', $amount, 'manual', 
                $([ -n "$reference" ] && echo "'$reference'" || echo "NULL"),
                $is_testnet, 'completed', NOW(), NOW()
            );
            
            SET @purchase_id = LAST_INSERT_ID();
            
            UPDATE api_keys 
            SET $balance_column = $balance_column + $amount,
                $lifetime_column = $lifetime_column + $amount,
                lifetime_credits_purchased = lifetime_credits_purchased + $amount,
                updated_at = NOW()
            WHERE api_key = '$api_key';
            
            INSERT INTO credit_ledger (
                api_key_id, purchase_id, entry_type, network_type, amount,
                balance_before, balance_after, description, created_at
            ) VALUES (
                $api_key_id, @purchase_id, 'purchase', '$network_type', $amount,
                $current_balance, $new_balance, 'Manual credit purchase', NOW()
            );
            
            COMMIT;
        " 2>/dev/null
        
        if [ $? -eq 0 ]; then
            print_success "Manual purchase created and credits added!"
            print_success "New $network_type balance: $new_balance USD"
        else
            print_error "Failed to create purchase"
        fi
    else
        print_warning "Cancelled"
    fi
    
    press_enter
}

# Update purchase status
update_purchase_status() {
    print_header
    echo -e "${BLUE}═══ Update Purchase Status ═══${NC}"
    echo ""
    
    read -p "Enter purchase ID: " purchase_id
    if [ -z "$purchase_id" ]; then
        print_error "Purchase ID is required"
        press_enter
        return
    fi
    
    # Get current status
    current_data=$($MYSQL_CMD -e "
        SELECT id, api_key, usd_amount, status, is_testnet 
        FROM credit_purchases 
        WHERE id = $purchase_id;" 2>/dev/null)
    
    if [ -z "$current_data" ]; then
        print_error "Purchase not found"
        press_enter
        return
    fi
    
    api_key=$(echo "$current_data" | cut -f2)
    amount=$(echo "$current_data" | cut -f3)
    current_status=$(echo "$current_data" | cut -f4)
    is_testnet=$(echo "$current_data" | cut -f5)
    
    echo ""
    echo "Purchase ID: $purchase_id"
    echo "API Key: $api_key"
    echo "Amount: $amount USD"
    echo "Current Status: $current_status"
    echo ""
    
    echo "New status:"
    echo "1) Pending"
    echo "2) Completed"
    echo "3) Failed"
    echo "4) Refunded"
    echo ""
    read -p "Select new status (1-4): " choice
    
    case $choice in
        1) new_status="pending" ;;
        2) new_status="completed" ;;
        3) new_status="failed" ;;
        4) new_status="refunded" ;;
        *)
            print_error "Invalid choice"
            press_enter
            return
            ;;
    esac
    
    if [ "$new_status" = "$current_status" ]; then
        print_warning "Status is already '$current_status'"
        press_enter
        return
    fi
    
    read -p "Change status from '$current_status' to '$new_status'? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        # If completing a pending purchase, add credits
        if [ "$current_status" = "pending" ] && [ "$new_status" = "completed" ]; then
            print_info "Adding credits to API key..."
            
            if [ "$is_testnet" = "1" ]; then
                balance_column="testnet_balance"
                lifetime_column="lifetime_testnet_purchased"
            else
                balance_column="mainnet_balance"
                lifetime_column="lifetime_mainnet_purchased"
            fi
            
            $MYSQL_CMD -e "
                UPDATE credit_purchases 
                SET status = '$new_status', completed_at = NOW() 
                WHERE id = $purchase_id;
                
                UPDATE api_keys 
                SET $balance_column = $balance_column + $amount,
                    $lifetime_column = $lifetime_column + $amount,
                    lifetime_credits_purchased = lifetime_credits_purchased + $amount,
                    updated_at = NOW()
                WHERE api_key = '$api_key';
            " 2>/dev/null
        # If refunding a completed purchase, deduct credits
        elif [ "$current_status" = "completed" ] && [ "$new_status" = "refunded" ]; then
            print_warning "Deducting credits from API key..."
            
            if [ "$is_testnet" = "1" ]; then
                balance_column="testnet_balance"
            else
                balance_column="mainnet_balance"
            fi
            
            $MYSQL_CMD -e "
                UPDATE credit_purchases 
                SET status = '$new_status' 
                WHERE id = $purchase_id;
                
                UPDATE api_keys 
                SET $balance_column = $balance_column - $amount,
                    updated_at = NOW()
                WHERE api_key = '$api_key';
            " 2>/dev/null
        else
            # Just update status
            $MYSQL_CMD -e "
                UPDATE credit_purchases 
                SET status = '$new_status' 
                WHERE id = $purchase_id;
            " 2>/dev/null
        fi
        
        if [ $? -eq 0 ]; then
            print_success "Status updated to '$new_status'"
        else
            print_error "Failed to update status"
        fi
    else
        print_warning "Cancelled"
    fi
    
    press_enter
}

# Export to CSV
export_to_csv() {
    print_header
    echo -e "${BLUE}═══ Export Purchases to CSV ═══${NC}"
    echo ""
    
    read -p "Number of days to export (default 30): " days
    days=${days:-30}
    
    filename="/tmp/purchases_export_$(date +%Y%m%d_%H%M%S).csv"
    
    $MYSQL_CMD -e "
        SELECT 
            'ID', 'API Key', 'Amount USD', 'Payment Method', 'Reference', 
            'Network', 'Is Testnet', 'Payer Address', 'Tx Hash', 'Status', 
            'Created At', 'Completed At'
        UNION ALL
        SELECT 
            id,
            api_key,
            usd_amount,
            payment_method,
            COALESCE(payment_reference, ''),
            COALESCE(network, ''),
            IF(is_testnet, 'Yes', 'No'),
            COALESCE(payer_address, ''),
            COALESCE(transaction_hash, ''),
            status,
            created_at,
            COALESCE(completed_at, '')
        FROM credit_purchases
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL $days DAY)
        ORDER BY created_at DESC;
    " 2>/dev/null | sed 's/\t/,/g' > "$filename"
    
    if [ -f "$filename" ]; then
        print_success "Exported to: $filename"
        wc -l "$filename" | awk '{print $1-1 " purchases exported"}'
    else
        print_error "Export failed"
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
        echo "    1) Purchase Summary"
        echo "    2) Recent Purchases"
        echo "    3) View Purchase Details"
        echo ""
        echo "  ${GREEN}Search:${NC}"
        echo "    4) Search by API Key"
        echo ""
        echo "  ${GREEN}Filter:${NC}"
        echo "    5) Filter by Status"
        echo "    6) Filter by Payment Method"
        echo "    7) Filter by Date Range"
        echo ""
        echo "  ${GREEN}Actions:${NC}"
        echo "    8) Create Manual Purchase"
        echo "    9) Update Purchase Status"
        echo "    10) Export to CSV"
        echo ""
        echo "    0) Exit"
        echo ""
        read -p "Select option: " choice
        
        case $choice in
            1) show_summary ;;
            2) list_recent ;;
            3) view_purchase_details ;;
            4) search_by_api_key ;;
            5) filter_by_status ;;
            6) filter_by_method ;;
            7) filter_by_date ;;
            8) create_manual_purchase ;;
            9) update_purchase_status ;;
            10) export_to_csv ;;
            0) echo "Goodbye!"; exit 0 ;;
            *) print_error "Invalid option" ;;
        esac
    done
}

# Run
main_menu
