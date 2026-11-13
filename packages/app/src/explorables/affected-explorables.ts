/**
 * The approved explorables a script library's change affects, as the consent dialog lists them (ADR
 * 0107, A10's review). The core's `script-library/consent` does not carry them yet: this reads the
 * optional field `approvedExplorables`, and is the one place to follow the core's name for it.
 */
import type { ScriptLibraryConsentMessage } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** An approved explorable a library change affects, by its id and, when given, its name. */
export interface AffectedExplorable {
  id: Id;
  name: string;
}

/**
 * The approved explorables a request's library change affects, read from the optional field
 * `approvedExplorables`: each an id, or `{ id, name }` (`explorable` is taken for `id` too). Anything
 * else is passed over; none when the field is missing.
 */
export function affectedExplorables(asked: ScriptLibraryConsentMessage): AffectedExplorable[] {
  const given = (asked as { approvedExplorables?: unknown }).approvedExplorables;
  if (!Array.isArray(given)) return [];
  return given.flatMap((each: unknown): AffectedExplorable[] => {
    if (typeof each === 'string') return [{ id: each, name: each }];
    if (typeof each !== 'object' || each === null) return [];
    const { id, explorable, name } = each as Record<string, unknown>;
    const which = typeof id === 'string' ? id : typeof explorable === 'string' ? explorable : '';
    if (which === '') return [];
    return [{ id: which, name: typeof name === 'string' && name !== '' ? name : which }];
  });
}
