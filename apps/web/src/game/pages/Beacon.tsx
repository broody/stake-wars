import { useCallback } from 'react';
import {
  useProvider,
  useSendTransaction,
} from '@starknetfoundation/starknet-start-react';
import { Link, useLocation } from 'react-router-dom';
import { TransactionExecutionStatus, type Call } from 'starknet';
import { BeaconLogo } from '../components/3d/BeaconLogo';
import { BeaconConsole } from '../components/ui/BeaconModal';
import { useTransactionToast } from '../contexts/TransactionToastContext';
import { useBeaconHistory } from '../contexts/useBeaconHistory';
import { useBeacon } from '../contexts/useBeacon';
import { useWallet } from '../contexts/WalletContext';
import { config } from '../services/config';
import {
  buildBeaconBidCalls,
  buildBeaconSettleCall,
} from '../services/beaconBid';
import { parseStrk } from '../utils/format';

export function Beacon() {
  const location = useLocation();
  const { provider } = useProvider();
  const transaction = useSendTransaction({});
  const { snapshot, isLoading, error, refresh } = useBeacon();
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const { address, isConnected } = useWallet();
  const view = location.pathname.endsWith('/history') ? 'history' : 'auction';
  const historyState = useBeaconHistory(view === 'history');
  const round = snapshot?.round ?? null;
  const consoleLoading =
    view === 'history' ? historyState.isLoading : isLoading;
  const consoleError = view === 'history' ? historyState.error : error;
  const consoleRefresh = view === 'history' ? historyState.refresh : refresh;

  const bidStatusLabel = !config.beaconSystemAddress
    ? 'AUCTION NOT CONFIGURED'
    : !isConnected
      ? 'CONNECT WALLET TO BID'
      : 'PUBLIC BID // STRK';
  const canTransact = Boolean(
    isConnected && address && config.beaconSystemAddress && round
  );

  const submit = useCallback(
    async (calls: Call[], label: string) => {
      let hash: string | null = null;
      try {
        const result = await transaction.sendAsync(calls);
        hash = result.transaction_hash;
        notifySubmitting(hash, label);
        await provider.waitForTransaction(hash, {
          errorStates: [TransactionExecutionStatus.REVERTED],
        });
        notifyConfirmed(hash);
        refresh();
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : `${label} failed.`;
        if (hash) notifyFailed(hash, message);
        throw new Error(message);
      }
    },
    [
      notifyConfirmed,
      notifyFailed,
      notifySubmitting,
      provider,
      refresh,
      transaction,
    ]
  );

  const placeBid = useCallback(
    async (amount: string) => {
      if (!snapshot?.round || !address) {
        throw new Error('Live auction or wallet state is unavailable.');
      }
      const calls = buildBeaconBidCalls({
        beaconSystemAddress: config.beaconSystemAddress,
        strkTokenAddress: config.strkTokenAddress,
        round: snapshot.round,
        bidder: address,
        amount: parseStrk(amount),
      });
      await submit(calls, 'BEACON BID');
    },
    [address, snapshot, submit]
  );

  const settle = useCallback(async () => {
    if (!snapshot?.round) {
      throw new Error('Live auction state is unavailable.');
    }
    await submit(
      [
        buildBeaconSettleCall({
          beaconSystemAddress: config.beaconSystemAddress,
          round: snapshot.round,
        }),
      ],
      'BEACON SETTLEMENT'
    );
  }, [snapshot, submit]);

  return (
    <div className="h-full w-full overflow-y-auto bg-bg font-mono">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(255,255,255,0.055),transparent_24%)]" />
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pt-24">
        <header className="relative border-b border-grid pb-5 pr-24 sm:pb-6 sm:pr-36">
          <div className="text-[9px] tracking-[0.26em] text-dim">
            OPEN SIGNAL AUCTION
          </div>
          <h1 className="game-page-title mt-1">THE BEACON</h1>
          <p className="mt-2 max-w-xl text-[11px] leading-5 text-neutral-400">
            Bid for control of the Beacon. The winning Operator controls the
            image, description, and link it transmits.
          </p>

          <div className="absolute right-0 top-0 flex items-center gap-3">
            <div className="hidden text-right text-[7px] tracking-[0.18em] text-neutral-600 sm:block">
              <div>LIVE OBJECT</div>
              <div className="mt-1 text-neutral-400">BEACON // 01</div>
            </div>
            <div className="h-16 w-16 border border-grid bg-black sm:h-24 sm:w-24">
              <BeaconLogo className="pointer-events-none h-full w-full" />
            </div>
          </div>
        </header>

        <nav
          aria-label="Beacon pages"
          className="mb-5 flex border-b border-grid sm:mb-6"
        >
          <BeaconPageLink
            to="/beacon"
            search={location.search}
            active={view === 'auction'}
          >
            AUCTION
          </BeaconPageLink>
          <BeaconPageLink
            to="/beacon/history"
            search={location.search}
            active={view === 'history'}
          >
            HISTORY
          </BeaconPageLink>
        </nav>

        <BeaconConsole
          isOpen
          onClose={() => undefined}
          snapshot={snapshot}
          isLoading={consoleLoading}
          error={consoleError}
          onRefresh={consoleRefresh}
          onPlaceBid={canTransact ? placeBid : undefined}
          onSettle={canTransact ? settle : undefined}
          viewerAddress={address}
          bidStatusLabel={bidStatusLabel}
          presentation="page"
          title={view === 'history' ? 'WINNER HISTORY' : 'SIGNAL AUCTION'}
          view={view}
          history={historyState.entries}
        />
      </div>
    </div>
  );
}

function BeaconPageLink({
  to,
  search,
  active,
  children,
}: {
  to: string;
  search: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      to={{ pathname: to, search }}
      aria-current={active ? 'page' : undefined}
      className={`min-w-28 border-x border-grid px-5 py-3 text-center text-[9px] tracking-[0.2em] transition-colors first:border-r-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-fg ${
        active ? 'bg-fg text-bg' : 'text-neutral-500 hover:text-fg'
      }`}
    >
      {children}
    </Link>
  );
}
