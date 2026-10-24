import type { Command } from '@visual-anything/core';

/** The command the stand-in sends, as renaming an element on the canvas would. */
export const CANVAS_COMMAND: Command = {
  type: 'update-element',
  id: 'patient',
  changes: { name: 'Client' },
};
