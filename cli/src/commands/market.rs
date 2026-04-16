use crate::commands::contract::resolve_signer;
use alloy::{
	primitives::{utils::format_ether, utils::parse_ether, Address, U256},
	providers::ProviderBuilder,
};
use clap::Subcommand;
use serde::Deserialize;
use std::{fs, path::PathBuf};

alloy::sol! {
	#[sol(rpc)]
	contract MedicalMarket {
		function createListing(bytes32 statementHash, uint256 price) external;
		function placeBuyOrder(uint256 listingId) external payable;
		function fulfill(uint256 orderId, bytes32 decryptionKey) external;
		function cancelListing(uint256 listingId) external;
		function getListing(uint256 id) external view returns (bytes32 statementHash, uint256 price, address patient, bool active);
		function getListingCount() external view returns (uint256);
		function getOrder(uint256 id) external view returns (uint256 listingId, address researcher, uint256 amount, bool confirmed, bool cancelled);
		function getDecryptionKey(uint256 orderId) external view returns (bytes32);
		function getOrderCount() external view returns (uint256);
		function getPendingOrderId(uint256 listingId) external view returns (uint256);

		event ListingCreated(address indexed patient, uint256 indexed listingId, bytes32 statementHash, uint256 price);
		event OrderPlaced(uint256 indexed listingId, uint256 indexed orderId, address indexed researcher, uint256 amount);
		event SaleFulfilled(uint256 indexed orderId, uint256 indexed listingId, address patient, address researcher, bytes32 decryptionKey);
		event ListingCancelled(uint256 indexed listingId, address indexed patient);
	}
}

#[derive(Debug, Deserialize)]
pub struct MarketDeployments {
	#[serde(rename = "medicalMarket")]
	pub medical_market: Option<String>,
}

#[derive(Subcommand)]
pub enum MarketAction {
	/// Show contract address, listing count, and order count
	Info,
	/// List all listings
	ListListings,
	/// Get details for a single listing
	GetListing {
		/// Listing ID
		id: u64,
	},
	/// List all orders
	ListOrders,
	/// Get details for a single order
	GetOrder {
		/// Order ID
		id: u64,
	},
	/// Create a new data listing
	CreateListing {
		/// 0x-prefixed 32-byte statement hash
		statement_hash: String,
		/// Price in ETH (e.g. "1.5")
		price: String,
		/// Signer: dev name (alice/bob/charlie) or 0x private key
		#[arg(long, short, default_value = "alice")]
		signer: String,
	},
	/// Place a buy order on a listing
	PlaceOrder {
		/// Listing ID to buy
		listing_id: u64,
		/// Signer: dev name (alice/bob/charlie) or 0x private key
		#[arg(long, short, default_value = "bob")]
		signer: String,
	},
	/// Fulfill a sale by posting the AES-256-GCM decryption key (patient action)
	Fulfill {
		/// Order ID to fulfill
		order_id: u64,
		/// 0x-prefixed 32-byte AES-256-GCM decryption key
		decryption_key: String,
		/// Signer: dev name (alice/bob/charlie) or 0x private key
		#[arg(long, short, default_value = "alice")]
		signer: String,
	},
	/// Cancel a listing (patient action)
	CancelListing {
		/// Listing ID to cancel
		listing_id: u64,
		/// Signer: dev name (alice/bob/charlie) or 0x private key
		#[arg(long, short, default_value = "alice")]
		signer: String,
	},
}

pub fn load_market_address() -> Result<Address, Box<dyn std::error::Error>> {
	let paths = [
		PathBuf::from("deployments.json"),
		PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../deployments.json"),
	];
	for path in &paths {
		if path.exists() {
			let content = fs::read_to_string(path)?;
			let deployments: MarketDeployments = serde_json::from_str(&content)?;
			let addr_str = deployments.medical_market.ok_or(
				"medicalMarket not found in deployments.json. Deploy MedicalMarket contract first.",
			)?;
			return Ok(addr_str.parse()?);
		}
	}
	Err("deployments.json not found. Deploy contracts first.".into())
}

