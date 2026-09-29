// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClipboardImagePaste } from './useClipboardImagePaste';

let root: Root;
let container: HTMLDivElement;
const onImage = vi.fn();

function Harness({ enabled }: { enabled: boolean }) {
  useClipboardImagePaste(enabled, onImage);
  return <textarea aria-label="notes" />;
}

function render(enabled: boolean) {
  act(() => root.render(<Harness enabled={enabled} />));
}

function paste(target: EventTarget, files: File[]) {
  const event = new Event('paste', {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: files.map((file) => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      })),
      files,
    },
  });
  target.dispatchEvent(event);
  return event;
}

const image = new File(['png'], 'clip.png', { type: 'image/png' });

describe('useClipboardImagePaste', () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    onImage.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('hands a pasted image to the handler and claims the event', () => {
    render(true);
    const event = paste(document.body, [image]);

    expect(onImage).toHaveBeenCalledWith(image);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores pastes while disabled', () => {
    render(false);
    const event = paste(document.body, [image]);

    expect(onImage).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves pastes into editable fields alone', () => {
    render(true);
    const event = paste(container.querySelector('textarea')!, [image]);

    expect(onImage).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores clipboard data without an image', () => {
    render(true);
    const text = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const event = paste(document.body, [text]);

    expect(onImage).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
