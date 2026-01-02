#!/bin/bash
# =============================================================================
# X402 Forwarder Deployment Script
# =============================================================================
# Deploys the X402Forwarder contract to all networks in networks.toml
#
# Prerequisites:
#   - Foundry installed (forge, cast)
#   - DEPLOYER_PRIVATE_KEY env var set (or in .env file)
#   - RPC URLs set in environment or using defaults from networks.toml
#
# Usage:
#   ./scripts/deploy-forwarder.sh                    # Deploy to all mainnets
#   ./scripts/deploy-forwarder.sh --testnet          # Deploy to all testnets
#   ./scripts/deploy-forwarder.sh --network "Base"   # Deploy to specific network
#   ./scripts/deploy-forwarder.sh --dry-run          # Show what would be deployed
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CONTRACTS_DIR="$ROOT_DIR/contracts"
CONFIG_FILE="$ROOT_DIR/config/networks.toml"
DEPLOYMENTS_FILE="$ROOT_DIR/config/deployments.json"

# Load .env file if it exists
if [[ -f "$ROOT_DIR/.env" ]]; then
    set -a  # automatically export all variables
    source "$ROOT_DIR/.env"
    set +a
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
ENVIRONMENT="mainnet"
SPECIFIC_NETWORK=""
DRY_RUN=false
VERIFY=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --testnet)
            ENVIRONMENT="testnet"
            shift
            ;;
        --network)
            SPECIFIC_NETWORK="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --verify)
            VERIFY=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --testnet           Deploy to testnet networks"
            echo "  --network <name>    Deploy to specific network only"
            echo "  --dry-run           Show what would be deployed without deploying"
            echo "  --verify            Verify contracts on block explorer"
            echo "  --help              Show this help"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    
    if ! command -v forge &> /dev/null; then
        echo -e "${RED}Error: Foundry (forge) not installed${NC}"
        echo "Install with: curl -L https://foundry.paradigm.xyz | bash && foundryup"
        exit 1
    fi
    
    if ! command -v cast &> /dev/null; then
        echo -e "${RED}Error: Foundry (cast) not installed${NC}"
        exit 1
    fi
    
    if ! command -v toml &> /dev/null && ! command -v python3 &> /dev/null; then
        echo -e "${YELLOW}Warning: Neither 'toml' CLI nor python3 found, using grep for TOML parsing${NC}"
    fi
    
    if [[ -z "$DEPLOYER_PRIVATE_KEY" ]]; then
        echo -e "${RED}Error: DEPLOYER_PRIVATE_KEY environment variable not set${NC}"
        exit 1
    fi
    
    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo -e "${RED}Error: Config file not found: $CONFIG_FILE${NC}"
        exit 1
    fi
    
    if [[ ! -f "$CONTRACTS_DIR/X402Forwarder.sol" ]]; then
        echo -e "${RED}Error: Contract not found: $CONTRACTS_DIR/X402Forwarder.sol${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Prerequisites check passed${NC}"
}

# Get deployer address
get_deployer_address() {
    cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY"
}

# Parse networks from TOML using Python (more reliable than grep)
parse_networks() {
    local config_file="$1"
    local environment="$2"
    local specific="$3"
    
    python3 - "$config_file" "$environment" "$specific" << 'PYTHON_SCRIPT'
import sys

config_file = sys.argv[1] if len(sys.argv) > 1 else "config/networks.toml"
environment = sys.argv[2] if len(sys.argv) > 2 else "mainnet"
specific = sys.argv[3] if len(sys.argv) > 3 else ""

with open(config_file, 'r') as f:
    content = f.read()

# Simple TOML parser for our specific format
networks = []
current_network = None
in_tokens_section = False

for line in content.split('\n'):
    line = line.strip()
    
    # Start of a new network
    if line == '[[networks]]':
        if current_network and current_network.get('name'):
            networks.append(current_network)
        current_network = {}
        in_tokens_section = False
    # Start of tokens sub-section (skip these)
    elif line == '[[networks.tokens]]':
        in_tokens_section = True
    # Parse key-value pairs only from network section, not tokens
    elif current_network is not None and not in_tokens_section and '=' in line and not line.startswith('#'):
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        
        if key in ['name', 'chain_id', 'environment', 'rpc_url_env', 'rpc_url_default', 'network_type']:
            current_network[key] = value

# Don't forget the last network
if current_network and current_network.get('name'):
    networks.append(current_network)

# Filter and output
for n in networks:
    if n.get('network_type', 'evm') != 'evm':
        continue
    if n.get('environment', 'mainnet') != environment:
        continue
    if specific and n.get('name', '').lower() != specific.lower():
        continue
    
    name = n.get('name', '')
    chain_id = n.get('chain_id', '')
    rpc_env = n.get('rpc_url_env', '')
    rpc_default = n.get('rpc_url_default', '')
    
    print(f"{name}|{chain_id}|{rpc_env}|{rpc_default}")
PYTHON_SCRIPT
}

