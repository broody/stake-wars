// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { api } from '../services/api';
import { config } from '../services/config';
import { Survivors } from './Survivors';

vi.mock('../services/api', () => ({
  api: {
    getSurvivorBoard: vi.fn(),
    startSurvivorRun: vi.fn(),
    claimSurvivorPrize: vi.fn(),
  },
}));
vi.mock('../contexts/WalletContext', () => ({
  useWallet: () => ({ address: '0x000123' }),
}));
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
      claimed: false,
    },
    entries: [
      {
        wallet: '0x123',
        outis: true,
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
        outis: false,
        destroyed: 10,
        durationSeconds: 15,
        upgrades: [],
      },
      {
        wallet: '0x789',
        outis: false,
        destroyed: 1,
        durationSeconds: null,
        upgrades: null,
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
    const [best, empty, legacy] =
      node.querySelectorAll<HTMLTableRowElement>('tbody tr');
    const prize = node.querySelector('section[aria-label="Prize round"]')!;
    expect(prize.textContent).toContain('100 STRK');
    expect(prize.textContent).toContain(
      'Every player can join the leaderboard. Only Outis wallets are eligible for the prize.'
    );
    expect(node.querySelector('header')?.textContent).not.toMatch(
      /player name|set leaderboard name/i
    );
    expect(best.cells[1].textContent).toContain('Anonymous');
    expect(best.cells[1].textContent).not.toContain('0x123');
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
    vi.mocked(api.startSurvivorRun).mockResolvedValue({
      token: 'anonymous-ticket',
      seed: 1,
    });
    const start = Array.from(node.querySelectorAll('button')).find(
      (b) => b.textContent === 'Play'
    )!;
    expect(start.disabled).toBe(false);
    await act(async () => start.click());
    expect(api.startSurvivorRun).toHaveBeenCalledWith();
  } finally {
    await act(async () => root.unmount());
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
    claimed: false,
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
    outis: true,
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
    claimed: true,
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
    expect(prize.querySelector('img')).not.toBeNull();
    expect(prize.textContent).toContain('Only Outis wallets are eligible');
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
              claimed: false,
            },
          }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(prize.querySelector('img')).toBeNull();
    expect(prize.textContent).not.toContain('eligible');
    expect(node.textContent).toContain('Paid 100 STRK');
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('keeps the claim and its payment receipt in the eligible winner’s last cell', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const winner = {
    wallet: '0x123',
    outis: true,
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
    claimed: false,
  };
  const board = {
    network: config.starknetChainId,
    payoutsEnabled: true,
    round,
    entries: [
      { ...winner, wallet: '0xabc', outis: false, destroyed: 500 },
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
    const claim = lastCell.querySelector('button')!;
    expect(claim.textContent).toBe('Claim 100 STRK');
    expect(
      node.querySelector('section[aria-label="Prize round"] button')
    ).toBeNull();
    vi.mocked(api.claimSurvivorPrize).mockRejectedValueOnce(
      new Error('Signature declined')
    );
    await act(async () => claim.click());
    expect(
      eligible.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')
    ).toBe('false');
    expect(lastCell.querySelector('[role="alert"]')?.textContent).toBe(
      'Signature declined'
    );
    vi.mocked(api.getSurvivorBoard).mockResolvedValue({
      ...board,
      round: {
        ...round,
        claimed: true,
        paymentStatus: 'succeeded',
        transactionHash: '0xabc',
      },
    });
    vi.mocked(api.claimSurvivorPrize).mockResolvedValueOnce({ claimed: true });
    await act(async () => claim.click());
    const receipt = node.querySelector('tbody tr:last-child td:last-child')!;
    expect(receipt.textContent).toContain('Paid 100 STRK');
    expect(receipt.querySelector('a')?.getAttribute('href')).toContain(
      '/tx/0xabc'
    );
    expect(receipt.querySelector('button')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
