import { blake2b } from "blakejs";

/**
 * Compute the blake2b-256 hash of a File, returned as a 0x-prefixed hex string.
 */
export function hashFile(file: File): Promise<`0x${string}`> {
  return hashFileWithBytes(file).then((r) => r.hash);
}

/**
 * Compute the blake2b-256 hash of a File AND return the raw file bytes.
 * Avoids reading the file twice when both hash and bytes are needed (e.g. for IPFS upload).
 */
export function hashFileWithBytes(
  file: File
): Promise<{ hash: `0x${string}`; bytes: Uint8Array }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      const hash = blake2b(bytes, undefined, 32);
      const hex = Array.from(hash)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      resolve({ hash: `0x${hex}`, bytes });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
