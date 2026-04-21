#![cfg_attr(not(feature = "abi-gen"), no_main, no_std)]

use alloc::string::String;
use pallet_revive_uapi::{HostFnImpl as api, StorageFlags};
use pvm_contract_types::Address;
use ruint::aliases::U256;

#[pvm_contract_macros::contract("DotTransfer.sol", allocator = "bump")]
mod dot_transfer {
    use super::*;

    // Storage slot tags for Transfer fields, one byte appended to the transfer ID before hashing.
    const SLOT_UPLOADER: u8 = 0;
    const SLOT_EXPIRES_AT: u8 = 1;
    const SLOT_FILE_SIZE: u8 = 2;
    const SLOT_CHUNK_COUNT: u8 = 3;
    const SLOT_REVOKED: u8 = 4;
    const SLOT_CIDS: u8 = 5;
    const SLOT_FILENAME: u8 = 6;
    const SLOT_LIST_LEN: u8 = 7;

    pub enum Error {
        NotFound,
        AlreadyTaken,
        NotUploader,
        AlreadyRevoked,
        ExpiryInPast,
        FileSizeZero,
        EmptyCids,
        ChunkCountZero,
    }

    impl AsRef<[u8]> for Error {
        fn as_ref(&self) -> &[u8] {
            match self {
                Error::NotFound => b"NotFound",
                Error::AlreadyTaken => b"AlreadyTaken",
                Error::NotUploader => b"NotUploader",
                Error::AlreadyRevoked => b"AlreadyRevoked",
                Error::ExpiryInPast => b"ExpiryInPast",
                Error::FileSizeZero => b"FileSizeZero",
                Error::EmptyCids => b"EmptyCids",
                Error::ChunkCountZero => b"ChunkCountZero",
            }
        }
    }

    // ── storage key helpers ───────────────────────────────────────────────────

    fn keccak256(input: &[u8]) -> [u8; 32] {
        let mut out = [0u8; 32];
        api::hash_keccak_256(input, &mut out);
        out
    }

    fn transfer_field_key(id: &[u8; 32], slot: u8) -> [u8; 32] {
        let mut input = [0u8; 33];
        input[..32].copy_from_slice(id);
        input[32] = slot;
        keccak256(&input)
    }

    fn uploader_meta_key(addr: &[u8; 20], slot: u8) -> [u8; 32] {
        let mut input = [0u8; 21];
        input[..20].copy_from_slice(addr);
        input[20] = slot;
        keccak256(&input)
    }

    fn uploader_item_key(addr: &[u8; 20], index: u64) -> [u8; 32] {
        let mut input = [0u8; 29];
        input[..20].copy_from_slice(addr);
        input[20] = SLOT_LIST_LEN;
        input[21..29].copy_from_slice(&index.to_be_bytes());
        keccak256(&input)
    }

    fn string_chunk_key(base: &[u8; 32], chunk: u32) -> [u8; 32] {
        let mut input = [0u8; 36];
        input[..32].copy_from_slice(base);
        input[32..36].copy_from_slice(&chunk.to_be_bytes());
        keccak256(&input)
    }

    // ── raw 32-byte slot r/w ─────────────────────────────────────────────────

    fn read32(key: &[u8; 32]) -> [u8; 32] {
        let mut buf = [0u8; 32];
        let mut out: &mut [u8] = &mut buf;
        api::get_storage(StorageFlags::empty(), key, &mut out).ok();
        buf
    }

    fn write32(key: &[u8; 32], val: &[u8; 32]) {
        api::set_storage(StorageFlags::empty(), key, val);
    }

    // ── typed r/w ────────────────────────────────────────────────────────────

    fn read_u256(key: &[u8; 32]) -> U256 {
        U256::from_be_bytes(read32(key))
    }

    fn write_u256(key: &[u8; 32], val: U256) {
        write32(key, &val.to_be_bytes::<32>());
    }

    fn read_addr(key: &[u8; 32]) -> Address {
        let buf = read32(key);
        let mut inner = [0u8; 20];
        inner.copy_from_slice(&buf[12..32]);
        Address(inner)
    }

    fn write_addr(key: &[u8; 32], addr: &Address) {
        let mut buf = [0u8; 32];
        buf[12..32].copy_from_slice(&addr.0);
        write32(key, &buf);
    }

