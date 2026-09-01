const DATABASE_NAME = 'stakewars-beacon-private';
const DATABASE_VERSION = 1;
const KEY_STORE = 'keys';
const BID_STORE = 'bids';
const BID_SCOPE_INDEX = 'scope';
const RECORD_VERSION = 1;
const IV_BYTES = 12;

export interface StoredBeaconBid {
  version: 1;
  network: string;
  walletAddress: string;
  roundId: number;
  auctionId: number;
  whisperAddress: string;
  amount: string;
  groupHandle: string;
  bidHandle: string;
  transactionHash: string | null;
  submittedAt: string;
}

export interface BeaconBidScope {
  network: string;
  walletAddress: string;
  whisperAddress: string;
  auctionId: number;
}

interface EncryptedBidEnvelope {
  id: string;
  scope: string;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
  updatedAt: string;
}

interface StoredEncryptionKey {
  scope: string;
  key: CryptoKey;
}

export interface BeaconBidPersistence {
  getKey(scope: string): Promise<CryptoKey | undefined>;
  addKey(scope: string, key: CryptoKey): Promise<void>;
  putBid(envelope: EncryptedBidEnvelope): Promise<void>;
  listBids(scope: string): Promise<EncryptedBidEnvelope[]>;
}

export interface BeaconBidStore {
  save(record: StoredBeaconBid): Promise<StoredBeaconBid>;
  list(scope: BeaconBidScope): Promise<StoredBeaconBid[]>;
}

let browserStore: BeaconBidStore | undefined;

export function saveBeaconBid(
  record: StoredBeaconBid
): Promise<StoredBeaconBid> {
  return getBrowserStore().save(record);
}

export function listBeaconBids(
  scope: BeaconBidScope
): Promise<StoredBeaconBid[]> {
  return getBrowserStore().list(scope);
}

export function createBeaconBidStore(
  persistence: BeaconBidPersistence,
  webCrypto: Crypto
): BeaconBidStore {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const scopeHash = async (scope: BeaconBidScope) => {
    const material = [
      'stakewars-beacon-bid/v1',
      scope.network,
      normalizeFelt(scope.walletAddress),
      normalizeFelt(scope.whisperAddress),
      String(scope.auctionId),
    ].join(':');
    return digestHex(webCrypto, encoder.encode(material));
  };

  const keyForScope = async (scope: string) => {
    const existing = await persistence.getKey(scope);
    if (existing) return existing;

    const candidate = await webCrypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    try {
      await persistence.addKey(scope, candidate);
      return candidate;
    } catch (reason) {
      // Another tab may have created the same scope key first.
      const winner = await persistence.getKey(scope);
      if (winner) return winner;
      throw reason;
    }
  };

  return {
    async save(record) {
      const canonical = canonicalBid(record);
      const scope = await scopeHash(canonical);
      const id = await digestHex(
        webCrypto,
        encoder.encode(
          `stakewars-beacon-bid-record/v1:${scope}:${canonical.bidHandle}`
        )
      );
      const key = await keyForScope(scope);
      const iv = webCrypto.getRandomValues(new Uint8Array(IV_BYTES));
      const ciphertext = await webCrypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: encoder.encode(id),
        },
        key,
        encoder.encode(JSON.stringify(canonical))
      );
      await persistence.putBid({
        id,
        scope,
        iv: iv.buffer.slice(0),
        ciphertext,
        updatedAt: canonical.submittedAt,
      });
      return canonical;
    },

    async list(scopeInput) {
      const scope = await scopeHash(scopeInput);
      const [key, envelopes] = await Promise.all([
        persistence.getKey(scope),
        persistence.listBids(scope),
      ]);
      if (envelopes.length === 0) return [];
      if (!key) throw new Error('Saved bid encryption key is unavailable.');

      const records = await Promise.all(
        envelopes.map(async (envelope) => {
          const plaintext = await webCrypto.subtle.decrypt(
            {
              name: 'AES-GCM',
              iv: envelope.iv,
              additionalData: encoder.encode(envelope.id),
            },
            key,
            envelope.ciphertext
          );
          const value = JSON.parse(decoder.decode(plaintext)) as unknown;
          if (!isStoredBeaconBid(value)) {
            throw new Error('Saved bid record is invalid.');
          }
          return canonicalBid(value);
        })
      );
      return records.sort((left, right) =>
        right.submittedAt.localeCompare(left.submittedAt)
      );
    },
  };
}

