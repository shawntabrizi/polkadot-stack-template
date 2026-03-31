import { CID } from "multiformats/cid";
import * as digest from "multiformats/hashes/digest";

const BLAKE2B_256_CODE = 0xb220;
const RAW_CODEC = 0x55;
const IPFS_GATEWAY = "https://paseo-ipfs.polkadot.io/ipfs";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert a blake2b-256 hash (as 0x hex string) to an IPFS CID string.
 * The CID wraps the same 32-byte hash: CID v1 + raw codec + blake2b-256 multihash.
 */
export function hexHashToCid(hexHash: string): string {
  const hashBytes = hexToBytes(hexHash);
  const mh = digest.create(BLAKE2B_256_CODE, hashBytes);
  const cid = CID.createV1(RAW_CODEC, mh);
  return cid.toString();
}

/**
 * Build an IPFS gateway URL from a CID string.
 */
export function ipfsUrl(cid: string): string {
  return `${IPFS_GATEWAY}/${cid}`;
}

/**
 * Check if a CID is available on the IPFS gateway (HEAD request).
 * Returns false on network/CORS errors.
 */
export async function checkIpfsAvailable(cid: string): Promise<boolean> {
  try {
    const res = await fetch(ipfsUrl(cid), { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}
