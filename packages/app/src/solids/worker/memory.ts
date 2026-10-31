/**
 * The solid worker's memory (ADR 0075): it keeps the solids it drew lately within 768 MiB of
 * estimated GPU memory, letting go of the least recently drawn first. A solid counts from the first
 * time it is drawn, since three.js puts its geometry and textures on the GPU only then, at the size
 * its reader estimated; drawing it again makes it the most recent.
 */
import { SOLID_WORKER_MEMORY } from '../protocol';

/** The solids drawn lately, by their hashes, least recent first, and what they take. */
export class SolidMemory {
  /** Insertion order is recency: the first is the least recently drawn. */
  private readonly drawn = new Map<string, number>();
  private total = 0;

  constructor(readonly limit: number = SOLID_WORKER_MEMORY) {}

  /** The estimated bytes the solids drawn lately take together. */
  get used(): number {
    return this.total;
  }

  /** The solids drawn lately, least recent first. */
  get order(): string[] {
    return [...this.drawn.keys()];
  }

  /** Whether a solid of this many bytes fits at all. */
  fits(bytes: number): boolean {
    return bytes <= this.limit;
  }

  /**
   * Marks a solid drawn now, taking `bytes`, and answers the solids to let go of to keep within the
   * limit, least recently drawn first. The solid drawn now is never one of them.
   */
  draw(hash: string, bytes: number): string[] {
    const known = this.drawn.get(hash);
    if (known !== undefined) {
      this.drawn.delete(hash);
      this.total -= known;
    }
    this.drawn.set(hash, bytes);
    this.total += bytes;
    const letGo: string[] = [];
    for (const [other, size] of this.drawn) {
      if (this.total <= this.limit) break;
      if (other === hash) continue;
      this.drawn.delete(other);
      this.total -= size;
      letGo.push(other);
    }
    return letGo;
  }

  /** Forgets a solid, let go of or released. */
  forget(hash: string): void {
    const known = this.drawn.get(hash);
    if (known === undefined) return;
    this.drawn.delete(hash);
    this.total -= known;
  }

  /** Forgets every solid: a lost context took what was on the GPU with it. */
  reset(): void {
    this.drawn.clear();
    this.total = 0;
  }
}
