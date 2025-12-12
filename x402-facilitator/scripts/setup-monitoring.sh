#!/bin/bash

# ╔═══════════════════════════════════════════════════════════════════╗
# ║         MONITORING SETUP & CRON CONFIGURATION                     ║
# ╚═══════════════════════════════════════════════════════════════════╝
#
# One-time setup script to configure automated monitoring cronjobs.
# Sets up system monitoring and alerting to run automatically.
#
# USAGE:
#   ./setup-monitoring.sh
#
# WHAT IT DOES:
#   1. Makes monitoring scripts executable
#   2. Creates log files in /var/log
#   3. Configures cronjobs for:
#      - System monitoring (every 5 minutes)
#      - Alert checks (every 2 minutes)
#      - Log rotation (daily at midnight)
#   4. Prompts before overwriting existing cronjobs
#
# CRONJOBS INSTALLED:
#   */5 * * * *  - monitor-system.sh
#   */2 * * * *  - monitor-alerts.sh
#   0 0 * * *    - Log cleanup (7 day retention)
#
# EXAMPLES:
#   ./setup-monitoring.sh
#
# REQUIREMENTS:
#   - crontab access
#   - Write access to /var/log
#   - Monitoring scripts in same directory
#
# POST-SETUP:
#   - Check crontab: crontab -l
#   - View logs: tail -f /var/log/x402-monitor.log
#   - View alerts: tail -f /var/log/x402-alerts.log
#   - Remove: crontab -e (manually delete entries)
#
# NOTES:
#   - Safe to run multiple times (prompts before overwrite)
#   - Logs are auto-rotated after 7 days
#   - Configure alert webhooks in .env before first run

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Setting up x402 Facilitator monitoring cronjobs..."
echo ""

# Make scripts executable
chmod +x "$SCRIPT_DIR/monitor-system.sh"
chmod +x "$SCRIPT_DIR/monitor-alerts.sh"

# Create log directory
sudo mkdir -p /var/log
sudo touch /var/log/x402-monitor.log
sudo touch /var/log/x402-alerts.log
sudo chown $USER:$USER /var/log/x402-monitor.log
sudo chown $USER:$USER /var/log/x402-alerts.log

echo "✓ Made scripts executable"
echo "✓ Created log files"
echo ""

# Create cronjob entries
CRON_ENTRIES="
# x402 Facilitator Monitoring
# Run system monitor every 5 minutes
*/5 * * * * cd ${PROJECT_ROOT} && ${SCRIPT_DIR}/monitor-system.sh >> /var/log/x402-monitor-cron.log 2>&1

# Run alert checks every 2 minutes
*/2 * * * * cd ${PROJECT_ROOT} && ${SCRIPT_DIR}/monitor-alerts.sh >> /var/log/x402-alerts-cron.log 2>&1

# Daily log rotation at midnight
0 0 * * * find /var/log -name 'x402-*.log' -mtime +7 -delete
"

# Check if cronjobs already exist
EXISTING_CRON=$(crontab -l 2>/dev/null | grep -c "x402 Facilitator Monitoring" || true)

if [ "$EXISTING_CRON" -gt 0 ]; then
    echo "⚠️  x402 monitoring cronjobs already exist"
    echo ""
    read -p "Do you want to update them? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipping cronjob setup"
        exit 0
    fi
    
    # Remove existing x402 cronjobs
    crontab -l 2>/dev/null | grep -v "x402 Facilitator Monitoring" | grep -v "monitor-system.sh" | grep -v "monitor-alerts.sh" | crontab -
    echo "✓ Removed old cronjobs"
fi

# Add new cronjobs
(crontab -l 2>/dev/null; echo "$CRON_ENTRIES") | crontab -

echo ""
echo "✓ Cronjobs installed successfully!"
echo ""
echo "Monitoring schedule:"
echo "  • System monitor: Every 5 minutes"
echo "  • Alert checks: Every 2 minutes"
echo "  • Log cleanup: Daily at midnight (keeps 7 days)"
echo ""
echo "Log files:"
echo "  • /var/log/x402-monitor.log"
echo "  • /var/log/x402-alerts.log"
echo "  • /var/log/x402-monitor-cron.log"
echo "  • /var/log/x402-alerts-cron.log"
echo ""
echo "To view current cronjobs:"
echo "  crontab -l"
echo ""
echo "To remove cronjobs:"
echo "  crontab -e  # Then delete the x402 lines"
echo ""
echo "To test monitoring manually:"
echo "  ${SCRIPT_DIR}/monitor-system.sh"
echo "  ${SCRIPT_DIR}/monitor-alerts.sh"
echo ""

# Test run
echo "Running test monitoring check..."
echo ""
"$SCRIPT_DIR"/monitor-system.sh

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Setup complete! Monitoring is now active."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
