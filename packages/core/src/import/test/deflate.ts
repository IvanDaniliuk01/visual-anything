/**
 * A small deflate writer for the tests (RFC 1951): stored blocks, and fixed-Huffman blocks with
 * matches found greedily, so that the inflater can be checked on any bytes, and bombs made that
 * inflate to more than the cap from a few kilobytes.
 */

/** Writes bits from the least significant first, as deflate packs them. */
class BitWriter {
  readonly bytes: number[] = [];
  #acc = 0;
  #count = 0;

  bits(value: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.#acc |= ((value >>> i) & 1) << this.#count;
      this.#count += 1;
      if (this.#count === 8) this.flush();
    }
  }

  /** A Huffman code, written from its most significant bit. */
  code(code: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits((code >>> i) & 1, 1);
  }

  flush(): void {
    if (this.#count === 0) return;
    this.bytes.push(this.#acc);
    this.#acc = 0;
    this.#count = 0;
  }
}

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

/** Writes a literal or length symbol in the fixed code. */
function fixedSymbol(out: BitWriter, symbol: number): void {
  if (symbol < 144) out.code(0x30 + symbol, 8);
  else if (symbol < 256) out.code(0x190 + symbol - 144, 9);
  else if (symbol < 280) out.code(symbol - 256, 7);
  else out.code(0xc0 + symbol - 280, 8);
}

function lastIndexAtMost(table: readonly number[], value: number): number {
  let at = 0;
  while (at + 1 < table.length && (table[at + 1] as number) <= value) at++;
  return at;
}

function writeMatch(out: BitWriter, length: number, distance: number): void {
  const lengthCode = length === 258 ? 28 : lastIndexAtMost(LENGTH_BASE.slice(0, 28), length);
  fixedSymbol(out, 257 + lengthCode);
  out.bits(length - (LENGTH_BASE[lengthCode] as number), LENGTH_EXTRA[lengthCode] as number);
  const distanceCode = lastIndexAtMost(DISTANCE_BASE, distance);
  out.code(distanceCode, 5);
  out.bits(
    distance - (DISTANCE_BASE[distanceCode] as number),
    DISTANCE_EXTRA[distanceCode] as number,
  );
}

/** Raw deflate of the bytes in one fixed-Huffman block, with greedy matches. */
export function deflateFixed(data: Uint8Array): Uint8Array {
  const out = new BitWriter();
  out.bits(1, 1);
  out.bits(1, 2);
  const last = new Map<number, number>();
  let i = 0;
  while (i < data.length) {
    let length = 0;
    let distance = 0;
    if (i + 2 < data.length) {
      const key =
        ((data[i] as number) << 16) | ((data[i + 1] as number) << 8) | (data[i + 2] as number);
      const start = last.get(key);
      last.set(key, i);
      if (start !== undefined && i - start <= 32768) {
        while (
          length < 258 &&
          i + length < data.length &&
          data[start + length] === data[i + length]
        ) {
          length++;
        }
        distance = i - start;
      }
    }
    if (length >= 3) {
      writeMatch(out, length, distance);
      i += length;
    } else {
      fixedSymbol(out, data[i] as number);
      i++;
    }
  }
  fixedSymbol(out, 256);
  out.flush();
  return Uint8Array.from(out.bytes);
}

/** Raw deflate of the bytes in stored blocks of at most `size` bytes. */
export function deflateStored(data: Uint8Array, size = 65535): Uint8Array {
  const bytes: number[] = [];
  let at = 0;
  do {
    const length = Math.min(size, data.length - at);
    const final = at + length >= data.length ? 1 : 0;
    bytes.push(final, length & 255, length >> 8, ~length & 255, (~length >> 8) & 255);
    for (let i = 0; i < length; i++) bytes.push(data[at + i] as number);
    at += length;
  } while (at < data.length);
  return Uint8Array.from(bytes);
}

/**
 * A bomb: raw deflate of one byte followed by `matches` copies of the longest match at distance 1,
 * which inflates to 1 + 258 × `matches` bytes from about 13 bits a match.
 */
export function deflateBomb(matches: number): Uint8Array {
  const out = new BitWriter();
  out.bits(1, 1);
  out.bits(1, 2);
  fixedSymbol(out, 0);
  for (let i = 0; i < matches; i++) writeMatch(out, 258, 1);
  fixedSymbol(out, 256);
  out.flush();
  return Uint8Array.from(out.bytes);
}

/** The bytes of a hexadecimal string. */
export function hex(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** UTF-8 bytes of a text, without TextEncoder, which the core's types leave out. */
export function utf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
    }
  }
  return Uint8Array.from(bytes);
}
