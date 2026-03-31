import { useState, useCallback, useEffect, type ReactNode } from "react";
import { type Address } from "viem";
import {
  proofOfExistenceAbi,
  evmDevAccounts,
  getPublicClient,
  getWalletClient,
} from "../config/evm";
import { devAccounts } from "../hooks/useAccount";
import FileDropZone from "./FileDropZone";
import { hexHashToCid, ipfsUrl, checkIpfsAvailable } from "../utils/cid";
import {
  uploadToBulletin,
  checkBulletinAuthorization,
} from "../hooks/useBulletin";
import { useChainStore } from "../store/chainStore";

interface Props {
  title: string;
  description: ReactNode;
  contractKind: "evm" | "pvm";
  accentColor: "purple" | "green";
  storageKey: string;
  defaultAddress?: string;
}

interface Claim {
  hash: `0x${string}`;
  owner: string;
  block: bigint;
}

const colorMap = {
  purple: {
    title: "text-purple-400",
    button: "bg-purple-600 hover:bg-purple-700",
  },
  green: {
    title: "text-green-400",
    button: "bg-green-600 hover:bg-green-700",
  },
};

export default function ContractProofOfExistencePage({
  title,
  description,
  contractKind,
  accentColor,
  storageKey,
  defaultAddress,
}: Props) {
  const colors = colorMap[accentColor];
  const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
  const scopedStorageKey = `${storageKey}:${ethRpcUrl}`;
  const [contractAddress, setContractAddress] = useState("");
  const [selectedAccount, setSelectedAccount] = useState(0);
  const [fileHash, setFileHash] = useState<`0x${string}` | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [uploadToIpfs, setUploadToIpfs] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ipfsAvailable, setIpfsAvailable] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setContractAddress(localStorage.getItem(scopedStorageKey) || defaultAddress || "");
  }, [defaultAddress, scopedStorageKey]);

  useEffect(() => {
    if (contractAddress) {
      loadClaims();
    } else {
      setClaims([]);
      setTxStatus(null);
    }
  }, [contractAddress, ethRpcUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  function saveAddress(address: string) {
    setContractAddress(address);
    if (address) {
      localStorage.setItem(scopedStorageKey, address);
    } else {
      localStorage.removeItem(scopedStorageKey);
    }
  }

  function missingContractMessage() {
    return [
      `Error: No ${contractKind.toUpperCase()} contract was found at this address on ${ethRpcUrl}.`,
      `Update the address or deploy one with: cd contracts/${contractKind} && npm run deploy:local (local dev) or npm run deploy:testnet (testnet).`,
    ].join(" ");
  }

  const onFileHashed = useCallback((hash: `0x${string}`) => {
    setFileHash(hash);
  }, []);

  const onFileBytes = useCallback((bytes: Uint8Array) => {
    setFileBytes(bytes);
  }, []);

  async function loadClaims() {
    if (!contractAddress) {
      setTxStatus("Error: Enter a contract address first");
      return;
    }
    try {
      setLoading(true);
      setTxStatus(null);
      const client = getPublicClient(ethRpcUrl);
      const addr = contractAddress as Address;

      // Check if contract is actually deployed at this address
      const code = await client.getCode({ address: addr });
      if (!code || code === "0x") {
        setClaims([]);
        setTxStatus(missingContractMessage());
        return;
      }

      const count = await client.readContract({
        address: addr,
        abi: proofOfExistenceAbi,
        functionName: "getClaimCount",
      });
      const result: Claim[] = [];
      for (let i = 0n; i < count; i++) {
        const hash = await client.readContract({
          address: addr,
          abi: proofOfExistenceAbi,
          functionName: "getClaimHashAtIndex",
          args: [i],
        });
        const [owner, block] = await client.readContract({
          address: addr,
          abi: proofOfExistenceAbi,
          functionName: "getClaim",
          args: [hash],
        });
        result.push({ hash, owner, block });
      }
      setClaims(result);
      // Check IPFS availability in background
      result.forEach((claim) => {
        const cid = hexHashToCid(claim.hash);
        checkIpfsAvailable(cid).then((available) => {
          if (available) {
            setIpfsAvailable((prev) => ({ ...prev, [claim.hash]: true }));
          }
        });
      });
    } catch (e) {
      console.error("Failed to load claims:", e);
      setTxStatus(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  }

  async function createClaim() {
    if (!contractAddress || !fileHash) {
      setTxStatus("Error: Select a file and enter a contract address");
      return;
    }
    try {
      const client = getPublicClient(ethRpcUrl);
      const code = await client.getCode({ address: contractAddress as Address });
      if (!code || code === "0x") {
        setTxStatus(missingContractMessage());
        return;
      }
      // Optional: upload to Bulletin Chain first (using Substrate signer)
      if (uploadToIpfs && fileBytes) {
        const substrateSigner = devAccounts[selectedAccount].signer;
        const substrateAddress = devAccounts[selectedAccount].address;

        setTxStatus("Checking Bulletin Chain authorization...");
        const authorized = await checkBulletinAuthorization(
          substrateAddress,
          fileBytes.length
        );
        if (!authorized) {
          setTxStatus(
            "Error: Not authorized to upload to Bulletin Chain. Authorization is required via chain governance."
          );
          return;
        }
        setTxStatus("Uploading to Bulletin Chain (IPFS)...");
        await uploadToBulletin(fileBytes, substrateSigner);
        setTxStatus("Upload complete. Submitting claim...");
      } else {
        setTxStatus("Submitting createClaim...");
      }

      const walletClient = await getWalletClient(selectedAccount, ethRpcUrl);
      const hash = await walletClient.writeContract({
        address: contractAddress as Address,
        abi: proofOfExistenceAbi,
        functionName: "createClaim",
        args: [fileHash],
      });
      setTxStatus(`Transaction submitted: ${hash}`);
      const publicClient = getPublicClient(ethRpcUrl);
      await publicClient.waitForTransactionReceipt({ hash });
      setTxStatus("Claim created!");
      setFileHash(null);
      setFileBytes(null);
      loadClaims();
    } catch (e) {
      console.error("Transaction failed:", e);
      setTxStatus(`Error: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function revokeClaim(documentHash: `0x${string}`) {
    if (!contractAddress) return;
    try {
      const client = getPublicClient(ethRpcUrl);
      const code = await client.getCode({ address: contractAddress as Address });
      if (!code || code === "0x") {
        setTxStatus(missingContractMessage());
        return;
      }
      setTxStatus("Submitting revokeClaim...");
      const walletClient = await getWalletClient(selectedAccount, ethRpcUrl);
      const hash = await walletClient.writeContract({
        address: contractAddress as Address,
        abi: proofOfExistenceAbi,
        functionName: "revokeClaim",
        args: [documentHash],
      });
      setTxStatus(`Transaction submitted: ${hash}`);
      const publicClient = getPublicClient(ethRpcUrl);
      await publicClient.waitForTransactionReceipt({ hash });
      setTxStatus("Claim revoked!");
      loadClaims();
    } catch (e) {
      console.error("Transaction failed:", e);
      setTxStatus(`Error: ${e instanceof Error ? e.message : e}`);
    }
  }

  const currentAddress = evmDevAccounts[selectedAccount].account.address;

  return (
    <div className="space-y-6">
      <h1 className={`text-2xl font-bold ${colors.title}`}>{title}</h1>
      <p className="text-gray-400">{description}</p>

      <div className="bg-gray-900 rounded-lg p-5 border border-gray-800 space-y-4">
        <div>
          <label className="text-sm text-gray-400 block mb-1">
            Contract Address
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={contractAddress}
              onChange={(e) => saveAddress(e.target.value)}
              placeholder="0x..."
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white w-full font-mono text-sm"
            />
            {defaultAddress && contractAddress !== defaultAddress && (
              <button
                onClick={() => saveAddress(defaultAddress)}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-xs whitespace-nowrap"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-400 block mb-1">
            Dev Account
          </label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(parseInt(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white w-full"
          >
            {evmDevAccounts.map((acc, i) => (
              <option key={i} value={i}>
                {acc.name} ({acc.account.address})
              </option>
            ))}
          </select>
        </div>

        <FileDropZone
          onFileHashed={onFileHashed}
          onFileBytes={onFileBytes}
          showUploadToggle={true}
          uploadToIpfs={uploadToIpfs}
          onUploadToggle={setUploadToIpfs}
        />

        {fileHash && (
          <div className="space-y-2">
            <p className="text-sm text-gray-400">
              Blake2b-256:{" "}
              <code className="text-white font-mono text-xs break-all">
                {fileHash}
              </code>
            </p>
            <button
              onClick={createClaim}
              className={`px-4 py-2 ${colors.button} rounded text-white text-sm`}
            >
              Create Claim
            </button>
          </div>
        )}

        {txStatus && (
          <p
            className={`text-sm ${txStatus.startsWith("Error") ? "text-red-400" : "text-green-400"}`}
          >
            {txStatus}
          </p>
        )}
      </div>

      <div className="bg-gray-900 rounded-lg p-5 border border-gray-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-300">Claims</h2>
          <button
            onClick={loadClaims}
            disabled={loading}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {claims.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No claims found. Click Refresh to load.
          </p>
        ) : (
          <div className="space-y-2">
            {claims.map((claim) => {
              const cid = hexHashToCid(claim.hash);
              return (
                <div
                  key={claim.hash}
                  className="bg-gray-800 rounded p-3 text-sm space-y-1"
                >
                  <p className="font-mono text-xs text-gray-300 break-all">
                    {claim.hash}
                  </p>
                  <p className="text-gray-400">
                    Owner:{" "}
                    <span className="text-gray-300">
                      {claim.owner.slice(0, 8)}...{claim.owner.slice(-4)}
                    </span>{" "}
                    | Block:{" "}
                    <span className="text-gray-300">
                      {claim.block.toString()}
                    </span>{" "}
                    {ipfsAvailable[claim.hash] && (
                      <>
                        {" "}|{" "}
                        <a
                          href={ipfsUrl(cid)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline"
                        >
                          View on IPFS
                        </a>
                      </>
                    )}
                  </p>
                  {claim.owner.toLowerCase() ===
                    currentAddress.toLowerCase() && (
                    <button
                      onClick={() => revokeClaim(claim.hash)}
                      className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-xs"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
