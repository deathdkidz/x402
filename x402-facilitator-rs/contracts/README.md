# X402 Forwarder Contract

Secure forwarder contract for the x402 payment facilitator. This contract enables gasless ERC-2612 permit-based token transfers while maintaining strict access control.

## Why This Contract Exists

### ERC-2612 (permit + transferFrom) - NEEDS FORWARDER
```
User signs permit → permit(owner, SPENDER, amount) → SPENDER calls transferFrom(owner, recipient, amount)
```
- `permit()` approves a **specific spender** to transfer tokens
- `transferFrom()` must be called **by that spender**
- This contract acts as the spender, combining both in one atomic transaction
- Without this contract, you'd need: (1) user signs permit (2) submit permit tx (3) submit transferFrom tx = 2 txs

### ERC-3009 (transferWithAuthorization) - NO FORWARDER NEEDED
```
User signs authorization → transferWithAuthorization(from, TO, amount, ...) → Tokens go from→to directly
```
- The transfer happens directly from signer to recipient
- The caller is just the tx submitter, NOT a spender
- Calling through a forwarder wastes ~10k gas with zero benefit
- **Call the token contract directly instead**

## Features

- **Atomic Permit+Transfer**: ERC-2612 permit and transferFrom in one transaction
- **Access Control**: Only whitelisted facilitator addresses can execute transfers
- **Error Capture**: Returns revert reasons for debugging failed transfers
- **Emergency Controls**: Pausable with owner controls
- **Security**: Reentrancy protection, gas limits, and zero-address checks

## Supported Function

### permitAndTransfer (ERC-2612)
Used by: Many ERC-20 tokens with permit support

```solidity
function permitAndTransfer(
    address token,
    address owner,
    address recipient,
    uint256 value,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) external returns (bool success);
```

**Note**: For ERC-3009 tokens (like USDC), call `transferWithAuthorization()` directly on the token contract.

## Deployment

### Prerequisites
- Node.js 18+
- Foundry or Hardhat

### Using Foundry

```bash
# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts

# Compile
forge build

# Deploy
forge create --rpc-url $RPC_URL \
  --private-key $DEPLOYER_KEY \
  contracts/X402Forwarder.sol:X402Forwarder \
  --constructor-args $OWNER_ADDRESS
```

### Using Hardhat

```bash
# Install dependencies
npm install @openzeppelin/contracts

# Compile
npx hardhat compile

# Deploy (create a deploy script)
npx hardhat run scripts/deploy-forwarder.js --network base
```

## Post-Deployment Setup

After deploying the forwarder contract:

1. **Add Paymaster Wallets as Authorized Callers**:
```solidity
forwarder.addAuthorizedCaller(paymasterAddress1);
forwarder.addAuthorizedCaller(paymasterAddress2);
// Or batch add
forwarder.addAuthorizedCallers([paymaster1, paymaster2, paymaster3]);
```

2. **Update networks.toml**:
```toml
[[networks.tokens]]
symbol = "USDC"
address = "0x..."
forwarder_address = "0x<deployed_forwarder_address>"
```

3. **Test the Setup**:
```bash
# Verify authorized callers
cast call $FORWARDER_ADDRESS "isAuthorizedCaller(address)(bool)" $PAYMASTER_ADDRESS

# Check stats
cast call $FORWARDER_ADDRESS "getStats()(uint256,uint256,uint256,bool)"
```

## Security Considerations

1. **Owner Key Security**: The owner can add/remove callers and pause the contract. Store securely.

2. **Paymaster Keys**: Each paymaster wallet that needs to execute transfers must be whitelisted.

3. **Gas Limits**: Default gas limit per call is 150,000. Adjust if needed:
   ```solidity
   forwarder.setMaxGasPerCall(200000);
   ```

4. **Emergency Pause**: If issues detected:
   ```solidity
   forwarder.pause();
   ```

## Contract Addresses

| Network | Forwarder Address |
|---------|-------------------|
| Base | TBD |
| Ethereum | TBD |
| Optimism | TBD |
| Base Sepolia | TBD |

## Gas Costs (Approximate)

| Operation | Gas Used |
|-----------|----------|
| permitAndTransfer | ~100,000-150,000 |
| addAuthorizedCaller | ~45,000 |
| removeAuthorizedCaller | ~25,000 |

**Note**: For ERC-3009 tokens, calling `transferWithAuthorization()` directly on the token costs ~60,000-80,000 gas (vs ~80,000-100,000 through a forwarder).

## Architecture Decision: Why No ERC-3009 in Forwarder

We intentionally removed ERC-3009 support from this forwarder because:

1. **No Value Added**: ERC-3009's `transferWithAuthorization()` transfers directly from signer to recipient. The forwarder would just be an unnecessary middleman.

2. **Gas Waste**: Every call through the forwarder adds ~10,000 gas overhead for zero benefit.

3. **Simplicity**: Fewer code paths = fewer bugs = better security.

4. **Direct Calls Work**: The facilitator's Rust code calls `transferWithAuthorization()` directly on the token contract with local signature verification beforehand.

## Auditing Notes

This contract should be audited before production use. Key areas to review:

1. Access control logic
2. Reentrancy protection
3. Gas limit handling
4. Error handling and revert conditions
5. Event emission completeness
