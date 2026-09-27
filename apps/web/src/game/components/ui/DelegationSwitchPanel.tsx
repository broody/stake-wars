import type { ExternalDelegationPosition } from '../../services/stakingPoolDiscovery';
import { addressesMatch, formatStrk, shortAddress } from '../../utils/format';
import type { StakingActionPhase } from '../../contexts/useYield';

interface DelegationSwitchPanelProps {
  positions: ExternalDelegationPosition[];
  targetRewardAddress: string | null;
  phase: StakingActionPhase;
  switchingPoolAddress: string | null;
  error: string | null;
  disabledReason: string | null;
  isBusy: boolean;
  onSwitch: (position: ExternalDelegationPosition) => void;
}

export function DelegationSwitchPanel({
  positions,
  targetRewardAddress,
  phase,
  switchingPoolAddress,
  error,
  disabledReason,
  isBusy,
  onSwitch,
}: DelegationSwitchPanelProps) {
  const totalDetected = positions.reduce(
    (total, position) => total + position.totalAmount,
    0n
  );

  return (
    <section className="relative mt-8 overflow-hidden border border-[#ff4a04]/70 bg-[#ff4a04]/[0.035]">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-[#ff4a04]"
        aria-hidden="true"
      />
      <div className="grid gap-5 border-b border-[#ff4a04]/25 px-5 py-5 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="text-[9px] tracking-[0.24em] text-[#ff6a2f]">
            DELEGATION ROUTE DETECTED
          </div>
          <h2 className="mt-2 text-xl tracking-[0.08em] text-white sm:text-2xl">
            BRING YOUR STRK TO STAKE WARS
          </h2>
          <p className="mt-3 max-w-2xl text-[10px] leading-5 text-neutral-400">
            Your wallet has STRK delegated to another validator. Switch it
            directly through Starknet staking&mdash;no withdrawal window and no
            token approval.
          </p>
        </div>
        <div className="border-l border-[#ff4a04]/40 pl-4 text-right">
          <div className="text-[8px] tracking-[0.18em] text-neutral-500">
            OUTSIDE STAKE FOUND
          </div>
          <div className="mt-1 text-lg tabular-nums text-white">
            {formatStrk(totalDetected, 6)} STRK
          </div>
        </div>
      </div>

      <div className="divide-y divide-[#ff4a04]/20">
        {positions.map((position) => {
          const rewardAddressCompatible =
            !targetRewardAddress ||
            addressesMatch(targetRewardAddress, position.rewardAddress);
          const isThisPositionSwitching =
            switchingPoolAddress !== null &&
            addressesMatch(switchingPoolAddress, position.poolAddress);
          const buttonLabel = isThisPositionSwitching
            ? phase === 'submitting'
              ? 'AUTHORIZE SWITCH…'
              : 'CONFIRMING SWITCH…'
            : disabledReason ||
              (!rewardAddressCompatible
                ? 'REWARD ADDRESS MISMATCH'
                : `SWITCH ${formatStrk(position.totalAmount, 6)} STRK`);

          return (
            <div
              key={position.poolAddress}
              className="grid gap-5 px-5 py-5 sm:px-7 xl:grid-cols-[1fr_auto_1fr_auto] xl:items-center"
            >
              <div>
                <div className="text-[8px] tracking-[0.2em] text-neutral-600">
                  CURRENT VALIDATOR
                </div>
                <div
                  className="mt-2 text-xs text-neutral-300"
                  title={position.stakerAddress}
                >
                  {shortAddress(position.stakerAddress)}
                </div>
                <div className="mt-1 text-[9px] tabular-nums text-neutral-500">
                  {formatStrk(position.totalAmount, 6)} STRK DELEGATED
                </div>
              </div>

              <div
                className="flex items-center gap-2 text-[#ff4a04] xl:px-5"
                aria-hidden="true"
              >
                <span className="h-px w-8 bg-[#ff4a04]/50" />
                <span className="text-sm">▶</span>
                <span className="h-px w-8 bg-[#ff4a04]/50" />
              </div>

              <div>
                <div className="text-[8px] tracking-[0.2em] text-[#ff6a2f]">
                  NEW VALIDATOR
                </div>
                <div className="mt-2 text-xs tracking-[0.12em] text-white">
                  STAKE WARS
                </div>
                <div className="mt-1 text-[9px] text-neutral-500">
                  EARNS FORCE FROM THE NEXT EPOCH
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSwitch(position)}
                disabled={
                  isBusy || Boolean(disabledReason) || !rewardAddressCompatible
                }
                className="min-w-56 border border-[#ff4a04] bg-[#ff4a04] px-5 py-4 text-[9px] font-semibold tracking-[0.18em] text-black transition-colors hover:bg-black hover:text-[#ff6a2f] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500"
              >
                {buttonLabel}
              </button>

              {position.unpoolAmount > 0n ? (
                <p className="text-[9px] leading-4 text-amber-400 xl:col-span-4">
                  Includes {formatStrk(position.unpoolAmount, 6)} STRK currently
                  in that pool&rsquo;s exit window; switching keeps it staked.
                </p>
              ) : null}
              {!rewardAddressCompatible ? (
                <p className="text-[9px] leading-4 text-amber-400 xl:col-span-4">
                  This source position pays a different reward address. Align it
                  with your Stake Wars reward address in the official staking
                  interface before switching.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ff4a04]/25 px-5 py-3 text-[8px] tracking-[0.14em] text-neutral-600 sm:px-7">
        <span>ONE WALLET TRANSACTION · OFFICIAL STARKNET CONTRACT</span>
        <span>VALIDATOR CHANGE APPLIES NEXT EPOCH</span>
      </div>
      {error ? (
        <p
          className="border-t border-amber-400/30 px-5 py-3 text-[9px] leading-5 text-amber-400 sm:px-7"
          role="alert"
        >
          SWITCH FAILED · {error}
        </p>
      ) : null}
    </section>
  );
}
