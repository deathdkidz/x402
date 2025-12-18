// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title BatchTransfer
 * @dev Simple and gas-efficient batch ETH transfer contract
 * @notice Sends native ETH to multiple recipients in a single transaction
 */
contract BatchTransfer {
    
    event BatchTransferExecuted(address indexed sender, uint256 totalAmount, uint256 recipientCount);
    event TransferFailed(address indexed recipient, uint256 amount);
    
    /**
     * @dev Send ETH to multiple recipients in a single transaction
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts to send (in wei)
     * @notice msg.value must equal sum of all amounts
     * @notice Uses .call{value} for safe transfers
     */
    function batchTransfer(
        address payable[] calldata recipients,
        uint256[] calldata amounts
    ) external payable {
        require(recipients.length == amounts.length, "Length mismatch");
        require(recipients.length > 0, "Empty arrays");
        require(recipients.length <= 100, "Too many recipients"); // Gas limit protection
        
        uint256 totalAmount = 0;
        
        // Calculate total and validate
        for (uint256 i = 0; i < amounts.length; i++) {
            require(recipients[i] != address(0), "Zero address");
            require(amounts[i] > 0, "Zero amount");
            totalAmount += amounts[i];
        }
        
        require(msg.value == totalAmount, "Incorrect total amount");
        
        // Execute transfers
        uint256 successCount = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            (bool success, ) = recipients[i].call{value: amounts[i]}("");
            if (success) {
                successCount++;
            } else {
                emit TransferFailed(recipients[i], amounts[i]);
            }
        }
        
        require(successCount == recipients.length, "Some transfers failed");
        
        emit BatchTransferExecuted(msg.sender, totalAmount, recipients.length);
    }
    
    /**
     * @dev Send equal amounts to multiple recipients
     * @param recipients Array of recipient addresses
     * @notice msg.value will be split equally among all recipients
     */
    function batchTransferEqual(address payable[] calldata recipients) external payable {
        require(recipients.length > 0, "Empty array");
        require(recipients.length <= 100, "Too many recipients");
        require(msg.value > 0, "Zero value");
        
        uint256 amountPerRecipient = msg.value / recipients.length;
        require(amountPerRecipient > 0, "Amount too small");
        
        uint256 successCount = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Zero address");
            (bool success, ) = recipients[i].call{value: amountPerRecipient}("");
            if (success) {
                successCount++;
            } else {
                emit TransferFailed(recipients[i], amountPerRecipient);
            }
        }
        
        require(successCount == recipients.length, "Some transfers failed");
        
        // Return dust (remainder from division)
        uint256 dust = msg.value - (amountPerRecipient * recipients.length);
        if (dust > 0) {
            (bool success, ) = payable(msg.sender).call{value: dust}("");
            require(success, "Dust refund failed");
        }
        
        emit BatchTransferExecuted(msg.sender, msg.value - dust, recipients.length);
    }
    
    /**
     * @dev Fallback to reject direct ETH sends
     */
    receive() external payable {
        revert("Use batchTransfer or batchTransferEqual");
    }
}
