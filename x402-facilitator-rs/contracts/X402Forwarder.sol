// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title X402Forwarder
 * @notice Forwarder contract for ERC-2612 permit-based token transfers
 * @dev Executes permit + transferFrom atomically for gasless ERC-2612 payments
 * 
 * WHY THIS CONTRACT EXISTS:
 * - ERC-2612 permit() approves a SPENDER to transfer tokens
 * - transferFrom() must be called BY that spender
 * - This contract acts as the spender, making it atomic in one tx
 * 
 * Security features:
 * - Only whitelisted facilitator addresses can execute transfers
 * - Owner can add/remove authorized callers
 * - Pausable in case of emergency
 * - Reentrancy protection
 * - Gas limit controls
 * - Error reason capture for debugging
 */
contract X402Forwarder is Ownable, ReentrancyGuard, Pausable {
    
    // ============ Events ============
    
    event AuthorizedCallerAdded(address indexed caller);
    event AuthorizedCallerRemoved(address indexed caller);
    event PermitTransferExecuted(
        address indexed token,
        address indexed owner,
        address indexed recipient,
        uint256 value,
        bool success,
        string reason
    );
    event GasLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event NativeWithdrawn(address indexed to, uint256 amount);
    
    // ============ Errors ============
    
    error UnauthorizedCaller();
    error ZeroAddress();
    error PermitFailed(string reason);
    error TransferFailed(string reason);
    
    // ============ State ============
    
    /// @notice Mapping of authorized caller addresses
    mapping(address => bool) public authorizedCallers;
    
    /// @notice Number of authorized callers
    uint256 public authorizedCallerCount;
    
    /// @notice Maximum gas limit for token calls
    uint256 public maxGasPerCall = 150000;
    
    /// @notice Total successful transfers executed
    uint256 public totalTransfers;
    
    // ============ ERC-2612 Interface ============
    
    /// @notice ERC-2612 permit function selector
    bytes4 private constant PERMIT_SELECTOR = 
        bytes4(keccak256("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"));
    
    /// @notice ERC-20 transferFrom function selector
    bytes4 private constant TRANSFER_FROM_SELECTOR = 
        bytes4(keccak256("transferFrom(address,address,uint256)"));
    
    // ============ Constructor ============
    
    /**
     * @notice Initialize the forwarder with owner
     * @param _owner Owner address (can add/remove authorized callers)
     */
    constructor(address _owner) Ownable(_owner) {
        if (_owner == address(0)) revert ZeroAddress();
    }
    
    // ============ Modifiers ============
    
    /**
     * @notice Restrict to authorized callers only
     */
    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender]) revert UnauthorizedCaller();
        _;
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Add an authorized caller (facilitator address)
     * @param caller Address to authorize
     */
    function addAuthorizedCaller(address caller) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        if (!authorizedCallers[caller]) {
            authorizedCallers[caller] = true;
            authorizedCallerCount++;
            emit AuthorizedCallerAdded(caller);
        }
    }
    
    /**
     * @notice Remove an authorized caller
     * @param caller Address to remove
     */
    function removeAuthorizedCaller(address caller) external onlyOwner {
        if (authorizedCallers[caller]) {
            authorizedCallers[caller] = false;
            authorizedCallerCount--;
            emit AuthorizedCallerRemoved(caller);
        }
    }
    
    /**
     * @notice Add multiple authorized callers at once
     * @param callers Array of addresses to authorize
     */
    function addAuthorizedCallers(address[] calldata callers) external onlyOwner {
        for (uint256 i = 0; i < callers.length; i++) {
            if (callers[i] != address(0) && !authorizedCallers[callers[i]]) {
                authorizedCallers[callers[i]] = true;
                authorizedCallerCount++;
                emit AuthorizedCallerAdded(callers[i]);
            }
        }
    }
    
    /**
     * @notice Update maximum gas per token call
     * @param newLimit New gas limit
     */
    function setMaxGasPerCall(uint256 newLimit) external onlyOwner {
        require(newLimit >= 50000 && newLimit <= 500000, "Invalid gas limit");
        emit GasLimitUpdated(maxGasPerCall, newLimit);
        maxGasPerCall = newLimit;
    }
    
    /**
     * @notice Pause contract in emergency
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @notice Withdraw native tokens (ETH) sent to contract by mistake
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function withdrawNative(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        require(amount <= address(this).balance, "Insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
        emit NativeWithdrawn(to, amount);
    }
    
    // ============ ERC-2612 Functions ============
    
    /**
     * @notice Execute permit + transferFrom atomically
     * @dev Only callable by authorized facilitator addresses
     * 
     * Flow:
     * 1. Owner signs EIP-712 permit (off-chain)
     * 2. Facilitator calls this function
     * 3. permit() approves THIS CONTRACT as spender
     * 4. transferFrom() moves tokens from owner → recipient
     * 
     * @param token Token contract address (must support ERC-2612)
     * @param owner Token owner (who signed the permit)
     * @param recipient Final recipient of tokens
     * @param value Amount to transfer
     * @param deadline Permit deadline (unix timestamp)
     * @param v Signature v component
     * @param r Signature r component
     * @param s Signature s component
     * @return success Whether the transfer succeeded
     */
    function permitAndTransfer(
        address token,
        address owner,
        address recipient,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external onlyAuthorized nonReentrant whenNotPaused returns (bool success) {
        if (token == address(0)) revert ZeroAddress();
        if (owner == address(0)) revert ZeroAddress();
        if (recipient == address(0)) revert ZeroAddress();
        
        // Step 1: Execute permit (approve this contract to spend owner's tokens)
        bytes memory permitData = abi.encodeWithSelector(
            PERMIT_SELECTOR,
            owner,
            address(this), // spender is this contract
            value,
            deadline,
            v,
            r,
            s
        );
        
        (bool permitSuccess, bytes memory permitResult) = token.call{gas: maxGasPerCall}(permitData);
        
        if (!permitSuccess) {
            string memory reason = _getRevertReason(permitResult);
            emit PermitTransferExecuted(token, owner, recipient, value, false, reason);
            return false;
        }
        
        // Step 2: Execute transferFrom (this contract is now approved as spender)
        bytes memory transferData = abi.encodeWithSelector(
            TRANSFER_FROM_SELECTOR,
            owner,
            recipient,
            value
        );
        
        (bool transferSuccess, bytes memory transferResult) = token.call{gas: maxGasPerCall}(transferData);
        
        string memory reason = "";
        if (transferSuccess) {
            totalTransfers++;
        } else {
            reason = _getRevertReason(transferResult);
        }
        
        emit PermitTransferExecuted(token, owner, recipient, value, transferSuccess, reason);
        
        return transferSuccess;
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Check if an address is an authorized caller
     * @param caller Address to check
     * @return bool Whether the address is authorized
     */
    function isAuthorizedCaller(address caller) external view returns (bool) {
        return authorizedCallers[caller];
    }
    
    /**
     * @notice Get contract statistics
     * @return _totalTransfers Total successful transfers
     * @return _authorizedCallerCount Number of authorized callers
     * @return _maxGasPerCall Current gas limit per call
     * @return _paused Whether contract is paused
     */
    function getStats() external view returns (
        uint256 _totalTransfers,
        uint256 _authorizedCallerCount,
        uint256 _maxGasPerCall,
        bool _paused
    ) {
        return (totalTransfers, authorizedCallerCount, maxGasPerCall, paused());
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Extract revert reason from failed call
     * @param returnData The return data from the failed call
     * @return reason The revert reason string, or "Unknown error"
     */
    function _getRevertReason(bytes memory returnData) internal pure returns (string memory reason) {
        // If no data, return generic message
        if (returnData.length == 0) {
            return "Unknown error";
        }
        
        // Check for standard Error(string) selector: 0x08c379a0
        if (returnData.length >= 68) {
            bytes4 selector;
            assembly {
                selector := mload(add(returnData, 32))
            }
            
            if (selector == 0x08c379a0) {
                // Decode the string
                assembly {
                    returnData := add(returnData, 4)
                }
                return abi.decode(returnData, (string));
            }
        }
        
        // Check for Panic(uint256) selector: 0x4e487b71
        if (returnData.length == 36) {
            bytes4 selector;
            assembly {
                selector := mload(add(returnData, 32))
            }
            
            if (selector == 0x4e487b71) {
                uint256 code;
                assembly {
                    code := mload(add(returnData, 36))
                }
                return string(abi.encodePacked("Panic: ", _uintToString(code)));
            }
        }
        
        // Return hex representation for unknown errors
        return "Unknown error (check logs)";
    }
    
    /**
     * @notice Convert uint to string (for panic codes)
     */
    function _uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        
        return string(buffer);
    }
    
    // ============ Fallback ============
    
    /**
     * @notice Receive native tokens
     */
    receive() external payable {}
    
    /**
     * @notice Reject unknown function calls
     */
    fallback() external payable {
        revert("Unknown function");
    }
}
