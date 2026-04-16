use crate::commands::{rpc_call, resolve_statement_signer, submit_to_statement_store};
use blake2::{
	digest::{consts::U32, Digest},
	Blake2b,
};
use clap::Subcommand;
use codec::Decode;
use sp_statement_store::Statement;
use std::fs;

type Blake2b256 = Blake2b<U32>;

#[derive(Subcommand)]
pub enum StatementAction {
	/// List all statements in the local Statement Store
	List,
	/// Submit a file to the Statement Store and print its on-chain lookup hash
	Submit {
		/// Path to the file to submit
		file: String,
		/// Signer: dev name (alice/bob/charlie) or derivation path
		#[arg(long, short, default_value = "alice")]
		signer: String,
	},
}

pub async fn run(
	action: StatementAction,
	url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
	match action {
		StatementAction::List => list(url).await?,
		StatementAction::Submit { file, signer } => submit(&file, &signer, url).await?,
	}
	Ok(())
}

async fn list(url: &str) -> Result<(), Box<dyn std::error::Error>> {
	let raw: Vec<String> = rpc_call(url, "statement_dump", Vec::<String>::new()).await?;

	if raw.is_empty() {
		println!("No statements found in the Statement Store.");
		return Ok(());
	}

	println!("Statements ({} total)", raw.len());
	println!("{}", "=".repeat(60));

	for (i, hex) in raw.iter().enumerate() {
		let bytes = hex_to_bytes(hex);

		match Statement::decode(&mut bytes.as_slice()) {
			Ok(stmt) => {
				// blake2b-256 of the raw data payload — matches the on-chain lookup key
				// computed by the frontend (PatientDashboard / ResearcherBuy)
				let lookup_hash = match stmt.data() {
					Some(data) => {
						let mut hasher = Blake2b256::new();
						hasher.update(data);
						format!("0x{}", hex::encode(hasher.finalize()))
					},
					None => "(no data)".to_string(),
				};

				let data_len = stmt.data_len();
				let preview = stmt.data().map(|d| data_preview(d)).unwrap_or_default();

				println!("[{i}] hash={lookup_hash}");
				println!("     data_len={data_len}  {preview}");
			},
			Err(e) => {
				println!("[{i}] (decode error: {e})  raw_len={}", bytes.len());
			},
		}
	}

	Ok(())
}

async fn submit(
	file: &str,
	signer_input: &str,
	url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
	let bytes = fs::read(file)?;
	let signer = resolve_statement_signer(signer_input)?;

	// Compute the on-chain lookup hash (blake2b-256 of the data bytes)
	let mut hasher = Blake2b256::new();
	hasher.update(&bytes);
	let lookup_hash = format!("0x{}", hex::encode(hasher.finalize()));

	submit_to_statement_store(url, &bytes, &signer).await?;

	println!("On-chain lookup hash (use with `market create-listing`): {lookup_hash}");
	Ok(())
}

fn hex_to_bytes(hex: &str) -> Vec<u8> {
	let clean = hex.strip_prefix("0x").unwrap_or(hex);
	hex::decode(clean).unwrap_or_default()
}

/// Show a short preview of the data: UTF-8 text snippet or "binary" label.
fn data_preview(data: &[u8]) -> String {
	match std::str::from_utf8(data) {
		Ok(s) => {
			let snippet: String = s.chars().take(80).collect();
			let ellipsis = if s.chars().count() > 80 { "…" } else { "" };
			format!("preview=\"{snippet}{ellipsis}\"")
		},
		Err(_) => format!("binary (0x{}…)", hex::encode(&data[..data.len().min(8)])),
	}
}
