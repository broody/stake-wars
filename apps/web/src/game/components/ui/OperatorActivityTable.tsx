import { useCallback, useEffect, useState } from 'react';
import type { OperatorActivity, OperatorActivityType } from '../../types';
import { getOperatorActivity, getYieldClaims } from '../../services/torii';
import { formatStrk, shortAddress } from '../../utils/format';
import { voyagerTransactionUrl } from '../../utils/voyager';

interface OperatorActivityTableProps {
  operator: string;
  variant?: 'page' | 'modal';
}

const eventPresentation: Record<
  OperatorActivityType,
  { marker: string; label: string; markerClassName: string }
> = {
  capture: {
    marker: '+',
    label: 'CAPTURED',
    markerClassName: 'border-white text-white',
  },
  loss: {
    marker: '!',
    label: 'DISPLACED',
    markerClassName: 'border-amber-500 text-amber-400',
  },
  reinforcement: {
    marker: '↑',
    label: 'REINFORCED',
    markerClassName: 'border-white text-white',
  },
  release: {
    marker: '−',
    label: 'RELEASED',
    markerClassName: 'border-neutral-600 text-neutral-400',
  },
  redeployment: {
    marker: '→',
    label: 'REDEPLOYED',
    markerClassName: 'border-white text-white',
  },
  disqualification: {
    marker: '×',
    label: 'COMMAND RESET',
    markerClassName: 'border-amber-500 text-amber-400',
  },
  yield_claim: {
    marker: '◇',
    label: 'YIELD CLAIMED',
    markerClassName: 'border-white text-white',
  },
};

function pointLabel(id: number | undefined): string {
  return id === undefined ? '—' : `CP-${id.toString().padStart(4, '0')}`;
}

function eventDetail(activity: OperatorActivity): string {
  switch (activity.type) {
    case 'capture':
      return activity.counterparty ? 'TOOK HIGH GROUND' : 'NEUTRAL POINT';
    case 'loss':
      return 'STAKE RETURNED TO AVAILABLE';
    case 'reinforcement':
      return activity.secondaryAmount === undefined
        ? 'ALLOCATION INCREASED'
        : `NEW TOTAL ${formatStrk(activity.secondaryAmount)} STRK`;
    case 'release':
      return 'STAKE RETURNED TO AVAILABLE';
    case 'redeployment':
      return `${pointLabel(activity.controlPointId)} → ${pointLabel(
        activity.destinationControlPointId
      )}`;
    case 'disqualification':
      return `${activity.affectedPointCount ?? 0} POINTS INVALIDATED`;
    case 'yield_claim':
      return 'VALIDATOR REWARD TRANSFERRED';
  }
}

function stakeDetail(activity: OperatorActivity): string {
  const amount = `${formatStrk(
    activity.amount,
    activity.type === 'yield_claim' ? 6 : 4
  )} STRK`;
  switch (activity.type) {
    case 'loss':
    case 'release':
      return `${amount} FREED`;
    case 'reinforcement':
    case 'yield_claim':
      return `+${amount}`;
    case 'disqualification':
      return `${amount} RESET`;
    default:
      return amount;
  }
}

function counterpartyDetail(activity: OperatorActivity): string {
  if (!activity.counterparty) return '—';
  if (activity.type === 'yield_claim') {
    return `TO ${shortAddress(activity.counterparty)}`;
  }
  const prefix = activity.type === 'loss' ? 'BY' : 'FROM';
  return `${prefix} ${shortAddress(activity.counterparty)}`;
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to read event data.';
}

async function loadOperatorActivity(
  operator: string,
  signal: AbortSignal
): Promise<{ activity: OperatorActivity[]; warning: string | null }> {
  const [controlResult, claimResult] = await Promise.allSettled([
    getOperatorActivity(operator, signal),
    getYieldClaims(operator, signal),
  ]);

  if (
    controlResult.status === 'rejected' &&
    claimResult.status === 'rejected'
  ) {
    throw controlResult.reason;
  }

  const controlActivity =
    controlResult.status === 'fulfilled' ? controlResult.value : [];
  const claimActivity: OperatorActivity[] =
    claimResult.status === 'fulfilled'
      ? claimResult.value.map((claim) => ({
          id: claim.id,
          type: 'yield_claim',
          blockNumber: claim.blockNumber,
          eventIndex: claim.eventIndex,
          transactionHash: claim.transactionHash,
          amount: claim.amount,
          counterparty: claim.rewardAddress,
        }))
      : [];
  const warning =
    controlResult.status === 'rejected'
      ? `CONTROL EVENTS UNAVAILABLE · ${failureMessage(controlResult.reason)}`
      : claimResult.status === 'rejected'
        ? `YIELD EVENTS UNAVAILABLE · ${failureMessage(claimResult.reason)}`
        : null;

  return {
    activity: [...controlActivity, ...claimActivity].sort(
      (left, right) =>
        right.blockNumber - left.blockNumber ||
        right.eventIndex - left.eventIndex
    ),
    warning,
  };
}

