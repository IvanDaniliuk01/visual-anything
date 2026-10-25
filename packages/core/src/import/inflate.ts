/**
 * Inflating deflate data (RFC 1951), raw or in a zlib wrapper (RFC 1950), within a budget of bytes
 * that one file shares, so that a few kilobytes that would inflate to gigabytes are refused as soon
 * as they pass it (ADR-0042). Written out here because the core has no dependency and no I/O; it
 * decodes as the reference decoder `puff` does, a bit at a time, and checks everything it reads.
 */
import { refuse } from './reading';

/** What one file may still inflate to, shared by every compressed part of it. */
export class InflateBudget {
  /** What is left of it. */
  remaining: number;

  constructor(readonly total: number) {
    this.remaining = total;
  }
}

const LENGTH_BASE = Uint16Array.from([
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
]);
const LENGTH_EXTRA = Uint8Array.from([
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
]);
const DISTANCE_BASE = Uint16Array.from([
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
]);
const DISTANCE_EXTRA = Uint8Array.from([
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
]);
/** The order in which a dynamic block gives the lengths of its code length code. */
const CODE_LENGTH_ORDER = Uint8Array.from([
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
]);
const MAX_BITS = 15;

function damaged(): never {
  refuse('The compressed content is not valid deflate data.');
}

/** A canonical Huffman code: how many codes each length has, and the symbols in code order. */
interface Huffman {
  counts: Uint16Array;
  symbols: Uint16Array;
}

/**
 * The code that lengths give; refuses an over-subscribed code, and an incomplete one unless it is a
 * single code of one bit, as deflate allows. The fixed distance code, whose last two codes are never
 * used, is the one incomplete code that is not checked.
 */
function huffman(lengths: Uint8Array, count: number, check = true): Huffman {
  const counts = new Uint16Array(MAX_BITS + 1);
  for (let symbol = 0; symbol < count; symbol++) {
    const length = lengths[symbol] as number;
    counts[length] = (counts[length] as number) + 1;
  }
  const used = count - (counts[0] as number);
  let left = 1;
  for (let length = 1; length <= MAX_BITS; length++) {
    left <<= 1;
    left -= counts[length] as number;
    if (left < 0) damaged();
  }
  if (check && left > 0 && !(used === 1 && counts[1] === 1)) {
    // An incomplete code is allowed only for a single code of one bit, or for no code at all.
    if (used !== 0) damaged();
  }
  const offsets = new Uint16Array(MAX_BITS + 2);
  for (let length = 1; length <= MAX_BITS; length++) {
    offsets[length + 1] = (offsets[length] as number) + (counts[length] as number);
  }
  const symbols = new Uint16Array(count);
  for (let symbol = 0; symbol < count; symbol++) {
    const length = lengths[symbol] as number;
    if (length === 0) continue;
    const at = offsets[length] as number;
    symbols[at] = symbol;
    offsets[length] = at + 1;
  }
  return { counts, symbols };
}

let fixedCodes: { lengths: Huffman; distances: Huffman } | undefined;

function fixed(): { lengths: Huffman; distances: Huffman } {
  if (!fixedCodes) {
    const lengths = new Uint8Array(288);
    lengths.fill(8, 0, 144);
    lengths.fill(9, 144, 256);
    lengths.fill(7, 256, 280);
    lengths.fill(8, 280, 288);
    fixedCodes = {
      lengths: huffman(lengths, 288),
      distances: huffman(new Uint8Array(30).fill(5), 30, false),
    };
  }
  return fixedCodes;
}

/** Reads deflate data, writing what it gives into a buffer that grows up to the budget. */
class Inflater {
  #at = 0;
  #bits = 0;
  #count = 0;
  #out: Uint8Array;
  #length = 0;

  constructor(
    private readonly input: Uint8Array,
    private readonly start: number,
    private readonly cap: number,
    /** The whole budget, which a refusal names. */
    private readonly total: number,
  ) {
    this.#at = start;
    this.#out = new Uint8Array(Math.min(cap, Math.max(1024, input.length * 4)));
  }

  get position(): number {
    return this.#at;
  }

  run(): Uint8Array {
    let last = false;
    while (!last) {
      last = this.bits(1) === 1;
      const type = this.bits(2);
      if (type === 0) this.stored();
      else if (type === 1) this.codes(fixed().lengths, fixed().distances);
      else if (type === 2) this.dynamic();
      else damaged();
    }
    return this.#out.subarray(0, this.#length);
  }