# Get RPC URL for a network
get_rpc_url() {
    local rpc_env="$1"
    local rpc_default="$2"
    
    # Try environment variable first
    if [[ -n "$rpc_env" ]]; then
        local env_value="${!rpc_env}"
        if [[ -n "$env_value" ]]; then
            echo "$env_value"
            return
        fi
    fi
    
    # Fall back to default
    echo "$rpc_default"
}

# Deploy to a single network
deploy_to_network() {
    local name="$1"
    local chain_id="$2"
    local rpc_url="$3"
    
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Deploying to: ${YELLOW}$name${BLUE} (Chain ID: $chain_id)${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Convert WebSocket to HTTP if needed (Foundry prefers HTTP)
    local http_rpc="${rpc_url/wss:\/\//https://}"
    http_rpc="${http_rpc/ws:\/\//http://}"
    
    echo -e "RPC URL: ${http_rpc:0:50}..."
    
    if [[ "$DRY_RUN" == true ]]; then
        echo -e "${YELLOW}[DRY RUN] Would deploy X402Forwarder to $name${NC}"
        return 0
    fi
    
    # Get deployer address (will be the owner)
    local deployer_address
    deployer_address=$(get_deployer_address)
    echo -e "Deployer/Owner: $deployer_address"
    
    # Check deployer balance
    local balance
    balance=$(cast balance "$deployer_address" --rpc-url "$http_rpc" 2>/dev/null || echo "0")
    echo -e "Deployer Balance: $balance wei"
    
    if [[ "$balance" == "0" ]]; then
        echo -e "${RED}Error: Deployer has no balance on $name${NC}"
        return 1
    fi
    
    # Compile contract
    echo -e "${BLUE}Compiling contract...${NC}"
    cd "$CONTRACTS_DIR"
    
    # Create a temporary foundry project structure if needed
    if [[ ! -f "foundry.toml" ]]; then
        cat > foundry.toml << 'EOF'
[profile.default]
src = "."
out = "out"
libs = ["lib"]
solc = "0.8.20"
optimizer = true
optimizer_runs = 200

[rpc_endpoints]
EOF
    fi
    
    # Install OpenZeppelin if not present
    if [[ ! -d "lib/openzeppelin-contracts" ]]; then
        echo -e "${BLUE}Installing OpenZeppelin contracts...${NC}"
        forge install OpenZeppelin/openzeppelin-contracts --no-commit 2>/dev/null || true
    fi
    
    # Create remappings
    echo "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/" > remappings.txt
    
    # Compile
    forge build --force 2>&1 | head -20
    
    # Deploy using cast send --create (forge create --broadcast is bugged in v1.5.0)
    echo -e "${BLUE}Deploying X402Forwarder...${NC}"
    
    # Get the bytecode with constructor args
    local bytecode
    bytecode=$(cat out/X402Forwarder.sol/X402Forwarder.json | jq -r '.bytecode.object')
    
    # Encode constructor args (single address parameter)
    local encoded_args
    encoded_args=$(cast abi-encode "constructor(address)" "$deployer_address" | cut -c3-)  # remove 0x prefix
    
    # Full init code = bytecode + encoded constructor args
    local init_code="${bytecode}${encoded_args}"
    
    local deploy_output
    deploy_output=$(cast send \
        --rpc-url "$http_rpc" \
        --private-key "$DEPLOYER_PRIVATE_KEY" \
        --create "$init_code" \
        --json 2>&1)
    
    local deploy_status=$?
    
    if [[ $deploy_status -ne 0 ]]; then
        echo -e "${RED}Deployment failed!${NC}"
        echo "$deploy_output"
        return 1
    fi
    
    # Parse deployed address from cast send JSON output
    local contract_address
    contract_address=$(echo "$deploy_output" | jq -r '.contractAddress // empty')
    
    if [[ -z "$contract_address" ]]; then
        # Try alternate parsing
        contract_address=$(echo "$deploy_output" | grep -oE '"contractAddress":"0x[a-fA-F0-9]{40}"' | cut -d'"' -f4)
    fi
    
    if [[ -z "$contract_address" || "$contract_address" == "null" ]]; then
        echo -e "${RED}Failed to parse contract address from output${NC}"
        echo "$deploy_output"
        return 1
    fi
    
    local tx_hash
    tx_hash=$(echo "$deploy_output" | jq -r '.transactionHash // empty')
    
    echo -e "${GREEN}✓ Deployed successfully!${NC}"
    echo -e "  Contract Address: ${GREEN}$contract_address${NC}"
    echo -e "  Transaction Hash: $tx_hash"
    
    # Save deployment info
    save_deployment "$name" "$chain_id" "$contract_address" "$tx_hash" "$deployer_address"
    
    # Verify if requested
    if [[ "$VERIFY" == true ]]; then
        echo -e "${BLUE}Verifying contract on explorer...${NC}"
        verify_contract "$name" "$chain_id" "$contract_address" "$http_rpc" "$deployer_address"
    fi
    
    return 0
}

# Save deployment to JSON file
save_deployment() {
    local name="$1"
    local chain_id="$2"
    local address="$3"
    local tx_hash="$4"
    local owner="$5"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Create or update deployments file
    if [[ ! -f "$DEPLOYMENTS_FILE" ]]; then
        echo '{"forwarders":{}}' > "$DEPLOYMENTS_FILE"
    fi
    
    # Use Python to update JSON
    python3 << PYTHON_SCRIPT
import json
import sys

deployments_file = "$DEPLOYMENTS_FILE"
name = "$name"
chain_id = "$chain_id"
address = "$address"
tx_hash = "$tx_hash"
owner = "$owner"
timestamp = "$timestamp"

with open(deployments_file, 'r') as f:
    data = json.load(f)

if 'forwarders' not in data:
    data['forwarders'] = {}

data['forwarders'][name] = {
    'chain_id': int(chain_id),
    'address': address,
    'tx_hash': tx_hash,
    'owner': owner,
    'deployed_at': timestamp
}

with open(deployments_file, 'w') as f:
    json.dump(data, f, indent=2)

print(f"Saved deployment to {deployments_file}")
PYTHON_SCRIPT
}

# Verify contract on block explorer
verify_contract() {
    local name="$1"
    local chain_id="$2"
    local address="$3"
    local rpc_url="$4"
    local owner="$5"
    
    # Map chain IDs to Etherscan API URLs
    local etherscan_api=""
    case $chain_id in
        1) etherscan_api="https://api.etherscan.io/api" ;;
        8453) etherscan_api="https://api.basescan.org/api" ;;
        10) etherscan_api="https://api-optimistic.etherscan.io/api" ;;
        42161) etherscan_api="https://api.arbiscan.io/api" ;;
        137) etherscan_api="https://api.polygonscan.com/api" ;;
        43114) etherscan_api="https://api.snowtrace.io/api" ;;
        56) etherscan_api="https://api.bscscan.com/api" ;;
        84532) etherscan_api="https://api-sepolia.basescan.org/api" ;;
        11155111) etherscan_api="https://api-sepolia.etherscan.io/api" ;;
        *)
            echo -e "${YELLOW}No Etherscan API configured for chain $chain_id, skipping verification${NC}"
            return
            ;;
    esac
    
    forge verify-contract \
        --chain-id "$chain_id" \
        --constructor-args $(cast abi-encode "constructor(address)" "$owner") \
        "$address" \
        X402Forwarder \
        2>&1 || echo -e "${YELLOW}Verification may have failed or contract already verified${NC}"
}

