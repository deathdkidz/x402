//! Test signature recovery with actual signature

use alloy::primitives::{Address, U256, FixedBytes, keccak256, Signature};

fn main() {
    println!("=== Testing Different Scenarios ===\n");
    
    // Test 1: Check if it's a message vs typed data issue
    // If the client signed raw message instead of EIP-712 typed data
    
    let from: Address = "0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C".parse().unwrap();
    let to: Address = "0x530f81F36D55118D8e829A1f8b15a4D910f43b6E".parse().unwrap();
    let value: U256 = "10000".parse().unwrap();
    let valid_after: U256 = "1734620270".parse().unwrap();
    let valid_before: U256 = "1734623870".parse().unwrap();
    let verifying_contract: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e".parse().unwrap();
    
    let nonce_str = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    let nonce_hex = nonce_str.strip_prefix("0x").unwrap();
    let nonce_bytes = hex::decode(nonce_hex).unwrap();
    let mut nonce_arr = [0u8; 32];
    nonce_arr.copy_from_slice(&nonce_bytes);
    let nonce: FixedBytes<32> = FixedBytes::from(nonce_arr);
    
    println!("Test: Check different domain name possibilities");
    
    // Test with "USDC" (correct)
    let domain_sep_usdc = compute_domain_separator("USDC", "2", 84532, verifying_contract);
    println!("Domain (name='USDC'): 0x{}", hex::encode(domain_sep_usdc));
    
    // Test with "USD Coin" (might be used by some tokens)
    let domain_sep_usdcoin = compute_domain_separator("USD Coin", "2", 84532, verifying_contract);
    println!("Domain (name='USD Coin'): 0x{}", hex::encode(domain_sep_usdcoin));
    
    // Test with different versions
    let domain_sep_v1 = compute_domain_separator("USDC", "1", 84532, verifying_contract);
    println!("Domain (version='1'): 0x{}", hex::encode(domain_sep_v1));
    
    // Check if client might be using wrong chainId
    let domain_sep_eth = compute_domain_separator("USDC", "2", 1, verifying_contract);
    println!("Domain (chainId=1): 0x{}", hex::encode(domain_sep_eth));
    
    let domain_sep_base = compute_domain_separator("USDC", "2", 8453, verifying_contract);
    println!("Domain (chainId=8453/Base Mainnet): 0x{}", hex::encode(domain_sep_base));
    
    println!("\n=== Struct Hash Variants ===");
    
    let struct_hash = compute_struct_hash(from, to, value, valid_after, valid_before, nonce);
    println!("Struct hash: 0x{}", hex::encode(struct_hash));
    
    // Final message with correct domain
    let message = compute_typed_data_hash(domain_sep_usdc, struct_hash);
    println!("\nFinal message hash (correct): 0x{}", hex::encode(message));
    
    println!("\n=== Key Debug Points ===");
    println!("1. Make sure the demo app is using the correct chainId from the network config");
    println!("2. Make sure the demo app is using 'USDC' not 'USD Coin' as the domain name");  
    println!("3. The /networks endpoint returns the correct eip712 config");
    println!("4. Check that wagmi/viem is using the values correctly");
}

fn compute_domain_separator(name: &str, version: &str, chain_id: u64, verifying_contract: Address) -> [u8; 32] {
    let domain_type_hash = keccak256(
        b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    let name_hash = keccak256(name.as_bytes());
    let version_hash = keccak256(version.as_bytes());
    
    let mut padded = Vec::with_capacity(32 * 5);
    padded.extend_from_slice(domain_type_hash.as_slice());
    padded.extend_from_slice(name_hash.as_slice());
    padded.extend_from_slice(version_hash.as_slice());
    padded.extend_from_slice(&[0u8; 24]);
    padded.extend_from_slice(&chain_id.to_be_bytes());
    padded.extend_from_slice(&[0u8; 12]);
    padded.extend_from_slice(verifying_contract.as_slice());
    
    keccak256(&padded).into()
}

fn compute_struct_hash(
    from: Address,
    to: Address,
    value: U256,
    valid_after: U256,
    valid_before: U256,
    nonce: FixedBytes<32>,
) -> [u8; 32] {
    let type_hash = keccak256(
        b"TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    
    let mut encoded = Vec::with_capacity(32 * 7);
    encoded.extend_from_slice(type_hash.as_slice());
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
