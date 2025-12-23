#!/bin/bash
#
# Admin User Management Script for x402 Facilitator
# Interactive menu to manage admin users
#

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Database config
DB_NAME="x402_facilitator"
DB_USER="root"
DB_PASS="setanMERAH@00"

# MySQL command
MYSQL_CMD="mysql -u $DB_USER -p$DB_PASS $DB_NAME -N -B"
MYSQL_TABLE="mysql -u $DB_USER -p$DB_PASS $DB_NAME"

# Helper functions
print_header() {
    clear
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║        x402 Facilitator - Admin Management            ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
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

press_enter() {
    echo ""
    read -p "Press Enter to continue..."
}

# List all admins
list_admins() {
    print_header
    echo -e "${BLUE}Current Admin Users:${NC}"
    echo ""
    $MYSQL_TABLE -e "
        SELECT 
            id AS ID,
            username AS Username,
            display_name AS 'Display Name',
            COALESCE(wallet_address, '-') AS 'Wallet Address',
            role AS Role,
            IF(is_active, 'Yes', 'No') AS Active,
            COALESCE(DATE_FORMAT(last_login_at, '%Y-%m-%d %H:%i'), 'Never') AS 'Last Login'
        FROM admin_users
        ORDER BY id;
    " 2>/dev/null
    press_enter
}

# Add new admin
add_admin() {
    print_header
    echo -e "${BLUE}Add New Admin User${NC}"
    echo ""
    
    # Username
    read -p "Username: " username
    if [ -z "$username" ]; then
        print_error "Username is required"
        press_enter
        return
    fi
    
    # Check if username exists
    exists=$($MYSQL_CMD -e "SELECT COUNT(*) FROM admin_users WHERE username = '$username';" 2>/dev/null)
    if [ "$exists" -gt 0 ]; then
        print_error "Username '$username' already exists"
        press_enter
        return
    fi
    
    # Display name
    read -p "Display Name (optional): " display_name
    
    # Wallet address
    read -p "Wallet Address (0x...): " wallet_address
    if [ -n "$wallet_address" ]; then
        # Validate format
        if [[ ! "$wallet_address" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
            print_error "Invalid wallet address format"
            press_enter
            return
        fi
        # Convert to lowercase
        wallet_address=$(echo "$wallet_address" | tr '[:upper:]' '[:lower:]')
    fi
    
    # Email
    read -p "Email (optional): " email
    
    # Role
    echo ""
    echo "Select Role:"
    echo "  1) super_admin - Full access"
    echo "  2) admin - Manage merchants & transactions"
    echo "  3) viewer - Read-only access"
    read -p "Role [1-3]: " role_choice
    
    case $role_choice in
        1) role="super_admin" ;;
        2) role="admin" ;;
        3) role="viewer" ;;
        *) role="viewer" ;;
    esac
    
    # Password (for non-SIWE login)
    echo ""
    read -s -p "Password (leave empty for SIWE-only): " password
    echo ""
    
    if [ -n "$password" ]; then
        # Generate bcrypt hash using Python
        password_hash=$(python3 -c "import bcrypt; print(bcrypt.hashpw(b'$password', bcrypt.gensalt()).decode())" 2>/dev/null)
        if [ -z "$password_hash" ]; then
            password_hash="siwe_auth_only"
        fi
    else
        password_hash="siwe_auth_only"
    fi
    
    # Confirmation
    echo ""
    echo -e "${YELLOW}Confirm new admin:${NC}"
    echo "  Username: $username"
    echo "  Display Name: ${display_name:-N/A}"
    echo "  Wallet: ${wallet_address:-N/A}"
    echo "  Email: ${email:-N/A}"
    echo "  Role: $role"
    echo "  Auth: $([ "$password_hash" = "siwe_auth_only" ] && echo "SIWE only" || echo "Password + SIWE")"
    echo ""
    read -p "Create this admin? [y/N]: " confirm
    
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        $MYSQL_CMD -e "
            INSERT INTO admin_users (username, password_hash, display_name, email, wallet_address, role, is_active)
            VALUES ('$username', '$password_hash', $([ -n "$display_name" ] && echo "'$display_name'" || echo "NULL"), $([ -n "$email" ] && echo "'$email'" || echo "NULL"), $([ -n "$wallet_address" ] && echo "'$wallet_address'" || echo "NULL"), '$role', 1);
        " 2>/dev/null
        
        if [ $? -eq 0 ]; then
            print_success "Admin '$username' created successfully"
        else
            print_error "Failed to create admin"
        fi
    else
        print_warning "Cancelled"
    fi
    
    press_enter
}

