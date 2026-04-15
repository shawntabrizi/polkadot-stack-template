SHELL := /bin/bash

ROOT_DIR := $(shell pwd)
EVM_DIR  := $(ROOT_DIR)/contracts/evm
PVM_DIR  := $(ROOT_DIR)/contracts/pvm

# Read PRIVATE_KEY from hardhat vars file if not set in environment
HARDHAT_VARS_FILE := $(HOME)/Library/Preferences/hardhat-nodejs/vars.json
ifndef PRIVATE_KEY
  PRIVATE_KEY := $(shell node -e "try{const v=require('$(HARDHAT_VARS_FILE)');process.stdout.write(v.vars.PRIVATE_KEY??'')}catch(e){}" 2>/dev/null)
endif

ifndef MNEMONIC
  MNEMONIC := $(shell node -e "try{const v=require('$(HARDHAT_VARS_FILE)');process.stdout.write(v.vars.MNEMONIC??'')}catch(e){}" 2>/dev/null)
endif

export PRIVATE_KEY
export MNEMONIC

# ─── Paseo deploy ─────────────────────────────────────────────────────────────

.PHONY: deploy-paseo
deploy-paseo: check-key deploy-paseo-evm deploy-paseo-commons
	@echo ""
	@echo "=== Paseo deployment complete ==="
	@cat $(ROOT_DIR)/deployments.json

.PHONY: deploy-paseo-evm
deploy-paseo-evm:
	@echo "[1/3] Deploying ProofOfExistence (EVM)..."
	@cd $(EVM_DIR) && npm install --silent && npx hardhat compile --quiet && npx hardhat run scripts/deploy.ts --network polkadotTestnet

.PHONY: deploy-paseo-pvm
deploy-paseo-pvm:
	@echo "[2/3] Deploying ProofOfExistence (PVM)..."
	@cd $(PVM_DIR) && npm install --silent && npx hardhat compile --quiet && npx hardhat run scripts/deploy.ts --network polkadotTestnet

.PHONY: deploy-paseo-commons
deploy-paseo-commons:
	@echo "[3/3] Deploying FungibleCredential + PriceOracle..."
	@cd $(EVM_DIR) && npx hardhat run scripts/deploy-commons.ts --network polkadotTestnet

# ─── Frontend deploy ──────────────────────────────────────────────────────────

# Domain to deploy to — override with: make deploy-frontend DOMAIN=my-app.dot
DOMAIN ?= polkadot-stack-template00.dot

.PHONY: deploy-frontend
deploy-frontend: build-frontend check-bulletin-deploy check-ipfs
	@echo "Deploying frontend to Bulletin Chain..."
	@echo "  Domain:  $(DOMAIN)"
	@echo "  URL:     https://$(DOMAIN).li"
	@if [ -n "$(MNEMONIC)" ]; then \
		MNEMONIC="$(MNEMONIC)" bulletin-deploy $(ROOT_DIR)/web/dist $(DOMAIN); \
	else \
		bulletin-deploy $(ROOT_DIR)/web/dist $(DOMAIN); \
	fi

.PHONY: build-frontend
build-frontend:
	@echo "Building frontend..."
	@cd $(ROOT_DIR)/web && npm install --silent && npm run build
	@echo "  Build output: web/dist/"

.PHONY: check-bulletin-deploy
check-bulletin-deploy:
	@if ! command -v bulletin-deploy &>/dev/null; then \
		echo "ERROR: bulletin-deploy not installed."; \
		echo "Run: npm install -g bulletin-deploy"; \
		exit 1; \
	fi

.PHONY: check-ipfs
check-ipfs:
	@if ! command -v ipfs &>/dev/null; then \
		echo "ERROR: IPFS Kubo not installed (required by bulletin-deploy)."; \
		echo "macOS:  brew install ipfs && ipfs init"; \
		echo "Linux:  see https://docs.ipfs.tech/install/command-line/"; \
		exit 1; \
	fi

# ─── Guards ───────────────────────────────────────────────────────────────────

.PHONY: check-key
check-key:
	@if [ -z "$(PRIVATE_KEY)" ]; then \
		echo "ERROR: PRIVATE_KEY not set."; \
		echo "Run: cd contracts/evm && npx hardhat vars set PRIVATE_KEY"; \
		echo "Or:  export PRIVATE_KEY=0x..."; \
		exit 1; \
	fi
	@echo "Deploying from: $$(source web/.env 2>/dev/null; node -e " \
		const {privateKeyToAccount}=require('viem/accounts'); \
		const k='$(PRIVATE_KEY)'; \
		const pk=k.startsWith('0x')?k:'0x'+k; \
		console.log(privateKeyToAccount(pk).address)" 2>/dev/null || echo "(address lookup unavailable)")"
