import { describe, expect, it, vi } from 'vitest';
import {
  readShieldedTokenBalance,
  supportsShieldedBalances,
} from './shieldedBalance';

describe('STRK20 wallet API support', () => {
  it('requires stable wallet API 0.10.3 or newer', () => {
    expect(supportsShieldedBalances(['0.10.2'])).toBe(false);
    expect(supportsShieldedBalances(['0.10.3'])).toBe(true);
    expect(supportsShieldedBalances(['0.10.4-rc.1'])).toBe(true);
    expect(supportsShieldedBalances(['0.11.0'])).toBe(true);
  });

  it('ignores malformed versions', () => {
    expect(supportsShieldedBalances(['0.10', 'next'])).toBe(false);
  });
});

describe('shielded token balances', () => {
  it('requests only the configured token and normalizes its address', async () => {
    const strk =
      '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
    const strk20Balances = vi.fn().mockResolvedValue([
      {
        token:
          '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
        balance: '0xde0b6b3a7640000',
      },
    ]);

    await expect(
      readShieldedTokenBalance({ strk20Balances }, strk)
    ).resolves.toBe(1_000_000_000_000_000_000n);
    expect(strk20Balances).toHaveBeenCalledWith([strk]);
  });

  it('returns zero when the wallet omits the requested token', async () => {
    await expect(
      readShieldedTokenBalance(
        { strk20Balances: vi.fn().mockResolvedValue([]) },
        '0x1'
      )
    ).resolves.toBe(0n);
  });

  it('propagates wallet consent and operational errors', async () => {
    const rejection = new Error('User rejected the balance request');
    await expect(
      readShieldedTokenBalance(
        { strk20Balances: vi.fn().mockRejectedValue(rejection) },
        '0x1'
      )
    ).rejects.toBe(rejection);
  });
});
