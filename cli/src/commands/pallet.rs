use crate::commands::{hash_input, parse_h256, resolve_statement_signer, resolve_substrate_signer};
use clap::Subcommand;
use sp_core::crypto::AccountId32;
use subxt::{dynamic::At, OnlineClient, PolkadotConfig};

#[derive(Subcommand)]
pub enum PalletAction {
	/// Create a proof-of-existence claim for a file or hash
	CreateClaim {
		/// The 0x-prefixed blake2b-256 hash to claim
		#[arg(group = "input")]
		hash: Option<String>,
		/// Path to a file (will be hashed with blake2b-256)
		#[arg(long, group = "input")]
		file: Option<String>,
		/// Also upload the file to the Bulletin Chain (IPFS)
		#[arg(long, requires = "file")]
		upload: bool,
		/// Also submit the file to the Statement Store
		#[arg(long, requires = "file")]
		statement_store: bool,
		/// Signer: dev name (alice/bob/charlie), mnemonic, or 0x secret seed
		#[arg(long, short, default_value = "alice")]
		signer: String,
	},
	/// Revoke a proof-of-existence claim
	RevokeClaim {
		/// The 0x-prefixed hash to revoke
		hash: String,
		/// Signer: dev name (alice/bob/charlie), mnemonic, or 0x secret seed
		#[arg(long, short, default_value = "alice")]
		signer: String,
	},
	/// Get the claim details for a hash
	GetClaim {
		/// The 0x-prefixed hash to look up
		hash: String,
	},
	/// List all claims stored in the pallet
	ListClaims,
}

/// Extract a 32-byte array from a subxt dynamic Value.
/// Handles the nested composite structure: Composite([Composite([u8; 32])]).
fn value_to_bytes32<T>(val: &subxt::dynamic::Value<T>) -> Option<[u8; 32]> {
	// Unwrap the outer composite wrapper to get the inner byte array
	let inner = val.at(0)?;
	let mut bytes = [0u8; 32];
	for i in 0..32 {
		bytes[i] = inner.at(i).and_then(|v| v.as_u128()).map(|n| n as u8)?;
	}
	Some(bytes)
}

/// Decode a claim from a subxt dynamic value into (owner, block_number) strings.
/// Uses runtime metadata to decode — no hardcoded byte offsets.
fn decode_claim(value: &subxt::dynamic::DecodedValueThunk) -> (String, String) {
	let Ok(val) = value.to_value() else {
		return ("?".to_string(), "?".to_string());
	};
	let owner = val
		.at("owner")
		.and_then(value_to_bytes32)
		.map(|bytes| AccountId32::new(bytes).to_string())
		.unwrap_or_else(|| "?".to_string());
	let block = val
		.at("block_number")
		.and_then(|v: &subxt::dynamic::Value<u32>| v.as_u128())
		.map(|n| n.to_string())
		.unwrap_or_else(|| "?".to_string());
	(owner, block)
}

pub async fn run(action: PalletAction, url: &str) -> Result<(), Box<dyn std::error::Error>> {
	let api = OnlineClient::<PolkadotConfig>::from_url(url).await?;

	match action {
		PalletAction::CreateClaim { hash, file, upload, statement_store, signer } => {
			let (hash_hex, file_bytes) = hash_input(hash, file.as_deref())?;
			let hash_bytes = parse_h256(&hash_hex)?;
			let keypair = resolve_substrate_signer(&signer)?;

			if upload {
				let bytes = file_bytes.as_ref().ok_or("--upload requires --file")?;
				crate::commands::upload_to_bulletin(bytes, &keypair).await?;
			}

			if statement_store {
				let bytes = file_bytes.as_ref().ok_or("--statement-store requires --file")?;
				let statement_signer = resolve_statement_signer(&signer)?;
				crate::commands::submit_to_statement_store(url, bytes, &statement_signer).await?;
			}

			let tx = subxt::dynamic::tx(
				"TemplatePallet",
				"create_claim",
				vec![("hash", subxt::dynamic::Value::from_bytes(hash_bytes))],
			);
			let result = api
				.tx()
				.sign_and_submit_then_watch_default(&tx, &keypair)
				.await?
				.wait_for_finalized_success()
				.await?;
			println!("create_claim finalized in block: {}", result.extrinsic_hash());
		},
		PalletAction::RevokeClaim { hash, signer } => {
			let hash_bytes = parse_h256(&hash)?;
			let keypair = resolve_substrate_signer(&signer)?;
			let tx = subxt::dynamic::tx(
				"TemplatePallet",
				"revoke_claim",
				vec![("hash", subxt::dynamic::Value::from_bytes(hash_bytes))],
			);
			let result = api
				.tx()
				.sign_and_submit_then_watch_default(&tx, &keypair)
				.await?
				.wait_for_finalized_success()
				.await?;
			println!("revoke_claim finalized in block: {}", result.extrinsic_hash());
		},
		PalletAction::GetClaim { hash } => {
			let hash_bytes = parse_h256(&hash)?;
			let storage_query = subxt::dynamic::storage(
				"TemplatePallet",
				"Claims",
				vec![subxt::dynamic::Value::from_bytes(hash_bytes)],
			);
			let result = api.storage().at_latest().await?.fetch(&storage_query).await?;
			match result {
				Some(value) => {
					let (owner, block) = decode_claim(&value);
					println!("Claim found:");
					println!("  Hash:  {hash}");
					println!("  Owner: {owner}");
					println!("  Block: {block}");
				},
				None => println!("No claim found for this hash"),
			}
		},
		PalletAction::ListClaims => {
			let storage_query = subxt::dynamic::storage(
				"TemplatePallet",
				"Claims",
				Vec::<subxt::dynamic::Value>::new(),
			);
			let mut results = api.storage().at_latest().await?.iter(storage_query).await?;

			println!("{:<68} {:<50} BLOCK", "HASH", "OWNER");
			println!("{}", "-".repeat(130));

			let mut count = 0u32;
			while let Some(Ok(kv)) = results.next().await {
				let hash = kv
					.keys
					.first()
					.and_then(value_to_bytes32)
					.map(|bytes| format!("0x{}", hex::encode(bytes)))
					.unwrap_or_else(|| "?".to_string());
				let (owner, block) = decode_claim(&kv.value);

				println!("{:<68} {:<50} {}", hash, owner, block);
				count += 1;
			}

			if count == 0 {
				println!("(no claims found)");
			} else {
				println!("{}", "-".repeat(130));
				println!("{count} claim(s) total");
			}
		},
	}

	Ok(())
}
