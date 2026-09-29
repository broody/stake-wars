// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ChallengeParticipantStatus,
  ChallengeStatus,
  OperatorStatus,
  SectorStatus,
} from '../../types';

const ME = '0xa11ce';
const OWNER = '0xb0b';
const RIVAL = '0xc4a1';
const FORCE = 10n ** 18n;

const state = vi.hoisted(() => ({
  wallet: { address: null as string | null, isConnected: false },
  operatorStatus: null as OperatorStatus | null,
  challenge: null as ChallengeStatus | null,
  participant: null as ChallengeParticipantStatus | null,
}));

vi.mock('@starknetfoundation/starknet-start-react', () => ({
  useProvider: () => ({ provider: { waitForTransaction: vi.fn() } }),
  useSendTransaction: () => ({ sendAsync: vi.fn() }),
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
  config: { controlSystemAddress: '0x1' },
}));
vi.mock('../../services/starknet', () => ({
  getChallengeStatus: vi.fn(async () => state.challenge),
  getChallengeParticipantStatus: vi.fn(async () => state.participant),
  getSectorStatus: vi.fn(),
  getOperatorStatus: vi.fn(),
}));
vi.mock('../../hooks/useChallengeWindow', () => ({
  useChallengeWindowSeconds: () => 10_800,
}));
vi.mock('./WalletButton', () => ({
  WalletButton: ({ label }: { label?: string }) => <button>{label}</button>,
}));

import { CaptureControl } from './CaptureControl';

const NOW = 1_800_000_000;

function force(amount: number) {
  return BigInt(amount) * FORCE;
}

function sector(overrides: Partial<SectorStatus> = {}): SectorStatus {
  return {
    id: 42,
    controller: OWNER,
    captureForce: force(100),
    ownershipGeneration: 1n,
    controlledSince: NOW - 86_400,
    requiredStake: force(110),
    activeChallengeId: 0n,
    challengeLeadChangeCount: 0,
    challengeDeadline: null,
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
    challengeForce: 0n,
    spentForce: 0n,
    availableForce: force(available),
    generation: 1n,
    controlledSectorCount: 0,
    activeChallengeCount: 0,
    retired: false,
    exiting: false,
    needsSync: false,
  };
}

function challenge(overrides: Partial<ChallengeStatus> = {}): ChallengeStatus {
  return {
    id: 7n,
    sectorId: 42,
    incumbent: OWNER,
    leader: RIVAL,
    leadingForce: force(620),
    lastLoser: ME,
    lastLosingForce: force(500),
    deadline: NOW + 3_600,
    leadChangeCount: 3,
    participantCount: 3,
    settled: false,
    winner: '0x0',
    winningForce: 0n,
    losingForce: 0n,
    ...overrides,
  };
}

function participant(committed: number): ChallengeParticipantStatus {
  return {
    challengeId: 7n,
    operator: ME,
    committedForce: force(committed),
    sectorForceIncluded: 0n,
    additionalForce: 0n,
    joined: true,
    resolved: false,
    won: false,
  };
}

function connect(available = 1_000) {
  state.wallet = { address: ME, isConnected: true };
  state.operatorStatus = operator(available);
}

let root: Root;
let container: HTMLDivElement;

async function render(target: SectorStatus) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <CaptureControl sectors={[target]} />
      </MemoryRouter>
    );
  });
  return container.textContent ?? '';
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW * 1_000);
  state.wallet = { address: null, isConnected: false };
  state.operatorStatus = null;
  state.challenge = null;
  state.participant = null;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CaptureControl onboarding copy', () => {
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
    const text = await render(
      sector({ controller: '0x0', captureForce: 0n, requiredStake: force(10) })
    );

    expect(text).toContain('STAKE 10 STRK TO CAPTURE');
  });

  it('explains the window and what a losing challenge costs', async () => {
    connect();
    const text = await render(sector());

    expect(text).toContain('CHALLENGE SECTOR');
    expect(text).toContain('Bid 10% over the defense to start a challenge.');
    expect(text).toContain('MINIMUM110 FORCE');
    expect(text).toContain('Lose and your 110 FORCE is spent.');
    expect(text).toContain('START CHALLENGE · 110 FORCE');

    const toggle = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.startsWith('HOW IT WORKS')
    );
    await act(async () => toggle?.click());
    expect(container.textContent).toContain(
      'Each new lead resets the timer to 3 hours.'
    );
  });

  it('shows the top bid, your bid, and the increment when rejoining', async () => {
    connect();
    state.challenge = challenge();
    state.participant = participant(500);
    const text = await render(
      sector({
        activeChallengeId: 7n,
        requiredStake: force(682),
        challengeDeadline: NOW + 3_600,
      })
    );

    expect(text).toContain('CHALLENGE IN PROGRESS');
    expect(text).toContain('TOP BID620 FORCE');
    expect(text).toContain('YOUR BID500 FORCE');
    expect(text).toContain('YOUR NEW TOTAL BID');
    expect(text).toContain('YOU ADD+182 FORCE');
    expect(text).toContain('PLACE BID · 682 FORCE');
  });

  it('tells a challenged owner that their defense is already their bid', async () => {
    connect();
    state.challenge = challenge({ incumbent: ME });
    state.participant = participant(100);
    const text = await render(
      sector({
        controller: ME,
        activeChallengeId: 7n,
        requiredStake: force(682),
        challengeDeadline: NOW + 3_600,
      })
    );

    expect(text).toContain('DEFEND YOUR SECTOR');
    expect(text).toContain('YOUR BID100 FORCE');
    expect(text).toContain('Lose and you forfeit the Sector and 682 FORCE.');
    expect(text).toContain('DEFEND · 682 FORCE');
  });

  it('hides the bid form while the connected Operator leads', async () => {
    connect();
    state.challenge = challenge({ leader: ME });
    state.participant = participant(620);
    const text = await render(
      sector({
        activeChallengeId: 7n,
        requiredStake: force(682),
        challengeDeadline: NOW + 3_600,
      })
    );

    expect(text).toContain('YOU ARE LEADING');
    expect(text).toContain('Lose the lead and your 620 FORCE is at risk.');
    expect(text).not.toContain('YOUR NEW TOTAL BID');
    expect(container.querySelector('input')).toBeNull();
  });

  it('explains settlement once the clock runs out', async () => {
    connect();
    state.challenge = challenge({ deadline: NOW - 1 });
    const text = await render(
      sector({ activeChallengeId: 7n, challengeDeadline: NOW - 1 })
    );

    expect(text).toContain('CHALLENGE ENDED');
    expect(text).toContain('WINNING BID620 FORCE');
    expect(text).toContain('SETTLE CHALLENGE');
  });
});