pub async fn run(
	action: MarketAction,
	eth_rpc_url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
	match action {
		MarketAction::Info => {
			let contract_addr = load_market_address()?;
			let provider = ProviderBuilder::new().connect_http(eth_rpc_url.parse()?);
			let contract = MedicalMarket::new(contract_addr, &provider);

			let listing_count = contract.getListingCount().call().await?;
			let order_count = contract.getOrderCount().call().await?;

			println!("MedicalMarket Contract");
			println!("======================");
			println!("Address:        {contract_addr}");
			println!("Listing count:  {listing_count}");
			println!("Order count:    {order_count}");
		},

		MarketAction::ListListings => {
			let contract_addr = load_market_address()?;
			let provider = ProviderBuilder::new().connect_http(eth_rpc_url.parse()?);
			let contract = MedicalMarket::new(contract_addr, &provider);

			let count_result = contract.getListingCount().call().await?;
			let count: u64 = count_result.try_into().unwrap_or(u64::MAX);

			if count == 0 {
				println!("No listings found.");
				return Ok(());
			}

			println!("Listings ({count} total)");
			println!("{}", "=".repeat(60));

			for id in 0..count {
				let result = contract.getListing(U256::from(id)).call().await?;
				let pending_order_result =
					contract.getPendingOrderId(U256::from(id)).call().await?;
				let pending_order_id: u64 =
					pending_order_result.try_into().unwrap_or(u64::MAX);

				let status = listing_status(result.active, pending_order_id);
				println!(
					"[{id}] hash={:#x}  price={}  patient={}  status={}",
					result.statementHash,
					format_ether(result.price),
					result.patient,
					status,
				);
			}
		},

		MarketAction::GetListing { id } => {
			let contract_addr = load_market_address()?;
			let provider = ProviderBuilder::new().connect_http(eth_rpc_url.parse()?);
			let contract = MedicalMarket::new(contract_addr, &provider);

			let result = contract.getListing(U256::from(id)).call().await?;
			let pending_order_result =
				contract.getPendingOrderId(U256::from(id)).call().await?;
			let pending_order_id: u64 =
				pending_order_result.try_into().unwrap_or(u64::MAX);

			let status = listing_status(result.active, pending_order_id);

			println!("Listing #{id}");
			println!("{}", "=".repeat(40));
			println!("Statement hash: {:#x}", result.statementHash);
			println!("Price:          {} ETH", format_ether(result.price));
			println!("Patient:        {}", result.patient);
			println!("Status:         {status}");
			if result.active && pending_order_id != 0 {
				// pending_order_id is 1-based from the contract; convert to 0-based
				println!("Pending order:  #{}", pending_order_id - 1);
			}
		},

		MarketAction::ListOrders => {
			let contract_addr = load_market_address()?;
			let provider = ProviderBuilder::new().connect_http(eth_rpc_url.parse()?);
			let contract = MedicalMarket::new(contract_addr, &provider);

			let count_result = contract.getOrderCount().call().await?;
			let count: u64 = count_result.try_into().unwrap_or(u64::MAX);

			if count == 0 {
				println!("No orders found.");
				return Ok(());
			}

			println!("Orders ({count} total)");
			println!("{}", "=".repeat(60));

			for id in 0..count {
				let result = contract.getOrder(U256::from(id)).call().await?;
				let listing_id: u64 = result.listingId.try_into().unwrap_or(u64::MAX);
				let status = order_status(result.confirmed, result.cancelled);

				println!(
					"[{id}] listing=#{listing_id}  researcher={}  amount={}  status={}",
					result.researcher,
					format_ether(result.amount),
					status,
				);
			}
		},

		MarketAction::GetOrder { id } => {
			let contract_addr = load_market_address()?;
			let provider = ProviderBuilder::new().connect_http(eth_rpc_url.parse()?);
			let contract = MedicalMarket::new(contract_addr, &provider);

			let result = contract.getOrder(U256::from(id)).call().await?;
			let listing_id: u64 = result.listingId.try_into().unwrap_or(u64::MAX);
			let status = order_status(result.confirmed, result.cancelled);

			println!("Order #{id}");
			println!("{}", "=".repeat(40));
			println!("Listing ID:   #{listing_id}");
			println!("Researcher:   {}", result.researcher);
			println!("Amount:       {} ETH", format_ether(result.amount));
			println!("Status:       {status}");

			if result.confirmed {
				let key = contract.getDecryptionKey(U256::from(id)).call().await?;
				println!("Decryption key: {:#x}", key);
			}
		},

		MarketAction::CreateListing { statement_hash, price, signer } => {
			let contract_addr = load_market_address()?;
			let price_wei = parse_ether(&price)?;
			let hash_bytes: alloy::primitives::FixedBytes<32> = statement_hash.parse()?;

			let wallet = alloy::network::EthereumWallet::from(resolve_signer(&signer)?);
			let provider =
				ProviderBuilder::new().wallet(wallet).connect_http(eth_rpc_url.parse()?);
			let contract = MedicalMarket::new(contract_addr, &provider);

			println!("Creating listing: hash={statement_hash}  price={price} ETH...");
			let pending = contract.createListing(hash_bytes, price_wei).send().await?;
			let receipt = pending.get_receipt().await?;
			println!(
				"Confirmed in block {}: tx {}",
				receipt.block_number.unwrap_or_default(),
				receipt.transaction_hash
			);
		},

		MarketAction::PlaceOrder { listing_id, signer } => {
			let contract_addr = load_market_address()?;

			// Read listing price with a read-only provider first
			let ro_provider = ProviderBuilder::new().connect_http(eth_rpc_url.parse()?);
			let ro_contract = MedicalMarket::new(contract_addr, &ro_provider);
			let listing = ro_contract.getListing(U256::from(listing_id)).call().await?;

			if !listing.active {
				return Err(format!("Listing #{listing_id} is not active.").into());
			}
			let price = listing.price;

			let wallet = alloy::network::EthereumWallet::from(resolve_signer(&signer)?);
			let provider =
				ProviderBuilder::new().wallet(wallet).connect_http(eth_rpc_url.parse()?);
			let contract = MedicalMarket::new(contract_addr, &provider);

			println!(
				"Placing buy order on listing #{listing_id} for {} ETH...",
				format_ether(price)
			);
			let pending = contract.placeBuyOrder(U256::from(listing_id)).value(price).send().await?;
			let receipt = pending.get_receipt().await?;
			println!(
				"Confirmed in block {}: tx {}",
				receipt.block_number.unwrap_or_default(),
				receipt.transaction_hash
			);
		},

		MarketAction::Fulfill { order_id, decryption_key, signer } => {
			let contract_addr = load_market_address()?;
			let key_bytes: alloy::primitives::FixedBytes<32> = decryption_key.parse()?;
			let wallet = alloy::network::EthereumWallet::from(resolve_signer(&signer)?);
			let provider =
				ProviderBuilder::new().wallet(wallet).connect_http(eth_rpc_url.parse()?);
			let contract = MedicalMarket::new(contract_addr, &provider);

			println!("Fulfilling order #{order_id} with decryption key...");
			let pending = contract.fulfill(U256::from(order_id), key_bytes).send().await?;
			let receipt = pending.get_receipt().await?;
			println!(
				"Confirmed in block {}: tx {}",
				receipt.block_number.unwrap_or_default(),
				receipt.transaction_hash
			);
		},

		MarketAction::CancelListing { listing_id, signer } => {
			let contract_addr = load_market_address()?;
			let wallet = alloy::network::EthereumWallet::from(resolve_signer(&signer)?);
			let provider =
				ProviderBuilder::new().wallet(wallet).connect_http(eth_rpc_url.parse()?);
			let contract = MedicalMarket::new(contract_addr, &provider);

			println!("Cancelling listing #{listing_id}...");
			let pending = contract.cancelListing(U256::from(listing_id)).send().await?;
			let receipt = pending.get_receipt().await?;
			println!(
				"Confirmed in block {}: tx {}",
				receipt.block_number.unwrap_or_default(),
				receipt.transaction_hash
			);
		},
	}

	Ok(())
}

fn listing_status(active: bool, pending_order_id: u64) -> &'static str {
	if !active {
		"Inactive"
	} else if pending_order_id == 0 {
		// Contract stores pending order as 1-based (0 = no pending order)
		"Active (no order)"
	} else {
		"Active (order pending)"
	}
}

fn order_status(confirmed: bool, cancelled: bool) -> &'static str {
	if confirmed {
		"Confirmed"
	} else if cancelled {
		"Cancelled"
	} else {
		"Pending"
	}
}
