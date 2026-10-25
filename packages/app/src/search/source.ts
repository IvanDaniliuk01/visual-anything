/**
 * The search index the find field reads, kept outside React's state: asked for a project, it builds
 * that project's index a slice at a time between frames, and tells its listeners once it is whole.
 * Until then it holds the index it had, if any, so that results never blink while typing goes on.
 */
import type { Definitions, ProjectSnapshot } from '@visual-anything/core';
import { IndexBuilder, type FindIndex } from './find';

/** How long one slice of indexing works, in milliseconds: half a frame, at most. */
export const INDEX_SLICE = 6;

/** How the source waits between slices: a task of its own, so that frames come in between. */
export interface Later {
  set(callback: () => void): unknown;
  clear(handle: unknown): void;
}

const NEXT_TASK: Later = {
  set: (callback) => setTimeout(callback, 0),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class IndexSource {
  #index: FindIndex | undefined;
  #for: { project: ProjectSnapshot; definitions: Definitions } | undefined;
  #building: { builder: IndexBuilder; handle: unknown } | undefined;
  readonly #listeners = new Set<() => void>();

  constructor(private readonly later: Later = NEXT_TASK) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** The index whole last, until the one asked for is whole too. */
  readonly get = (): FindIndex | undefined => this.#index;

  /** Asks for the index of a project; it comes a few slices later, or at once when it is the same. */
  want(project: ProjectSnapshot, definitions: Definitions): void {
    if (this.#for?.project === project && this.#for.definitions === definitions) return;
    this.stop();
    this.#for = { project, definitions };
    const builder = new IndexBuilder(project, definitions);
    const work = () => {
      if (!builder.step(INDEX_SLICE)) {
        this.#building = { builder, handle: this.later.set(work) };
        return;
      }
      this.#building = undefined;
      this.#index = builder.index;
      for (const listener of this.#listeners) listener();
    };
    this.#building = { builder, handle: this.later.set(work) };
  }

  /** Stops building; the index it has stays. */
  stop(): void {
    if (this.#building) this.later.clear(this.#building.handle);
    this.#building = undefined;
    this.#for = undefined;
  }
}
