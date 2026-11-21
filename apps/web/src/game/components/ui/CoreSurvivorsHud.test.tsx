// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { survivorsSession } from '../../survivors/session';
import { CoreSurvivorsHud } from './CoreSurvivorsHud';
import { spawnEnemy } from '../../survivors/sim';
import { survivorGuestId } from '../../survivors/guest';
import { api } from '../../services/api';
import { RankedReplay, rankedRun } from '../../survivors/rankedReplay';

const wallet = vi.hoisted(() => ({
  address: null as string | null,
  sign: vi.fn(),
}));
vi.mock('../../contexts/WalletContext', () => ({ useWallet: () => wallet }));
vi.mock('@starknetfoundation/starknet-start-react', () => ({
  useSignTypedData: () => ({ signTypedDataAsync: wallet.sign }),
}));
vi.mock('./WalletButton', () => ({
  WalletButton: ({ label }: { label: string }) => <button>{label}</button>,
}));
vi.mock('../../services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/api')>()),
  api: {
    finishGuestRun: vi.fn(),
    hasSurvivorSession: () => false,
    attachSurvivorWallet: vi.fn(),
    guestProfile: vi.fn().mockResolvedValue({ name: '' }),
    getWalletProfile: vi.fn().mockResolvedValue({ name: 'Orbit' }),
  },
}));

it('automatically records a completed guest run and links it once after the wallet signs', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = survivorsSession;
  const run = rankedRun(343);
  session.run = run;
  session.ticket = { seed: 343, token: 'guest-ticket' };
  session.replay = new RankedReplay();
  run.player.hp = 1;
  run.weapons[0].cooldown = 10;
  spawnEnemy(run, 'mite', { ...run.player.n });
  vi.mocked(api.finishGuestRun).mockResolvedValueOnce({ destroyed: 17 });
  session.advance(1 / 30);
  run.deathAge = 5;
  const node = document.createElement('div');
  const root = createRoot(node);
  const render = () =>
    act(async () =>
      root.render(
        <MemoryRouter>
          <CoreSurvivorsHud />
        </MemoryRouter>
      )
    );
  try {
    await render();
    expect(node.textContent).toContain('Score recorded on the leaderboard.');
    expect(node.textContent).toContain('Connect to link this score');
    const nameButton = () =>
      Array.from(node.querySelectorAll('button')).find(
        (b) => b.textContent === 'Set leaderboard name'
      );
    expect(api.guestProfile).not.toHaveBeenCalled();
    await act(async () => nameButton()!.click());
    expect(api.guestProfile).toHaveBeenCalledWith(survivorGuestId());
    expect(node.querySelector('input')?.placeholder).toBe('Anonymous');
    expect(api.finishGuestRun).toHaveBeenCalledTimes(1);
    expect(api.finishGuestRun).toHaveBeenCalledWith(
      'guest-ticket',
      expect.any(String),
      survivorGuestId()
    );
    wallet.address = '0x456';
    await render();
    const link = () =>
      Array.from(node.querySelectorAll('button')).find((b) =>
        b.textContent?.startsWith('Link score to')
      );
    vi.mocked(api.attachSurvivorWallet)
      .mockRejectedValueOnce(new Error('Signature declined'))
      .mockResolvedValueOnce({ wallet: wallet.address });
    await act(async () => link()!.click());
    expect(node.textContent).toContain('Signature declined');
    expect(node.textContent).toContain('Score recorded on the leaderboard.');
    await act(async () => link()!.click());
    expect(api.attachSurvivorWallet).toHaveBeenLastCalledWith(
      'guest-ticket',
      survivorGuestId(),
      '0x456',
      wallet.sign
    );
    expect(node.textContent).toContain('Score recorded for 0x456');
    expect(link()).toBeUndefined();
    expect(node.querySelector('input')).toBeNull();
    await act(async () => nameButton()!.click());
    expect(api.getWalletProfile).toHaveBeenCalledWith(wallet.address);
    expect(node.textContent).toContain('Sign and save');
  } finally {
    await act(async () => root.unmount());
    session.run = null;
    session.ticket = null;
    session.replay = null;
    session.scoreResult = null;
    wallet.address = null;
    vi.unstubAllGlobals();
  }
});
