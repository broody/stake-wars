// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { api } from '../services/api';
import { config } from '../services/config';
import { Survivors } from './Survivors';
import type { WalletState } from '../types';

vi.mock('../services/api', () => ({
  api: {
    getSurvivorBoard: vi.fn(),
    startSurvivorRun: vi.fn(),
    hasSurvivorSession: () => false,
  },
}));
const { wallet } = vi.hoisted(() => ({
  wallet:
    vi.fn<
      () => Pick<
        WalletState,
        'address' | 'isConnected' | 'walletName' | 'walletId'
      >
    >(),
}));
vi.mock('../contexts/WalletContext', () => ({ useWallet: wallet }));
const guest = {
  address: null,
  isConnected: false,
  walletName: null,
  walletId: null,
};
beforeEach(() => {
  wallet.mockReturnValue(guest);
});
vi.mock('@starknetfoundation/starknet-start-react', () => ({
  useSignTypedData: () => ({}),
}));
vi.mock('../survivors/session', () => ({ survivorsSession: {} }));

it('displays active time and expands the final skills for the selected score', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(api.getSurvivorBoard).mockResolvedValue({
    network: config.starknetChainId,
    payoutsEnabled: true,
    round: {
      id: 1,
      deadline: '2099-01-01T00:00:00Z',
      closed: false,
      winner: null,
      prizeAmount: '100000000000000000000',
    },
    entries: [
      {
        wallet: '0x554973123456789abcdef09efcd',
        walletKind: 'outis',
        destroyed: 201,
        durationSeconds: 119,
        upgrades: [
          { kind: 'system', name: 'Aegis', level: 1 },
          { kind: 'weapon', name: 'Arc Blade', level: 5 },
          { kind: 'weapon', name: 'Orbital Strike', level: 1 },
          { kind: 'system', name: 'Aegis', level: 2 },
          { kind: 'repair', name: 'Field Repair' },
          { kind: 'sharpen', name: 'Sharpen' },
          { kind: 'weapon', name: 'Orbital Strike', level: 3 },
          { kind: 'evolution', name: 'Eclipse' },
        ],
      },
      {
        guest: 'guest-publicid',
        name: 'Moon Pilot',

        destroyed: 10,
        durationSeconds: 15,
        upgrades: [],
      },
      {
        wallet: '0x789',
        name: 'Star Pilot',

        destroyed: 1,
        durationSeconds: null,
        upgrades: null,
      },
      {
        guest: 'guest-unnamed',

        destroyed: 0,
        durationSeconds: 12,
        upgrades: [],
      },
    ],
  });
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Survivors />
        </MemoryRouter>
      );
    });
    const [best, empty, legacy, guest] =
      node.querySelectorAll<HTMLTableRowElement>('tbody tr');
    const prize = node.querySelector('section[aria-label="Prize round"]')!;
    expect(prize.textContent).toContain('100 STRK');
    expect(prize.textContent).toContain(
      'Play as a guest. Submit your score with any supported Starknet wallet to compete for the daily prize.'
    );
    expect(node.querySelector('header')?.textContent).not.toMatch(
      /player name|set leaderboard name/i
    );
    expect(best.cells[1].textContent).toContain('0x554973…09efcd');
    expect(best.cells[1].querySelector('button')?.title).toBe(
      '0x554973123456789abcdef09efcd'
    );
    expect(legacy.cells[1].textContent).toContain('Star Pilot');
    expect(guest.cells[1].textContent).toContain('Anonymous');
    expect(empty.cells[1].textContent).toContain('Moon Pilot');
    expect(best.cells[2].textContent).toBe('201');
    expect(best.cells[3].textContent).toBe('01:59');
    expect(node.querySelector('ol')).toBeNull();
    const button = best.querySelector('button')!;
    await act(async () => best.cells[2].click());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(
      Array.from(node.querySelectorAll('ol [role="img"]'), (tile) =>
        tile.getAttribute('aria-label')
      )
    ).toEqual([
      'Eclipse · Lv 5 · Evolution',
      'Aegis · Lv 2',
      'Orbital Strike · Lv 3',
    ]);
    await act(async () => button.click());
    expect(node.querySelector('ol')).toBeNull();
    await act(async () => empty.click());
    expect(
      node.querySelector('ol [role="img"]')?.getAttribute('aria-label')
    ).toBe('Arc Blade · Lv 1');
    await act(async () => legacy.click());
    expect(node.textContent).toContain('Final skills unrecorded.');
    expect(node.querySelector('ol')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('updates prize eligibility when a player connects, switches wallets, or disconnects', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(api.getSurvivorBoard).mockResolvedValue({
    network: config.starknetChainId,
    payoutsEnabled: true,
    round: {
      id: 1,
      closed: false,
      deadline: '2099-01-01T00:00:00Z',
      prizeAmount: '100000000000000000000',
      winner: null,
    },
    entries: [],
  });
  const node = document.createElement('div');
  const root = createRoot(node);
  const render = () =>
    act(async () =>
      root.render(
        <MemoryRouter>
          <Survivors />
        </MemoryRouter>
      )
    );
  const message = () =>
    node.querySelector('section[aria-label="Prize round"] [role="status"]')
      ?.textContent;
  try {
    await render();
    const guestMessage = message();
    expect(guestMessage).toContain('Play as a guest');
    const connected = { address: '0x123', isConnected: true };
    wallet.mockReturnValue({
      ...connected,
      walletName: 'Privacy Wallet',
      walletId: 'outis',
    });
    await render();
    expect(message()).toContain('Outis connected.');
    wallet.mockReturnValue({
      ...connected,
      walletName: 'Braavos',
      walletId: 'braavos',
    });
    await render();
    // Every supported wallet competes for the prize.
    expect(message()).toBe(
      'Braavos connected. Submit your score with this wallet to compete for the daily prize.'
    );
    wallet.mockReturnValue(guest);
    await render();
    expect(message()).toBe(guestMessage);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('waits for first-play guidance before starting a run and skips it on return', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(api.getSurvivorBoard).mockResolvedValue({
    network: config.starknetChainId,
    payoutsEnabled: true,
    round: null,
    entries: [],
  });
  vi.mocked(api.startSurvivorRun)
    .mockClear()
    .mockRejectedValueOnce(new Error('Try again'))
    .mockResolvedValue({
      token: 'anonymous-ticket',
      seed: 1,
    });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const play = () => node.querySelector<HTMLButtonElement>('header button')!;
  const guide = () => document.querySelector('[role="dialog"]');
  const confirm = () =>
    Array.from(guide()!.querySelectorAll('button')).find(
      (b) => b.textContent === 'Start run'
    )!;
  try {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/survivors']}>
          <Routes>
            <Route path="/survivors" element={<Survivors />} />
            <Route path="/" element={<Link to="/survivors">Lobby</Link>} />
          </Routes>
        </MemoryRouter>
      )
    );
    expect(guide()).toBeNull();
    await act(async () => play().click());
    expect(guide()?.textContent).toContain('Collect shards');
    expect(document.activeElement).toBe(confirm());
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(guide()).toBeNull();
    expect(api.startSurvivorRun).not.toHaveBeenCalled();
    await act(async () => play().click());
    await act(async () => confirm().click());
    expect(guide()!.querySelector('[role="alert"]')?.textContent).toBe(
      'Try again'
    );
    await act(async () => confirm().click());
    expect(guide()).toBeNull();
    await act(async () => node.querySelector('a')!.click());
    await act(async () => play().click());
    expect(guide()).toBeNull();
    expect(node.querySelector('a')?.textContent).toBe('Lobby');
    expect(api.startSurvivorRun).toHaveBeenCalledTimes(3);
  } finally {
    await act(async () => root.unmount());
    node.remove();
    vi.unstubAllGlobals();
  }
});

