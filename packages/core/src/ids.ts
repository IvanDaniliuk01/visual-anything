/**
 * New ids. An id is generated once and never reused, so that a reference left behind, such as a broken
 * scenario step, never comes to mean something else. Each id is a readable base made from a name,
 * followed by a random suffix.
 */
import type { Id } from '@visual-anything/schema';

/** Makes a candidate id from a readable base. */
export type IdGenerator = (base: string) => Id;

/** The pattern every id matches; the same as the `Id` pattern of the published schema. */
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const SUFFIX_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const SUFFIX_LENGTH = 6;
const BASE_LENGTH = 40;

/** Whether a string is a valid id. */
export function isId(value: unknown): value is Id {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

/**
 * The readable base of an id made from a name: lowercase ASCII letters and digits joined by dashes,
 * at most 40 characters; `fallback` when the name has none.
 */
export function slug(name: string, fallback: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, BASE_LENGTH)
    .replace(/-+$/, '');
  return base === '' ? fallback : base;
}

/** An id generator that adds six random base-36 characters to the base. */
export function randomIds(random: () => number = Math.random): IdGenerator {
  return (base) => {
    let suffix = '';
    for (let i = 0; i < SUFFIX_LENGTH; i++) {
      suffix += SUFFIX_ALPHABET.charAt(Math.floor(random() * SUFFIX_ALPHABET.length));
    }
    return `${base}-${suffix}`;
  };
}

/** A new id from the generator that no element, relation or other definition has taken. */
export function freshId(generate: IdGenerator, base: string, taken: (id: Id) => boolean): Id {
  for (let attempt = 0; attempt < 100; attempt++) {
    const id = generate(base);
    if (!taken(id)) return id;
  }
  throw new Error(`No free id could be made from "${base}".`);
}
