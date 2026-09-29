import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BusyLabel } from './Spinner';

describe('BusyLabel', () => {
  it('leads the label with a spinner only while busy', () => {
    const busy = renderToStaticMarkup(<BusyLabel busy>CONFIRMING…</BusyLabel>);
    expect(busy).toContain('animate-spin');
    expect(busy.indexOf('animate-spin')).toBeLessThan(
      busy.indexOf('CONFIRMING…')
    );

    expect(
      renderToStaticMarkup(<BusyLabel busy={false}>CAPTURE</BusyLabel>)
    ).toBe('CAPTURE');
  });
});