function getBrowserStore(): BeaconBidStore {
  if (browserStore) return browserStore;
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) {
    throw new Error('Encrypted browser storage is unavailable.');
  }
  browserStore = createBeaconBidStore(
    new IndexedDbBeaconBidPersistence(globalThis.indexedDB),
    globalThis.crypto
  );
  return browserStore;
}

class IndexedDbBeaconBidPersistence implements BeaconBidPersistence {
  private databasePromise: Promise<IDBDatabase> | undefined;

  constructor(private readonly databaseFactory: IDBFactory) {}

  async getKey(scope: string): Promise<CryptoKey | undefined> {
    const database = await this.database();
    const transaction = database.transaction(KEY_STORE, 'readonly');
    const result = await requestResult<StoredEncryptionKey | undefined>(
      transaction.objectStore(KEY_STORE).get(scope)
    );
    await transactionComplete(transaction);
    return result?.key;
  }

  async addKey(scope: string, key: CryptoKey): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(KEY_STORE, 'readwrite');
    transaction.objectStore(KEY_STORE).add({ scope, key });
    await transactionComplete(transaction);
  }

  async putBid(envelope: EncryptedBidEnvelope): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(BID_STORE, 'readwrite');
    transaction.objectStore(BID_STORE).put(envelope);
    await transactionComplete(transaction);
  }

  async listBids(scope: string): Promise<EncryptedBidEnvelope[]> {
    const database = await this.database();
    const transaction = database.transaction(BID_STORE, 'readonly');
    const result = await requestResult<EncryptedBidEnvelope[]>(
      transaction.objectStore(BID_STORE).index(BID_SCOPE_INDEX).getAll(scope)
    );
    await transactionComplete(transaction);
    return result;
  }

  private database() {
    if (!this.databasePromise) {
      this.databasePromise = openDatabase(this.databaseFactory);
    }
    return this.databasePromise;
  }
}

function openDatabase(databaseFactory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = databaseFactory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(KEY_STORE)) {
        database.createObjectStore(KEY_STORE, { keyPath: 'scope' });
      }
      if (!database.objectStoreNames.contains(BID_STORE)) {
        const bids = database.createObjectStore(BID_STORE, { keyPath: 'id' });
        bids.createIndex(BID_SCOPE_INDEX, 'scope', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('Encrypted bid storage upgrade is blocked.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function canonicalBid(record: StoredBeaconBid): StoredBeaconBid {
  if (!isStoredBeaconBid(record)) {
    throw new Error('Bid receipt cannot be saved.');
  }
  return {
    version: 1,
    network: record.network.trim(),
    walletAddress: normalizeFelt(record.walletAddress),
    roundId: record.roundId,
    auctionId: record.auctionId,
    whisperAddress: normalizeFelt(record.whisperAddress),
    amount: record.amount,
    groupHandle: normalizeFelt(record.groupHandle),
    bidHandle: normalizeFelt(record.bidHandle),
    transactionHash: record.transactionHash
      ? normalizeFelt(record.transactionHash)
      : null,
    submittedAt: record.submittedAt,
  };
}

function isStoredBeaconBid(value: unknown): value is StoredBeaconBid {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === RECORD_VERSION &&
    typeof candidate.network === 'string' &&
    candidate.network.trim().length > 0 &&
    isFelt(candidate.walletAddress) &&
    Number.isSafeInteger(candidate.roundId) &&
    Number(candidate.roundId) > 0 &&
    Number.isSafeInteger(candidate.auctionId) &&
    Number(candidate.auctionId) > 0 &&
    isFelt(candidate.whisperAddress) &&
    typeof candidate.amount === 'string' &&
    /^\d+$/.test(candidate.amount) &&
    BigInt(candidate.amount) > 0n &&
    isFelt(candidate.groupHandle) &&
    isFelt(candidate.bidHandle) &&
    (candidate.transactionHash === null || isFelt(candidate.transactionHash)) &&
    typeof candidate.submittedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.submittedAt))
  );
}

function isFelt(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return BigInt(value) >= 0n;
  } catch {
    return false;
  }
}

function normalizeFelt(value: string): string {
  const felt = BigInt(value);
  if (felt < 0n) throw new Error('Felt value cannot be negative.');
  return `0x${felt.toString(16)}`;
}

async function digestHex(webCrypto: Crypto, value: Uint8Array) {
  const digestInput = Uint8Array.from(value).buffer;
  const digest = new Uint8Array(
    await webCrypto.subtle.digest('SHA-256', digestInput)
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}
