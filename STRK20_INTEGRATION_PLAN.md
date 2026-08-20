# STRK20 Privacy Integration Plan — Stake Wars shielded balance

Generated 2026-08-19 by the strk20-privacy-integration skill. This plan is intentionally limited to a consented shielded STRK balance read in the existing staking UI; it does not make staking private.

## 1. Project snapshot

- Stack: React 19 + Vite frontend in `apps/web`; `starknet@10.7.0`; `@starknetfoundation/starknet-start-react@^2.0.1`; `@starknet-io/get-starknet-modal@6.0.1`; Dojo/Cairo contracts; Go API. The app runs locally against the shared Sepolia deployment.
- Wallet connection: `apps/web/src/game/contexts/WalletContext.tsx:16-29` and `apps/web/src/game/components/ui/WalletButton.tsx:27-164`. The wallet menu currently admits Ready/Argent only.
- Provider and transaction layer: `apps/web/src/game/providers/StarknetProvider.tsx:8-23`; staking sends remain in `apps/web/src/game/contexts/YieldContext.tsx` and are out of scope for this balance-only change.
- UI surface: `apps/web/src/game/pages/Staking.tsx:372-409` renders Live Position with active stake, available force, committed force, and spent force.
- Token: `apps/web/.env.sepolia` already configures the canonical STRK token address through `config.strkTokenAddress`.
- Privacy goal: remove committed and spent force from Live Position, then display the connected wallet's consented shielded STRK balance there using the `[STRK]` unit convention. Do not add shield, transfer, unshield, or private-staking actions.
- Environment and wallet: Sepolia first; Ready is the app's current supported wallet.

## 2. Chosen route: Privacy Wallet API through starknet.js `WalletAccountV6`

This is a normal dapp relying on the user's wallet, so the balance read must go through the connected privacy-enabled wallet. The app will call `WalletAccountV6.strk20Balances([config.strkTokenAddress])`; the wallet owns the private state and asks the user for balance-read consent.

**The rule this follows:** Stake Wars never touches a viewing key, encrypted notes, or proofs. It receives only the balance value the user explicitly authorizes the wallet to disclose.

## 3. What this delivers — hidden vs visible

| Private / not disclosed to Stake Wars | Disclosed or public |
|---|---|
| Viewing key, notes, nullifiers, private transfer history, and balances for tokens the app did not request | The shielded STRK aggregate balance is disclosed to the frontend after wallet consent |
| Sender, receiver, amount, and token type of transfers inside the pool remain private onchain | Deposit and withdrawal amounts, the fact that an address interacted with the pool, and interaction timing remain public onchain |

The read itself creates no transaction. The frontend must not log, persist, analyze, or send the returned shielded balance to the API.

## 4. Prerequisites and version gate

Freshness was checked on 2026-08-20. The current relevant releases/dist-tags are:

- `starknet@10.7.0` (`WalletAccountV6`; STRK20 support requires at least 10.4.0)
- `@starknet-io/get-starknet-modal@6.0.1`
- `@starknet-io/get-starknet-core@6.0.1`
- `@starknet-io/get-starknet-wallet-standard@6.0.5`
- `@starknet-io/types-js@0.10.3` (stable Wallet API spec 0.10.3)
- `@starknetfoundation/starknet-start-react@2.0.1`
- Test wallet: current Ready extension on Sepolia

The maintained Starknet Foundation package line uses get-starknet v6 and removes Stake Wars' former direct v5 compatibility dependency. Stake Wars retains its focused `WalletAccountV6` adapter for the consented STRK20 read so this dependency migration does not change the privacy interaction or normal transaction paths.

Capability detection must use `walletV6.supportedWalletApi(wallet)` (or `supportedSpecs`) and require Wallet API `>=0.10.3`. It must not call `strk20Balances` as a feature probe because balance reads trigger consent.

## 5. Phase 1 — wallet-mediated shielded balance read ✅ done 2026-08-19

