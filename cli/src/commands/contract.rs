use crate::commands::{hash_input, resolve_substrate_signer};
use alloy::primitives::{Address, FixedBytes};
use alloy::providers::ProviderBuilder;
use alloy::signers::local::PrivateKeySigner;
use alloy::sol;
use clap::Subcommand;
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

const ALICE_KEY: &str = "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133";
const BOB_KEY: &str = "0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b";
const CHARLIE_KEY: &str = "0x0b6e18cafb6ed99687ec547bd28139cafbd3a4f28014f8640076aba0082bf262";

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

#[derive(Debug, Deserialize)]
pub struct Deployments {
    pub evm: Option<String>,
    pub pvm: Option<String>,
}

#[derive(Subcommand)]
pub enum ContractAction {
    /// Show deployed contract addresses and dev accounts
    Info,
    /// Create a proof-of-existence claim
    CreateClaim {
        /// Contract type: evm or pvm
        #[arg(value_parser = ["evm", "pvm"])]
        contract_type: String,
        /// The 0x-prefixed blake2b-256 hash to claim
        #[arg(group = "input")]
        hash: Option<String>,
        /// Path to a file (will be hashed with blake2b-256)
        #[arg(long, group = "input")]
        file: Option<String>,
        /// Also upload the file to the Bulletin Chain (IPFS)
        #[arg(long, requires = "file")]
        upload: bool,
        /// Signer: dev name (alice/bob/charlie) or 0x private key
        #[arg(long, short, default_value = "alice")]
        signer: String,
    },
    /// Revoke a proof-of-existence claim
    RevokeClaim {
        /// Contract type: evm or pvm
        #[arg(value_parser = ["evm", "pvm"])]
        contract_type: String,
        /// The 0x-prefixed hash to revoke
        hash: String,
        /// Signer: dev name (alice/bob/charlie) or 0x private key
        #[arg(long, short, default_value = "alice")]
        signer: String,
    },
    /// Get the claim details for a hash
    GetClaim {
        /// Contract type: evm or pvm
        #[arg(value_parser = ["evm", "pvm"])]
        contract_type: String,
        /// The 0x-prefixed hash to look up
        hash: String,
    },
}

fn resolve_signer(name: &str) -> Result<PrivateKeySigner, Box<dyn std::error::Error>> {
    let lowered = name.to_lowercase();
    let key = match lowered.as_str() {
        "alice" => ALICE_KEY,
        "bob" => BOB_KEY,
        "charlie" => CHARLIE_KEY,
        hex if hex.starts_with("0x") => hex,
        _ => return Err(format!("Unknown signer: {name}. Use alice, bob, or charlie.").into()),
    };
    Ok(key.parse()?)
}

fn parse_hash(hex_str: &str) -> Result<FixedBytes<32>, Box<dyn std::error::Error>> {
    Ok(hex_str.parse()?)
}

fn load_deployments() -> Result<Deployments, Box<dyn std::error::Error>> {
    let paths = [
        PathBuf::from("deployments.json"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../deployments.json"),
    ];
    for path in &paths {
        if path.exists() {
            let content = fs::read_to_string(path)?;
            return Ok(serde_json::from_str(&content)?);
        }
    }
    Err("deployments.json not found. Deploy contracts first.".into())
}

fn get_contract_address(
    deployments: &Deployments,
    contract_type: &str,
) -> Result<Address, Box<dyn std::error::Error>> {
    let addr = match contract_type {
        "evm" => deployments.evm.as_deref(),
        "pvm" => deployments.pvm.as_deref(),
        _ => None,
    };
    let addr_str = addr.ok_or_else(|| -> Box<dyn std::error::Error> {
        format!(
            "{} contract not deployed. Run: cd contracts/{} && npm run deploy:local",
            contract_type.to_uppercase(),
            contract_type
        )
        .into()
    })?;
    Ok(addr_str.parse()?)
}

pub async fn run(
    action: ContractAction,
    eth_rpc_url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        ContractAction::Info => {
            let deployments = load_deployments()?;
            println!("Deployed Contracts");
            println!("==================");
            println!(
                "EVM (solc):    {}",
                deployments.evm.as_deref().unwrap_or("not deployed")
            );
            println!(
                "PVM (resolc):  {}",
                deployments.pvm.as_deref().unwrap_or("not deployed")
            );
            println!();
            println!("Dev Accounts (Ethereum)");
            println!("=======================");
            for name in ["alice", "bob", "charlie"] {
                let signer = resolve_signer(name)?;
                println!(
                    "{:<10} {}",
                    format!("{}:", capitalize(name)),
                    signer.address()
                );
            }
        }
        ContractAction::CreateClaim {
            contract_type,
            hash,
            file,
            upload,
            signer,
        } => {
            let (hash_hex, file_bytes) = hash_input(hash, file.as_deref())?;

            if upload {
                let bytes = file_bytes.ok_or("--upload requires --file")?;
                // Use Substrate signer for Bulletin Chain (maps dev names to sr25519 keys)
                let substrate_signer = resolve_substrate_signer(&signer)?;
                crate::commands::upload_to_bulletin(&bytes, &substrate_signer).await?;
            }

            let deployments = load_deployments()?;
            let contract_addr = get_contract_address(&deployments, &contract_type)?;
            let document_hash = parse_hash(&hash_hex)?;
            let wallet = alloy::network::EthereumWallet::from(resolve_signer(&signer)?);

            let provider = ProviderBuilder::new()
                .wallet(wallet)
                .connect_http(eth_rpc_url.parse()?);
            let contract = ProofOfExistence::new(contract_addr, &provider);

            println!(
                "Submitting createClaim to {} contract...",
                contract_type.to_uppercase()
            );
            let pending = contract.createClaim(document_hash).send().await?;
            let receipt = pending.get_receipt().await?;
            println!(
                "Confirmed in block {}: tx {}",
                receipt.block_number.unwrap_or_default(),
                receipt.transaction_hash
            );
        }
        ContractAction::RevokeClaim {
            contract_type,
            hash,
            signer,
        } => {
            let deployments = load_deployments()?;
            let contract_addr = get_contract_address(&deployments, &contract_type)?;
            let document_hash = parse_hash(&hash)?;
            let wallet = alloy::network::EthereumWallet::from(resolve_signer(&signer)?);

            let provider = ProviderBuilder::new()
                .wallet(wallet)
                .connect_http(eth_rpc_url.parse()?);
            let contract = ProofOfExistence::new(contract_addr, &provider);

            println!(
                "Submitting revokeClaim to {} contract...",
                contract_type.to_uppercase()
            );
            let pending = contract.revokeClaim(document_hash).send().await?;
            let receipt = pending.get_receipt().await?;
            println!(
                "Confirmed in block {}: tx {}",
                receipt.block_number.unwrap_or_default(),
                receipt.transaction_hash
            );
        }
        ContractAction::GetClaim {
            contract_type,
            hash,
        } => {
            let deployments = load_deployments()?;
            let contract_addr = get_contract_address(&deployments, &contract_type)?;
            let document_hash = parse_hash(&hash)?;

            let provider = ProviderBuilder::new().connect_http(eth_rpc_url.parse()?);
            let contract = ProofOfExistence::new(contract_addr, &provider);

            let result = contract.getClaim(document_hash).call().await?;
            if result.owner == Address::ZERO {
                println!("No claim found for this hash");
            } else {
                println!("Owner: {}", result.owner);
                println!("Block:  {}", result.blockNumber);
            }
        }
    }

    Ok(())
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().to_string() + c.as_str(),
    }
}
