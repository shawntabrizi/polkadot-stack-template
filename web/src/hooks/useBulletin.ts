import { createClient, type PolkadotClient, type PolkadotSigner, Binary, Enum } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/web";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { bulletin } from "@polkadot-api/descriptors";

const BULLETIN_WS = "wss://paseo-bulletin-rpc.polkadot.io";
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MiB
const UPLOAD_TIMEOUT_MS = 60_000;

let bulletinClient: PolkadotClient | null = null;

function getBulletinClient(): PolkadotClient {
  if (!bulletinClient) {
    bulletinClient = createClient(
      withPolkadotSdkCompat(getWsProvider(BULLETIN_WS))
    );
  }
  return bulletinClient;
}

function getBulletinApi() {
  return getBulletinClient().getTypedApi(bulletin);
}

/**
 * Check if an account is authorized to store data on the Bulletin Chain.
 */
export async function checkBulletinAuthorization(
  address: string,
  dataSize: number
): Promise<boolean> {
  try {
    const api = getBulletinApi();
    const auth = await api.query.TransactionStorage.Authorizations.getValue(
      Enum("Account", address)
    );
    if (!auth) return false;
    return (
      auth.extent.transactions > 0n &&
      auth.extent.bytes >= BigInt(dataSize)
    );
  } catch {
    return false;
  }
}

/**
 * Upload file bytes to the Bulletin Chain via TransactionStorage.store().
 * Wraps the Observable-based signSubmitAndWatch in a Promise.
 */
export async function uploadToBulletin(
  fileBytes: Uint8Array,
  signer: PolkadotSigner
): Promise<void> {
  if (fileBytes.length > MAX_FILE_SIZE) {
    throw new Error(
      `File too large (${(fileBytes.length / 1024 / 1024).toFixed(1)} MiB). Maximum is 8 MiB.`
    );
  }

  const api = getBulletinApi();
  const tx = api.tx.TransactionStorage.store({
    data: Binary.fromBytes(fileBytes),
  });

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      subscription.unsubscribe();
      reject(new Error("Bulletin Chain upload timed out"));
    }, UPLOAD_TIMEOUT_MS);

    const subscription = tx.signSubmitAndWatch(signer).subscribe({
      next: (ev) => {
        if (ev.type === "txBestBlocksState" && ev.found) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          resolve();
        }
      },
      error: (err) => {
        clearTimeout(timeout);
        subscription.unsubscribe();
        reject(err);
      },
    });
  });
}
