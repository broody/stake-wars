import { FeaturedValidatorPanel } from '../components/network/FeaturedValidatorPanel';
import { NetworkOverview } from '../components/network/NetworkOverview';
import { StakedHistoryPanel } from '../components/network/StakedHistoryPanel';
import { UnstakingPanel } from '../components/network/UnstakingPanel';
import { ValidatorTable } from '../components/network/ValidatorTable';
import { useStakingDashboard } from '../hooks/useStakingDashboard';
import type { StakingSnapshot } from '../types/staking';
import {
  formatAmount,
  formatDate,
  formatDuration,
  parseAmount,
} from '../utils/stakingFormat';
import { voyagerContractUrl } from '../utils/voyager';
import {
  Callout,
  Eyebrow,
  ExternalLink,
  PageTitle,
  Panel,
  Spinner,
} from '../../ui';

export function Network() {
  const { snapshot, snapshotError, isLoading, history, historyError } =
    useStakingDashboard();

  return (
    <div className="h-full w-full overflow-y-auto bg-surface font-mono">
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pt-24">
        <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>STARKNET STAKING · READ LIVE FROM CHAIN</Eyebrow>
            <PageTitle className="mt-3">NETWORK</PageTitle>
          </div>
          {snapshot ? (
            <div className="space-y-1 text-label text-fg-subtle sm:text-right">
              <div>
                {snapshot.network.replace('SN_', '')} · BLOCK{' '}
                <span className="text-fg-secondary">
                  {snapshot.block.number.toLocaleString('en-US')}
                </span>
              </div>
              <div>
                UPDATED {new Date(snapshot.observedAt).toLocaleTimeString()}
              </div>
            </div>
          ) : null}
        </header>

        {snapshotError ? (
          <Callout role="status" tone="warning" className="mt-6">
            {snapshot ? 'LIVE UPDATE FAILED · SHOWING LAST GOOD DATA · ' : ''}
            {snapshotError.toUpperCase()}
          </Callout>
        ) : null}

        {!snapshot ? (
          <div className="flex min-h-[40vh] items-center justify-center text-label text-fg-subtle">
            {isLoading ? (
              <span>
                <Spinner className="mr-3" />
                READING THE STAKING CONTRACTS…
              </span>
            ) : (
              'STAKING STATISTICS ARE UNAVAILABLE'
            )}
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            <IndexBanner snapshot={snapshot} />
            <FeaturedValidatorPanel
              snapshot={snapshot}
              history={history?.points ?? []}
            />
            <NetworkOverview snapshot={snapshot} />
            <StakedHistoryPanel history={history} error={historyError} />
            <UnstakingPanel
              snapshot={snapshot}
              history={history}
              featuredAddress={snapshot.featured?.address ?? null}
            />
            <ValidatorTable snapshot={snapshot} />
            <ProtocolParameters snapshot={snapshot} />
          </div>
        )}
      </div>
    </div>
  );
}

function IndexBanner({ snapshot }: { snapshot: StakingSnapshot }) {
  const { index } = snapshot;
  if (index.stakingSynced && index.membersSynced && index.historySynced)
    return null;
  const span = Math.max(1, index.headBlock - index.deploymentBlock);
  const percent = (block: number) =>
    Math.max(0, Math.min(100, ((block - index.deploymentBlock) / span) * 100));
  const tasks = [
    !index.stakingSynced &&
      `VALIDATORS & EXITS ${percent(index.stakingBlock).toFixed(0)}% (LIST MAY BE INCOMPLETE)`,
    !index.membersSynced &&
      `DELEGATORS ${percent(index.membersBlock).toFixed(0)}%`,
    !index.historySynced &&
      `HISTORY ${index.historyThrough ? `THROUGH ${formatDate(index.historyThrough)}` : 'STARTING'}`,
  ].filter(Boolean);

  return (
    <Panel
      as="div"
      role="status"
      className="flex items-start gap-3 px-4 py-3 text-label text-fg-muted"
    >
      <Spinner className="mt-0.5" />
      <span>INDEXING THE STAKING CONTRACTS · {tasks.join(' · ')}</span>
    </Panel>
  );
}

function ProtocolParameters({ snapshot }: { snapshot: StakingSnapshot }) {
  const { parameters, epoch, contracts } = snapshot;
  const items = [
    [
      'MINIMUM VALIDATOR STAKE',
      `${formatAmount(parseAmount(parameters.minStake))} STRK`,
    ],
    ['EXIT WAIT WINDOW', formatDuration(parameters.exitWaitWindowSeconds)],
    [
      'EPOCH LENGTH',
      `${epoch.lengthBlocks.toLocaleString('en-US')} BLOCKS · ~${formatDuration(epoch.durationSeconds)}`,
    ],
    ['YEARLY MINT', `${formatAmount(parseAmount(parameters.yearlyMint))} STRK`],
    [
      'REWARD SPLIT',
      `${100 - parameters.btcRewardSharePercent}% STRK · ${parameters.btcRewardSharePercent}% BTC`,
    ],
  ];
  return (
    <Panel aria-labelledby="protocol-parameters">
      <h2
        id="protocol-parameters"
        className="border-b border-line px-5 py-3 text-label text-fg-subtle"
      >
        PROTOCOL PARAMETERS
      </h2>
      <dl className="grid sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([label, value]) => (
          <div
            key={label}
            className="border-b border-line px-5 py-3 sm:odd:border-r lg:border-r"
          >
            <dt className="text-label text-fg-subtle">{label}</dt>
            <dd className="mt-1 text-body text-fg-secondary">{value}</dd>
          </div>
        ))}
        <div className="border-b border-line px-5 py-3">
          <dt className="text-label text-fg-subtle">STAKING CONTRACT</dt>
          <dd className="mt-1 text-body text-fg-secondary">
            <ExternalLink href={voyagerContractUrl(contracts.staking)}>
              {contracts.staking.slice(0, 10)}…{contracts.staking.slice(-6)}
            </ExternalLink>
          </dd>
        </div>
      </dl>
      <p className="px-5 py-3 text-caption text-fg-subtle">
        Every figure is read from Starknet&rsquo;s official staking,
        delegation-pool, and minting contracts. USD values use the Pragma
        oracle.
      </p>
    </Panel>
  );
}
