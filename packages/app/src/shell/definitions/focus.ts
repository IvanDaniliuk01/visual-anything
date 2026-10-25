import { flushSync } from 'react-dom';

/**
 * Shows the selection again in the inspector that holds `from`, and moves the focus to what it then
 * inspects, as when the control that had it goes with the component editor: the title of what is
 * selected, or else the inspector's heading.
 */
export function backToSelection(from: Element | null, close: () => void): void {
  const panel = from?.closest('.inspector');
  flushSync(close);
  const target =
    panel?.querySelector<HTMLElement>('.inspector-title') ??
    panel?.querySelector<HTMLElement>('h2');
  if (!target) return;
  if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
  target.focus();
}
