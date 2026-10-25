/** Checking the destinations a command stores (ADR 0056). */
import type { AttributeDefinition, Attributes } from '@visual-anything/schema';
import { readDestination } from '../destinations';
import { reject } from './draft';

/**
 * Refuses, with `invalid-destination`, values a command sets on attributes of type `destination`
 * that are not destinations: `file:`, `javascript:` and other schemes are refused when stored.
 */
export function checkDestinationValues(
  set: Attributes | undefined,
  definitions: readonly AttributeDefinition[],
  of: string,
): void {
  if (set === undefined) return;
  for (const definition of definitions) {
    if (definition.type !== 'destination' || !Object.hasOwn(set, definition.name)) continue;
    const read = readDestination(set[definition.name]);
    if (!read.ok) {
      reject(
        'invalid-destination',
        `"${definition.name}" of ${of} holds a destination, and this is not one: ${read.why}`,
      );
    }
  }
}
