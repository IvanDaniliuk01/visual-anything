import type { ReactNode } from 'react';

/**
 * Secondary text after an item's name; screen readers hear it after a comma. The space after the comma
 * is a text of its own, which the accessible name keeps, as it would not keep the hidden comma's.
 */
export function Secondary({ text }: { text: ReactNode }) {
  return (
    <span className="item-detail">
      <span className="visually-hidden">,</span> {text}
    </span>
  );
}
