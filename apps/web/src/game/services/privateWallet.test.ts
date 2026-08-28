import { describe, expect, it, vi } from 'vitest';
import type { STRK20_ACTION } from 'starknet';
import {
  invokePrivateActionTransaction,
  type PrivacyWallet,
} from './privateWallet';

const actions: STRK20_ACTION[] = [
  {
    type: 'transfer',
    token: '0x1',
    amount: '0x2',
    recipient: '0x3',
  },
];

describe('Ready private transaction submission', () => {
  it('uses the fee-aware one-shot wallet path and returns its hash', async () => {
    const request = vi.fn(async () => ({ transaction_hash: '0xfeed' }));
    const wallet = {
      features: {
        'starknet:walletApi': { request },
      },
    } as unknown as PrivacyWallet;

    await expect(
      invokePrivateActionTransaction(wallet, actions)
    ).resolves.toEqual({
      transactionHash: '0xfeed',
      confirmedBy: 'wallet',
    });
    expect(request).toHaveBeenCalledWith({
      type: 'wallet_strk20InvokeTransaction',
      params: { actions },
    });
  });

  it('falls back to the bid counter when Ready leaves its request open', async () => {
    const request = vi.fn(() => new Promise(() => undefined));
    const wallet = {
      features: {
        'starknet:walletApi': { request },
      },
    } as unknown as PrivacyWallet;
    const observeSubmission = vi.fn(async () => undefined);

    await expect(
      invokePrivateActionTransaction(wallet, actions, observeSubmission)
    ).resolves.toEqual({
      transactionHash: null,
      confirmedBy: 'bid-count',
    });
    expect(observeSubmission).toHaveBeenCalledOnce();
  });

  it('preserves a wallet rejection before the bid counter changes', async () => {
    const request = vi.fn(async () => {
      throw new Error('User rejected the request');
    });
    const wallet = {
      features: {
        'starknet:walletApi': { request },
      },
    } as unknown as PrivacyWallet;
    const observeSubmission = vi.fn(() => new Promise<void>(() => undefined));

    await expect(
      invokePrivateActionTransaction(wallet, actions, observeSubmission)
    ).rejects.toThrow('User rejected the request');
  });
});
