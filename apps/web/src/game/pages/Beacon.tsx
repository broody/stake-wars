import { useCallback, useEffect, useState } from 'react';
import { useProvider } from '@starknetfoundation/starknet-start-react';
import { Link, useLocation } from 'react-router-dom';
import { TransactionExecutionStatus } from 'starknet';
import { BeaconLogo } from '../components/3d/BeaconLogo';
import { BeaconConsole } from '../components/ui/BeaconModal';
import { useTransactionToast } from '../contexts/TransactionToastContext';
import { useBeaconHistory } from '../contexts/useBeaconHistory';
import { useBeacon } from '../contexts/useBeacon';
import { useWallet } from '../contexts/WalletContext';
import { config } from '../services/config';
import {
  listBeaconBids,
  saveBeaconBid,
  type StoredBeaconBid,
} from '../services/beaconBidStorage';
import { submitBeaconBid } from '../services/whisperBid';

export function Beacon() {
  const location = useLocation();
  const { provider } = useProvider();
  const { snapshot, isLoading, error, refresh } = useBeacon();
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const {
    address,
    chainId,
    invokePrivateActions,
    isConnected,
    isPrivacyWalletSupported,
    shieldedStrkStatus,
  } = useWallet();
  const view = location.pathname.endsWith('/history') ? 'history' : 'auction';
  const historyState = useBeaconHistory(view === 'history');
  const [ownBids, setOwnBids] = useState<StoredBeaconBid[]>([]);
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
    listBeaconBids({
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
      const receipt = await submitBeaconBid({
        amount,
        network: snapshot.network,
        round: snapshot.round,
        walletAddress: address,
        walletChainId: chainId,
        expectedPaymentToken: config.strkTokenAddress,
        expectedPoolAddress: config.strk20PoolAddress,
        operatorUrl: config.whisperOperatorUrl,
        invokePrivateActions,
      });
      notifySubmitting(receipt.transactionHash, 'BEACON BID');
      void provider
        .waitForTransaction(receipt.transactionHash, {
          errorStates: [TransactionExecutionStatus.REVERTED],
        })
        .then(() => {
          notifyConfirmed(receipt.transactionHash);
          refresh();
        })
        .catch((reason: unknown) => {
          notifyFailed(
            receipt.transactionHash,
            reason instanceof Error
              ? reason.message
              : 'The Beacon bid transaction failed.'
          );
        });
      let storageStatus: 'saved' | 'failed' = 'saved';
      try {
        const saved = await saveBeaconBid({
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
      return { ...receipt, storageStatus };
    },
    [
      address,
      chainId,
      invokePrivateActions,
      notifyConfirmed,
      notifyFailed,
      notifySubmitting,
      provider,
      refresh,
      snapshot,
    ]
  );

  return (
    <div className="h-full w-full overflow-y-auto bg-bg font-mono">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(255,255,255,0.055),transparent_24%)]" />
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pt-24">
        <header className="relative border-b border-grid pb-5 pr-24 sm:pb-6 sm:pr-36">
          <div className="text-[9px] tracking-[0.26em] text-dim">
            SEALED SIGNAL AUCTION
          </div>
          <h1 className="mt-1 text-4xl font-bold tracking-[-0.08em] text-fg sm:text-5xl">
            THE BEACON
          </h1>
          <p className="mt-2 max-w-xl text-[11px] leading-5 text-neutral-400">
            Bid for control of the Beacon. The winning Operator may publish one
            paid transmission.
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
          onPlaceBid={canSubmitBid ? placeBid : undefined}
          bidStatusLabel={bidStatusLabel}
          presentation="page"
          title={view === 'history' ? 'WINNER HISTORY' : 'SIGNAL AUCTION'}
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
