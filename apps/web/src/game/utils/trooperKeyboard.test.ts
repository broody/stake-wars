// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrooperKeyboard, bindTrooperKeyboard } from './trooperKeyboard';
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});
function setup() {
  const input = new TrooperKeyboard(),
    stop = vi.fn(),
    pause = vi.fn();
  dispose = bindTrooperKeyboard(input, stop, pause);
  return { input, stop, pause };
}
function key(type: string, code: string, target: EventTarget = window) {
  const event = new KeyboardEvent(type, {
    code,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}
describe('armed player keyboard', () => {
  it('holds Space together with WASD, prevents scroll, and stops on release', () => {
    const { input } = setup();
    key('keydown', 'KeyA');
    expect(key('keydown', 'Space').defaultPrevented).toBe(true);
    expect([...input.takeFrame()]).toEqual(['KeyA', 'Space']);
    expect(input.takeFrame().has('Space')).toBe(true);
    key('keyup', 'Space');
    expect([...input.takeFrame()]).toEqual(['KeyA']);
  });
  it('buffers a quick tap for exactly one render frame', () => {
    const { input } = setup();
    key('keydown', 'Space');
    key('keyup', 'Space');
    expect(input.takeFrame().has('Space')).toBe(true);
    expect(input.takeFrame().has('Space')).toBe(false);
  });
  it('leaves typing and native button Space alone', () => {
    const { input } = setup();
    for (const tag of ['input', 'textarea', 'button']) {
      const node = document.body.appendChild(document.createElement(tag));
      expect(key('keydown', 'Space', node).defaultPrevented).toBe(false);
      expect(input.takeFrame().has('Space')).toBe(false);
    }
  });
  it('clears held fire and movement on blur, text focus, Escape and cleanup', () => {
    const { input, stop, pause } = setup();
    key('keydown', 'Space');
    window.dispatchEvent(new Event('blur'));
    expect(input.focused).toBe(false);
    expect(input.takeFrame().size).toBe(0);
    window.dispatchEvent(new Event('focus'));
    expect(input.focused).toBe(true);
    key('keydown', 'Space');
    const field = document.body.appendChild(document.createElement('input'));
    field.focus();
    expect(input.takeFrame().size).toBe(0);
    key('keydown', 'Space');
    key('keydown', 'Escape');
    expect(input.takeFrame().size).toBe(0);
    expect(pause).toHaveBeenCalledOnce();
    key('keydown', 'Space');
    dispose?.();
    dispose = undefined;
    expect(input.takeFrame().size).toBe(0);
    key('keydown', 'Space');
    expect(input.takeFrame().size).toBe(0);
    expect(stop).toHaveBeenCalled();
  });
});
