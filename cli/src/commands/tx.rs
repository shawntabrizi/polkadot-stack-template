use crate::commands::rpc_call;
use alloy::{
    primitives::{keccak256, utils::format_ether, Bytes, FixedBytes, U256},
    sol_types::SolEvent,
};
use clap::Subcommand;

alloy::sol! {
    event ListingCreated(address indexed patient, uint256 indexed listingId, bytes32 statementHash, uint256 price);
    event OrderPlaced(uint256 indexed listingId, uint256 indexed orderId, address indexed researcher, uint256 amount);
    event SaleConfirmed(uint256 indexed orderId, uint256 indexed listingId, address patient, address researcher);
    event ListingCancelled(uint256 indexed listingId, address indexed patient);
    event ProofSubmitted(address indexed owner, bytes32 indexed hash);
}

#[derive(Subcommand)]
pub enum TxAction {
    /// Inspect a transaction by hash
    Inspect {
        /// Transaction hash (0x-prefixed)
        hash: String,
    },
}

pub async fn run(action: TxAction, eth_rpc_url: &str) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        TxAction::Inspect { hash } => inspect(&hash, eth_rpc_url).await?,
    }
    Ok(())
}

/// Try to ABI-decode a log into a human-readable string.
/// Returns None if the selector doesn't match any known event.
fn decode_log(topics: &[FixedBytes<32>], data: &Bytes) -> Option<String> {
    if let Ok(e) = ListingCreated::decode_raw_log(topics, data) {
        return Some(format!(
            "MedicalMarket.ListingCreated\n    patient:   {}\n    listingId: {}\n    hash:      {:#x}\n    price:     {} PAS",
            e.patient,
            e.listingId,
            e.statementHash,
            format_ether(e.price),
        ));
    }
    if let Ok(e) = OrderPlaced::decode_raw_log(topics, data) {
        return Some(format!(
            "MedicalMarket.OrderPlaced\n    listingId:  {}\n    orderId:    {}\n    researcher: {}\n    amount:     {} PAS",
            e.listingId,
            e.orderId,
            e.researcher,
            format_ether(e.amount),
        ));
    }
    if let Ok(e) = SaleConfirmed::decode_raw_log(topics, data) {
        return Some(format!(
            "MedicalMarket.SaleConfirmed\n    orderId:    {}\n    listingId:  {}\n    patient:    {}\n    researcher: {}",
            e.orderId,
            e.listingId,
            e.patient,
            e.researcher,
        ));
    }
    if let Ok(e) = ListingCancelled::decode_raw_log(topics, data) {
        return Some(format!(
            "MedicalMarket.ListingCancelled\n    listingId: {}\n    patient:   {}",
            e.listingId, e.patient,
        ));
    }
    if let Ok(e) = ProofSubmitted::decode_raw_log(topics, data) {
        return Some(format!(
            "ProofOfExistence.ProofSubmitted\n    owner: {}\n    hash:  {:#x}",
            e.owner, e.hash,
        ));
    }
    None
}

/// Parse a JSON array of topic strings into alloy FixedBytes<32>.
fn parse_topics(topics: &[serde_json::Value]) -> Vec<FixedBytes<32>> {
    topics
        .iter()
        .filter_map(|t| {
            let s = t.as_str()?;
            let hex = s.trim_start_matches("0x");
            let bytes = hex::decode(hex).ok()?;
            if bytes.len() == 32 {
                Some(FixedBytes::<32>::from_slice(&bytes))
            } else {
                None
            }
        })
        .collect()
}

/// Parse a JSON hex data string into alloy Bytes.
fn parse_data(data_str: &str) -> Bytes {
    let hex = data_str.trim_start_matches("0x");
    Bytes::from(hex::decode(hex).unwrap_or_default())
}

fn hex_to_u64(v: &serde_json::Value) -> u64 {
    let s = v.as_str().unwrap_or("0x0");
    u64::from_str_radix(s.trim_start_matches("0x"), 16).unwrap_or(0)
}

