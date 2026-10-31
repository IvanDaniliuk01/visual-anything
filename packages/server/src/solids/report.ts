/**
 * What cleaning a solid dropped or changed (ADR 0075), in the words the person reads in the import
 * dialog and on the command line: counted by kind, as the image cleaner counts what it removes ("2
 * cameras", "1 skin"), in the order first met, then the sentences that say once what happened to the
 * whole file. The app reads each line in Spanish through its catalog's templates (ADR 0038).
 */

/** How many kinds of thing the report names, as the image cleaner's report does. */
export const REPORTED_KINDS = 20;

/** How many sentences the report says, so that it fits the 100 lines `solid/prepared` carries. */
export const REPORTED_NOTES = 60;

/** How many renamed nodes the report names one by one. */
export const REPORTED_RENAMES = 12;

export class SolidReport {
  readonly #counts = new Map<string, { singular: string; plural: string; count: number }>();
  readonly #notes: string[] = [];
  readonly #renames: string[] = [];
  #moreRenames = 0;

  /** Counts `count` more of a kind, named as "1 camera" and "2 cameras". */
  add(singular: string, plural = `${singular}s`, count = 1): void {
    if (count <= 0) return;
    const key = `${singular}|${plural}`;
    const known = this.#counts.get(key);
    if (known) known.count += count;
    else this.#counts.set(key, { singular, plural, count });
  }

  /** How many of a kind were counted. */
  count(singular: string, plural = `${singular}s`): number {
    return this.#counts.get(`${singular}|${plural}`)?.count ?? 0;
  }

  /** Says once, in a sentence of its own, what happened to the whole file. */
  note(sentence: string): void {
    if (!this.#notes.includes(sentence)) this.#notes.push(sentence);
  }

  /** Says that a node's name changed, as cleaning names nodes (ADR 0075). */
  renamed(from: string, to: string): void {
    if (this.#renames.length < REPORTED_RENAMES) {
      this.#renames.push(`The node "${clip(from)}" is named "${to}".`);
    } else this.#moreRenames += 1;
  }

  /** The report, line by line: the kinds, then the sentences, then the names changed. */
  lines(): string[] {
    const all = [...this.#counts.values()].map(({ singular, plural, count }) =>
      count === 1 ? `1 ${singular}` : `${count.toLocaleString('en')} ${plural}`,
    );
    const more = all.length - REPORTED_KINDS;
    const kinds =
      more <= 0
        ? all
        : [...all.slice(0, REPORTED_KINDS), `${more} more kind${more === 1 ? '' : 's'} of thing`];
    const renames =
      this.#moreRenames === 0
        ? this.#renames
        : [
            ...this.#renames,
            this.#moreRenames === 1
              ? '1 more node is named otherwise.'
              : `${this.#moreRenames.toLocaleString('en')} more nodes are named otherwise.`,
          ];
    return [...kinds, ...this.#notes.slice(0, REPORTED_NOTES), ...renames];
  }
}

/** A name from the file as the report quotes it: at most 64 characters, on one line. */
function clip(name: string): string {
  // eslint-disable-next-line no-control-regex
  const line = name.replace(/[\u0000-\u001f\u007f"\\]/g, '_');
  return line.length > 64 ? `${line.slice(0, 64)}…` : line;
}
