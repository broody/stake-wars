import { config } from './config';

const STARK_FIELD_PRIME = (1n << 251n) + 17n * (1n << 192n) + 1n;

interface AuctionKey {
  keyId: string;
  algorithm: 'RSA-OAEP-256';
  threshold: number;
  committeeSize: number;
  publicKeyPem: string;
}

interface PlainBid {
  version: 1;
  controlPointId: number;
  operator: string;
  maxBid: string;
  nonce: string;
}

export interface PreparedSealedBid {
  commitment: bigint;
  keyId: string;
}

export async function prepareSealedBid(
  controlPointId: number,
  operator: string,
  maxBid: bigint,
  signal?: AbortSignal
): Promise<PreparedSealedBid> {
  if (!Number.isInteger(controlPointId) || controlPointId < 0 || maxBid <= 0n) {
    throw new Error('Invalid sealed bid.');
  }

  const keyResponse = await fetch(`${config.domain}/v1/auctions/key`, {
    signal,
  });
  if (!keyResponse.ok) {
    throw new Error('Sealed bidding is temporarily unavailable.');
  }
  const key = (await keyResponse.json()) as AuctionKey;
  if (
    key.algorithm !== 'RSA-OAEP-256' ||
    key.threshold < 1 ||
    key.committeeSize < key.threshold
  ) {
    throw new Error('The auction encryption key is invalid.');
  }

  const plaintext: PlainBid = {
    version: 1,
    controlPointId,
    operator: normalizeAddress(operator),
    maxBid: maxBid.toString(),
    nonce: randomHex(32),
  };
  const encoded = new TextEncoder().encode(JSON.stringify(plaintext));
  const commitment = await commitmentFor(encoded);
  const publicKey = await crypto.subtle.importKey(
    'spki',
    pemBytes(key.publicKeyPem),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      arrayBuffer(encoded)
    )
  );

  const storeResponse = await fetch(`${config.domain}/v1/auctions/bids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      controlPointId,
      operator: plaintext.operator,
      commitment: `0x${commitment.toString(16)}`,
      keyId: key.keyId,
      ciphertext: bytesToBase64(ciphertext),
    }),
    signal,
  });
  if (!storeResponse.ok) {
    throw new Error('The encrypted bid could not be stored. Try again.');
  }

  return { commitment, keyId: key.keyId };
}

export async function commitmentFor(plaintext: Uint8Array): Promise<bigint> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', arrayBuffer(plaintext))
  );
  const value = BigInt(
    `0x${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  );
  return value % STARK_FIELD_PRIME;
}

function normalizeAddress(value: string): string {
  const address = BigInt(value);
  if (address <= 0n || address >= STARK_FIELD_PRIME) {
    throw new Error('Invalid Operator address.');
  }
  return `0x${address.toString(16)}`;
}

function randomHex(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

function pemBytes(value: string): ArrayBuffer {
  const base64 = value
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  const decoded = atob(base64);
  const bytes = Uint8Array.from(decoded, (character) =>
    character.charCodeAt(0)
  );
  return bytes.buffer;
}

function bytesToBase64(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength
  ) as ArrayBuffer;
}
