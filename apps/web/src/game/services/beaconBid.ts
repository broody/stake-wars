import type { Call } from 'starknet';
import type { BeaconRound } from './api';
import { normalizeContractAddress } from './supplyDrop';
import { addressesMatch, formatStrk } from '../utils/format';

const MAX_U64 = (1n << 64n) - 1n;
const MAX_U128 = (1n << 128n) - 1n;

/**
 * Approves exactly the bid and places it in one multicall. The Beacon System
 * escrows only the leading bid and refunds the displaced leader immediately.
 */
export function buildBeaconBidCalls({
  beaconSystemAddress,
  strkTokenAddress,
  round,
  bidder,
  amount,
}: {
  beaconSystemAddress: string;
  strkTokenAddress: string;
  round: BeaconRound;
  bidder: string;
  amount: bigint;
}): Call[] {
  const system = requireBeaconSystem(beaconSystemAddress, round);
  if (
    !strkTokenAddress ||
    !addressesMatch(round.paymentToken, strkTokenAddress)
  ) {
    throw new Error(
      'The auction payment token is not the configured STRK token.'
    );
  }
  if (round.leader && addressesMatch(round.leader, bidder)) {
    throw new Error('You already hold the leading bid.');
  }
  if (amount > MAX_U128) {
    throw new Error('Bid amount is too large.');
  }
  const minimum = BigInt(round.minimumBid);
  if (amount < minimum) {
    throw new Error(`Bid at least ${formatStrk(minimum, 18)} STRK.`);
  }
  return [
    {
      contractAddress: normalizeContractAddress(round.paymentToken),
      entrypoint: 'approve',
      calldata: [system, amount.toString(), '0'],
    },
    {
      contractAddress: system,
      entrypoint: 'place_beacon_bid',
      calldata: [round.id.toString(), amount.toString()],
    },
  ];
}

/** Anyone may settle once the chain clock passes the round deadline. */
export function buildBeaconSettleCall({
  beaconSystemAddress,
  round,
}: {
  beaconSystemAddress: string;
  round: BeaconRound;
}): Call {
  return {
    contractAddress: requireBeaconSystem(beaconSystemAddress, round),
    entrypoint: 'settle_beacon_auction',
    calldata: [round.id.toString()],
  };
}

function requireBeaconSystem(beaconSystemAddress: string, round: BeaconRound) {
  if (!beaconSystemAddress) {
    throw new Error('The Beacon auction is not configured.');
  }
  // The API reports the system it verified; refuse to approve any other spender.
  if (!addressesMatch(round.auctionAddress, beaconSystemAddress)) {
    throw new Error('The Beacon auction does not match this network.');
  }
  if (
    !Number.isSafeInteger(round.id) ||
    round.id <= 0 ||
    BigInt(round.id) > MAX_U64
  ) {
    throw new Error('Beacon round ID is invalid.');
  }
  return normalizeContractAddress(beaconSystemAddress);
}
