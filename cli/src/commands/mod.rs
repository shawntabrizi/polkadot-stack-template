pub mod chain;
pub mod contract;
pub mod market;
pub mod pallet;
pub mod prove;
pub mod statement;
pub mod tx;

use alloy::sol;
use blake2::{
	digest::{consts::U32, Digest},
	Blake2b,
};

// Shared contract ABI for the ProofOfExistence Solidity contract.
// Used by both the `contract` and `prove` command modules.
sol! {
	#[sol(rpc)]
	contract ProofOfExistence {
		function createClaim(bytes32 documentHash) external;
		function revokeClaim(bytes32 documentHash) external;
		function getClaim(bytes32 documentHash) external view returns (address owner, uint256 blockNumber);
		function getClaimCount() external view returns (uint256);
		function getClaimHashAtIndex(uint256 index) external view returns (bytes32);
	}
}
use codec::Encode;
use reqwest::Url;

/// Parse a 0x-prefixed hex string into 32 raw bytes.
pub fn parse_h256(hex_str: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
	let hex = hex_str.strip_prefix("0x").unwrap_or(hex_str);
	let bytes = hex::decode(hex)?;
	if bytes.len() != 32 {
		return Err(format!("Hash must be 32 bytes (64 hex chars), got {}", bytes.len()).into());
	}
	Ok(bytes)
}
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sp_core::Pair;
use sp_statement_store::Statement;
use std::fs;
use subxt::{OnlineClient, PolkadotConfig};
use subxt_signer::sr25519::{dev, Keypair};

type Blake2b256 = Blake2b<U32>;
type HashResult = Result<(String, Option<Vec<u8>>), Box<dyn std::error::Error>>;

const BULLETIN_WS: &str = "wss://paseo-bulletin-rpc.polkadot.io";
// Matches the node-side statement store propagation limit.
const MAX_STATEMENT_STORE_ENCODED_SIZE: usize = 1024 * 1024 - 1;

/// Resolve a signer from a flexible input:
/// - Named dev account: "alice", "bob", "charlie"
/// - Mnemonic phrase: "word1 word2 word3 ..." (contains spaces)
/// - Secret seed (0x hex): "0x5fb92d..."
pub fn resolve_substrate_signer(input: &str) -> Result<Keypair, Box<dyn std::error::Error>> {
	let lowered = input.to_lowercase();
	match lowered.as_str() {
		"alice" => Ok(dev::alice()),
		"bob" => Ok(dev::bob()),
		"charlie" => Ok(dev::charlie()),
		"dave" => Ok(dev::dave()),
		"eve" => Ok(dev::eve()),
		"ferdie" => Ok(dev::ferdie()),
		_ => {
			if input.contains(' ') {
				// Treat as mnemonic phrase
				let mnemonic = bip39::Mnemonic::parse_in(bip39::Language::English, input)?;
				let keypair = Keypair::from_phrase(&mnemonic, None)?;
				Ok(keypair)
			} else if input.starts_with("0x") || input.starts_with("0X") {
				// Treat as hex secret seed
				let seed_hex = input.strip_prefix("0x").or(input.strip_prefix("0X")).unwrap();
				let seed_bytes = hex::decode(seed_hex)?;
				if seed_bytes.len() != 32 {
					return Err("Secret seed must be 32 bytes (64 hex chars)".into());
				}
				let mut seed = [0u8; 32];
				seed.copy_from_slice(&seed_bytes);
				let keypair = Keypair::from_secret_key(seed)?;
				Ok(keypair)
			} else {
				Err(format!(
					"Unknown signer: {input}\n\
                     Use a dev account name (alice, bob, charlie),\n\
                     a mnemonic phrase (\"word1 word2 ...\"),\n\
                     or a 0x-prefixed secret seed."
				)
				.into())
			}
		},
	}
}

/// Resolve an sr25519 signer for the statement store from a flexible input.
pub fn resolve_statement_signer(
	input: &str,
) -> Result<sp_core::sr25519::Pair, Box<dyn std::error::Error>> {
	let uri = match input.to_lowercase().as_str() {
		"alice" => "//Alice",
		"bob" => "//Bob",
		"charlie" => "//Charlie",
		"dave" => "//Dave",
		"eve" => "//Eve",
		"ferdie" => "//Ferdie",
		_ => input,
	};

	sp_core::sr25519::Pair::from_string(uri, None)
		.map_err(|error| format!("Could not resolve statement signer {input}: {error}").into())
}

/// Resolve a hash from either a direct hex string or a file path.
/// Returns (hex_hash, Option<file_bytes>).
pub fn hash_input(hash: Option<String>, file: Option<&str>) -> HashResult {
	match (hash, file) {
		(Some(h), _) => Ok((h, None)),
		(None, Some(path)) => {
			let bytes = fs::read(path)?;
			let mut hasher = Blake2b256::new();
			hasher.update(&bytes);
			let result = hasher.finalize();
			let hex = format!("0x{}", hex::encode(result));
			println!("File: {path}");
			println!("Blake2b-256: {hex}");
			Ok((hex, Some(bytes)))
		},
		(None, None) => Err("Provide either a hash or --file <path>".into()),
	}
}

