const UNIT = 10n ** 18n;
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});
const groupedFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Parses a base-unit decimal string, treating malformed input as zero. */
export function parseAmount(value: string | null | undefined): bigint {
  if (!value || !/^\d+$/.test(value)) return 0n;
  return BigInt(value);
}

/** Converts an 18-decimal amount to a display number. */
export function amountToNumber(amount: bigint): number {
  const whole = amount / UNIT;
  const fraction = amount % UNIT;
  return Number(whole) + Number(fraction) / 1e18;
}

/** Rescales a token amount with any decimals to 18 decimals. */
export function normalizeTokenAmount(amount: bigint, decimals: number): bigint {
  if (decimals === 18) return amount;
  return decimals < 18
    ? amount * 10n ** BigInt(18 - decimals)
    : amount / 10n ** BigInt(decimals - 18);
}

/** Formats a display number: compact above 10k, sparse decimals below. */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 10_000) return compactFormatter.format(value);
  if (magnitude >= 1) return groupedFormatter.format(value);
  if (magnitude < 0.0001) return value > 0 ? '<0.0001' : '>-0.0001';
  return value.toLocaleString('en-US', { maximumSignificantDigits: 3 });
}

/** Formats an 18-decimal amount for a headline or table cell. */
export function formatAmount(amount: bigint): string {
  return formatQuantity(amountToNumber(amount));
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 10_000) return `$${compactFormatter.format(value)}`;
  return `$${groupedFormatter.format(value)}`;
}

export function formatPercent(
  value: number | null | undefined,
  fractionDigits = 2
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(fractionDigits)}%`;
}

/** Formats basis points of commission as a percentage. */
export function formatCommission(bps: number | null): string {
  return bps === null ? '—' : formatPercent(bps / 100, bps % 100 ? 2 : 0);
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${minutes}M`;
  if (minutes > 0) return `${minutes}M ${seconds % 60}S`;
  return `${seconds}S`;
}

export function formatDate(timestampSeconds: number): string {
  return dateFormatter.format(timestampSeconds * 1_000).toUpperCase();
}

export { formatDay, formatMonth } from '../../ui/charts/scale';