it('counts down each second and refreshes the standings at the deadline', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-22T02:34:58.000Z'));
  const round = {
    id: 2,
    deadline: '2026-11-22T02:35:00Z',
    closed: false,
    winner: null,
    prizeAmount: '100000000000000000000',
  };
  const board = {
    network: config.starknetChainId,
    payoutsEnabled: false,
    round,
    entries: [],
  };
  vi.mocked(api.getSurvivorBoard)
    .mockResolvedValueOnce(board)
    .mockResolvedValue({
      ...board,
      round: { ...round, closed: true },
    });
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <Survivors />
        </MemoryRouter>
      )
    );
    const prizeRow = node.querySelector('section[aria-label="Prize round"]')!;
    expect(prizeRow.querySelector('[role="timer"]')?.textContent).toBe(
      '00:00:02'
    );
    expect(node.querySelector('a[href="/drop/claims"]')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(node.querySelector('[role="timer"]')?.textContent).toBe('00:00:01');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(node.querySelector('[role="timer"]')).toBeNull();
    expect(node.querySelector('header button')?.textContent).toBe('Play');
    expect(node.textContent).not.toContain('Practice run');
    expect(node.querySelector('time')?.dateTime).toBe(round.deadline);
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('hides the eligibility banner on a pinned round once a newer round opens', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  const winner = {
    wallet: '0x123',
    walletKind: 'outis',
    destroyed: 417,
    durationSeconds: 207,
    upgrades: [],
  };
  const round = {
    id: 1,
    closed: true,
    deadline: '2026-01-01T00:00:00Z',
    winner,
    prizeAmount: '100000000000000000000',
    paymentStatus: 'succeeded',
  };
  const board = {
    network: config.starknetChainId,
    payoutsEnabled: true,
    round,
    entries: [winner],
  };
  const getBoard = vi.mocked(api.getSurvivorBoard);
  getBoard.mockResolvedValue(board);
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/survivors?round=1']}>
          <Survivors />
        </MemoryRouter>
      )
    );
    const prize = node.querySelector('section[aria-label="Prize round"]')!;
    expect(prize.querySelector('[role="status"]')).not.toBeNull();
    expect(prize.textContent).toContain('compete for the daily prize');
    getBoard.mockImplementation(async (_signal, id) =>
      id === '1'
        ? board
        : {
            ...board,
            round: {
              ...round,
              id: 2,
              closed: false,
              winner: null,
            },
          }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(prize.querySelector('[role="status"]')).toBeNull();
    expect(prize.textContent).not.toContain('compete');
    expect(node.textContent).toContain('Paid 100 STRK');
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('shows the automatic payment in the winner’s last cell without a claim', async () => {
  wallet.mockReturnValue({
    address: '0x000123',
    isConnected: true,
    walletId: 'outis',
    walletName: 'Outis',
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const winner = {
    wallet: '0x123',
    walletKind: 'outis',
    destroyed: 417,
    durationSeconds: 207,
    upgrades: [],
  };
  const round = {
    id: 4,
    closed: true,
    deadline: '2026-01-01T00:00:00Z',
    winner,
    prizeAmount: '100000000000000000000',
    paymentStatus: 'submitted',
    transactionHash: '0xabc',
  };
  const board = {
    network: config.starknetChainId,
    payoutsEnabled: true,
    round,
    entries: [
      // Guests rank on the board but can't win the prize.
      {
        ...winner,
        wallet: undefined,
        walletKind: undefined,
        guest: 'guest-1',
        destroyed: 500,
      },
      winner,
    ],
  };
  vi.mocked(api.getSurvivorBoard).mockResolvedValue(board);
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <Survivors />
        </MemoryRouter>
      )
    );
    const [top, eligible] =
      node.querySelectorAll<HTMLTableRowElement>('tbody tr');
    expect(top.cells[4].textContent).toBe('');
    const lastCell = eligible.cells[eligible.cells.length - 1];
    expect(lastCell.textContent).toMatch(/^Sending 100 STRKView transaction/);
    expect(node.querySelector('tbody button:not([aria-expanded])')).toBeNull();
    expect(lastCell.querySelector('a')?.getAttribute('href')).toContain(
      '/tx/0xabc'
    );
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
