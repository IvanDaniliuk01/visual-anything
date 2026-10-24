/** What cleaning an image gives: the cleaned value and what was removed, or why it is refused. */
import { problem, type Problem } from '../problems';

/** The outcome of cleaning: the cleaned value with what cleaning removed, in words, or a refusal. */
export type Cleaned<T> =
  { ok: true; value: T; removed: readonly string[] } | { ok: false; problem: Problem };

/** Thrown inside a cleaner to refuse the image; the cleaner turns it into its outcome. */
export class Refusal extends Error {
  override name = 'Refusal';
  constructor(readonly problem: Problem) {
    super(problem.message);
  }
}

/** Refuses an image as not valid. */
export function invalid(message: string): never {
  throw new Refusal(problem('invalid-image', message));
}

/** Refuses an image over a cap. */
export function tooLarge(message: string): never {
  throw new Refusal(problem('image-too-large', message));
}

/** Runs a cleaner, turning a refusal into its outcome. */
export function cleaning<T>(clean: (removals: Removals) => T): Cleaned<T> {
  const removals = new Removals();
  try {
    const value = clean(removals);
    return { ok: true, value, removed: removals.list() };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, problem: error.problem };
    throw error;
  }
}

/** Counts what cleaning removed, by kind, in the order first met. */
export class Removals {
  readonly #counts = new Map<string, { singular: string; plural: string; count: number }>();

  /** Counts one more of a kind, named as "1 script element" and "2 script elements". */
  add(singular: string, plural = `${singular}s`, count = 1): void {
    const key = `${singular}|${plural}`;
    const known = this.#counts.get(key);
    if (known) known.count += count;
    else this.#counts.set(key, { singular, plural, count });
  }

  /** What was removed, in words, such as "2 script elements". */
  list(): string[] {
    return [...this.#counts.values()].map(({ singular, plural, count }) =>
      count === 1 ? `1 ${singular}` : `${count} ${plural}`,
    );
  }
}