  bits(need: number): number {
    let value = this.#bits;
    while (this.#count < need) {
      if (this.#at >= this.input.length) damaged();
      value |= (this.input[this.#at++] as number) << this.#count;
      this.#count += 8;
    }
    this.#bits = value >>> need;
    this.#count -= need;
    return value & ((1 << need) - 1);
  }

  stored(): void {
    this.#bits = 0;
    this.#count = 0;
    if (this.#at + 4 > this.input.length) damaged();
    const input = this.input;
    const length = (input[this.#at] as number) | ((input[this.#at + 1] as number) << 8);
    const complement = (input[this.#at + 2] as number) | ((input[this.#at + 3] as number) << 8);
    if (length !== (~complement & 0xffff)) damaged();
    this.#at += 4;
    if (this.#at + length > input.length) damaged();
    this.reserve(length);
    this.#out.set(input.subarray(this.#at, this.#at + length), this.#length);
    this.#length += length;
    this.#at += length;
  }

  decode(code: Huffman): number {
    let value = 0;
    let first = 0;
    let index = 0;
    for (let length = 1; length <= MAX_BITS; length++) {
      value |= this.bits(1);
      const count = code.counts[length] as number;
      if (value - count < first) return code.symbols[index + (value - first)] as number;
      index += count;
      first += count;
      first <<= 1;
      value <<= 1;
    }
    return damaged();
  }

  dynamic(): void {
    const lengthCount = this.bits(5) + 257;
    const distanceCount = this.bits(5) + 1;
    const codeCount = this.bits(4) + 4;
    if (lengthCount > 286 || distanceCount > 30) damaged();
    const codeLengths = new Uint8Array(19);
    for (let i = 0; i < codeCount; i++) codeLengths[CODE_LENGTH_ORDER[i] as number] = this.bits(3);
    const lengthCode = huffman(codeLengths, 19);
    const lengths = new Uint8Array(lengthCount + distanceCount);
    let at = 0;
    while (at < lengthCount + distanceCount) {
      const symbol = this.decode(lengthCode);
      if (symbol < 16) {
        lengths[at++] = symbol;
        continue;
      }
      let repeat: number;
      let value = 0;
      if (symbol === 16) {
        if (at === 0) damaged();
        value = lengths[at - 1] as number;
        repeat = 3 + this.bits(2);
      } else if (symbol === 17) repeat = 3 + this.bits(3);
      else repeat = 11 + this.bits(7);
      if (at + repeat > lengthCount + distanceCount) damaged();
      lengths.fill(value, at, at + repeat);
      at += repeat;
    }
    // A block must be able to end.
    if (lengths[256] === 0) damaged();
    this.codes(
      huffman(lengths.subarray(0, lengthCount), lengthCount),
      huffman(lengths.subarray(lengthCount), distanceCount),
    );
  }

  codes(lengthCode: Huffman, distanceCode: Huffman): void {
    for (;;) {
      let symbol = this.decode(lengthCode);
      if (symbol < 256) {
        this.reserve(1);
        this.#out[this.#length++] = symbol;
        continue;
      }
      if (symbol === 256) return;
      symbol -= 257;
      if (symbol >= 29) damaged();
      const length = (LENGTH_BASE[symbol] as number) + this.bits(LENGTH_EXTRA[symbol] as number);
      const distanceSymbol = this.decode(distanceCode);
      if (distanceSymbol >= 30) damaged();
      const distance =
        (DISTANCE_BASE[distanceSymbol] as number) +
        this.bits(DISTANCE_EXTRA[distanceSymbol] as number);
      if (distance > this.#length) damaged();
      this.reserve(length);
      const out = this.#out;
      let from = this.#length - distance;
      for (let i = 0; i < length; i++) out[this.#length++] = out[from++] as number;
    }
  }

  /** Makes room for more bytes, refusing once the budget would be passed. */
  reserve(more: number): void {
    const needed = this.#length + more;
    if (needed > this.cap) {
      refuse(
        `The compressed content inflates to over ${Math.round(this.total / (1024 * 1024))} MiB, the most an import reads.`,
      );
    }
    if (needed <= this.#out.length) return;
    const grown = new Uint8Array(Math.min(this.cap, Math.max(needed, this.#out.length * 2)));
    grown.set(this.#out.subarray(0, this.#length));
    this.#out = grown;
  }

  /** Where the next whole byte starts, after the last block. */
  end(): number {
    return this.#at - Math.floor(this.#count / 8);
  }
}

function spending(budget: InflateBudget, inflate: (cap: number) => Uint8Array): Uint8Array {
  const out = inflate(budget.remaining);
  budget.remaining -= out.length;
  return out;
}

/** Inflates raw deflate data. */
export function inflateRaw(data: Uint8Array, budget: InflateBudget): Uint8Array {
  return spending(budget, (cap) => new Inflater(data, 0, Math.max(0, cap), budget.total).run());
}

/** Whether the bytes start with a zlib header: deflate, a window within 32 KiB, and its check. */
function hasZlibHeader(data: Uint8Array): boolean {
  if (data.length < 2) return false;
  const method = data[0] as number;
  const flags = data[1] as number;
  return (method & 0x0f) === 8 && method >> 4 <= 7 && ((method << 8) | flags) % 31 === 0;
}

/** Inflates zlib data: its header, the deflate data, and the Adler-32 of what it gives. */
export function inflateZlib(data: Uint8Array, budget: InflateBudget): Uint8Array {
  if (!hasZlibHeader(data)) damaged();
  // A preset dictionary is something the file would need from outside itself.
  if (((data[1] as number) & 0x20) !== 0) damaged();
  return spending(budget, (cap) => {
    const inflater = new Inflater(data, 2, Math.max(0, cap), budget.total);
    const out = inflater.run();
    const end = inflater.end();
    if (end + 4 > data.length) damaged();
    const stored =
      (((data[end] as number) << 24) |
        ((data[end + 1] as number) << 16) |
        ((data[end + 2] as number) << 8) |
        (data[end + 3] as number)) >>>
      0;
    if (adler32(out) !== stored) damaged();
    return out;
  });
}

/** Inflates zlib data, or raw deflate data when the bytes do not start with a zlib header. */
export function inflate(data: Uint8Array, budget: InflateBudget): Uint8Array {
  return hasZlibHeader(data) ? inflateZlib(data, budget) : inflateRaw(data, budget);
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length;) {
    const end = Math.min(bytes.length, i + 5552);
    for (; i < end; i++) {
      a += bytes[i] as number;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * Text from UTF-8 bytes, without TextDecoder, which the core's types leave out: each byte that does
 * not start or continue a well-formed character becomes U+FFFD, as the WHATWG decoder does. A byte
 * order mark is kept, for the reader of the text to drop.
 */
export function decodeUtf8(bytes: Uint8Array): string {
  const parts: string[] = [];
  let units: number[] = [];
  const push = (code: number) => {
    if (code > 0xffff) {
      code -= 0x10000;
      units.push(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else units.push(code);
    if (units.length >= 8192) {
      parts.push(String.fromCharCode(...units));
      units = [];
    }
  };
  for (let i = 0; i < bytes.length;) {
    const byte = bytes[i] as number;
    if (byte < 0x80) {
      push(byte);
      i += 1;
      continue;
    }
    let need: number;
    let code: number;
    let lower = 0x80;
    let upper = 0xbf;
    if (byte >= 0xc2 && byte <= 0xdf) {
      need = 1;
      code = byte & 0x1f;
    } else if (byte >= 0xe0 && byte <= 0xef) {
      need = 2;
      code = byte & 0x0f;
      if (byte === 0xe0) lower = 0xa0;
      if (byte === 0xed) upper = 0x9f;
    } else if (byte >= 0xf0 && byte <= 0xf4) {
      need = 3;
      code = byte & 0x07;
      if (byte === 0xf0) lower = 0x90;
      if (byte === 0xf4) upper = 0x8f;
    } else {
      push(0xfffd);
      i += 1;
      continue;
    }
    let j = 1;
    for (; j <= need; j++) {
      const next = bytes[i + j];
      if (next === undefined || next < lower || next > upper) break;
      code = (code << 6) | (next & 0x3f);
      lower = 0x80;
      upper = 0xbf;
    }
    if (j <= need) {
      push(0xfffd);
      i += j;
      continue;
    }
    push(code);
    i += need + 1;
  }
  parts.push(String.fromCharCode(...units));
  return parts.join('');
}