/// Upload file bytes to the Bulletin Chain via subxt dynamic API.
/// Signs with the provided signer. Requires authorization on the Bulletin Chain.
pub async fn upload_to_bulletin(
	file_bytes: &[u8],
	signer: &Keypair,
) -> Result<(), Box<dyn std::error::Error>> {
	let max_size = 8 * 1024 * 1024;
	if file_bytes.len() > max_size {
		return Err(format!(
			"File too large ({:.1} MiB). Bulletin Chain max is 8 MiB.",
			file_bytes.len() as f64 / 1024.0 / 1024.0
		)
		.into());
	}

	println!("Connecting to Bulletin Chain ({BULLETIN_WS})...");
	let api = OnlineClient::<PolkadotConfig>::from_url(BULLETIN_WS).await?;

	println!(
		"Uploading {} bytes to Bulletin Chain (TransactionStorage.store)...",
		file_bytes.len()
	);
	println!(
        "Note: Requires authorization. Manage at: https://paritytech.github.io/polkadot-bulletin-chain/"
    );

	let tx = subxt::dynamic::tx(
		"TransactionStorage",
		"store",
		vec![("data", subxt::dynamic::Value::from_bytes(file_bytes))],
	);

	let result = api
		.tx()
		.sign_and_submit_then_watch_default(&tx, signer)
		.await?
		.wait_for_finalized_success()
		.await?;

	println!("Uploaded to Bulletin Chain! Finalized: {}", result.extrinsic_hash());
	println!("File will be available on IPFS via the Paseo gateway.");

	Ok(())
}

/// Submit file bytes to the local node's Statement Store via statement_submit RPC.
/// Creates a signed statement with the file data and submits it.
pub async fn submit_to_statement_store(
	url: &str,
	file_bytes: &[u8],
	signer: &sp_core::sr25519::Pair,
) -> Result<(), Box<dyn std::error::Error>> {
	println!("Submitting {} bytes to Statement Store...", file_bytes.len());

	let statement = build_signed_statement(file_bytes, signer);
	ensure_statement_store_size(&statement)?;

	let encoded = format!("0x{}", hex::encode(statement.encode()));
	let statement_hash = format!("0x{}", hex::encode(statement.hash()));

	rpc_call::<_, ()>(url, "statement_submit", vec![encoded]).await?;

	println!("Statement submitted to store.");
	println!("Statement hash: {statement_hash}");
	println!("Data bytes: {}", statement.data_len());

	Ok(())
}

fn build_signed_statement(file_bytes: &[u8], signer: &sp_core::sr25519::Pair) -> Statement {
	let mut statement = Statement::new();
	statement.set_plain_data(file_bytes.to_vec());
	statement.sign_sr25519_private(signer);
	statement
}

fn ensure_statement_store_size(statement: &Statement) -> Result<(), Box<dyn std::error::Error>> {
	let encoded_size = statement.encoded_size();
	if encoded_size > MAX_STATEMENT_STORE_ENCODED_SIZE {
		return Err(format!(
            "Statement is too large for node propagation ({encoded_size} encoded bytes, max {}). Choose a smaller file.",
            MAX_STATEMENT_STORE_ENCODED_SIZE
        )
        .into());
	}

	Ok(())
}

// --- Shared JSON-RPC helpers ---

pub fn rpc_url(url: &str) -> Result<Url, Box<dyn std::error::Error>> {
	let mut rpc_url = Url::parse(url)?;
	match rpc_url.scheme() {
		"ws" => rpc_url.set_scheme("http").expect("valid URL scheme conversion"),
		"wss" => rpc_url.set_scheme("https").expect("valid URL scheme conversion"),
		"http" | "https" => {},
		scheme => return Err(format!("Unsupported RPC URL scheme: {scheme}").into()),
	}
	Ok(rpc_url)
}

pub async fn rpc_call<P: Serialize, R: DeserializeOwned>(
	url: &str,
	method: &str,
	params: P,
) -> Result<R, Box<dyn std::error::Error>> {
	let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(30)).build()?;
	let response: RpcResponse = client
		.post(rpc_url(url)?)
		.json(&RpcRequest { jsonrpc: "2.0", id: 1u32, method, params })
		.send()
		.await?
		.json()
		.await?;

	match response.error {
		Some(error) => Err(error.to_string().into()),
		None => Ok(serde_json::from_value(response.result)?),
	}
}

#[derive(Serialize)]
pub struct RpcRequest<'a, P> {
	pub jsonrpc: &'static str,
	pub id: u32,
	pub method: &'a str,
	pub params: P,
}

#[derive(Deserialize)]
pub struct RpcResponse {
	#[serde(default)]
	pub result: serde_json::Value,
	#[serde(default)]
	pub error: Option<RpcError>,
}

#[derive(Debug, Deserialize)]
pub struct RpcError {
	pub code: i32,
	pub message: String,
	#[serde(default)]
	pub data: Option<serde_json::Value>,
}

impl std::fmt::Display for RpcError {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		match &self.data {
			Some(data) => write!(f, "JSON-RPC error {}: {} ({data})", self.code, self.message),
			None => write!(f, "JSON-RPC error {}: {}", self.code, self.message),
		}
	}
}

impl std::error::Error for RpcError {}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn small_statement_is_allowed() {
		let signer = sp_core::sr25519::Pair::from_string("//Alice", None).unwrap();
		let statement = build_signed_statement(b"hello world", &signer);

		assert!(ensure_statement_store_size(&statement).is_ok());
	}

	#[test]
	fn oversized_statement_is_rejected_before_rpc() {
		let signer = sp_core::sr25519::Pair::from_string("//Alice", None).unwrap();
		let data = vec![0u8; MAX_STATEMENT_STORE_ENCODED_SIZE];
		let statement = build_signed_statement(&data, &signer);

		let error = ensure_statement_store_size(&statement).unwrap_err();
		assert!(error.to_string().contains("Statement is too large for node propagation"));
	}
}
