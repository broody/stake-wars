import { useEffect } from 'react';
import { clipboardImageFile } from '../utils/sectorImage';

const EDITABLE_TARGET =
  'input, textarea, [contenteditable]:not([contenteditable="false"])';

/**
 * Hands image files pasted anywhere on the page to `onImage` while enabled.
 * Pastes into editable fields and pastes without image data pass through.
 */
export function useClipboardImagePaste(
  enabled: boolean,
  onImage: (file: File) => void
) {
  useEffect(() => {
    if (!enabled) return;

    const handlePaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;

      const target = event.target;
      if (target instanceof Element && target.closest(EDITABLE_TARGET)) {
        return;
      }

      const file = clipboardImageFile(event.clipboardData);
      if (!file) return;

      event.preventDefault();
      onImage(file);
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [enabled, onImage]);
}
