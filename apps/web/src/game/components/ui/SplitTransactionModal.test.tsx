import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SplitTransactionModal } from './SplitTransactionModal';

describe('SplitTransactionModal', () => {
  it('explains and itemizes the transaction split before proceeding', () => {
    const markup = renderToStaticMarkup(
      <SplitTransactionModal
        batches={[
          { pointCount: 200, status: 'queued' },
          { pointCount: 200, status: 'queued' },
          { pointCount: 50, status: 'queued' },
        ]}
        intent="capture"
        isOpen
        isRunning={false}
        pointCount={450}
        onClose={() => undefined}
        onProceed={() => undefined}
      />
    );

    expect(markup).toContain('TRANSACTION SPLIT REQUIRED');
    expect(markup).toContain('450 POINTS // 3 TRANSACTIONS');
    expect(markup).toContain('split into 3 sequential transactions');
    expect(markup).toContain('BEGIN 3 TRANSACTIONS');
    expect(markup.match(/200 CONTROL POINTS/g)).toHaveLength(2);
    expect(markup).toContain('50 CONTROL POINTS');
  });

  it('keeps confirmed and failed transaction progress visible', () => {
    const markup = renderToStaticMarkup(
      <SplitTransactionModal
        batches={[
          { pointCount: 200, status: 'confirmed', hash: '0x123' },
          {
            pointCount: 1,
            status: 'failed',
            error: 'Wallet request rejected.',
          },
        ]}
        intent="fortify"
        isOpen
        isRunning={false}
        pointCount={201}
        onClose={() => undefined}
        onProceed={() => undefined}
      />
    );

    expect(markup).toContain('1/2 CONFIRMED');
    expect(markup).toContain('TX 0x123');
    expect(markup).toContain('Wallet request rejected.');
    expect(markup).toContain('CLOSE · KEEP REMAINING SELECTED');
  });
});
