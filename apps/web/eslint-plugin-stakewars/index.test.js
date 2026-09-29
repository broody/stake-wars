import { describe, expect, it } from 'vitest';
import plugin from './index.js';

const { problemsIn } = plugin;

describe('no-adhoc-styles', () => {
  it('rejects improvised sizes, spacing and colors', () => {
    for (const className of [
      'text-[9px]',
      'sm:text-[10px]',
      'tracking-[0.18em]',
      'leading-[1.7]',
      'bg-[#ff4a04]',
      'hover:border-[#d6a84b]/40',
      'shadow-[8px_8px_0_rgba(255,255,255,0.08)]',
      'text-neutral-500',
      'hover:bg-amber-400/40',
      'border-grid',
      'text-white',
      'text-xs',
      'md:text-2xl',
      'tracking-widest',
    ]) {
      expect(problemsIn(className), className).toHaveLength(1);
    }
  });

  it('accepts tokens and unrelated arbitrary values', () => {
    expect(
      problemsIn(
        'text-label text-fg-muted border-line bg-accent/20 tracking-caps w-[24rem] grid grid-cols-[1fr_auto] [&>*]:bg-surface z-[90] bg-gold/[0.03] sm:text-display'
      )
    ).toEqual([]);
  });
});
