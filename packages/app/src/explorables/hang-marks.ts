/**
 * The mark that keeps an explorable that hung the tab from starting by itself after a reload (ADR
 * 0107). While a frame runs, the tab's session storage names its approval hash; the page takes the
 * marks away as it goes (`pagehide`), which a page whose thread a frame keeps busy never gets to do.
 * So the marks a page finds when it starts are those of frames that were running when it could not
 * go on: those explorables wait for the person to run them again.
 */

/** Where the tab keeps the marks. */
export const RUNNING_KEY = 'visual-anything.explorables.running';

/** What the marks use of the tab's session storage. */
export type MarkStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const HASH = /^[0-9a-f]{64}$/;

export class HangMarks {
  readonly #storage: MarkStorage | undefined;
  /** The hashes found marked when the page started: their frames hung the page before. */
  readonly #hung: Set<string>;
  readonly #running = new Map<string, number>();

  constructor(storage: MarkStorage | undefined) {
    this.#storage = storage;
    this.#hung = new Set(this.#read());
    this.#write();
  }

  /** Whether an explorable's frame was running when the page last stopped without going. */
  hung(hash: string): boolean {
    return this.#hung.has(hash);
  }

  /** The person runs it again: it starts like any other from now on. */
  forgive(hash: string): void {
    this.#hung.delete(hash);
  }

  /** A frame of this hash starts; returns what says it ended. */
  start(hash: string): () => void {
    this.#running.set(hash, (this.#running.get(hash) ?? 0) + 1);
    this.#write();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      const count = (this.#running.get(hash) ?? 1) - 1;
      if (count <= 0) this.#running.delete(hash);
      else this.#running.set(hash, count);
      this.#write();
    };
  }

  /** The page goes as it should: no frame hung it. */
  clear(): void {
    this.#running.clear();
    try {
      this.#storage?.removeItem(RUNNING_KEY);
    } catch {
      // Without storage nothing was marked.
    }
  }

  /** Clears the marks when the page goes, until the function it returns is called. */
  watch(target: Pick<Window, 'addEventListener' | 'removeEventListener'>): () => void {
    const listener = () => this.clear();
    target.addEventListener('pagehide', listener);
    return () => target.removeEventListener('pagehide', listener);
  }

  #read(): string[] {
    try {
      const text = this.#storage?.getItem(RUNNING_KEY);
      if (!text) return [];
      const read: unknown = JSON.parse(text);
      return Array.isArray(read)
        ? read.filter((each): each is string => typeof each === 'string' && HASH.test(each))
        : [];
    } catch {
      return [];
    }
  }

  #write(): void {
    try {
      if (this.#running.size === 0) this.#storage?.removeItem(RUNNING_KEY);
      else this.#storage?.setItem(RUNNING_KEY, JSON.stringify([...this.#running.keys()]));
    } catch {
      // Without storage a reload starts every explorable again.
    }
  }
}
