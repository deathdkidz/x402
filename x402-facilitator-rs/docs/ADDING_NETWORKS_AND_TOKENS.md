# Adding Networks and Tokens to x402 Facilitator

This guide explains how to add new blockchain networks and tokens to the x402 Facilitator without modifying code.

## Overview

The x402 Facilitator uses external TOML configuration files for networks and tokens:
- `config/networks.toml` - Network definitions and token configurations
- `config/fees.toml` - Fee structures and credit packages

**No code changes required!** Simply update the TOML files and restart the service.

### How It Works

When the service starts:
1. External config is loaded from `config/networks.toml`
2. The network resolver is automatically initialized with networks from config
3. Network name aliases are generated automatically (e.g., "base-sepolia", "Base Sepolia", "84532")
4. CAIP-2 identifiers are created for each network (e.g., "eip155:84532")

If no external config exists, a built-in default network list is used as fallback.

## Adding a New Network

### Step 1: Add Network Configuration

Open `config/networks.toml` and add a new `[[networks]]` block:

```toml
[[networks]]
name = "MyNewNetwork"           # Human-readable name (must be unique)
chain_id = 12345                # Chain ID (must match the blockchain)
network_type = "evm"            # Currently only "evm" supported
environment = "mainnet"         # "mainnet" or "testnet"
enabled = true                  # Set to false to disable without deleting

# RPC Configuration
rpc_url_env = "MY_NETWORK_RPC"  # Environment variable name for RPC URL
rpc_url_default = "wss://..."   # Default RPC URL if env var not set

# Explorer (for reference/logging)
explorer_url = "https://explorer.mynetwork.io"

# Performance options
flashblock_enabled = false      # Enable flashblock for faster confirmations
credit_cost = 1                 # Credits per settlement (0 for testnets)
gas_limit = 200000              # Default gas limit
gas_buffer_percent = 20         # Extra gas buffer percentage

# Native token for gas fees
native_symbol = "ETH"           # Token symbol
native_name = "Ethereum"        # Full name
native_decimals = 18            # Decimal places
native_cmc_slug = "ethereum"    # CoinMarketCap slug for price feeds
```

### Step 2: Add Supported Tokens

Add tokens under your network:

```toml
[[networks.tokens]]
symbol = "USDC"
name = "USD Coin"
address = "0x..."               # Token contract address
decimals = 6
transfer_type = "erc3009"       # "erc3009" or "erc2612"
eip712_name = "USD Coin"        # EIP-712 domain name (from token contract)
eip712_version = "2"            # EIP-712 domain version
forwarder_address = ""          # Optional trusted forwarder
enabled = true                  # Can disable specific tokens
```

### Step 3: Add Network Aliases (Optional)

For better network resolution, add aliases to `config/network_aliases` or the database:

```sql
INSERT INTO network_aliases (canonical_name, alias, alias_type) VALUES
    ('MyNewNetwork', 'mynetwork', 'slug'),
    ('MyNewNetwork', '12345', 'chain_id'),
    ('MyNewNetwork', 'eip155:12345', 'caip2');
```

### Step 4: Configure RPC URL

Add the RPC URL to your `.env` file:

```bash
MY_NETWORK_RPC=wss://your-rpc-endpoint.com
```

### Step 5: Fund Paymaster

Fund your paymaster wallets with native tokens on the new network to pay gas fees.

### Step 6: Restart Service

```bash
systemctl restart x402-facilitator
# or
pm2 restart x402-facilitator
```

## Adding a New Token to Existing Network

### Step 1: Research Token Contract

1. Find the token contract address
2. Verify it supports ERC-3009 (`transferWithAuthorization`) or ERC-2612 (`permit`)
3. Get EIP-712 domain name and version from the contract

### Step 2: Add Token Configuration

```toml
[[networks.tokens]]
symbol = "USDT"
name = "Tether USD"
address = "0x..."
decimals = 6
transfer_type = "erc2612"       # USDT typically uses permit
eip712_name = "Tether USD"
eip712_version = "1"
enabled = true
```

### Transfer Types

- **erc3009**: Uses `transferWithAuthorization` (preferred for USDC)
  - Single transaction
  - Requires valid_after and valid_before timestamps
  - Uses nonce for replay protection

- **erc2612**: Uses `permit` + `transferFrom`
  - Two-step (approve then transfer)
  - Uses deadline timestamp
  - Uses incrementing nonce

## Determining EIP-712 Domain

### Method 1: Read from Contract

```javascript
// Using ethers.js or viem
const domain = await token.eip712Domain();
console.log(domain); // { name, version, chainId, verifyingContract }
```

### Method 2: Check Etherscan

Look for `EIP712_DOMAIN` or `DOMAIN_SEPARATOR` in the contract's read functions.

### Method 3: Common Values

| Token | EIP-712 Name | Version |
|-------|-------------|---------|
| USDC  | "USD Coin"  | "2"     |
| USDT  | "Tether USD"| "1"     |

## Enabling/Disabling Networks

Set `enabled = false` to temporarily disable a network without deleting configuration:

```toml
[[networks]]
name = "Base"
enabled = false  # Network disabled, config preserved
# ... rest of config
```

## Network-Specific Considerations

### Base (Chain ID: 8453)
- Flashblock enabled for faster confirmations
- USDC uses EIP-712 version "2"

### Ethereum Mainnet (Chain ID: 1)
- Higher gas costs - consider higher `credit_cost`
- Flashblock not supported

### Testnets
- Set `credit_cost = 0` for free testing
- Set `environment = "testnet"`
- Balance tracked separately from mainnet

## Troubleshooting

### Network Not Appearing
1. Check `enabled = true`
2. Verify `environment` matches (mainnet/testnet)
3. Check logs for TOML parsing errors
4. Restart the service

### Token Not Working
1. Verify contract address is correct
2. Check `transfer_type` matches contract capability
3. Verify EIP-712 domain parameters
4. Ensure token is `enabled = true`

### RPC Errors
1. Check RPC URL is accessible
2. Prefer WebSocket (wss://) for faster performance
3. Verify API key limits aren't exceeded

## Complete Example: Adding Polygon

```toml
[[networks]]
name = "Polygon"
chain_id = 137
network_type = "evm"
environment = "mainnet"
enabled = true
rpc_url_env = "POLYGON_RPC"
rpc_url_default = "wss://polygon-rpc.publicnode.com"
explorer_url = "https://polygonscan.com"
flashblock_enabled = false
credit_cost = 1
gas_limit = 200000
gas_buffer_percent = 25
native_symbol = "POL"
native_name = "Polygon"
native_decimals = 18
native_cmc_slug = "polygon-ecosystem"

[[networks.tokens]]
symbol = "USDC"
name = "USD Coin"
address = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
decimals = 6
transfer_type = "erc3009"
eip712_name = "USD Coin"
eip712_version = "2"
enabled = true
```

## Verification Checklist

After adding a network/token:

- [ ] Network appears in `GET /supported` response
- [ ] Token shows up under the network
- [ ] Paymaster has native tokens for gas
- [ ] Test verify endpoint works
- [ ] Test settle endpoint works
- [ ] Check logs for any errors
