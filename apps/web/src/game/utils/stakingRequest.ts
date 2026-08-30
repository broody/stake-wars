import { formatStrk, parseStrk } from './format';

const STAKE_AMOUNT_SEARCH_PARAM = 'amount';

export function stakeRequestSearch(requiredForce: bigint): string {
  const search = new URLSearchParams();
  search.set(STAKE_AMOUNT_SEARCH_PARAM, formatStrk(requiredForce, 18));
  return `?${search.toString()}`;
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
