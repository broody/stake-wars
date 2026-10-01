import { isTypingTarget, TROOPER_KEYS } from './trooperController';

export class TrooperKeyboard {
  readonly keys = new Set<string>();
  private readonly buffered = new Set<string>();
  focused = true;

  press(code: string) {
    this.keys.add(code);
    this.buffered.add(code);
  }
  release(code: string) {
    this.keys.delete(code);
  }
  clear() {
    this.keys.clear();
    this.buffered.clear();
  }
  takeFrame(): ReadonlySet<string> {
    if (!this.buffered.size) return this.keys;
    const keys = new Set([...this.keys, ...this.buffered]);
    this.buffered.clear();
    return keys;
  }
}

export function bindTrooperKeyboard(
  input: TrooperKeyboard,
  onStop: () => void,
  onPause: () => void
) {
  input.focused = true;
  const clear = () => {
    input.clear();
    onStop();
  };
  const down = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    if (event.code === 'Escape') {
      clear();
      onPause();
      return;
    }
    if (
      !TROOPER_KEYS.has(event.code) ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return;
    if (
      event.code === 'Space' &&
      event.target instanceof Element &&
      event.target.closest('button, a, [role="button"]')
    )
      return;
    event.preventDefault();
    input.focused = true;
    input.press(event.code);
  };
  const up = (event: KeyboardEvent) => input.release(event.code);
  const blur = () => {
    input.focused = false;
    clear();
  };
  const focus = () => {
    input.focused = true;
  };
  const visibility = () => {
    if (document.hidden) blur();
    else focus();
  };
  const focusIn = (event: FocusEvent) => {
    if (isTypingTarget(event.target)) clear();
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  window.addEventListener('focus', focus);
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('focusin', focusIn);
  return () => {
    clear();
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    window.removeEventListener('focus', focus);
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('focusin', focusIn);
  };
}