    fn read_bool(key: &[u8; 32]) -> bool {
        read32(key)[31] != 0
    }

    fn write_bool(key: &[u8; 32], val: bool) {
        let mut buf = [0u8; 32];
        buf[31] = val as u8;
        write32(key, &buf);
    }

    fn read_u64(key: &[u8; 32]) -> u64 {
        let buf = read32(key);
        let mut arr = [0u8; 8];
        arr.copy_from_slice(&buf[24..32]);
        u64::from_be_bytes(arr)
    }

    fn write_u64(key: &[u8; 32], val: u64) {
        let mut buf = [0u8; 32];
        buf[24..32].copy_from_slice(&val.to_be_bytes());
        write32(key, &buf);
    }

    // Strings are stored as: base_key → length (u32 in bytes [28..32]),
    // string_chunk_key(base, i) → 32-byte chunk i of the UTF-8 bytes.
    fn write_string(base: &[u8; 32], s: &str) {
        let bytes = s.as_bytes();
        let len = bytes.len() as u32;
        let mut len_buf = [0u8; 32];
        len_buf[28..32].copy_from_slice(&len.to_be_bytes());
        write32(base, &len_buf);
        let chunks = (bytes.len() + 31) / 32;
        for i in 0..chunks {
            let ck = string_chunk_key(base, i as u32);
            let start = i * 32;
            let end = core::cmp::min(start + 32, bytes.len());
            let mut chunk = [0u8; 32];
            chunk[..end - start].copy_from_slice(&bytes[start..end]);
            write32(&ck, &chunk);
        }
    }

    fn read_string(base: &[u8; 32]) -> String {
        let len_buf = read32(base);
        let mut arr = [0u8; 4];
        arr.copy_from_slice(&len_buf[28..32]);
        let len = u32::from_be_bytes(arr) as usize;
        if len == 0 {
            return String::new();
        }
        let mut result = vec![0u8; len];
        let chunks = (len + 31) / 32;
        for i in 0..chunks {
            let ck = string_chunk_key(base, i as u32);
            let chunk = read32(&ck);
            let start = i * 32;
            let end = core::cmp::min(start + 32, len);
            result[start..end].copy_from_slice(&chunk[..end - start]);
        }
        String::from_utf8(result).unwrap_or_default()
    }

    // ── host function wrappers ────────────────────────────────────────────────

    fn get_caller() -> Address {
        let mut inner = [0u8; 20];
        api::caller(&mut inner);
        Address(inner)
    }

    fn get_timestamp() -> U256 {
        let mut buf = [0u8; 32];
        api::now(&mut buf);
        // pallet_revive writes the timestamp as a SCALE-encoded LE u64 (ms).
        // Divide by 1000 to match EVM block.timestamp (seconds).
        U256::from_le_bytes(buf) / U256::from(1000u64)
    }

    fn is_zero(addr: &Address) -> bool {
        addr.0 == [0u8; 20]
    }

    // ABI encode (uint256 expiresAt, string fileName, uint256 fileSize) for TransferCreated.
    fn encode_created_data(expires_at: U256, file_name: &str, file_size: U256) -> Vec<u8> {
        let fn_bytes = file_name.as_bytes();
        let fn_len = fn_bytes.len();
        let fn_padded = (fn_len + 31) / 32 * 32;
        let mut data = vec![0u8; 96 + 32 + fn_padded];
        data[0..32].copy_from_slice(&expires_at.to_be_bytes::<32>());
        data[32..64].copy_from_slice(&U256::from(96u64).to_be_bytes::<32>());
        data[64..96].copy_from_slice(&file_size.to_be_bytes::<32>());
        data[96..128].copy_from_slice(&U256::from(fn_len as u64).to_be_bytes::<32>());
        data[128..128 + fn_len].copy_from_slice(fn_bytes);
        data
    }

    // ── contract entry points ─────────────────────────────────────────────────

    #[pvm_contract_macros::constructor]
    pub fn new() -> Result<(), Error> {
        Ok(())
    }

