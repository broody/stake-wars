import { useEffect, useMemo, useState } from 'react';
import {
  useProvider,
  useSendTransaction,
} from '@starknetfoundation/starknet-start-react';
import { Link } from 'react-router-dom';
import { TransactionExecutionStatus } from 'starknet';
import type {
  ChallengeParticipantStatus,
  ChallengeStatus,
  SectorStatus,
} from '../../types';
import { useSectors } from '../../contexts/SectorContext';
import { useWallet } from '../../contexts/WalletContext';
import { useTransactionToast } from '../../contexts/TransactionToastContext';
import { config } from '../../services/config';
import {
  getChallengeParticipantStatus,
  getChallengeStatus,
  getSectorStatus,
  getOperatorStatus,
} from '../../services/starknet';
import {
  buildControlCall,
  buildGameActionCalls,
  incrementalCommittedForce,
  stakeDeficit,
} from '../../services/smartCapture';
import {
  addressesMatch,
  formatCountdown,
  formatStrk,
  parseStrk,
  shortAddress,
} from '../../utils/format';
import { stakeRequestSearch } from '../../utils/stakingRequest';

interface CaptureControlProps {
  sectors: SectorStatus[];
  intent?: 'capture' | 'fortify';
}

type Phase = 'idle' | 'submitting' | 'confirming';
type Action = 'capture' | 'reinforce' | 'challenge' | 'settle';

const MAX_U128 = (1n << 128n) - 1n;