1. Update the wallet packages in `apps/web/package.json` and `pnpm-lock.yaml` to the exact compatible v6 versions above; keep the existing public staking flow working.
2. In `apps/web/src/game/contexts/WalletContext.tsx`, retain the connected wallet object, create/recreate a `WalletAccountV6` for the configured RPC when wallet/account/network changes, and expose privacy capability plus an explicit `readShieldedStrkBalance()` action.
3. Implement the action with `strk20Balances([config.strkTokenAddress])`, normalize token addresses with `BigInt(a) === BigInt(b)`, parse the returned smallest-unit balance as `bigint`, and discard it on disconnect, account change, or network change.
4. Treat unsupported API versions distinctly from rejected consent and operational wallet errors. Do not query on page load merely to detect support.
5. Add focused unit tests for supported/unsupported wallets, approved/rejected reads, missing STRK entries, address normalization, and stale account responses.
6. Verify existing connect, stake, claim, unstake, capture, and typed-data signing flows still build and test after the wallet-stack change.

## 6. Phase 2 — Live Position UI ✅ included in the Phase 1 wallet checkpoint 2026-08-19

1. In `apps/web/src/game/pages/Staking.tsx:378-405`, remove the COMMITTED and SPENT metrics.
2. Add a SHIELDED metric whose displayed unit is `[STRK]`; do not label public wallet STRK or active stake with brackets.
3. Before consent, show a deliberate `READ [STRK]` affordance instead of triggering a balance prompt on page load. After consent, show the formatted balance and allow a manual refresh.
4. For a wallet without Wallet API 0.10.3 support, show `UNAVAILABLE` without requesting balance data. For rejected consent, keep the value hidden and allow retry without treating rejection as a staking failure.
5. Keep the remaining FORCE explanation accurate after removing committed/spent language.
6. Add component coverage for disconnected, unsupported, consent-pending, disclosed, rejected, and error states.

## 7. Out of scope / future entry criteria

- Shield, private transfer, and unshield buttons are not part of this request.
- Staking shielded STRK is not implied by displaying `[STRK]`. A private staking path would be a separate design using the protocol's current shadow-account or audited helper route, with explicit privacy-leak analysis and contract review.
- Xverse can be added to the wallet selector only after a separate product decision and manual verification of its current dapp-facing Wallet API behavior.

## 8. Testing and phase handoff

- Headless: `pnpm --filter @stakewars/web test`, `pnpm --filter @stakewars/web build`, `pnpm --filter @stakewars/web lint`, `pnpm --filter @stakewars/web format:check`, and `git diff --check`.
- Manual on `http://localhost:3000/?app=game` using `pnpm dev:web`: connect Ready on Sepolia; verify capability detection causes no consent prompt; click `READ [STRK]`; approve and compare the displayed balance with Ready; reject once and verify retry; switch account/network and verify the disclosed balance is cleared.
- Regression: submit no transaction during the balance read; ensure normal public staking still uses public STRK and is unaffected by the `[STRK]` value.

Execution stops after this phase for the wallet-backed manual check before any broader privacy feature is considered.

## 9. Privacy and security notes

- Request only the STRK token balance, not an empty token array (which requests all shielded token balances).
- Never read or store viewing keys, notes, or proofs.
- Never log, persist, or send the disclosed balance to the Stake Wars API or analytics.
- Deposit screening is enforced onchain by the protocol; this read-only feature does not deposit.
- Selective disclosure exists for legitimate regulatory requests; it is not automatic compliance or regulator endorsement, and Stake Wars owns its legal/compliance decisions.

## 10. Open items to re-verify at execution

- `WalletAccountV6.strk20Balances(tokens)` and the `STRK20_BALANCE_ENTRY.balance` field were confirmed against `starknet@10.7.0` and the stable Wallet API 0.10.3 schema.
- Manual checkpoint pending: confirm Ready's Sepolia balance-read consent behavior and exact rejection text.
- Maintenance completed 2026-08-20: adopted the maintained `@starknetfoundation/starknet-start-react` package and removed the temporary direct wallet-standard v5 compatibility dependency. Re-evaluate the native STRK20 hooks separately before changing the existing explicit-consent adapter.
- Re-check package dist-tags before future STRK20 work because get-starknet v6 packages are still moving independently.

## 11. Links

- Wallet API overview: https://strk20-by-example.org/starknet-wallet-api/overview
- React route: https://strk20-by-example.org/starknet-wallet-api/starknet-start-hook
- starknet.js / `WalletAccountV6`: https://strk20-by-example.org/starknet-wallet-api/starknet-js
- Current WalletAccount guide: https://starknet-js.com/docs/next/guides/account/walletAccount/#with-get-starknet-v6
- Wallet API spec v0.10.3: https://github.com/starkware-libs/starknet-specs/releases/tag/v0.10.3
- Wallet test dapp: https://starknet-wallet-account.vercel.app/
