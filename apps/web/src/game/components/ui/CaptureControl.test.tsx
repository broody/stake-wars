// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperatorStatus, SectorStatus } from '../../types';

const ME = '0xa11ce';
const RIVAL = '0xb0b';
const FORCE = 10n ** 18n;

const state = vi.hoisted(() => ({
  wallet: { address: null as string | null, isConnected: false },
  freshSector: null as SectorStatus | null,
  operatorStatus: null as OperatorStatus | null,
  sendAsync: vi.fn(),
}));

vi.mock('@starknetfoundation/starknet-start-react', () => ({
  useProvider: () => ({
    provider: { waitForTransaction: vi.fn(async () => undefined) },
  }),
  useSendTransaction: () => ({ sendAsync: state.sendAsync }),
}));
vi.mock('../../contexts/WalletContext', () => ({
  useWallet: () => state.wallet,
}));
vi.mock('../../contexts/SectorContext', () => ({
  useSectors: () => ({
    operatorStatus: state.operatorStatus,
    refreshSector: vi.fn(),
    refreshOperator: vi.fn(),
    refreshSectorIndex: vi.fn(),
    setSectorInteractionLocked: vi.fn(),
  }),
}));
vi.mock('../../contexts/TransactionToastContext', () => ({
  useTransactionToast: () => ({
    notifySubmitting: vi.fn(),
    notifyConfirmed: vi.fn(),
    notifyFailed: vi.fn(),
  }),
}));
vi.mock('../../services/config', () => ({
  config: { controlSystemAddress: '0xcontrol' },
}));
vi.mock('../../services/starknet', () => ({
  getSectorStatus: vi.fn(async () => state.freshSector),
  getOperatorStatus: vi.fn(async () => state.operatorStatus),
}));
vi.mock('./WalletButton', () => ({
  WalletButton: ({ label }: { label?: string }) => <button>{label}</button>,
}));

import { CaptureControl } from './CaptureControl';

function force(amount: number) {
  return BigInt(amount) * FORCE;
}

function sector(overrides: Partial<SectorStatus> = {}): SectorStatus {
  return {
    id: 42,
    controller: RIVAL,
    captureForce: force(100),
    ownershipGeneration: 3n,
    controlledSince: 1_000,
    requiredStake: force(110),
    stale: false,
    needsSync: false,
    ...overrides,
  };
}

function operator(available: number): OperatorStatus {
  return {
    operator: ME,
    liveDelegatedAmount: force(available),
    sectorForce: 0n,
    availableForce: force(available),
    generation: 1n,
    controlledSectorCount: 0,
    retired: false,
    exiting: false,
    needsSync: false,
  };
}

function connect(available = 1_000) {
  state.wallet = { address: ME, isConnected: true };
  state.operatorStatus = operator(available);
}

let root: Root;
let container: HTMLDivElement;

async function render(target: SectorStatus) {
  state.freshSector = target;
  await act(async () => {
    root.render(
      <MemoryRouter>
        <CaptureControl sectors={[target]} />
      </MemoryRouter>
    );
  });
  return container.textContent ?? '';
}

function buttonLabelled(text: string) {
  return [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes(text)
  );
}

async function click(text: string) {
  await act(async () => buttonLabelled(text)?.click());
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.wallet = { address: null, isConnected: false };
  state.operatorStatus = null;
  state.sendAsync = vi.fn(async () => ({ transaction_hash: '0xhash' }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('CaptureControl', () => {
  it('offers a wallet connection instead of a disabled capture', async () => {
    const text = await render(
      sector({ controller: '0x0', captureForce: 0n, requiredStake: force(10) })
    );

    expect(text).toContain('Your FORCE becomes this Sector’s defense.');
    expect(text).toContain('CONNECT WALLET TO CAPTURE');
    expect(text).not.toContain('CONNECT OPERATOR');
  });

  it('asks an Operator without FORCE to stake STRK', async () => {
    connect(0);
    const text = await render(sector());

    expect(text).toContain('STAKE 110 STRK TO TAKE OVER');
  });

  it('captures a neutral Sector at the minimum stake', async () => {
    connect();
    const text = await render(
      sector({ controller: '0x0', captureForce: 0n, requiredStake: force(10) })
    );

    expect(text).toContain('CAPTURE SECTOR');
    expect(text).toContain('CAPTURE · 10 FORCE');
  });

  it('takes over an occupied Sector through capture', async () => {
    connect();
    const text = await render(sector());
    expect(text).toContain('TAKE OVER SECTOR');
    expect(text).toContain(
      'Beat its defense by 10% and it’s yours right away.'
    );
    expect(text).toContain('TAKE OVER · 110 FORCE');

    await click('HOW IT WORKS');
    expect(container.textContent).toContain('The owner gets their FORCE back.');

    await click('TAKE OVER · 110 FORCE');

    expect(state.sendAsync).toHaveBeenCalledWith([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'capture',
        calldata: ['42', (110n * FORCE).toString()],
      },
    ]);
  });

  it('reinforces a Sector the Operator already holds', async () => {
    connect();
    const text = await render(sector({ controller: ME }));

    expect(text).toContain('REINFORCE SECTOR');
    expect(text).toContain('ADD FORCE');
    expect(text).toContain('REINFORCE · ENTER FORCE AMOUNT');
  });

  it('refuses a takeover whose price rose before submission', async () => {
    connect();
    await render(sector());
    state.freshSector = sector({ requiredStake: force(121) });

    await click('TAKE OVER · 110 FORCE');

    expect(state.sendAsync).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      'This Sector now needs at least 121 FORCE.'
    );
  });
});
