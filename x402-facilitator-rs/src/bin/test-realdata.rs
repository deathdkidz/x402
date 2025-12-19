//! Test with real-world data to find the mismatch

use alloy::primitives::{Address, U256, FixedBytes, keccak256};

fn main() {
    // These are the values from a real request:
    let from_str = "0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C";
    let to_str = "0x530f81F36D55118D8e829A1f8b15a4D910f43b6E";
    let value_str = "10000";
    let valid_after_str = "1734620270";
    let valid_before_str = "1734623870";
    let nonce_str = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    
    // Domain config
    let domain_name = "USDC";
    let domain_version = "2";
    let chain_id: u64 = 84532;
    let verifying_contract_str = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    
    // Parse values
    let from: Address = from_str.parse().unwrap();
    let to: Address = to_str.parse().unwrap();
    let value: U256 = value_str.parse().unwrap();
    let valid_after: U256 = valid_after_str.parse().unwrap();
    let valid_before: U256 = valid_before_str.parse().unwrap();
    let verifying_contract: Address = verifying_contract_str.parse().unwrap();
    
    // Parse nonce - THIS IS THE KEY PART
    let nonce_hex = nonce_str.strip_prefix("0x").unwrap_or(nonce_str);
    let nonce_bytes = hex::decode(nonce_hex).unwrap();
    
    println!("Nonce bytes length: {}", nonce_bytes.len());
    println!("Nonce bytes: {:?}", &nonce_bytes[..]);
    
    // Current code does LEFT padding (which is wrong for bytes32)
    // bytes32 should be right-padded or direct copy
    let mut nonce_arr_leftpad = [0u8; 32];
    let start = 32 - nonce_bytes.len().min(32);
    nonce_arr_leftpad[start..].copy_from_slice(&nonce_bytes[..nonce_bytes.len().min(32)]);
    
    // Direct copy (correct for bytes32)
    let mut nonce_arr_direct = [0u8; 32];
    nonce_arr_direct.copy_from_slice(&nonce_bytes[..32]);
    
    println!("\nLeft-padded nonce: 0x{}", hex::encode(nonce_arr_leftpad));
    println!("Direct nonce:      0x{}", hex::encode(nonce_arr_direct));
    println!("Same? {}", nonce_arr_leftpad == nonce_arr_direct);
    
    // Compute struct hash with each
    let nonce_left: FixedBytes<32> = FixedBytes::from(nonce_arr_leftpad);
    let nonce_direct: FixedBytes<32> = FixedBytes::from(nonce_arr_direct);
    
    let hash_left = compute_struct_hash(from, to, value, valid_after, valid_before, nonce_left);
    let hash_direct = compute_struct_hash(from, to, value, valid_after, valid_before, nonce_direct);
    
    println!("\nStruct hash (left pad):  0x{}", hex::encode(hash_left));
    println!("Struct hash (direct):    0x{}", hex::encode(hash_direct));
    
    // Compute domain separator
    let domain_sep = compute_domain_separator(domain_name, domain_version, chain_id, verifying_contract);
    println!("\nDomain separator: 0x{}", hex::encode(domain_sep));
    
    // Final message hashes
    let msg_left = compute_typed_data_hash(domain_sep, hash_left);
    let msg_direct = compute_typed_data_hash(domain_sep, hash_direct);
    
    println!("\nMessage hash (left pad): 0x{}", hex::encode(msg_left));
    println!("Message hash (direct):   0x{}", hex::encode(msg_direct));
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
