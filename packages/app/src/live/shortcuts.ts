/**
 * The keyboard shortcuts for undo and redo. Typing keeps its own undo: a shortcut pressed while the
 * focus is in a text input or in editable content belongs to the text there, not to the history.
 */

/** The parts of a key press that make a shortcut. */
export type ShortcutKeys = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
>;

export type HistoryAction = 'undo' | 'redo';

/** The history action a key press asks for: Ctrl+Z or ⌘Z undo; Ctrl+Shift+Z, ⌘⇧Z and Ctrl+Y redo. */
export function historyShortcut(keys: ShortcutKeys): HistoryAction | undefined {
  if (keys.altKey || !(keys.ctrlKey || keys.metaKey)) return undefined;
  const letter = letterOf(keys);
  if (letter === 'z') return keys.shiftKey ? 'redo' : 'undo';
  // Not ⌘Y: Safari shows its history with it.
  if (letter === 'y' && keys.ctrlKey && !keys.metaKey && !keys.shiftKey) return 'redo';
  return undefined;
}

/** The letter a key types: the key itself on Latin layouts, and its place on the others. */
export function letterOf({ key, code }: Pick<ShortcutKeys, 'key' | 'code'>): string {
  const typed = key.toLowerCase();
  if (/^[a-z]$/.test(typed)) return typed;
  return /^Key([A-Z])$/.exec(code)?.[1]?.toLowerCase() ?? typed;
}

/** Input types that take no typed text, so they have no undo of their own. */
const NOT_TYPED = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** Whether typing goes to this target: a text input, a text area or editable content. */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !NOT_TYPED.has(target.type);
  if (target instanceof HTMLTextAreaElement) return true;
  // Browsers say whether content is editable; jsdom does not, so read contenteditable as they do.
  if (typeof target.isContentEditable === 'boolean') return target.isContentEditable;
  const editable = target.closest('[contenteditable]');
  return editable !== null && editable.getAttribute('contenteditable')?.toLowerCase() !== 'false';
}
