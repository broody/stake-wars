// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { survivorsSession } from '../../survivors/session';
import { CoreSurvivorsHud } from './CoreSurvivorsHud';
import { spawnEnemy } from '../../survivors/sim';
import { api } from '../../services/api';
import { config } from '../../services/config';
import { retrySurvivorRuns } from '../../survivors/guest';
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
    finishSurvivorRun: vi.fn(),
    hasSurvivorSession: vi.fn(() => false),
    authorizeSurvivor: vi.fn(),
    getWalletProfile: vi.fn().mockResolvedValue({ name: 'Orbit' }),
  },
}));

it.each([false, true])(
  'submits a finished guest run only with an authorized wallet (cached session: %s)',
  async (cached) => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const session = survivorsSession;
    const run = rankedRun(343);
    session.run = run;
    session.ticket = { seed: 343, token: 'guest-ticket' };
    session.replay = new RankedReplay();
    run.player.hp = 1;
    run.weapons[0].cooldown = 10;
    spawnEnemy(run, 'mite', { ...run.player.n });
    vi.mocked(api.finishSurvivorRun).mockResolvedValueOnce({ destroyed: 17 });
    vi.mocked(api.hasSurvivorSession).mockReturnValue(cached);
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
      expect(node.textContent).toContain('Connect wallet to submit score');
      expect(node.textContent).not.toContain('Set leaderboard name');
      expect(api.finishSurvivorRun).not.toHaveBeenCalled();
      expect(api.authorizeSurvivor).not.toHaveBeenCalled();
      expect(
        Object.keys(localStorage).some((key) => key.includes('wallet-run'))
      ).toBe(false);
      wallet.address = '0x456';
      await render();
      const submit = () =>
        Array.from(node.querySelectorAll('button')).find((b) =>
          b.textContent?.startsWith('Submit score as')
        );
      if (!cached) {
        vi.mocked(api.authorizeSurvivor).mockRejectedValueOnce(
          new Error('Signature declined')
        );
        await act(async () => submit()!.click());
        expect(node.textContent).toContain('Signature declined');
        expect(api.finishSurvivorRun).not.toHaveBeenCalled();
        await act(async () => submit()!.click());
      }
      expect(api.authorizeSurvivor).toHaveBeenLastCalledWith(
        wallet.address,
        wallet.sign
      );
      expect(api.finishSurvivorRun).toHaveBeenCalledTimes(1);
      expect(api.finishSurvivorRun).toHaveBeenCalledWith(
        'guest-ticket',
        expect.any(String),
        wallet.address
      );
      expect(node.textContent).toContain('Score recorded for 0x456');
      expect(submit()).toBeUndefined();
      const nameButton = Array.from(node.querySelectorAll('button')).find(
        (b) => b.textContent === 'Set leaderboard name'
      );
      await act(async () => nameButton!.click());
      expect(api.getWalletProfile).toHaveBeenCalledWith(wallet.address);
      expect(node.textContent).toContain('Sign and save');
      wallet.address = null;
      await render();
      expect(node.textContent).not.toContain('Set leaderboard name');
    } finally {
      await act(async () => root.unmount());
      session.run = null;
      session.ticket = null;
      session.replay = null;
      session.scoreResult = null;
      wallet.address = null;
      vi.unstubAllGlobals();
    }
  }
);

it('retries only the signed wallet’s queued scores and skips older guest replays', async () => {
  vi.clearAllMocks();
  const wallet = '0x456';
  const chain = config.starknetChainId;
  const pending = 'stakewars.survivor.wallet-run.' + chain;
  const own = pending + '.' + wallet + '.mine';
  const other = pending + '.0x789.theirs';
  const guest = 'stakewars.survivor.run.' + chain + '.old';
  try {
    localStorage.setItem(
      own,
      JSON.stringify({ token: 'mine', wallet, replay: 'fwA=' })
    );
    localStorage.setItem(
      other,
      JSON.stringify({ token: 'theirs', wallet: '0x789', replay: 'fwA=' })
    );
    localStorage.setItem(
      guest,
      JSON.stringify({ token: 'old', guestId: 'anonymous', replay: 'fwA=' })
    );
    vi.mocked(api.hasSurvivorSession).mockReturnValue(false);
    await retrySurvivorRuns(wallet);
    expect(api.finishSurvivorRun).not.toHaveBeenCalled();
    vi.mocked(api.hasSurvivorSession).mockReturnValue(true);
    vi.mocked(api.finishSurvivorRun).mockResolvedValueOnce({ destroyed: 4 });
    await retrySurvivorRuns(wallet);
    expect(api.finishSurvivorRun).toHaveBeenCalledTimes(1);
    expect(api.finishSurvivorRun).toHaveBeenCalledWith('mine', 'fwA=', wallet);
    expect(localStorage.getItem(own)).toBeNull();
    expect(localStorage.getItem(other)).toBeTruthy();
  } finally {
    for (const key of [own, other, guest]) localStorage.removeItem(key);
  }
});