# Main execution
main() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          X402 Forwarder Deployment Script                 ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    check_prerequisites
    
    local deployer_address
    deployer_address=$(get_deployer_address)
    echo -e "Deployer Address: ${GREEN}$deployer_address${NC}"
    echo -e "Environment: ${YELLOW}$ENVIRONMENT${NC}"
    if [[ -n "$SPECIFIC_NETWORK" ]]; then
        echo -e "Target Network: ${YELLOW}$SPECIFIC_NETWORK${NC}"
    fi
    echo ""
    
    # Parse networks and deploy
    local networks
    networks=$(parse_networks "$CONFIG_FILE" "$ENVIRONMENT" "$SPECIFIC_NETWORK")
    
    if [[ -z "$networks" ]]; then
        echo -e "${RED}No networks found matching criteria${NC}"
        exit 1
    fi
    
    local success_count=0
    local fail_count=0
    local total_count=0
    
    while IFS='|' read -r name chain_id rpc_env rpc_default; do
        total_count=$((total_count + 1))
        
        local rpc_url
        rpc_url=$(get_rpc_url "$rpc_env" "$rpc_default")
        
        if [[ -z "$rpc_url" ]]; then
            echo -e "${RED}No RPC URL for $name, skipping${NC}"
            fail_count=$((fail_count + 1))
            continue
        fi
        
        if deploy_to_network "$name" "$chain_id" "$rpc_url"; then
            success_count=$((success_count + 1))
        else
            fail_count=$((fail_count + 1))
        fi
        
        # Small delay between deployments
        sleep 2
        
    done <<< "$networks"
    
    # Summary
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}                    Deployment Summary                       ${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "Total Networks: $total_count"
    echo -e "${GREEN}Successful: $success_count${NC}"
    echo -e "${RED}Failed: $fail_count${NC}"
    echo ""
    
    if [[ -f "$DEPLOYMENTS_FILE" ]]; then
        echo -e "Deployments saved to: ${YELLOW}$DEPLOYMENTS_FILE${NC}"
        echo ""
        echo "To update networks.toml with deployed addresses, run:"
        echo -e "${YELLOW}  ./scripts/update-forwarder-addresses.sh${NC}"
    fi
    
    if [[ $fail_count -gt 0 ]]; then
        exit 1
    fi
}

main "$@"
