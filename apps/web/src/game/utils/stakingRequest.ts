import { formatStrk, parseStrk } from './format';

const STAKE_AMOUNT_SEARCH_PARAM = 'amount';
const STAKE_RETURN_SEARCH_PARAM = 'return';
const CORE_RETURN = 'core';

/** Links to the staking page for a Core action's FORCE shortfall. */
export function stakeRequestSearch(requiredForce: bigint): string {
  const search = new URLSearchParams();
  search.set(STAKE_AMOUNT_SEARCH_PARAM, formatStrk(requiredForce, 18));
  search.set(STAKE_RETURN_SEARCH_PARAM, CORE_RETURN);
  return `?${search.toString()}`;
}

export function stakeReturnsToCore(search: URLSearchParams): boolean {
  return search.get(STAKE_RETURN_SEARCH_PARAM) === CORE_RETURN;
}

export function stakeAmountFromSearch(search: URLSearchParams): string {
  const requestedAmount = search.get(STAKE_AMOUNT_SEARCH_PARAM);
  if (!requestedAmount) return '';

  try {
    return formatStrk(parseStrk(requestedAmount, 'STRK'), 18);
  } catch {
    return '';
  }
}
