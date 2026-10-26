/**
 * Keep as attribute (ADR 0057): a live value turned into an ordinary, undoable edit of the stored
 * attribute it names, one action of the person's.
 */
import type { Command } from '@visual-anything/core';
import type { JsonValue } from '@visual-anything/schema';
import type { Attributed } from './lookup';

/** The label the history gives Keep as attribute, which the history panel translates. */
export function keepLabel(attribute: string): string {
  return `Keep the live value of “${attribute}” as an attribute`;
}

/** The command that keeps a live value as the stored value of its attribute. */
export function keepCommand(item: Attributed, attribute: string, value: JsonValue): Command {
  const change = { attributes: { [attribute]: value } };
  return {
    type: 'batch',
    label: keepLabel(attribute),
    commands: [
      item.kind === 'element'
        ? { type: 'update-element', id: item.element.id, changes: change }
        : { type: 'update-relation', id: item.relation.id, changes: change },
    ],
  };
}
