import { describe, expect, it, vi } from 'vitest';
import type { STRK20_ACTION } from 'starknet';
import type { ArbiterRound } from './api';
import { submitArbiterBid } from './whisperBid';

const round: ArbiterRound = {
  id: 1,
  whisperAddress: '0x123',
  auctionId: 2,
  paymentToken: '0x456',
  winnerPayloadDomain: '0x789',
  reservePrice: '100000000000000000',
  maxBids: 16,
  vaultAddress: '0xabc',
  revealPublicKey:
    '0x2401c56836a61ca8a81807195dbae679c9f9232f80f10d7e2092a330c7f553e',
  schedule: {
    kind: 'start-on-bid',
    biddingDurationSeconds: 300,
    acceptanceDurationSeconds: 180,
    settlementDurationSeconds: 1320,
  },
  startedAt: null,
  biddingDeadline: null,
  forceRevealAfter: null,
  abortAfter: null,
  submissionCount: 0,
  fundedTrancheCount: 0,
  status: 'pending',
  result: null,
};

const operatorConfig = {
  chainId: '0x534e5f5345504f4c4941',
  poolAddress: '0x111',
  whisperAddress: round.whisperAddress,
  vaultAddress: round.vaultAddress,
  vaultPublicKey: '0x222',
  revealPublicKey: round.revealPublicKey,
};

describe('Whisper Ready bid submission', () => {
  it('uploads the capsule before invoking Ready without browser persistence', async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url.endsWith('/v1/config') ? 'config' : 'capsule');
      return url.endsWith('/v1/config')
        ? Response.json(operatorConfig)
        : Response.json({ status: 'created' }, { status: 201 });
    }) as unknown as typeof fetch;
    const invokedActions: STRK20_ACTION[][] = [];
    const invokePrivateActions = vi.fn(async (actions: STRK20_ACTION[]) => {
      invokedActions.push(actions);
      calls.push('wallet');
      return { transactionHash: '0xfeed' };
    });
    const receipt = await submitArbiterBid({
      amount: '1.25',
      network: 'SN_SEPOLIA',
      round,
      walletAddress: '0x999',
      walletChainId: operatorConfig.chainId,
      expectedPaymentToken: round.paymentToken,
      expectedPoolAddress: operatorConfig.poolAddress,
      operatorUrl: 'https://operator.example/',
      invokePrivateActions,
      fetcher,
    });

    expect(calls).toEqual(['config', 'capsule', 'wallet']);
    expect(invokePrivateActions).toHaveBeenCalledTimes(1);
    const actions = invokedActions[0];
    expect(actions).toMatchObject([
      {
        type: 'transfer',
        token: round.paymentToken,
        amount: '0x1158e460913d0000',
        recipient: round.vaultAddress,
      },
      { type: 'invoke', contract: round.whisperAddress },
    ]);
    expect(receipt.transactionHash).toBe('0xfeed');
    expect(receipt.amount).toBe('1250000000000000000');
  });

  it('fails closed before Ready when the operator does not match the round', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ ...operatorConfig, vaultAddress: '0xbad' })
    ) as unknown as typeof fetch;
    const invokePrivateActions = vi.fn();

    await expect(
      submitArbiterBid({
        amount: '1',
        network: 'SN_SEPOLIA',
        round,
        walletAddress: '0x999',
        walletChainId: operatorConfig.chainId,
        expectedPaymentToken: round.paymentToken,
        expectedPoolAddress: operatorConfig.poolAddress,
        operatorUrl: 'https://operator.example',
        invokePrivateActions,
        fetcher,
      })
    ).rejects.toThrow('operator vault does not match');
    expect(invokePrivateActions).not.toHaveBeenCalled();
  });

  it('does not invoke Ready when capsule upload fails', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/v1/config')
        ? Response.json(operatorConfig)
        : Response.json({ error: 'capsule service paused' }, { status: 503 })
    ) as unknown as typeof fetch;
    const invokePrivateActions = vi.fn();

    await expect(
      submitArbiterBid({
        amount: '1',
        network: 'SN_SEPOLIA',
        round,
        walletAddress: '0x999',
        walletChainId: operatorConfig.chainId,
        expectedPaymentToken: round.paymentToken,
        expectedPoolAddress: operatorConfig.poolAddress,
        operatorUrl: 'https://operator.example',
        invokePrivateActions,
        fetcher,
      })
    ).rejects.toThrow('capsule service paused');
    expect(invokePrivateActions).not.toHaveBeenCalled();
  });

  it('propagates Ready rejection without substituting public bid state', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/v1/config')
        ? Response.json(operatorConfig)
        : Response.json({ status: 'created' }, { status: 201 })
    ) as unknown as typeof fetch;
    const invokePrivateActions = vi.fn(async () => {
      throw new Error('User rejected the request');
    });

    await expect(
      submitArbiterBid({
        amount: '1',
        network: 'SN_SEPOLIA',
        round,
        walletAddress: '0x999',
        walletChainId: operatorConfig.chainId,
        expectedPaymentToken: round.paymentToken,
        expectedPoolAddress: operatorConfig.poolAddress,
        operatorUrl: 'https://operator.example',
        invokePrivateActions,
        fetcher,
      })
    ).rejects.toThrow('User rejected the request');
    expect(invokePrivateActions).toHaveBeenCalledOnce();
  });
});
