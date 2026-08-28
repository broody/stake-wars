import { ec, shortString } from 'starknet';
import type { STRK20_ACTION } from 'starknet';
import { buildWhisperBidActions } from '@whisper-sdk/bid-action.ts';
import {
  computeRefundCommitment,
  computeRevealCommitment,
} from '@whisper-sdk/hashes.ts';
import { encryptWhisperBidCapsule } from '@whisper-sdk/capsule.ts';
import type { WhisperEncryptedCapsule } from '@whisper-sdk/capsule.ts';
import type { ArbiterRound } from './api';
import { parseStrk } from '../utils/format';

const MAX_FELT = (1n << 251n) + 17n * (1n << 192n);

interface WhisperOperatorConfig {
  chainId: string;
  poolAddress: string;
  whisperAddress: string;
  vaultAddress: string;
  vaultPublicKey: string;
  revealPublicKey: string;
}

export interface SubmitArbiterBidInput {
  amount: string;
  network: string;
  round: ArbiterRound;
  walletAddress: string;
  walletChainId: string;
  expectedPaymentToken: string;
  expectedPoolAddress: string;
  operatorUrl: string;
  invokePrivateActions: (
    actions: STRK20_ACTION[]
  ) => Promise<{ transactionHash: string }>;
  fetcher?: typeof fetch;
}

export interface ArbiterBidReceipt {
  transactionHash: string;
  groupHandle: string;
  bidHandle: string;
}

export async function submitArbiterBid({
  amount,
  network,
  round,
  walletAddress,
  walletChainId,
  expectedPaymentToken,
  expectedPoolAddress,
  operatorUrl,
  invokePrivateActions,
  fetcher = fetch,
}: SubmitArbiterBidInput): Promise<ArbiterBidReceipt> {
  if (round.submissionCount >= round.maxBids) {
    throw new Error('This auction has reached its bid limit.');
  }
  if (!operatorUrl) {
    throw new Error('The Whisper capsule operator is not configured.');
  }

  const chainId = networkFelt(network);
  if (!sameFelt(walletChainId, chainId)) {
    throw new Error(`Switch Ready to ${network} before bidding.`);
  }
  if (!sameFelt(round.paymentToken, expectedPaymentToken)) {
    throw new Error(
      'The auction payment token is not the configured STRK token.'
    );
  }

  const operator = await getOperatorConfig(operatorUrl, fetcher);
  validateOperatorConfig(operator, round, chainId, expectedPoolAddress);

  const bidAmount = parseStrk(amount, 'STRK');
  if (bidAmount <= 0n) throw new Error('Bid amount must be positive.');
  if (bidAmount < BigInt(round.reservePrice)) {
    throw new Error('Bid amount must meet the auction reserve.');
  }
  const auctionId = BigInt(round.auctionId);
  const bidder = positiveFelt('wallet address', walletAddress);
  const whisperAddress = positiveFelt('Whisper address', round.whisperAddress);
  const bidNonce = randomFelt();
  const salt = randomFelt();
  const winnerSecret = randomFelt();
  const refundCommitment = computeRefundCommitment(bidder);
  const winnerCommitment = computeStakeWarsWinnerCommitment({
    winnerPayloadDomain: round.winnerPayloadDomain,
    chainId,
    whisperAddress,
    auctionId,
    walletAddress: bidder,
    winnerSecret,
  });
  const revealCommitment = computeRevealCommitment(
    auctionId,
    bidAmount,
    salt,
    refundCommitment,
    winnerCommitment
  );
  const composition = buildWhisperBidActions({
    whisperAddress: round.whisperAddress,
    paymentToken: round.paymentToken,
    vaultAddress: round.vaultAddress,
    auctionId,
    bidNonce,
    bidAmount,
    revealCommitment,
    refundCommitment,
    winnerCommitment,
  });
  const capsule = await encryptWhisperBidCapsule(
    {
      auctionId,
      amount: bidAmount,
      salt,
      refundRecipient: bidder,
      refundCommitment,
      winnerCommitment,
    },
    round.revealPublicKey,
    {
      chainId,
      poolAddress: operator.poolAddress,
      whisperAddress,
      auctionId,
      revealCommitment,
    }
  );

  await uploadCapsule(operatorUrl, capsule, fetcher);

  const result = await invokePrivateActions(
    composition.actions as STRK20_ACTION[]
  );
  return {
    transactionHash: result.transactionHash,
    groupHandle: hex(composition.groupHandle),
    bidHandle: hex(composition.bidHandle),
  };
}