    #[pvm_contract_macros::method]
    pub fn create_transfer(
        transfer_id: [u8; 32],
        cids: String,
        expires_at: U256,
        file_size: U256,
        file_name: String,
        chunk_count: U256,
    ) -> Result<(), Error> {
        if !is_zero(&read_addr(&transfer_field_key(&transfer_id, SLOT_UPLOADER))) {
            return Err(Error::AlreadyTaken);
        }
        if expires_at < get_timestamp() {
            return Err(Error::ExpiryInPast);
        }
        if file_size == U256::ZERO {
            return Err(Error::FileSizeZero);
        }
        if cids.is_empty() {
            return Err(Error::EmptyCids);
        }
        if chunk_count == U256::ZERO {
            return Err(Error::ChunkCountZero);
        }

        let sender = get_caller();
        write_addr(&transfer_field_key(&transfer_id, SLOT_UPLOADER), &sender);
        write_u256(&transfer_field_key(&transfer_id, SLOT_EXPIRES_AT), expires_at);
        write_u256(&transfer_field_key(&transfer_id, SLOT_FILE_SIZE), file_size);
        write_u256(&transfer_field_key(&transfer_id, SLOT_CHUNK_COUNT), chunk_count);
        write_bool(&transfer_field_key(&transfer_id, SLOT_REVOKED), false);
        write_string(&transfer_field_key(&transfer_id, SLOT_CIDS), &cids);
        write_string(&transfer_field_key(&transfer_id, SLOT_FILENAME), &file_name);

        let lk = uploader_meta_key(&sender.0, SLOT_LIST_LEN);
        let len = read_u64(&lk);
        write32(&uploader_item_key(&sender.0, len), &transfer_id);
        write_u64(&lk, len + 1);

        let topic0 = keccak256(b"TransferCreated(bytes32,address,uint256,string,uint256)");
        let mut topic2 = [0u8; 32];
        topic2[12..32].copy_from_slice(&sender.0);
        api::deposit_event(
            &[topic0, transfer_id, topic2],
            &encode_created_data(expires_at, &file_name, file_size),
        );

        Ok(())
    }

    #[pvm_contract_macros::method]
    pub fn revoke_transfer(transfer_id: [u8; 32]) -> Result<(), Error> {
        let uploader = read_addr(&transfer_field_key(&transfer_id, SLOT_UPLOADER));
        if is_zero(&uploader) {
            return Err(Error::NotFound);
        }
        let sender = get_caller();
        if uploader != sender {
            return Err(Error::NotUploader);
        }
        let rk = transfer_field_key(&transfer_id, SLOT_REVOKED);
        if read_bool(&rk) {
            return Err(Error::AlreadyRevoked);
        }
        write_bool(&rk, true);

        let topic0 = keccak256(b"TransferRevoked(bytes32,address)");
        let mut topic2 = [0u8; 32];
        topic2[12..32].copy_from_slice(&sender.0);
        api::deposit_event(&[topic0, transfer_id, topic2], &[]);

        Ok(())
    }

    #[pvm_contract_macros::method]
    pub fn get_transfer(
        transfer_id: [u8; 32],
    ) -> Result<(String, Address, U256, U256, String, U256, bool, bool), Error> {
        let uploader = read_addr(&transfer_field_key(&transfer_id, SLOT_UPLOADER));
        if is_zero(&uploader) {
            return Err(Error::NotFound);
        }
        let expires_at = read_u256(&transfer_field_key(&transfer_id, SLOT_EXPIRES_AT));
        let file_size = read_u256(&transfer_field_key(&transfer_id, SLOT_FILE_SIZE));
        let chunk_count = read_u256(&transfer_field_key(&transfer_id, SLOT_CHUNK_COUNT));
        let revoked = read_bool(&transfer_field_key(&transfer_id, SLOT_REVOKED));
        let cids = read_string(&transfer_field_key(&transfer_id, SLOT_CIDS));
        let file_name = read_string(&transfer_field_key(&transfer_id, SLOT_FILENAME));
        let expired = get_timestamp() >= expires_at;

        Ok((cids, uploader, expires_at, file_size, file_name, chunk_count, expired, revoked))
    }

    #[pvm_contract_macros::method]
    pub fn get_transfers_by_uploader(uploader: Address) -> Vec<[u8; 32]> {
        let lk = uploader_meta_key(&uploader.0, SLOT_LIST_LEN);
        let len = read_u64(&lk);
        let mut result = Vec::with_capacity(len as usize);
        for i in 0..len {
            result.push(read32(&uploader_item_key(&uploader.0, i)));
        }
        result
    }

    #[pvm_contract_macros::fallback]
    pub fn fallback() -> Result<(), Error> {
        Ok(())
    }
}
