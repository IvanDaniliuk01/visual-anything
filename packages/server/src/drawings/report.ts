/**
 * What making a drawing dropped, in the core's words (ADR 0068): counted by kind, as the image cleaner
 * counts what it removes ("1 script element", "3 event handler attributes"), in the order first met,
 * and then the sentences that say once what happened to the whole page. The app reads each line
 * through its catalog's templates (ADR 0038).
 */

/** How many kinds of thing a report names, as the image cleaner's report does. */
export const REPORTED_KINDS = 20;

export class DrawingReport {
  readonly #counts = new Map<string, { singular: string; plural: string; count: number }>();
  readonly #notes: string[] = [];

  /** Counts one more of a kind, or `count` more, named as "1 script element" and "2 script elements". */
  add(singular: string, plural = `${singular}s`, count = 1): void {
    if (count <= 0) return;
    const key = `${singular}|${plural}`;
    const known = this.#counts.get(key);
    if (known) known.count += count;
    else this.#counts.set(key, { singular, plural, count });
  }

  /** Says once, in a sentence of its own, what happened to the whole page. */
  note(sentence: string): void {
    if (!this.#notes.includes(sentence)) this.#notes.push(sentence);
  }

  /** How many of a kind were counted. */
  count(singular: string, plural = `${singular}s`): number {
    return this.#counts.get(`${singular}|${plural}`)?.count ?? 0;
  }

  /**
   * The report, line by line: at most {@link REPORTED_KINDS} kinds, then how many more kinds there
   * were, then the sentences.
   */
  lines(): string[] {
    const all = [...this.#counts.values()].map(({ singular, plural, count }) =>
      count === 1 ? `1 ${singular}` : `${count} ${plural}`,
    );
    const more = all.length - REPORTED_KINDS;
    const kinds =
      more <= 0
        ? all
        : [...all.slice(0, REPORTED_KINDS), `${more} more kind${more === 1 ? '' : 's'} of thing`];
    return [...kinds, ...this.#notes];
  }
}
