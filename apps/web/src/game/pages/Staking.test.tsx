import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ShieldedMetric } from './Staking';

function renderShieldedMetric(
  status: Parameters<typeof ShieldedMetric>[0]['status'],
  balance: bigint | null = null,
  error: string | null = null
) {
  return renderToStaticMarkup(
    <ShieldedMetric
      balance={balance}
      error={error}
      onRead={vi.fn()}
      status={status}
    />
  );
}

describe('shielded STRK metric', () => {
  it('offers a consented read only after capability detection', () => {
    expect(renderShieldedMetric('available')).toContain('READ [STRK]');
    expect(renderShieldedMetric('checking')).not.toContain('READ [STRK]');
  });

  it('renders an unsupported wallet without a balance action', () => {
    const markup = renderShieldedMetric('unsupported');
    expect(markup).toContain('UNAVAILABLE');
    expect(markup).not.toContain('READ [STRK]');
  });

  it('uses the bracketed convention for a disclosed balance', () => {
    const markup = renderShieldedMetric('ready', 1_250_000_000_000_000_000n);
    expect(markup).toContain('1.25 [STRK]');
    expect(markup).toContain('REFRESH');
  });

  it('keeps a rejected read separate from staking errors', () => {
    const markup = renderShieldedMetric(
      'error',
      null,
      'User rejected the balance request'
    );
    expect(markup).toContain('User rejected the balance request');
    expect(markup).toContain('READ [STRK]');
  });
});
