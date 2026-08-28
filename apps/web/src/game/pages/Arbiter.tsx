import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArbiterLogo } from '../components/3d/ArbiterLogo';
import { ArbiterConsole } from '../components/ui/ArbiterModal';
import { useArbiterHistory } from '../contexts/useArbiterHistory';
import { useArbiter } from '../contexts/useArbiter';
import { useWallet } from '../contexts/WalletContext';
import { config } from '../services/config';
import { api } from '../services/api';
import type { ArbiterRound } from '../services/api';
import {
  listArbiterBids,
  saveArbiterBid,
  type StoredArbiterBid,
} from '../services/arbiterBidStorage';
import { submitArbiterBid } from '../services/whisperBid';

const BID_CONFIRMATION_POLL_MS = 2_000;

export function Arbiter() {
  const location = useLocation();
  const { snapshot, isLoading, error, refresh } = useArbiter();
  const {
    address,
    chainId,
    invokePrivateActions,
    isConnected,
    isPrivacyWalletSupported,
    shieldedStrkStatus,
  } = useWallet();
  const view = location.pathname.endsWith('/history') ? 'history' : 'auction';
  const historyState = useArbiterHistory(view === 'history');
  const [ownBids, setOwnBids] = useState<StoredArbiterBid[]>([]);
  const [ownBidsLoading, setOwnBidsLoading] = useState(false);
  const [ownBidsError, setOwnBidsError] = useState<string | null>(null);
  const round = snapshot?.round ?? null;
  const roundAuctionId = round?.auctionId;
  const roundWhisperAddress = round?.whisperAddress;
  const consoleLoading =
    view === 'history' ? historyState.isLoading : isLoading;
  const consoleError = view === 'history' ? historyState.error : error;
  const consoleRefresh = view === 'history' ? historyState.refresh : refresh;

  const bidStatusLabel = !isConnected
    ? 'CONNECT READY TO BID'
    : shieldedStrkStatus === 'checking'
      ? 'CHECKING READY PRIVACY'
      : !isPrivacyWalletSupported
        ? 'READY PRIVACY REQUIRED'
        : !config.whisperOperatorUrl
          ? 'CAPSULE OPERATOR NOT CONFIGURED'
          : 'READY WALLET // PRIVATE';
  const canSubmitBid = Boolean(
    isConnected &&
      address &&
      chainId &&
      isPrivacyWalletSupported &&
      config.whisperOperatorUrl &&
      round
  );

  useEffect(() => {
    let active = true;
    if (
      !address ||
      !snapshot?.network ||
      roundAuctionId === undefined ||
      !roundWhisperAddress
    ) {
      setOwnBids([]);
      setOwnBidsLoading(false);
      setOwnBidsError(null);
      return () => {
        active = false;
      };
    }

    setOwnBids([]);
    setOwnBidsLoading(true);
    setOwnBidsError(null);
    listArbiterBids({
      network: snapshot.network,
      walletAddress: address,
      whisperAddress: roundWhisperAddress,
      auctionId: roundAuctionId,
    })
      .then((bids) => {
        if (active) setOwnBids(bids);
      })
      .catch(() => {
        if (active) {
          setOwnBids([]);
          setOwnBidsError('SAVED BID UNAVAILABLE ON THIS DEVICE');
        }
      })
      .finally(() => {
        if (active) setOwnBidsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [address, roundAuctionId, roundWhisperAddress, snapshot?.network]);

  const placeBid = useCallback(
    async (amount: string) => {
      if (!snapshot?.round || !address || !chainId) {
        throw new Error('Live auction or wallet state is unavailable.');
      }
      const receipt = await submitArbiterBid({
        amount,
        network: snapshot.network,
        round: snapshot.round,
        walletAddress: address,
        walletChainId: chainId,
        expectedPaymentToken: config.strkTokenAddress,
        expectedPoolAddress: config.strk20PoolAddress,
        operatorUrl: config.whisperOperatorUrl,
        invokePrivateActions,
        observeSubmission: (signal) =>
          waitForBidCountIncrease(snapshot.round!, signal),
      });
      let storageStatus: 'saved' | 'failed' = 'saved';
      try {
        const saved = await saveArbiterBid({
          version: 1,
          network: snapshot.network,
          walletAddress: address,
          roundId: snapshot.round.id,
          auctionId: snapshot.round.auctionId,
          whisperAddress: snapshot.round.whisperAddress,
          amount: receipt.amount,
          groupHandle: receipt.groupHandle,
          bidHandle: receipt.bidHandle,
          transactionHash: receipt.transactionHash,
          confirmedBy: receipt.confirmedBy,
          submittedAt: new Date().toISOString(),
        });
        setOwnBids((current) =>
          [
            saved,
            ...current.filter((bid) => bid.bidHandle !== saved.bidHandle),
          ].sort((left, right) =>
            right.submittedAt.localeCompare(left.submittedAt)
          )
        );
        setOwnBidsError(null);
      } catch {
        storageStatus = 'failed';
        setOwnBidsError('BID SUBMITTED // COULD NOT SAVE ON THIS DEVICE');
      }
      refresh();
      return { ...receipt, storageStatus };
    },
    [address, chainId, invokePrivateActions, refresh, snapshot]
  );

  return (
    <div className="h-full w-full overflow-y-auto bg-bg font-mono">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(255,255,255,0.055),transparent_24%)]" />
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pt-24">
        <header className="relative border-b border-grid pb-5 pr-24 sm:pb-6 sm:pr-36">
          <div className="text-[9px] tracking-[0.26em] text-dim">
            SEALED CONTROL AUCTION
          </div>
          <h1 className="mt-1 text-4xl font-bold tracking-[-0.08em] text-fg sm:text-5xl">
            ARBITER
          </h1>
          <p className="mt-2 max-w-xl text-[11px] leading-5 text-neutral-400">
            Bid to control the Arbiter. All bids are private until auction
            round ends.
          </p>

          <div className="absolute right-0 top-0 flex items-center gap-3">
            <div className="hidden text-right text-[7px] tracking-[0.18em] text-neutral-600 sm:block">
              <div>LIVE OBJECT</div>
              <div className="mt-1 text-neutral-400">ARBITER // 01</div>
            </div>
            <div className="h-16 w-16 border border-grid bg-black sm:h-24 sm:w-24">
              <ArbiterLogo className="pointer-events-none h-full w-full" />
            </div>
          </div>
        </header>

        <nav
          aria-label="Arbiter pages"
          className="mb-5 flex border-b border-grid sm:mb-6"
        >
          <ArbiterPageLink
            to="/arbiter"
            search={location.search}
            active={view === 'auction'}
          >
            AUCTION
          </ArbiterPageLink>
          <ArbiterPageLink
            to="/arbiter/history"
            search={location.search}
            active={view === 'history'}
          >
            HISTORY
          </ArbiterPageLink>
        </nav>

        <ArbiterConsole
          isOpen
          onClose={() => undefined}
          snapshot={snapshot}
          isLoading={consoleLoading}
          error={consoleError}
          onRefresh={consoleRefresh}
          onPlaceBid={canSubmitBid ? placeBid : undefined}
          bidStatusLabel={bidStatusLabel}
          presentation="page"
          title={view === 'history' ? 'WINNER HISTORY' : 'CONTROL AUCTION'}
          view={view}
          history={historyState.entries}
          ownBids={ownBids}
          ownBidsLoading={ownBidsLoading}
          ownBidsError={ownBidsError}
        />
      </div>
    </div>
  );
}

async function waitForBidCountIncrease(
  submittedRound: ArbiterRound,
  signal: AbortSignal
): Promise<void> {
  while (!signal.aborted) {
    await abortableDelay(BID_CONFIRMATION_POLL_MS, signal);
    try {
      const next = await api.getArbiter(signal);
      if (
        next.round?.id === submittedRound.id &&
        next.round.auctionId === submittedRound.auctionId &&
        next.round.submissionCount > submittedRound.submissionCount
      ) {
        return;
      }
      if (
        next.round &&
        (next.round.id !== submittedRound.id ||
          next.round.auctionId !== submittedRound.auctionId)
      ) {
        throw new Error('The auction changed before the bid was confirmed.');
      }
    } catch (reason) {
      if (signal.aborted) throw reason;
      if (
        reason instanceof Error &&
        reason.message === 'The auction changed before the bid was confirmed.'
      ) {
        throw reason;
      }
      // A transient API read must not override the wallet request. Keep polling.
    }
  }
  throw new DOMException('Bid confirmation was cancelled.', 'AbortError');
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        reject(
          new DOMException('Bid confirmation was cancelled.', 'AbortError')
        );
      },
      { once: true }
    );
  });
}

function ArbiterPageLink({
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
