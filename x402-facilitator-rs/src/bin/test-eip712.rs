// Test EIP-712 hash computation to compare with ethers.js
// Run with: cargo run --bin test-eip712

use alloy::primitives::{keccak256, Address, U256, FixedBytes};

fn main() {
    // Test data matching what the demo app would create
    let domain_name = "USDC";
    let domain_version = "2";
    let chain_id: u64 = 84532; // Base Sepolia
    let verifying_contract: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e".parse().unwrap();

    let from: Address = "0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C".parse().unwrap();
    let to: Address = "0x530f81F36D55118D8e829A1f8b15a4D910f43b6E".parse().unwrap();
    let value = U256::from(10000u64);
    let valid_after = U256::from(1734620270u64);
    let valid_before = U256::from(1734623870u64);
    let nonce_hex = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    let nonce_bytes = hex::decode(nonce_hex).unwrap();
    let nonce: FixedBytes<32> = FixedBytes::from_slice(&nonce_bytes);

    println!("=== RUST EIP-712 HASH COMPUTATION ===");
    println!("Domain: name={}, version={}, chainId={}, verifyingContract={}", 
             domain_name, domain_version, chain_id, verifying_contract);
    println!("Message: from={}, to={}, value={}, validAfter={}, validBefore={}, nonce=0x{}", 
             from, to, value, valid_after, valid_before, nonce_hex);

    // Compute domain separator
    let domain_separator = compute_domain_separator(
        domain_name,
        domain_version,
        chain_id,
        verifying_contract,
    );
    println!("\nDomain separator: 0x{}", hex::encode(domain_separator));
    println!("Expected:         0x71f17a3b2ff373b803d70a5a07c046c1a2bc8e89c09ef722fcb047abe94c9818");

    // Compute struct hash
    let struct_hash = compute_transfer_authorization_hash(
        from, to, value, valid_after, valid_before, nonce
    );
    println!("\nStruct hash: 0x{}", hex::encode(struct_hash));
    println!("Expected:    0x3bb28c2e05657d8c9b3754be015afb9952052012add9536b602ce893ab02b892");

    // Compute final message hash
    let message_hash = compute_typed_data_hash(domain_separator, struct_hash);
    println!("\nMessage hash: 0x{}", hex::encode(message_hash));
    println!("Expected:     0x1b262cf1b2ae920daf545f9e14e512bbe9f9b9a2a85674dde9394b6bec355ed9");

    // Check matches
    let expected_domain = "71f17a3b2ff373b803d70a5a07c046c1a2bc8e89c09ef722fcb047abe94c9818";
    let expected_struct = "3bb28c2e05657d8c9b3754be015afb9952052012add9536b602ce893ab02b892";
    let expected_message = "1b262cf1b2ae920daf545f9e14e512bbe9f9b9a2a85674dde9394b6bec355ed9";

    println!("\n=== COMPARISON ===");
    println!("Domain match: {}", hex::encode(domain_separator) == expected_domain);
    println!("Struct match: {}", hex::encode(struct_hash) == expected_struct);
    println!("Message match: {}", hex::encode(message_hash) == expected_message);
}

fn compute_domain_separator(name: &str, version: &str, chain_id: u64, verifying_contract: Address) -> [u8; 32] {
    // EIP-712 domain type hash
    let domain_type_hash = keccak256(
        b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    
    let name_hash = keccak256(name.as_bytes());
    let version_hash = keccak256(version.as_bytes());
    
    // Pad address to 32 bytes
    let mut padded = Vec::with_capacity(32 * 5);
    padded.extend_from_slice(domain_type_hash.as_slice());
    padded.extend_from_slice(name_hash.as_slice());
    padded.extend_from_slice(version_hash.as_slice());
    padded.extend_from_slice(&[0u8; 24]); // pad chainId
    padded.extend_from_slice(&chain_id.to_be_bytes());
    padded.extend_from_slice(&[0u8; 12]); // pad address
    padded.extend_from_slice(verifying_contract.as_slice());
    
    keccak256(&padded).into()
}

fn compute_transfer_authorization_hash(
    from: Address,
    to: Address,
    value: U256,
    valid_after: U256,
    valid_before: U256,
    nonce: FixedBytes<32>,
) -> [u8; 32] {
    // Type hash for TransferWithAuthorization
    let type_hash = keccak256(
        b"TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    
    let mut encoded = Vec::with_capacity(32 * 7);
    encoded.extend_from_slice(type_hash.as_slice());
    
    // Pad addresses to 32 bytes
    encoded.extend_from_slice(&[0u8; 12]);
    encoded.extend_from_slice(from.as_slice());
    
    encoded.extend_from_slice(&[0u8; 12]);
    encoded.extend_from_slice(to.as_slice());
    
    encoded.extend_from_slice(&value.to_be_bytes::<32>());
    encoded.extend_from_slice(&valid_after.to_be_bytes::<32>());
    encoded.extend_from_slice(&valid_before.to_be_bytes::<32>());
    encoded.extend_from_slice(nonce.as_slice());
    
    keccak256(&encoded).into()
}

fn compute_typed_data_hash(domain_separator: [u8; 32], struct_hash: [u8; 32]) -> [u8; 32] {
    let mut encoded = Vec::with_capacity(66);
    encoded.extend_from_slice(b"\x19\x01");
    encoded.extend_from_slice(&domain_separator);
    encoded.extend_from_slice(&struct_hash);
    
    keccak256(&encoded).into()
}
