import type { STRK20_BALANCE_ENTRY, WalletAccountV6 } from 'starknet';

const MINIMUM_STRK20_WALLET_API = [0, 10, 3] as const;

export interface ShieldedBalanceReader {
  strk20Balances(tokens: string[]): Promise<STRK20_BALANCE_ENTRY[]>;
}

function parseVersion(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function supportsShieldedBalances(versions: readonly string[]): boolean {
  return versions.some((version) => {
    const parsed = parseVersion(version);
    if (!parsed) return false;

    for (let index = 0; index < parsed.length; index += 1) {
      if (parsed[index] > MINIMUM_STRK20_WALLET_API[index]) return true;
      if (parsed[index] < MINIMUM_STRK20_WALLET_API[index]) return false;
    }
    return true;
  });
}

function sameAddress(left: string, right: string): boolean {
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}

export async function readShieldedTokenBalance(
  reader: ShieldedBalanceReader | WalletAccountV6,
  tokenAddress: string
): Promise<bigint> {
  const balances = await reader.strk20Balances([tokenAddress]);
  const entry = balances.find((balance) =>
    sameAddress(balance.token, tokenAddress)
  );
  return entry ? BigInt(entry.balance) : 0n;
}
