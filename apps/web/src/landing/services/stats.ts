const apiDomain = import.meta.env.VITE_API_DOMAIN || 'https://api.stakewars.gg';

export interface LandingStats {
  network: string;
  totalStaked: string;
  activeOperators: number;
  occupiedSectors: number;
  updatedAt: string;
}

export async function getLandingStats(
  signal?: AbortSignal
): Promise<LandingStats> {
  const response = await fetch(`${apiDomain}/v1/stats`, { signal });
  if (!response.ok) {
    throw new Error(`Stats request failed with HTTP ${response.status}`);
  }
  const value = (await response.json()) as Partial<LandingStats>;
  if (
    typeof value.network !== 'string' ||
    typeof value.totalStaked !== 'string' ||
    !/^\d+$/.test(value.totalStaked) ||
    typeof value.activeOperators !== 'number' ||
    !Number.isSafeInteger(value.activeOperators) ||
    value.activeOperators < 0 ||
    typeof value.occupiedSectors !== 'number' ||
    !Number.isSafeInteger(value.occupiedSectors) ||
    value.occupiedSectors < 0 ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new Error('Stats response is invalid');
  }
  return value as LandingStats;
}

export function formatStrkAmount(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error('STRK amount is invalid');

  const decimals = 18;
  const padded = value.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals).replace(/^0+(?=\d)/, '');
  const fraction = padded.slice(-decimals, -decimals + 2).replace(/0+$/, '');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}