# Edit admin
edit_admin() {
    print_header
    echo -e "${BLUE}Edit Admin User${NC}"
    echo ""
    
    # Show current admins
    $MYSQL_TABLE -e "SELECT id, username, display_name, role FROM admin_users ORDER BY id;" 2>/dev/null
    echo ""
    
    read -p "Enter Admin ID to edit: " admin_id
    if [ -z "$admin_id" ]; then
        return
    fi
    
    # Check if admin exists
    exists=$($MYSQL_CMD -e "SELECT COUNT(*) FROM admin_users WHERE id = $admin_id;" 2>/dev/null)
    if [ "$exists" -eq 0 ]; then
        print_error "Admin ID $admin_id not found"
        press_enter
        return
    fi
    
    # Get current values
    current=$($MYSQL_CMD -e "SELECT username, display_name, wallet_address, email, role FROM admin_users WHERE id = $admin_id;" 2>/dev/null)
    IFS=$'\t' read -r cur_username cur_display cur_wallet cur_email cur_role <<< "$current"
    
    echo ""
    echo "Current values (press Enter to keep):"
    echo ""
    
    read -p "Username [$cur_username]: " new_username
    new_username=${new_username:-$cur_username}
    
    read -p "Display Name [$cur_display]: " new_display
    new_display=${new_display:-$cur_display}
    
    read -p "Wallet Address [$cur_wallet]: " new_wallet
    new_wallet=${new_wallet:-$cur_wallet}
    
    read -p "Email [$cur_email]: " new_email
    new_email=${new_email:-$cur_email}
    
    echo ""
    echo "Current Role: $cur_role"
    echo "  1) super_admin  2) admin  3) viewer  4) Keep current"
    read -p "New Role [1-4]: " role_choice
    
    case $role_choice in
        1) new_role="super_admin" ;;
        2) new_role="admin" ;;
        3) new_role="viewer" ;;
        *) new_role="$cur_role" ;;
    esac
    
    # Update
    $MYSQL_CMD -e "
        UPDATE admin_users SET
            username = '$new_username',
            display_name = $([ -n "$new_display" ] && echo "'$new_display'" || echo "NULL"),
            wallet_address = $([ -n "$new_wallet" ] && echo "'$new_wallet'" || echo "NULL"),
            email = $([ -n "$new_email" ] && echo "'$new_email'" || echo "NULL"),
            role = '$new_role'
        WHERE id = $admin_id;
    " 2>/dev/null
    
    if [ $? -eq 0 ]; then
        print_success "Admin updated successfully"
    else
        print_error "Failed to update admin"
    fi
    
    press_enter
}

# Toggle admin status
toggle_admin() {
    print_header
    echo -e "${BLUE}Enable/Disable Admin${NC}"
    echo ""
    
    $MYSQL_TABLE -e "SELECT id, username, role, IF(is_active, 'Active', 'Disabled') AS status FROM admin_users ORDER BY id;" 2>/dev/null
    echo ""
    
    read -p "Enter Admin ID to toggle: " admin_id
    if [ -z "$admin_id" ]; then
        return
    fi
    
    current_status=$($MYSQL_CMD -e "SELECT is_active FROM admin_users WHERE id = $admin_id;" 2>/dev/null)
    
    if [ -z "$current_status" ]; then
        print_error "Admin ID $admin_id not found"
        press_enter
        return
    fi
    
    if [ "$current_status" -eq 1 ]; then
        new_status=0
        action="disable"
    else
        new_status=1
        action="enable"
    fi
    
    read -p "Are you sure you want to $action this admin? [y/N]: " confirm
    
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        $MYSQL_CMD -e "UPDATE admin_users SET is_active = $new_status WHERE id = $admin_id;" 2>/dev/null
        
        if [ $? -eq 0 ]; then
            print_success "Admin ${action}d successfully"
        else
            print_error "Failed to $action admin"
        fi
    fi
    
    press_enter
}

