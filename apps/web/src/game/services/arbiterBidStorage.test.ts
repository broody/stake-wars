import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createArbiterBidStore,
  type ArbiterBidPersistence,
  type StoredArbiterBid,
} from './arbiterBidStorage';

class MemoryPersistence implements ArbiterBidPersistence {
  readonly keys = new Map<string, CryptoKey>();
  readonly bids = new Map<
    string,
    Parameters<ArbiterBidPersistence['putBid']>[0]
  >();

  async getKey(scope: string) {
    return this.keys.get(scope);
  }

  async addKey(scope: string, key: CryptoKey) {
    if (this.keys.has(scope)) throw new Error('duplicate key');
    this.keys.set(scope, key);
  }

  async putBid(envelope: Parameters<ArbiterBidPersistence['putBid']>[0]) {
    this.bids.set(envelope.id, envelope);
  }

  async listBids(scope: string) {
    return [...this.bids.values()].filter((bid) => bid.scope === scope);
  }
}

const record: StoredArbiterBid = {
  version: 1,
  network: 'SN_SEPOLIA',
  walletAddress: '0x0999',
  roundId: 4,
  auctionId: 5,
  whisperAddress: '0x0123',
  amount: '2000000000000000000',
  groupHandle: '0x0456',
  bidHandle: '0x0789',
  transactionHash: '0x0abc',
  confirmedBy: 'wallet',
  submittedAt: '2026-08-27T22:00:00.000Z',
};

describe('encrypted Arbiter bid storage', () => {
  it('decrypts saved bids after a simulated reload and normalizes felts', async () => {
    const persistence = new MemoryPersistence();
    const crypto = webcrypto as unknown as Crypto;
    const firstPage = createArbiterBidStore(persistence, crypto);
    await firstPage.save(record);

    const reloadedPage = createArbiterBidStore(persistence, crypto);
    await expect(
      reloadedPage.list({
        network: record.network,
        walletAddress: '0x999',
        whisperAddress: '0x123',
        auctionId: record.auctionId,
      })
    ).resolves.toEqual([
      {
        ...record,
        walletAddress: '0x999',
        whisperAddress: '0x123',
        groupHandle: '0x456',
        bidHandle: '0x789',
        transactionHash: '0xabc',
      },
    ]);
    expect([...persistence.keys.values()][0]?.extractable).toBe(false);
  });

  it('does not expose the sealed amount or bid handle in its envelope', async () => {
    const persistence = new MemoryPersistence();
    const store = createArbiterBidStore(
      persistence,
      webcrypto as unknown as Crypto
    );
    await store.save(record);

    const serialized = JSON.stringify([...persistence.bids.values()]);
    expect(serialized).not.toContain(record.amount);
    expect(serialized).not.toContain(record.bidHandle);
    expect(serialized).not.toContain(record.walletAddress);
  });

  it('keeps records isolated by wallet and auction scope', async () => {
    const persistence = new MemoryPersistence();
    const store = createArbiterBidStore(
      persistence,
      webcrypto as unknown as Crypto
    );
    await store.save(record);

    await expect(
      store.list({
        network: record.network,
        walletAddress: '0x998',
        whisperAddress: record.whisperAddress,
        auctionId: record.auctionId,
      })
    ).resolves.toEqual([]);
    await expect(
      store.list({
        network: record.network,
        walletAddress: record.walletAddress,
        whisperAddress: record.whisperAddress,
        auctionId: record.auctionId + 1,
      })
    ).resolves.toEqual([]);
  });
});
