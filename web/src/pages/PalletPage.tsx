import { useState, useCallback, useEffect } from "react";
import { useChainStore } from "../store/chainStore";
import { devAccounts } from "../hooks/useAccount";
import { getClient } from "../hooks/useChain";
import { stack_template } from "@polkadot-api/descriptors";
import { Binary } from "polkadot-api";
import FileDropZone from "../components/FileDropZone";
import { hexHashToCid, ipfsUrl } from "../utils/cid";
import {
  uploadToBulletin,
  checkBulletinAuthorization,
} from "../hooks/useBulletin";

interface Claim {
  hash: string;
  owner: string;
  block: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatDispatchError(err: any): string {
  if (!err) return "Transaction failed";
  if (err.type === "Module" && err.value) {
    const mod = err.value;
    return `${mod.type}.${mod.value?.type ?? ""}: ${mod.value?.value ?? ""}`.replace(/:?\s*$/, "");
  }
  return JSON.stringify(err);
}

export default function PalletPage() {
  const { selectedAccount, setSelectedAccount, setTxStatus, txStatus, wsUrl } =
    useChainStore();
  const [fileHash, setFileHash] = useState<`0x${string}` | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [uploadToIpfs, setUploadToIpfs] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);

  const account = devAccounts[selectedAccount];

  useEffect(() => {
    loadClaims();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function getApi() {
    const client = getClient(wsUrl);
    return client.getTypedApi(stack_template);
  }

  const onFileHashed = useCallback((hash: `0x${string}`) => {
    setFileHash(hash);
  }, []);

  const onFileBytes = useCallback((bytes: Uint8Array) => {
    setFileBytes(bytes);
  }, []);

  async function loadClaims() {
    try {
      setLoading(true);
      const api = getApi();
      const entries = await api.query.TemplatePallet.Claims.getEntries();
      const result: Claim[] = entries.map((entry) => ({
        hash: entry.keyArgs[0].asHex(),
        owner: entry.value[0].toString(),
        block: Number(entry.value[1]),
      }));
      setClaims(result);
    } catch (e) {
      console.error("Failed to load claims:", e);
    } finally {
      setLoading(false);
    }
  }

  async function createClaim() {
    if (!fileHash) return;
    try {
      // Optional: upload to Bulletin Chain first
      if (uploadToIpfs && fileBytes) {
        setTxStatus("Checking Bulletin Chain authorization...");
        const authorized = await checkBulletinAuthorization(
          account.address,
          fileBytes.length
        );
        if (!authorized) {
          setTxStatus(
            "Error: Not authorized to upload to Bulletin Chain. Authorization is required via chain governance."
          );
          return;
        }
        setTxStatus("Uploading to Bulletin Chain (IPFS)...");
        await uploadToBulletin(fileBytes, account.signer);
        setTxStatus("Upload complete. Submitting claim...");
      } else {
        setTxStatus("Submitting create_claim...");
      }

      const api = getApi();
      const tx = api.tx.TemplatePallet.create_claim({
        hash: Binary.fromHex(fileHash),
      });
      const result = await tx.signAndSubmit(account.signer);
      if (!result.ok) {
        setTxStatus(`Error: ${formatDispatchError(result.dispatchError)}`);
        return;
      }
      setTxStatus("Claim created successfully!");
      setFileHash(null);
      setFileBytes(null);
      loadClaims();
    } catch (e) {
      console.error("Transaction failed:", e);
      setTxStatus(`Error: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function revokeClaim(hash: string) {
    try {
      setTxStatus("Submitting revoke_claim...");
      const api = getApi();
      const tx = api.tx.TemplatePallet.revoke_claim({
        hash: Binary.fromHex(hash),
      });
      const result = await tx.signAndSubmit(account.signer);
      if (!result.ok) {
        setTxStatus(`Error: ${formatDispatchError(result.dispatchError)}`);
        return;
      }
      setTxStatus("Claim revoked successfully!");
      loadClaims();
    } catch (e) {
      console.error("Transaction failed:", e);
      setTxStatus(`Error: ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-blue-400">
        Pallet Proof of Existence
      </h1>
      <p className="text-gray-400">
        Claim ownership of file hashes on-chain via the Substrate FRAME pallet.
        Uses PAPI to submit extrinsics and read storage.
      </p>

      <div className="bg-gray-900 rounded-lg p-5 border border-gray-800 space-y-4">
        <div>
          <label className="text-sm text-gray-400 block mb-1">
            Dev Account
          </label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(parseInt(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white w-full"
          >
            {devAccounts.map((acc, i) => (
              <option key={i} value={i}>
                {acc.name}
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
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
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
                      {claim.owner.slice(0, 8)}...{claim.owner.slice(-6)}
                    </span>{" "}
                    | Block:{" "}
                    <span className="text-gray-300">{claim.block}</span> |{" "}
                    <a
                      href={ipfsUrl(cid)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      View on IPFS
                    </a>
                  </p>
                  {claim.owner === account.address && (
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
