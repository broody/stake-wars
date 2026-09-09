import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupplyDrop } from '../../types';

const state = vi.hoisted(() => ({
  wallet: {
    address: '0xabc',
    chainId: '0x534e5f5345504f4c4941',
    isConnected: true,
  },
  sendAsync: vi.fn(),
}));

vi.mock('@starknetfoundation/starknet-start-react', () => ({
  useProvider: () => ({ provider: { waitForTransaction: vi.fn() } }),
  useSendTransaction: () => ({ sendAsync: state.sendAsync }),
}));
vi.mock('../../contexts/WalletContext', () => ({
  useWallet: () => state.wallet,
}));
vi.mock('../../contexts/TransactionToastContext', () => ({
  useTransactionToast: () => ({
    notifySubmitting: vi.fn(),
    notifyConfirmed: vi.fn(),
    notifyFailed: vi.fn(),
  }),
}));
vi.mock('../../services/config', () => ({
  config: {
    strkTokenAddress: '0x123',
    supplyDropSystemAddress: '0x456',
    starknetChainId: 'SN_SEPOLIA',
  },
}));
vi.mock('../../services/starknet', () => ({
  canCreateSupplyDrop: vi.fn(),
  getSupplyDropPrizeAmount: vi.fn(),
}));
vi.mock('./WalletButton', () => ({
  WalletButton: () => <button>Connect wallet</button>,
}));

import { SupplyDropTopUp } from './SupplyDropTopUp';

const supplyDrop: SupplyDrop = {
  id: 7n,
  status: 2,
  sponsor: '0xabc',
  prizeKind: 1,
  token: '0x123',
  tokenId: 0n,
  amount: 500n,
  sectorLimitSnapshot: 2000,
  durationSeconds: 100,
  startedAt: 0,
  endsAt: 100,
  randomnessBlock: 0n,
  lastDrawnSectorId: 0,
  drawCount: 0,
  winner: '0x0',
  settledAt: null,
  claimed: false,
  claimedBy: '0x0',
  claimedAt: null,
};

function render(prize: SupplyDrop = supplyDrop, now = 99_999) {
  return renderToStaticMarkup(
    <SupplyDropTopUp supplyDrop={prize} now={now} onConfirmed={vi.fn()} />
  );
}

describe('supply drop top-up access', () => {
  beforeEach(() => {
    state.wallet = {
      address: '0xabc',
      chainId: '0x534e5f5345504f4c4941',
      isConnected: true,
    };
    state.sendAsync.mockReset();
  });

  it('keeps submission unavailable until creator access is verified', () => {
    expect(render()).toContain('Checking creator access');
    expect(render()).not.toContain('<form');
    expect(state.sendAsync).not.toHaveBeenCalled();
  });

  it('requires a wallet on the configured network', () => {
    state.wallet.isConnected = false;
    expect(render()).toContain('Connect wallet');
    state.wallet.isConnected = true;
    state.wallet.chainId = '0x534e5f4d41494e';
    expect(render()).toContain('Switch your wallet to SN_SEPOLIA');
    expect(render()).not.toContain('<form');
  });

  it('closes at the deadline and during the draw', () => {
    expect(render(supplyDrop, 100_000)).toContain('Top-ups are closed');
    expect(render({ ...supplyDrop, status: 3 })).toContain(
      'Top-ups are closed'
    );
  });

  it('does not offer a top-up for an ERC-721 prize', () => {
    expect(render({ ...supplyDrop, prizeKind: 2, amount: 1n })).toBe('');
  });
});