export function OperatorActivityTable({
  operator,
  variant = 'page',
}: OperatorActivityTableProps) {
  const [activity, setActivity] = useState<OperatorActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setActivity(null);
    setError(null);
    setWarning(null);

    loadOperatorActivity(operator, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setActivity(result.activity);
        setWarning(result.warning);
      })
      .catch((activityError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            activityError instanceof Error
              ? activityError.message
              : 'Unable to read Operator activity.'
          );
        }
      });

    return () => controller.abort();
  }, [operator, revision]);

  return (
    <section
      className={variant === 'page' ? 'mt-12 border-t border-grid pt-6' : ''}
    >
      <div className="mb-4 flex items-end justify-between gap-4">
        {variant === 'page' ? (
          <div>
            <div className="text-[10px] tracking-[0.24em] text-dim">
              DOJO EVENT LOG
            </div>
            <h2 className="mt-2 text-lg tracking-widest text-white">
              OPERATOR ACTIVITY
            </h2>
          </div>
        ) : (
          <div className="text-[9px] tracking-[0.2em] text-neutral-600">
            ALL INDEXED OPERATOR EVENTS
          </div>
        )}
        <button
          type="button"
          onClick={refresh}
          className="border border-neutral-700 px-3 py-2 text-[10px] tracking-[0.2em] text-neutral-400 transition-colors hover:border-white hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          REFRESH LOG
        </button>
      </div>

      {activity === null && !error && (
        <div className="flex items-center gap-3 border-y border-grid py-10 text-xs tracking-wider text-dim">
          <span className="h-1.5 w-1.5 animate-pulse bg-white" />
          READING INDEXED EVENTS…
        </div>
      )}

      {error && (
        <div className="border border-amber-500/40 p-4 text-xs">
          <p className="text-amber-400">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-3 text-[10px] tracking-[0.2em] text-white underline decoration-neutral-700 underline-offset-4 hover:decoration-white"
          >
            RETRY EVENT READ
          </button>
        </div>
      )}

      {warning && !error && (
        <div className="mb-4 border-l-2 border-amber-400 pl-3 text-[10px] leading-relaxed text-amber-400">
          PARTIAL EVENT LOG · {warning}
        </div>
      )}

      {activity?.length === 0 && !error && (
        <div className="border-y border-grid py-10 text-sm text-neutral-500">
          No activity events recorded for this Operator yet. Capture a Control
          Point or claim yield to begin the log.
        </div>
      )}

      {activity && activity.length > 0 && !error && (
        <div className="activity-scrollbar overflow-x-auto border-l border-t border-grid">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <caption className="sr-only">
              Captures, displacements, reinforcements, releases, redeployments,
              command resets, and yield claims for this Operator
            </caption>
            <thead>
              <tr className="text-[9px] tracking-[0.2em] text-dim">
                <th className="border-b border-r border-grid px-4 py-3 font-normal">
                  EVENT
                </th>
                <th className="border-b border-r border-grid px-4 py-3 font-normal">
                  TARGET
                </th>
                <th className="border-b border-r border-grid px-4 py-3 font-normal">
                  VALUE
                </th>
                <th className="border-b border-r border-grid px-4 py-3 font-normal">
                  COUNTERPARTY
                </th>
                <th className="border-b border-r border-grid px-4 py-3 text-right font-normal">
                  BLOCK
                </th>
              </tr>
            </thead>
            <tbody>
              {activity.map((item) => {
                const presentation = eventPresentation[item.type];
                return (
                  <tr
                    key={item.id}
                    className="group text-xs transition-colors hover:bg-white/[0.025]"
                  >
                    <td className="border-b border-r border-grid px-4 py-4">
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center border text-xs ${presentation.markerClassName}`}
                          aria-hidden="true"
                        >
                          {presentation.marker}
                        </span>
                        <div>
                          <div className="tracking-wider text-white">
                            {presentation.label}
                          </div>
                          <div className="mt-1 text-[9px] tracking-wider text-dim">
                            {eventDetail(item)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-r border-grid px-4 py-4 tracking-wider text-neutral-300">
                      {item.type === 'redeployment'
                        ? pointLabel(item.destinationControlPointId)
                        : pointLabel(item.controlPointId)}
                    </td>
                    <td className="border-b border-r border-grid px-4 py-4 text-neutral-300">
                      {stakeDetail(item)}
                    </td>
                    <td className="border-b border-r border-grid px-4 py-4 text-neutral-500">
                      {counterpartyDetail(item)}
                    </td>
                    <td className="border-b border-r border-grid px-4 py-4 text-right">
                      <a
                        href={voyagerTransactionUrl(item.transactionHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-500 underline decoration-transparent underline-offset-4 transition-colors group-hover:text-neutral-300 hover:decoration-neutral-500 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
                        aria-label={`Open transaction for block ${item.blockNumber} in Voyager`}
                      >
                        #{item.blockNumber.toLocaleString()} ↗
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