# Delete admin
delete_admin() {
    print_header
    echo -e "${RED}Delete Admin User${NC}"
    echo ""
    
    $MYSQL_TABLE -e "SELECT id, username, display_name, role FROM admin_users ORDER BY id;" 2>/dev/null
    echo ""
    
    read -p "Enter Admin ID to DELETE: " admin_id
    if [ -z "$admin_id" ]; then
        return
    fi
    
    # Check if admin exists
    username=$($MYSQL_CMD -e "SELECT username FROM admin_users WHERE id = $admin_id;" 2>/dev/null)
    
    if [ -z "$username" ]; then
        print_error "Admin ID $admin_id not found"
        press_enter
        return
    fi
    
    echo ""
    print_warning "This will permanently delete admin '$username'"
    read -p "Type the username to confirm deletion: " confirm_name
    
    if [ "$confirm_name" = "$username" ]; then
        $MYSQL_CMD -e "DELETE FROM admin_users WHERE id = $admin_id;" 2>/dev/null
        
        if [ $? -eq 0 ]; then
            print_success "Admin '$username' deleted"
        else
            print_error "Failed to delete admin"
        fi
    else
        print_warning "Username doesn't match. Cancelled."
    fi
    
    press_enter
}

# Reset password
reset_password() {
    print_header
    echo -e "${BLUE}Reset Admin Password${NC}"
    echo ""
    
    $MYSQL_TABLE -e "SELECT id, username, display_name FROM admin_users ORDER BY id;" 2>/dev/null
    echo ""
    
    read -p "Enter Admin ID: " admin_id
    if [ -z "$admin_id" ]; then
        return
    fi
    
    username=$($MYSQL_CMD -e "SELECT username FROM admin_users WHERE id = $admin_id;" 2>/dev/null)
    
    if [ -z "$username" ]; then
        print_error "Admin ID $admin_id not found"
        press_enter
        return
    fi
    
    echo ""
    echo "Reset password for: $username"
    read -s -p "New Password (or empty for SIWE-only): " password
    echo ""
    
    if [ -n "$password" ]; then
        password_hash=$(python3 -c "import bcrypt; print(bcrypt.hashpw(b'$password', bcrypt.gensalt()).decode())" 2>/dev/null)
        if [ -z "$password_hash" ]; then
            print_error "Failed to hash password (is python3-bcrypt installed?)"
            press_enter
            return
        fi
    else
        password_hash="siwe_auth_only"
    fi
    
    $MYSQL_CMD -e "UPDATE admin_users SET password_hash = '$password_hash' WHERE id = $admin_id;" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        print_success "Password updated for '$username'"
    else
        print_error "Failed to update password"
    fi
    
    press_enter
}

# View sessions
view_sessions() {
    print_header
    echo -e "${BLUE}Active Admin Sessions${NC}"
    echo ""
    
    $MYSQL_TABLE -e "
        SELECT 
            s.id AS 'Session ID',
            a.username AS Admin,
            s.ip_address AS 'IP Address',
            DATE_FORMAT(s.created_at, '%Y-%m-%d %H:%i') AS 'Created',
            DATE_FORMAT(s.expires_at, '%Y-%m-%d %H:%i') AS 'Expires'
        FROM admin_sessions s
        JOIN admin_users a ON s.admin_id = a.id
        WHERE s.expires_at > NOW()
        ORDER BY s.created_at DESC;
    " 2>/dev/null
    
    echo ""
    read -p "Clear all sessions? [y/N]: " confirm
    
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        $MYSQL_CMD -e "DELETE FROM admin_sessions;" 2>/dev/null
        print_success "All sessions cleared"
    fi
    
    press_enter
}

# Main menu
main_menu() {
    while true; do
        print_header
        echo -e "${YELLOW}Main Menu:${NC}"
        echo ""
        echo "  1) List all admins"
        echo "  2) Add new admin"
        echo "  3) Edit admin"
        echo "  4) Enable/Disable admin"
        echo "  5) Delete admin"
        echo "  6) Reset password"
        echo "  7) View active sessions"
        echo ""
        echo "  0) Exit"
        echo ""
        read -p "Select option [0-7]: " choice
        
        case $choice in
            1) list_admins ;;
            2) add_admin ;;
            3) edit_admin ;;
            4) toggle_admin ;;
            5) delete_admin ;;
            6) reset_password ;;
            7) view_sessions ;;
            0) 
                echo ""
                echo "Goodbye!"
                exit 0 
                ;;
            *) 
                print_error "Invalid option"
                sleep 1
                ;;
        esac
    done
}

# Run
main_menu