export function CaptureControl({ sectors, intent }: CaptureControlProps) {
  const sector = sectors[0];
  const { address, isConnected } = useWallet();
  const {
    operatorStatus,
    refreshSector,
    refreshOperator,
    refreshSectorIndex,
    setSectorInteractionLocked,
  } = useSectors();
  const { provider } = useProvider();
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const transaction = useSendTransaction({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [allocation, setAllocation] = useState('');
  const [collateralId, setCollateralId] = useState('');
  const [challenge, setChallenge] = useState<ChallengeStatus | null>(null);
  const [participant, setParticipant] =
    useState<ChallengeParticipantStatus | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [clockSeconds, setClockSeconds] = useState(() =>
    Math.floor(Date.now() / 1_000)
  );

  const sectorId = sector?.id;
  const activeChallengeId = sector?.activeChallengeId ?? 0n;
  const challenged = activeChallengeId !== 0n;
  const owned = Boolean(
    address && sector && addressesMatch(sector.controller, address)
  );
  const neutral = sector?.captureForce === 0n;
  const expired = Boolean(
    challenged &&
      sector.challengeDeadline &&
      sector.challengeDeadline <= clockSeconds
  );
  const action: Action = expired
    ? 'settle'
    : challenged
      ? 'challenge'
      : neutral
        ? 'capture'
        : owned || intent === 'fortify'
          ? 'reinforce'
          : 'challenge';
  const availableForce = operatorStatus?.availableForce ?? 0n;
  const requiredForce = sector?.requiredStake ?? 0n;
  const currentLeader = Boolean(
    address && challenge && addressesMatch(challenge.leader, address)
  );
  const suggestedAllocation =
    action === 'capture' || action === 'challenge' ? requiredForce : 0n;

  useEffect(() => {
    if (!challenged || !sector?.challengeDeadline) return;

    const updateClock = () => setClockSeconds(Math.floor(Date.now() / 1_000));
    updateClock();
    const interval = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(interval);
  }, [challenged, sector?.challengeDeadline]);

  useEffect(() => {
    setError(null);
    setCollateralId('');
    setAllocation(
      suggestedAllocation > 0n ? formatStrk(suggestedAllocation, 18) : ''
    );
  }, [action, sector?.id, suggestedAllocation]);

  useEffect(() => {
    const controller = new AbortController();
    if (!challenged || sectorId === undefined) {
      setChallenge(null);
      setParticipant(null);
      setChallengeLoading(false);
      return () => controller.abort();
    }
    setChallengeLoading(true);
    Promise.all([
      getChallengeStatus(activeChallengeId, controller.signal),
      address
        ? getChallengeParticipantStatus(
            activeChallengeId,
            address,
            controller.signal
          )
        : Promise.resolve(null),
    ])
      .then(([nextChallenge, nextParticipant]) => {
        setChallenge(nextChallenge);
        setParticipant(nextParticipant);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to read the open contest.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setChallengeLoading(false);
      });
    return () => controller.abort();
  }, [activeChallengeId, address, challenged, sectorId]);

  const parsedAllocation = useMemo(() => {
    if (!allocation.trim()) return { value: 0n, error: null };
    try {
      const value = parseStrk(allocation, 'FORCE');
      return value > MAX_U128
        ? { value: null, error: 'Allocation is too large.' }
        : { value, error: null };
    } catch (reason) {
      return {
        value: null,
        error:
          reason instanceof Error ? reason.message : 'Enter a valid amount.',
      };
    }
  }, [allocation]);
  const selectedAllocation = parsedAllocation.value;
  const personalCommitment = participant?.joined
    ? participant.committedForce
    : 0n;
  const requestedForce = action === 'settle' ? 0n : (selectedAllocation ?? 0n);
  const additionalCommittedForce =
    action === 'challenge'
      ? incrementalCommittedForce(requestedForce, personalCommitment)
      : requestedForce;
  const deficit = stakeDeficit(additionalCommittedForce, availableForce);
  const currentPosition =
    action === 'reinforce' ? (sector?.captureForce ?? 0n) : 0n;
  const projectedCommitment = currentPosition + requestedForce;

  const commonDisabledReason = useMemo(() => {
    if (sectors.length !== 1 || !sector) return 'SELECT ONE SECTOR';
    if (!isConnected || !address) return 'CONNECT OPERATOR';
    if (action === 'settle') return null;
    if (!operatorStatus) return 'WAITING FOR OPERATOR STATE';
    if (operatorStatus.retired) return 'ADDRESS PERMANENTLY RETIRED';
    if (operatorStatus.needsSync) return 'OPERATOR SYNC REQUIRED';
    if (challenged && challengeLoading) return 'READING OPEN CONTEST';
    if (action === 'challenge' && currentLeader)
      return 'YOU ARE CURRENTLY LEADING';
    if (parsedAllocation.error) return 'ENTER A VALID FORCE AMOUNT';
    return null;
  }, [
    action,
    address,
    challenged,
    challengeLoading,
    sectors.length,
    currentLeader,
    isConnected,
    operatorStatus,
    parsedAllocation.error,
    sector,
  ]);

  const primaryDisabledReason = useMemo(() => {
    if (commonDisabledReason) return commonDisabledReason;
    if (action === 'settle') return null;
    if (selectedAllocation === null || selectedAllocation === 0n)
      return 'ENTER FORCE AMOUNT';
    if (
      (action === 'capture' || action === 'challenge') &&
      selectedAllocation < requiredForce
    ) {
      return `COMMIT AT LEAST ${formatStrk(requiredForce, 18)} FORCE`;
    }
    return null;
  }, [action, commonDisabledReason, requiredForce, selectedAllocation]);

  const collateralCommonDisabledReason = commonDisabledReason;

  const submit = async (withSacrifice = false) => {
    if (
      !sector ||
      !address ||
      !config.controlSystemAddress ||
      (withSacrifice ? collateralCommonDisabledReason : primaryDisabledReason)
    ) {
      return;
    }
    const allocationAmount = selectedAllocation ?? 0n;
    setError(null);
    setPhase('submitting');
    setSectorInteractionLocked(true);
    let hash: string | null = null;
    try {
      const freshSector = await getSectorStatus(sector.id);
      let calls;
      let label: string;

      if (action === 'settle') {
        if (
          freshSector.activeChallengeId === 0n ||
          !freshSector.challengeDeadline ||
          freshSector.challengeDeadline > Date.now() / 1_000
        ) {
          throw new Error(
            'The response window is still active or already settled.'
          );
        }
        calls = buildControlCall(
          config.controlSystemAddress,
          'settle_challenge',
          [String(sector.id)]
        );
        label = 'CONTEST SETTLEMENT';
      } else {
        if (!operatorStatus) throw new Error('Operator state is unavailable.');
        const freshOperator = await getOperatorStatus(address);
        if (action === 'reinforce') {
          if (allocationAmount === 0n) {
            throw new Error('Enter the additional FORCE allocation.');
          }
          const freshDeficit = stakeDeficit(
            allocationAmount,
            freshOperator.availableForce
          );
          if (freshDeficit > 0n) {
            throw new Error(
              `Generate ${formatStrk(freshDeficit, 18)} more FORCE before fortifying.`
            );
          }
          calls = buildGameActionCalls({
            controlSystemAddress: config.controlSystemAddress,
            entrypoint: 'reinforce',
            calldata: [String(sector.id), allocationAmount.toString()],
          });
          label = 'FORTIFICATION';
        } else if (action === 'challenge') {
          if (
            freshSector.activeChallengeId !== 0n &&
            freshSector.challengeDeadline &&
            freshSector.challengeDeadline <= Date.now() / 1_000
          ) {
            throw new Error('The response window ended. Settle the contest.');
          }
          let previousPersonalCommitment = 0n;
          if (freshSector.activeChallengeId !== 0n) {
            const freshChallenge = await getChallengeStatus(
              freshSector.activeChallengeId
            );
            if (addressesMatch(freshChallenge.leader, address)) {
              throw new Error('You are already the current leader.');
            }
            const freshParticipant = await getChallengeParticipantStatus(
              freshSector.activeChallengeId,
              address
            );
            if (freshParticipant.joined && !freshParticipant.resolved) {
              previousPersonalCommitment = freshParticipant.committedForce;
            }
          }

          let sacrificedForce = 0n;
          let source: number | null = null;
          if (withSacrifice) {
            source = Number(collateralId);
            if (
              !Number.isInteger(source) ||
              source < 0 ||
              source === sector.id
            ) {
              throw new Error(
                'Enter a different owned Sector ID to sacrifice.'
              );
            }
            const sourceSector = await getSectorStatus(source);
            if (
              !addressesMatch(sourceSector.controller, address) ||
              sourceSector.activeChallengeId !== 0n
            ) {
              throw new Error(
                'The sacrificed Sector must be uncontested and owned by you.'
              );
            }
            sacrificedForce = sourceSector.captureForce;
          }
          if (allocationAmount < freshSector.requiredStake) {
            throw new Error(
              `Challenge force must reach at least ${formatStrk(
                freshSector.requiredStake,
                18
              )} FORCE.`
            );
          }
          const addedCommittedForce = incrementalCommittedForce(
            allocationAmount,
            previousPersonalCommitment
          );
          const allocationAfterSacrifice =
            addedCommittedForce > sacrificedForce
              ? addedCommittedForce - sacrificedForce
              : 0n;
          const freshDeficit = stakeDeficit(
            allocationAfterSacrifice,
            freshOperator.availableForce
          );
          if (freshDeficit > 0n) {
            throw new Error(
              `Generate ${formatStrk(freshDeficit, 18)} more FORCE before challenging.`
            );
          }
          calls = buildGameActionCalls({
            controlSystemAddress: config.controlSystemAddress,
            entrypoint: withSacrifice
              ? 'challenge_with_sacrifice'
              : 'challenge',
            calldata: withSacrifice
              ? [String(sector.id), String(source), allocationAmount.toString()]
              : [String(sector.id), allocationAmount.toString()],
          });
          label = challenged
            ? withSacrifice
              ? 'SACRIFICED + ESCALATED CHALLENGE'
              : 'ESCALATED CHALLENGE'
            : withSacrifice
              ? 'SACRIFICED + INITIATED CHALLENGE'
              : 'INITIATED CHALLENGE';
        } else {
          if (allocationAmount < freshSector.requiredStake) {
            throw new Error(
              `Capture requires ${formatStrk(
                freshSector.requiredStake,
                18
              )} FORCE.`
            );
          }
          const freshDeficit = stakeDeficit(
            allocationAmount,
            freshOperator.availableForce
          );
          if (freshDeficit > 0n) {
            throw new Error(
              `Generate ${formatStrk(freshDeficit, 18)} more FORCE before capturing.`
            );
          }
          calls = buildGameActionCalls({
            controlSystemAddress: config.controlSystemAddress,
            entrypoint: 'capture',
            calldata: [String(sector.id), allocationAmount.toString()],
          });
          label = 'CAPTURE';
        }
      }

      const result = await transaction.sendAsync(calls);
      hash = result.transaction_hash;
      notifySubmitting(
        hash,
        `SECTOR-${String(sector.id).padStart(4, '0')} ${label}`
      );
      setPhase('confirming');
      await provider.waitForTransaction(hash, {
        errorStates: [TransactionExecutionStatus.REVERTED],
      });
      notifyConfirmed(hash);
      refreshSector();
      refreshOperator();
      refreshSectorIndex();
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'Transaction failed.';
      setError(message);
      if (hash) notifyFailed(hash, message);
    } finally {
      setPhase('idle');
      setSectorInteractionLocked(false);
    }
  };

  const actionLabel =
    action === 'settle'
      ? 'SETTLE CONTEST'
      : action === 'challenge'
        ? 'CHALLENGE'
        : action === 'reinforce'
          ? 'FORTIFY'
          : action.toUpperCase();
  const label =
    phase === 'submitting'
      ? 'AUTHORIZING…'
      : phase === 'confirming'
        ? 'CONFIRMING…'
        : primaryDisabledReason
          ? `${actionLabel} · ${primaryDisabledReason}`
          : action === 'reinforce'
            ? `${actionLabel} WITH ${formatStrk(
                selectedAllocation ?? 0n,
                18
              )} FORCE`
            : actionLabel;

  return (
    <section className="mt-4 border border-neutral-600 bg-neutral-950">
      <header className="flex items-center justify-between gap-3 border-b border-grid px-3 py-2 text-[10px] tracking-[0.18em] text-neutral-300">
        <span>
          {challenged
            ? owned
              ? 'DEFEND SECTOR'
              : 'CONTEST SECTOR'
            : neutral
              ? 'CAPTURE SECTOR'
              : owned
                ? 'FORTIFY SECTOR'
                : 'CHALLENGE SECTOR'}
        </span>
        <span className="text-[8px] text-dim">FORCE ACTION</span>
      </header>
      <div className="space-y-2 px-3 py-3 text-[9px] tracking-[0.12em] text-neutral-500">
        {challenged && challenge && (
          <>
            <div className="flex justify-between gap-4">
              <span>CURRENT LEADER</span>
              <span className="flex items-baseline gap-2 text-fg">
                <span title={challenge.leader}>
                  {shortAddress(challenge.leader)}
                </span>
                {currentLeader && <span className="text-amber-300">(YOU)</span>}
              </span>
            </div>
            {sector.challengeDeadline && (
              <div className="flex justify-between gap-4">
                <span>TIME LEFT</span>
                <span className="text-fg tabular-nums">
                  {formatCountdown(sector.challengeDeadline - clockSeconds)}
                </span>
              </div>
            )}
          </>
        )}
        {action !== 'settle' && (
          <>
            <label
              className="block pt-1 text-dim"
              htmlFor={`allocation-${sector?.id ?? 'none'}`}
            >
              {action === 'reinforce'
                ? 'ADDITIONAL FORCE'
                : action === 'challenge'
                  ? 'CHALLENGE FORCE'
                  : 'CAPTURE FORCE'}
            </label>
            <div className="flex items-center border border-neutral-700 bg-black focus-within:border-white">
              <input
                id={`allocation-${sector?.id ?? 'none'}`}
                value={allocation}
                onChange={(event) => setAllocation(event.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-fg outline-none"
              />
              <span className="px-2 text-dim">FORCE</span>
            </div>
            {parsedAllocation.error && (
              <div className="leading-relaxed text-amber-400">
                {parsedAllocation.error}
              </div>
            )}
            {action === 'reinforce' && (
              <div className="flex justify-between gap-4">
                <span>RESULTING GARRISON</span>
                <span>{formatStrk(projectedCommitment, 18)} FORCE</span>
              </div>
            )}
            {(action === 'capture' || action === 'challenge') && (
              <>
                <div className="flex justify-between gap-4">
                  <span>MINIMUM</span>
                  <span>{formatStrk(requiredForce, 18)} FORCE</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>AVAILABLE</span>
                  <span>{formatStrk(availableForce, 18)} FORCE</span>
                </div>
              </>
            )}
          </>
        )}
        {error && (
          <div className="border-l-2 border-amber-400 pl-2 leading-relaxed text-amber-400">
            ACTION FAILED · {error}
          </div>
        )}
        {!(action === 'challenge' && currentLeader) &&
          (deficit > 0n && action !== 'settle' && !primaryDisabledReason ? (
            <Link
              to={{
                pathname: '/staking',
                search: stakeRequestSearch(deficit),
              }}
              className="force-alert-button mt-2 block w-full border px-3 py-2.5 text-center text-[10px] font-semibold tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2"
            >
              GENERATE {formatStrk(deficit, 18)} MORE FORCE
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={Boolean(primaryDisabledReason) || phase !== 'idle'}
              className="mt-2 w-full border border-white bg-white px-3 py-2.5 text-[10px] font-semibold tracking-[0.18em] text-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500"
            >
              {label}
            </button>
          ))}
      </div>
    </section>
  );
}
