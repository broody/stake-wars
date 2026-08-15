import { describe, expect, it } from 'vitest';
import { commitmentFor } from './sealedBids';

describe('sealed bid commitments', () => {
  it('is deterministic and fits in a Starknet felt', async () => {
    const encoded = new TextEncoder().encode(
      '{"version":1,"controlPointId":7,"operator":"0x222","maxBid":"2000","nonce":"abc"}'
    );
    const first = await commitmentFor(encoded);
    const second = await commitmentFor(encoded);

    expect(first).toBe(second);
    expect(`0x${first.toString(16)}`).toBe(
      '0x85641f4bd175d697e0f6f219b30f8b002d82fb17c36b7e55096fcae55db96c'
    );
    expect(first).toBeGreaterThan(0n);
    expect(first).toBeLessThan((1n << 251n) + 17n * (1n << 192n) + 1n);
  });
});
