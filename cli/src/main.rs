use clap::{Parser, Subcommand};

mod commands;

#[derive(Parser)]
#[command(name = "stack-cli")]
#[command(about = "CLI for interacting with the Polkadot Stack Template chain")]
struct Cli {
	/// WebSocket RPC endpoint URL
	#[arg(long, env = "SUBSTRATE_RPC_WS", default_value = "ws://127.0.0.1:9944")]
	url: String,

	/// Ethereum JSON-RPC endpoint URL (for contract interaction via eth-rpc)
	#[arg(long, env = "ETH_RPC_HTTP", default_value = "http://127.0.0.1:8545")]
	eth_rpc_url: String,

	#[command(subcommand)]
	command: Commands,
}

#[derive(Subcommand)]
enum Commands {
	/// Chain information commands
	Chain {
		#[command(subcommand)]
		action: commands::chain::ChainAction,
	},
	/// Proof of existence pallet commands
	Pallet {
		#[command(subcommand)]
		action: commands::pallet::PalletAction,
	},
	/// Proof of existence contract commands (via eth-rpc)
	Contract {
		#[command(subcommand)]
		action: commands::contract::ContractAction,
	},
	/// All-in-one: hash a file, create a claim, and optionally upload to Bulletin Chain /
	/// Statement Store
	Prove(commands::prove::ProveArgs),
	/// Medical marketplace commands
	Market {
		#[command(subcommand)]
		action: commands::market::MarketAction,
	},
	/// Inspect a transaction by hash
	Tx {
		#[command(subcommand)]
		action: commands::tx::TxAction,
	},
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
	let cli = Cli::parse();

	match cli.command {
		Commands::Chain { action } => commands::chain::run(action, &cli.url).await?,
		Commands::Pallet { action } => commands::pallet::run(action, &cli.url).await?,
		Commands::Contract { action } => {
			commands::contract::run(action, &cli.eth_rpc_url, &cli.url).await?
		},
		Commands::Prove(args) => commands::prove::run(args, &cli.url, &cli.eth_rpc_url).await?,
		Commands::Market { action } => commands::market::run(action, &cli.eth_rpc_url).await?,
		Commands::Tx { action } => commands::tx::run(action, &cli.eth_rpc_url).await?,
	}

	Ok(())
}
