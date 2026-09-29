import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('keeps a type role beside a text color', () => {
    expect(cn('text-label text-fg-muted')).toBe('text-label text-fg-muted');
  });

  it('lets a later type role or color win', () => {
    expect(cn('text-label text-fg', 'text-caption')).toBe(
      'text-fg text-caption'
    );
    expect(cn('text-fg-muted', 'text-accent')).toBe('text-accent');
    expect(cn('tracking-caps', 'tracking-normal')).toBe('tracking-normal');
  });
});
