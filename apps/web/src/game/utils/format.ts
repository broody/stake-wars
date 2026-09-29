const STRK_DECIMALS = 18;

export function parseStrk(
  value: string,
  unit: 'STRK' | 'FORCE' = 'STRK'
): bigint {
  const normalized = value.trim();
  const match = /^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{0,18}))?$/.exec(normalized);

  if (!match) {
    throw new Error(`Enter a valid ${unit} amount with up to 18 decimals.`);
  }

  const whole = match[1].replace(/,/g, '');
  const fraction = (match[2] ?? '').padEnd(STRK_DECIMALS, '0');

  return BigInt(whole) * 10n ** BigInt(STRK_DECIMALS) + BigInt(fraction);
}

export function formatStrk(amount: bigint, maximumFractionDigits = 4): string {
  const divisor = 10n ** BigInt(STRK_DECIMALS);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionText = fraction
    .toString()
    .padStart(STRK_DECIMALS, '0')
    .slice(0, maximumFractionDigits)
    .replace(/0+$/, '');
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return fractionText.length > 0 ? `${wholeText}.${fractionText}` : wholeText;
}

export function formatStrkFixed(
  amount: bigint,
  fractionDigits: number
): string {
  const digits = Math.max(
    0,
    Math.min(STRK_DECIMALS, Math.floor(fractionDigits))
  );
  const divisor = 10n ** BigInt(STRK_DECIMALS);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (digits === 0) return wholeText;

  const fractionText = fraction
    .toString()
    .padStart(STRK_DECIMALS, '0')
    .slice(0, digits);
  return `${wholeText}.${fractionText}`;
}

export function formatCountdown(remainingSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingSeconds));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}

export function shortAddress(address: string): string {
  return address.length > 14
    ? `${address.slice(0, 8)}…${address.slice(-6)}`
    : address;
}

export function isZeroAddress(address: string): boolean {
  try {
    return BigInt(address) === 0n;
  } catch {
    return false;
  }
}

export function addressesMatch(left: string, right: string): boolean {
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}