export function computeStakeWarsWinnerCommitment({
  winnerPayloadDomain,
  chainId,
  whisperAddress,
  auctionId,
  walletAddress,
  winnerSecret,
}: {
  winnerPayloadDomain: string;
  chainId: bigint;
  whisperAddress: bigint;
  auctionId: bigint;
  walletAddress: bigint;
  winnerSecret: bigint;
}): bigint {
  return ec.starkCurve.poseidonHashMany([
    positiveFelt('winner payload domain', winnerPayloadDomain),
    positiveFelt('chain id', chainId),
    positiveFelt('Whisper address', whisperAddress),
    positiveFelt('auction id', auctionId),
    positiveFelt('wallet address', walletAddress),
    positiveFelt('winner secret', winnerSecret),
  ]);
}

function networkFelt(network: string): bigint {
  if (network.startsWith('0x')) return positiveFelt('network', network);
  return BigInt(shortString.encodeShortString(network));
}

async function getOperatorConfig(
  operatorUrl: string,
  fetcher: typeof fetch
): Promise<WhisperOperatorConfig> {
  const response = await fetcher(`${trimURL(operatorUrl)}/v1/config`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Whisper operator is unavailable (${response.status}).`);
  }
  const value = (await response.json()) as unknown;
  if (!value || typeof value !== 'object') {
    throw new Error('Whisper operator returned invalid configuration.');
  }
  const candidate = value as Record<string, unknown>;
  for (const key of [
    'chainId',
    'poolAddress',
    'whisperAddress',
    'vaultAddress',
    'vaultPublicKey',
    'revealPublicKey',
  ]) {
    if (typeof candidate[key] !== 'string') {
      throw new Error('Whisper operator returned incomplete configuration.');
    }
    positiveFelt(`operator ${key}`, candidate[key] as string);
  }
  return candidate as unknown as WhisperOperatorConfig;
}

function validateOperatorConfig(
  operator: WhisperOperatorConfig,
  round: ArbiterRound,
  chainId: bigint,
  expectedPoolAddress: string
) {
  const checks: Array<[string, string, string | bigint]> = [
    ['network', operator.chainId, chainId],
    ['privacy pool', operator.poolAddress, expectedPoolAddress],
    ['Whisper contract', operator.whisperAddress, round.whisperAddress],
    ['vault', operator.vaultAddress, round.vaultAddress],
    ['reveal key', operator.revealPublicKey, round.revealPublicKey],
  ];
  for (const [name, actual, expected] of checks) {
    if (!sameFelt(actual, expected)) {
      throw new Error(`Whisper operator ${name} does not match this auction.`);
    }
  }
}

async function uploadCapsule(
  operatorUrl: string,
  capsule: WhisperEncryptedCapsule,
  fetcher: typeof fetch
) {
  const response = await fetcher(`${trimURL(operatorUrl)}/v1/capsules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(capsule),
  });
  if (!response.ok) {
    let detail = `Whisper operator rejected the capsule (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // Preserve the status-based error when the response is not JSON.
    }
    throw new Error(detail);
  }
}

function randomFelt(): bigint {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return (value % (MAX_FELT - 1n)) + 1n;
}

function positiveFelt(name: string, input: string | number | bigint): bigint {
  let value: bigint;
  try {
    value = BigInt(input);
  } catch {
    throw new Error(`${name} is invalid.`);
  }
  if (value <= 0n || value >= MAX_FELT) {
    throw new Error(`${name} is outside the felt range.`);
  }
  return value;
}

function sameFelt(left: string | bigint, right: string | bigint): boolean {
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}

function hex(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function trimURL(value: string): string {
  return value.replace(/\/$/, '');
}
