import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useProvider,
  useSendTransaction,
  useStrk20InvokeTransaction,
  useWalletRequest,
} from '@starknetfoundation/starknet-start-react';
import type { STRK20_ACTION } from '@starknet-io/types-js';
import { cairo, TransactionExecutionStatus } from 'starknet';
import { config } from '../../src/game/services/config';
import { formatStrk, parseStrk } from '../../src/game/utils/format';
import {
  voyagerContractUrl,
  voyagerTransactionUrl,
} from '../../src/game/utils/voyager';
import {
  Button,
  Callout,
  ExternalLink,
  fieldStyles,
  PageTitle,
  Panel,
  PanelSection,
  SegmentedControl,
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../src/ui';

const STRK =
  '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
// The STRK20 privacy pool on mainnet. It charges one flat fee per transaction.
const PRIVACY_POOL =
  '0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a';
/** STRK20 actions need Wallet API 0.10.3 or later in the connected wallet. */
const STRK20_API = [0, 10, 3];
/** How long to wait for a relayed private transaction to show at the RPC. */
const PRIVATE_CONFIRM_TIMEOUT_MS = 5 * 60_000;

interface Bot {
  name: string;
  address: string;
  type: string;
}
interface BotStatus {
  balance: bigint | null;
  deployed: boolean | null;
}
type Phase = 'idle' | 'signing' | 'confirming' | 'done' | 'unconfirmed';
type Mode = 'private' | 'public';

function supportsStrk20(versions: readonly string[]) {
  return versions.some((version) => {
    const parts = version.split('.').map(Number);
    for (let i = 0; i < STRK20_API.length; i++) {
      const part = parts[i] ?? 0;
      if (part !== STRK20_API[i]) return part > STRK20_API[i];
    }
    return true;
  });
}

const short = (address: string) =>
  address.slice(0, 8) + '…' + address.slice(-6);

function amountOrError(text: string): bigint | string {
  try {
    const amount = parseStrk(text);
    return amount > 0n ? amount : 'Enter an amount above zero.';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function FundBots() {
  const account = useAccount();
  const { connectors, connectAsync, isPending } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { provider } = useProvider();
  const transaction = useSendTransaction({});
  const privateTransaction = useStrk20InvokeTransaction({});
  const walletApi = useWalletRequest({ type: 'wallet_supportedWalletApi' });

  const [bots, setBots] = useState<Bot[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, BotStatus>>({});
  const [rpcDown, setRpcDown] = useState(false);
  const [amountText, setAmountText] = useState('0.2');
  const [phase, setPhase] = useState<Phase>('idle');
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('private');
  const [strk20, setStrk20] = useState<boolean | null>(null);
  const [poolFee, setPoolFee] = useState<bigint | null>(null);

  // Ask the wallet which Wallet API versions it speaks. A data call would
  // prompt the user for consent, so never probe with one.
  const { requestAsync: walletVersions } = walletApi;
  useEffect(() => {
    setStrk20(null);
    if (!account.isConnected) return;
    walletVersions()
      .then((versions) => setStrk20(supportsStrk20(versions)))
      .catch(() => setStrk20(false));
  }, [account.isConnected, account.address, walletVersions]);

  useEffect(() => {
    provider
      .callContract({
        contractAddress: PRIVACY_POOL,
        entrypoint: 'get_fee_amount',
        calldata: [],
      })
      .then(([fee]) => setPoolFee(BigInt(fee)))
      .catch(() => setPoolFee(null));
  }, [provider]);

  // The address list is written locally by `pnpm fund-bots` and never committed.
  useEffect(() => {
    fetch('./bots.local.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Bot[]>;
      })
      .then(setBots)
      .catch(() =>
        setLoadError(
          'No bot list found. Start this page with `pnpm fund-bots` from apps/web, which writes tools/fund-bots/bots.local.json from your sncast accounts file.'
        )
      );
  }, []);

  const refresh = useCallback(async () => {
    if (!bots) return;
    const next: Record<string, BotStatus> = {};
    await Promise.all(
      bots.map(async (bot) => {
        const entry: BotStatus = { balance: null, deployed: null };
        try {
          const [low, high] = await provider.callContract({
            contractAddress: STRK,
            entrypoint: 'balance_of',
            calldata: [bot.address],
          });
          entry.balance = BigInt(low) + (BigInt(high) << 128n);
        } catch {
          // Shown as unknown.
        }
        try {
          await provider.getClassHashAt(bot.address);
          entry.deployed = true;
        } catch (error) {
          // Only "contract not found" means undeployed. Anything else is unknown.
          if (/contract not found/i.test(String(error))) entry.deployed = false;
        }
        next[bot.address] = entry;
      })
    );
    setStatus(next);
    setRpcDown(Object.values(next).every((entry) => entry.balance === null));
  }, [bots, provider]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const amount = amountOrError(amountText);
  const total =
    typeof amount === 'bigint' && bots ? amount * BigInt(bots.length) : null;
  const onMainnet =
    account.chainId !== undefined &&
    account.chainId === BigInt('0x534e5f4d41494e'); // 'SN_MAIN'

  const calls = useMemo(
    () =>
      typeof amount === 'bigint' && bots
        ? bots.map((bot) => {
            const { low, high } = cairo.uint256(amount);
            return {
              contractAddress: STRK,
              entrypoint: 'transfer',
              calldata: [bot.address, low.toString(), high.toString()],
            };
          })
        : [],
    [amount, bots]
  );

  // One withdrawal from the shielded balance to each bot, all in one
  // privacy-pool transaction, so the pool fee is paid once.
  const withdrawals = useMemo<STRK20_ACTION[]>(
    () =>
      typeof amount === 'bigint' && bots
        ? bots.map((bot) => ({
            type: 'withdraw',
            token: STRK,
            amount: '0x' + amount.toString(16),
            recipient: bot.address,
          }))
        : [],
    [amount, bots]
  );

  async function send() {
    setError(null);
    setHash(null);
    setPhase('signing');
    try {
      const result =
        mode === 'private'
          ? await privateTransaction.invokeAsync(withdrawals)
          : await transaction.sendAsync(calls);
      setHash(result.transaction_hash);
      setPhase('confirming');
      const confirmed = provider.waitForTransaction(result.transaction_hash, {
        errorStates: [TransactionExecutionStatus.REVERTED],
      });
      // A relayer submits private transactions, and the hash can take a while
      // to appear. A timeout means submitted but not yet visible.
      const visible = await Promise.race([
        confirmed.then(() => true),
        new Promise<false>((resolve) =>
          setTimeout(() => resolve(false), PRIVATE_CONFIRM_TIMEOUT_MS)
        ),
      ]);
      setPhase(visible ? 'done' : 'unconfirmed');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setPhase('idle');
    }
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6 text-fg">
      <PageTitle>FUND BOT WALLETS</PageTitle>
      <p className="text-body text-fg-secondary">
        Sends STRK from the connected wallet to every Survivor house bot in one
        transaction. Network: {config.starknetChainId}.
      </p>

      <SegmentedControl
        label="Funding route"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'private', label: 'PRIVATE (SHIELDED STRK)' },
          { value: 'public', label: 'PUBLIC (WALLET STRK)' },
        ]}
      />
      {mode === 'private' ? (
        <p className="text-caption text-fg-muted">
          Withdraws from your shielded balance in the STRK20 privacy pool to
          each bot, in one pool transaction. Nothing onchain links the bots to
          your wallet. The withdrawals themselves are public: anyone can see
          each bot received STRK from the pool, in the same transaction, so the
          bots are visibly linked to each other.
        </p>
      ) : (
        <p className="text-caption text-fg-muted">
          Transfers public STRK from your wallet. Anyone can see your wallet
          funded every bot.
        </p>
      )}

      {loadError && (
        <Callout tone="danger" title="BOT LIST MISSING">
          {loadError}
        </Callout>
      )}

      <Panel>
        <PanelSection>
          {account.isConnected && account.address ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="text-body">
                {account.connector?.name} connected:{' '}
                <ExternalLink href={voyagerContractUrl(account.address)}>
                  {short(account.address)}
                </ExternalLink>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void disconnectAsync()}
              >
                DISCONNECT
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {connectors.length === 0 && (
                <span className="text-body text-fg-muted">
                  No Starknet wallet found in this browser.
                </span>
              )}
              {connectors.map((connector) => (
                <Button
                  key={connector.name}
                  variant="outline"
                  busy={isPending}
                  onClick={() => void connectAsync({ connector })}
                >
                  CONNECT {connector.name.toUpperCase()}
                </Button>
              ))}
            </div>
          )}
        </PanelSection>
        {account.isConnected && mode === 'private' && strk20 === false && (
          <PanelSection>
            <Callout tone="warning" title="NO STRK20 SUPPORT">
              This wallet does not report Wallet API 0.10.3 or later, so it
              cannot send privacy-pool actions. Use a STRK20 wallet, or switch
              to the public route.
            </Callout>
          </PanelSection>
        )}
        {account.isConnected && !onMainnet && (
          <PanelSection>
            <Callout tone="warning" title="WRONG NETWORK">
              Switch the wallet to Starknet Mainnet before sending.
            </Callout>
          </PanelSection>
        )}
      </Panel>

      {rpcDown && (
        <Callout tone="warning" title="BALANCES UNAVAILABLE">
          This page reads balances through the RPC in FUND_BOTS_RPC_URL, by
          default an SSH tunnel to the validator&apos;s Pathfinder on local port
          19545. Open the tunnel, or start the page with another mainnet RPC.
          Sending still works, because the wallet uses its own RPC.
        </Callout>
      )}

      {bots && (
        <Panel>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>BOT</TableHeaderCell>
                <TableHeaderCell>ADDRESS</TableHeaderCell>
                <TableHeaderCell>DEPLOYED</TableHeaderCell>
                <TableHeaderCell className="text-right">STRK</TableHeaderCell>
              </TableRow>
            </TableHead>
            <tbody>
              {bots.map((bot) => {
                const s = status[bot.address];
                return (
                  <TableRow key={bot.address}>
                    <TableCell>{bot.name}</TableCell>
                    <TableCell>
                      <ExternalLink href={voyagerContractUrl(bot.address)}>
                        {short(bot.address)}
                      </ExternalLink>
                    </TableCell>
                    <TableCell>
                      {s?.deployed == null ? '…' : s.deployed ? 'YES' : 'NO'}
                    </TableCell>
                    <TableCell className="text-right">
                      {s?.balance == null ? '…' : formatStrk(s.balance)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </tbody>
          </Table>
        </Panel>
      )}

      {bots && (
        <Panel>
          <PanelSection className="flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-label text-fg-secondary">
              STRK FOR EACH BOT
              <input
                className={fieldStyles({ className: 'max-w-xs' })}
                value={amountText}
                inputMode="decimal"
                onChange={(event) => setAmountText(event.target.value)}
              />
            </label>
            {typeof amount === 'string' ? (
              <span className="text-caption text-danger">{amount}</span>
            ) : mode === 'private' ? (
              <span className="text-body">
                {bots.length} withdrawals of {formatStrk(amount)} STRK, for{' '}
                {total === null ? '…' : formatStrk(total)} STRK, plus one
                privacy pool fee of{' '}
                {poolFee === null
                  ? 'unknown (the wallet shows it)'
                  : `${formatStrk(poolFee)} STRK`}
                . Your shielded balance needs{' '}
                {total === null || poolFee === null
                  ? 'the total plus the fee'
                  : `${formatStrk(total + poolFee)} STRK`}
                . The wallet sponsors the network fee.
              </span>
            ) : (
              <span className="text-body">
                {bots.length} transfers of {formatStrk(amount)} STRK, for a
                total of {total === null ? '…' : formatStrk(total)} STRK plus
                the network fee.
              </span>
            )}
            <div>
              <Button
                tone="accent"
                size="lg"
                busy={phase === 'signing' || phase === 'confirming'}
                disabled={
                  !account.isConnected ||
                  !onMainnet ||
                  typeof amount === 'string' ||
                  calls.length === 0 ||
                  (mode === 'private' && strk20 !== true) ||
                  phase === 'signing' ||
                  phase === 'confirming' ||
                  // Not yet visible is not failed. Sending again could fund twice.
                  phase === 'unconfirmed'
                }
                onClick={() => void send()}
              >
                {phase === 'signing'
                  ? mode === 'private'
                    ? 'PROVING AND APPROVING IN WALLET'
                    : 'APPROVE IN WALLET'
                  : phase === 'confirming'
                    ? 'CONFIRMING'
                    : `${mode === 'private' ? 'WITHDRAW' : 'SEND'} ${total === null ? '' : formatStrk(total)} STRK`}
              </Button>
            </div>
            {hash && (
              <span className="text-body">
                {phase === 'done'
                  ? 'Confirmed: '
                  : phase === 'unconfirmed'
                    ? 'Submitted, but not visible at the RPC yet. Check it on Voyager: '
                    : 'Submitted: '}
                <ExternalLink href={voyagerTransactionUrl(hash)}>
                  {short(hash)}
                </ExternalLink>
              </span>
            )}
            {error && (
              <Callout tone="danger" title="NOT SENT">
                {error}
              </Callout>
            )}
          </PanelSection>
        </Panel>
      )}
    </main>
  );
}
