/**
 * Base64, as package files keep a bitmap's bytes: the standard alphabet with `=` padding and no line
 * breaks. Written out here because the core runs without the DOM and without Node's Buffer.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALUES = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) VALUES[ALPHABET.charCodeAt(i)] = i;

/** Bytes written in base64. */
export function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = '';
  const full = bytes.length - (bytes.length % 3);
  for (let i = 0; i < full; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    chunk +=
      ALPHABET.charAt(n >> 18) +
      ALPHABET.charAt((n >> 12) & 63) +
      ALPHABET.charAt((n >> 6) & 63) +
      ALPHABET.charAt(n & 63);
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  const rest = bytes.length - full;
  if (rest === 1) {
    const n = (bytes[full] ?? 0) << 16;
    chunk += `${ALPHABET.charAt(n >> 18)}${ALPHABET.charAt((n >> 12) & 63)}==`;
  } else if (rest === 2) {
    const n = ((bytes[full] ?? 0) << 16) | ((bytes[full + 1] ?? 0) << 8);
    chunk += `${ALPHABET.charAt(n >> 18)}${ALPHABET.charAt((n >> 12) & 63)}${ALPHABET.charAt((n >> 6) & 63)}=`;
  }
  parts.push(chunk);
  return parts.join('');
}

/**
 * The bytes base64 text holds; `undefined` when it is not canonical base64: a length that is not a
 * multiple of 4, a character outside the alphabet, padding anywhere but at the end, or padding bits
 * that are not zero. Only canonical text round-trips, so a stored value has one spelling.
 */
export function decodeBase64(text: string): Uint8Array | undefined {
  if (text.length % 4 !== 0) return undefined;
  let padding = 0;
  if (text.endsWith('==')) padding = 2;
  else if (text.endsWith('=')) padding = 1;
  const length = (text.length / 4) * 3 - padding;
  const bytes = new Uint8Array(length);
  let out = 0;
  for (let i = 0; i < text.length; i += 4) {
    const last = i + 4 === text.length;
    const a = valueAt(text, i);
    const b = valueAt(text, i + 1);
    const c = last && padding === 2 ? 0 : valueAt(text, i + 2);
    const d = last && padding >= 1 ? 0 : valueAt(text, i + 3);
    if (a < 0 || b < 0 || c < 0 || d < 0) return undefined;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    const kept = last ? 3 - padding : 3;
    // The bits past the last byte must be zero, so that each byte string has one spelling.
    if (kept === 1 && (n & 0xffff) !== 0) return undefined;
    if (kept === 2 && (n & 0xff) !== 0) return undefined;
    bytes[out++] = n >> 16;
    if (kept >= 2) bytes[out++] = (n >> 8) & 255;
    if (kept === 3) bytes[out++] = n & 255;
  }
  return bytes;
}

function valueAt(text: string, index: number): number {
  const code = text.charCodeAt(index);
  return code < 128 ? (VALUES[code] ?? -1) : -1;
}
