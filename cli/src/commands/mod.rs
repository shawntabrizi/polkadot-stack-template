pub mod chain;
pub mod contract;
pub mod pallet;

use blake2::digest::{consts::U32, Digest};
use blake2::Blake2b;
use std::fs;
use subxt::{OnlineClient, PolkadotConfig};
use subxt_signer::sr25519::{dev, Keypair};

type Blake2b256 = Blake2b<U32>;

const BULLETIN_WS: &str = "wss://paseo-bulletin-rpc.polkadot.io";

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
        }
    }
}

/// Resolve a hash from either a direct hex string or a file path.
/// Returns (hex_hash, Option<file_bytes>).
pub fn hash_input(
    hash: Option<String>,
    file: Option<&str>,
) -> Result<(String, Option<Vec<u8>>), Box<dyn std::error::Error>> {
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
        }
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

    println!(
        "Uploaded to Bulletin Chain! Finalized: {}",
        result.extrinsic_hash()
    );
    println!("File will be available on IPFS via the Paseo gateway.");

    Ok(())
}
