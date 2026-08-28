import { walletV6 } from 'starknet';
import type { STRK20_ACTION } from 'starknet';

export type PrivacyWallet = Parameters<typeof walletV6.supportedWalletApi>[0];

export type PrivateSubmissionObserver = (signal: AbortSignal) => Promise<void>;

export interface PrivateTransactionResult {
  transactionHash: string | null;
  confirmedBy: 'wallet' | 'bid-count';
}

/**
 * Uses Ready's one-shot STRK20 path so the wallet can add its private fee
 * action. Ready 5.33.x can leave the request open after broadcasting, so a
 * caller may also confirm submission through a narrowly scoped public signal.
 */
export async function invokePrivateActionTransaction(
  wallet: PrivacyWallet,
  actions: STRK20_ACTION[],
  observeSubmission?: PrivateSubmissionObserver
): Promise<PrivateTransactionResult> {
  // Starknet.js currently exports STRK20_ACTION through a second copy of the
  // Wallet API type package. The runtime shapes are the same.
  const walletActions = actions as unknown as Parameters<
    typeof walletV6.strk20InvokeTransaction
  >[1];
  const walletResult = walletV6
    .strk20InvokeTransaction(wallet, walletActions)
    .then((result) => ({
      transactionHash: result.transaction_hash,
      confirmedBy: 'wallet' as const,
    }));

  if (!observeSubmission) return walletResult;

  const controller = new AbortController();
  try {
    return await Promise.race([
      walletResult,
      observeSubmission(controller.signal).then(() => ({
        transactionHash: null,
        confirmedBy: 'bid-count' as const,
      })),
    ]);
  } finally {
    controller.abort();
  }
}
