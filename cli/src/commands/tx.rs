use crate::commands::rpc_call;
use alloy::primitives::{utils::format_ether, U256};
use clap::Subcommand;

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

fn hex_to_u64(v: &serde_json::Value) -> u64 {
    let s = v.as_str().unwrap_or("0x0");
    u64::from_str_radix(s.trim_start_matches("0x"), 16).unwrap_or(0)
}

async fn inspect(hash: &str, eth_rpc_url: &str) -> Result<(), Box<dyn std::error::Error>> {
    let receipt: serde_json::Value =
        rpc_call(eth_rpc_url, "eth_getTransactionReceipt", vec![hash]).await?;
    let tx: serde_json::Value =
        rpc_call(eth_rpc_url, "eth_getTransaction", vec![hash]).await?;

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
    let from = tx
        .get("from")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    // To — null means contract deploy
    let to_field = tx.get("to").unwrap_or(&serde_json::Value::Null);
    let to = if to_field.is_null() {
        "contract deploy".to_string()
    } else {
        to_field.as_str().unwrap_or("unknown").to_string()
    };

    // Value — parse as hex u256, format as ether
    let value_str = tx
        .get("value")
        .and_then(|v| v.as_str())
        .unwrap_or("0x0");
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
    let logs = receipt
        .get("logs")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty);

    println!();
    println!("Logs ({})", logs.len());
    println!("========");

    if logs.is_empty() {
        println!("(none)");
    } else {
        for (i, log) in logs.iter().enumerate() {
            let address = log
                .get("address")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            println!("[{i}] address: {address}");

            let no_topics: Vec<serde_json::Value> = vec![];
            let topics = log
                .get("topics")
                .and_then(|v| v.as_array())
                .unwrap_or(&no_topics);

            if !topics.is_empty() {
                println!("    topics:");
                for (j, topic) in topics.iter().enumerate() {
                    let topic_str = topic.as_str().unwrap_or("0x");
                    println!("      [{j}] {topic_str}");
                }
            }

            let data = log
                .get("data")
                .and_then(|v| v.as_str())
                .unwrap_or("0x");
            println!("    data: {data}");
        }
    }

    Ok(())
}
