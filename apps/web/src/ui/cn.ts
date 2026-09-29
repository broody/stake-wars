import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { fontSize, letterSpacing } from './tokens';

/**
 * tailwind-merge only recognises Tailwind's default size names, so it would
 * read `text-label` as a color and drop it beside `text-fg-muted`. Teach it
 * our type roles and spacing names.
 */
const twMerge = extendTailwindMerge({
  override: {
    theme: {
      text: Object.keys(fontSize),
      tracking: Object.keys(letterSpacing),
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
