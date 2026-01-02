#!/bin/bash
# =============================================================================
# Update Forwarder Addresses in networks.toml
# =============================================================================
# Reads deployed addresses from deployments.json and updates networks.toml
#
# Usage:
#   ./scripts/update-forwarder-addresses.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$ROOT_DIR/config/networks.toml"
DEPLOYMENTS_FILE="$ROOT_DIR/config/deployments.json"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [[ ! -f "$DEPLOYMENTS_FILE" ]]; then
    echo -e "${RED}Error: Deployments file not found: $DEPLOYMENTS_FILE${NC}"
    echo "Run deploy-forwarder.sh first to deploy contracts."
    exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
    echo -e "${RED}Error: Config file not found: $CONFIG_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}Updating forwarder addresses in networks.toml...${NC}"
echo ""

# Use Python to update TOML (shell variables interpolated)
python3 << PYTHON_SCRIPT
import json
import re

config_file = "$CONFIG_FILE"
deployments_file = "$DEPLOYMENTS_FILE"

# Read deployments
with open(deployments_file, 'r') as f:
    deployments = json.load(f)

forwarders = deployments.get('forwarders', {})

if not forwarders:
    print("No forwarder deployments found.")
    exit(0)

# Read networks.toml
with open(config_file, 'r') as f:
    content = f.read()

# Update each network's forwarder address
updates = 0
for network_name, info in forwarders.items():
    address = info.get('address', '')
    if not address:
        continue
    
    # Pattern to find network section
    network_pattern = rf'(\[\[networks\]\]\s*\nname\s*=\s*"{re.escape(network_name)}".*?(?=\[\[networks\]\]|\Z))'
    
    match = re.search(network_pattern, content, re.DOTALL | re.IGNORECASE)
    if match:
        network_section = match.group(1)
        
        # Update all forwarder_address = "" in this section
        updated_section = re.sub(
            r'forwarder_address\s*=\s*""',
            f'forwarder_address = "{address}"',
            network_section
        )
        
        if updated_section != network_section:
            content = content[:match.start()] + updated_section + content[match.end():]
            print(f"✓ Updated {network_name}: {address}")
            updates += 1

# Write back
if updates > 0:
    with open(config_file, 'w') as f:
        f.write(content)
    print(f"\n✓ Updated {updates} network(s) in {config_file}")
else:
    print("No updates needed.")
PYTHON_SCRIPT

echo ""
echo -e "${GREEN}Done!${NC}"