async fn inspect(hash: &str, eth_rpc_url: &str) -> Result<(), Box<dyn std::error::Error>> {
    let receipt: serde_json::Value =
        rpc_call(eth_rpc_url, "eth_getTransactionReceipt", vec![hash]).await?;
    let tx: serde_json::Value =
        rpc_call(eth_rpc_url, "eth_getTransactionByHash", vec![hash]).await?;

    if receipt.is_null() && tx.is_null() {
        println!("Transaction not found");
        return Ok(());
    }

    // Status
    let status_raw = receipt.get("status").unwrap_or(&serde_json::Value::Null);
    let status = if status_raw.is_null() {
        "Unknown"
    } else if status_raw.as_str().unwrap_or("0x0") == "0x1" {
        "Success"
    } else {
        "Failed"
    };

    // Block number
    let block_number = hex_to_u64(receipt.get("blockNumber").unwrap_or(&serde_json::Value::Null));

    // From
    let from = tx.get("from").and_then(|v| v.as_str()).unwrap_or("unknown");

    // To — null means contract deploy
    let to_field = tx.get("to").unwrap_or(&serde_json::Value::Null);
    let to = if to_field.is_null() {
        "contract deploy".to_string()
    } else {
        to_field.as_str().unwrap_or("unknown").to_string()
    };

    // Value — parse as hex u256, format as ether
    let value_str = tx.get("value").and_then(|v| v.as_str()).unwrap_or("0x0");
    let value_hex = value_str.trim_start_matches("0x");
    let value_u256 = U256::from_str_radix(value_hex, 16).unwrap_or(U256::ZERO);
    let value_formatted = format_ether(value_u256);

    // Gas used
    let gas_used = hex_to_u64(receipt.get("gasUsed").unwrap_or(&serde_json::Value::Null));

    println!("Transaction");
    println!("===========");
    println!("Hash:     {hash}");
    println!("Status:   {status}");
    println!("Block:    {block_number}");
    println!("From:     {from}");
    println!("To:       {to}");
    println!("Value:    {value_formatted} PAS");
    println!("Gas Used: {gas_used}");

    // Logs
    let empty = vec![];
    let logs = receipt.get("logs").and_then(|v| v.as_array()).unwrap_or(&empty);

    println!();
    println!("Logs ({})", logs.len());
    println!("========");

    if logs.is_empty() {
        println!("(none)");
    } else {
        for (i, log) in logs.iter().enumerate() {
            let address = log.get("address").and_then(|v| v.as_str()).unwrap_or("unknown");

            let no_topics: Vec<serde_json::Value> = vec![];
            let raw_topics =
                log.get("topics").and_then(|v| v.as_array()).unwrap_or(&no_topics);
            let data_str =
                log.get("data").and_then(|v| v.as_str()).unwrap_or("0x");

            let topics = parse_topics(raw_topics);
            let data = parse_data(data_str);

            // Try full ABI decode first
            if let Some(decoded) = decode_log(&topics, &data) {
                println!("[{i}] {decoded}");
                println!("    address: {address}");
            } else {
                // Fallback: show raw topics + data
                let selector_label = raw_topics
                    .first()
                    .and_then(|t| t.as_str())
                    .and_then(|t| {
                        let hex = t.trim_start_matches("0x");
                        for (sig, label) in [
                            ("Transfer(address,address,uint256)", "ERC20.Transfer"),
                            ("Approval(address,address,uint256)", "ERC20.Approval"),
                        ] {
                            if hex::encode(keccak256(sig.as_bytes())) == hex {
                                return Some(label);
                            }
                        }
                        None
                    });

                if let Some(label) = selector_label {
                    println!("[{i}] {label}  address: {address}");
                } else {
                    println!("[{i}] (unknown event)  address: {address}");
                }

                if !raw_topics.is_empty() {
                    println!("    topics:");
                    for (j, topic) in raw_topics.iter().enumerate() {
                        let topic_str = topic.as_str().unwrap_or("0x");
                        if j == 0 {
                            println!("      [{j}] {topic_str}  (selector)");
                        } else {
                            println!("      [{j}] {topic_str}");
                        }
                    }
                }
                if data_str != "0x" && !data_str.is_empty() {
                    println!("    data: {data_str}");
                }
            }
        }
    }

    Ok(())
}
