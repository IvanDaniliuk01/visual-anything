/**
 * What kind of address an IP address is, for what the local program fetches for package code
 * (ADR 0057's clarification on addresses, ADR 0063). A name granted to package code must resolve only
 * to public addresses; an address written in the grant itself may also be a loopback or a private
 * one, which the person granted on purpose. Nothing ever reaches an unspecified, link-local (the
 * cloud metadata address among them), multicast, broadcast or reserved address.
 *
 * IPv6 forms that carry an IPv4 address, mapped (`::ffff:127.0.0.1`), compatible (`::127.0.0.1`),
 * NAT64 (`64:ff9b::/96`) and 6to4 (`2002::/16`), are read as the IPv4 address they carry.
 */

/** What kind of address an IP address is. */
export type AddressKind =
  /** `0.0.0.0/8` and `::`: no one's. */
  | 'unspecified'
  /** `127.0.0.0/8` and `::1`: this computer. */
  | 'loopback'
  /** `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10` and `fc00::/7`. */
  | 'private'
  /** `169.254.0.0/16`, the cloud metadata address `169.254.169.254` among them, and `fe80::/10`. */
  | 'link-local'
  /** `224.0.0.0/4` and `ff00::/8`. */
  | 'multicast'
  /** `240.0.0.0/4`, `255.255.255.255` among them, and the rest of IPv6 no one may route. */
  | 'reserved'
  | 'public';

/** An IP address read: its family and its bytes, an IPv4 one carried in IPv6 read as IPv4. */
export interface ReadAddress {
  family: 4 | 6;
  bytes: number[];
}

/** Reads an IP address as written in a URL's host or by a resolver; undefined when it is none. */
export function readAddress(text: string): ReadAddress | undefined {
  const host = text.startsWith('[') && text.endsWith(']') ? text.slice(1, -1) : text;
  const v4 = readIpv4(host);
  if (v4 !== undefined) return { family: 4, bytes: v4 };
  const v6 = readIpv6(host);
  if (v6 === undefined) return undefined;
  const carried = carriedIpv4(v6);
  return carried === undefined ? { family: 6, bytes: v6 } : { family: 4, bytes: carried };
}

/** What kind of address an IP address is; undefined when the text is not one. */
export function addressKind(text: string): AddressKind | undefined {
  const read = readAddress(text);
  if (read === undefined) return undefined;
  return read.family === 4 ? ipv4Kind(read.bytes) : ipv6Kind(read.bytes);
}

/** Whether a host, as a URL writes it, is an IP address rather than a name. */
export function isAddressLiteral(host: string): boolean {
  return readAddress(host) !== undefined;
}

function ipv4Kind([a = 0, b = 0, c = 0]: number[]): AddressKind {
  if (a === 0) return 'unspecified';
  if (a === 127) return 'loopback';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
  if (a === 100 && b >= 64 && b <= 127) return 'private';
  if (a === 169 && b === 254) return 'link-local';
  if (a >= 224 && a <= 239) return 'multicast';
  if (a >= 240) return 'reserved';
  // The IETF's own block and the blocks for documentation and benchmarks route nowhere real.
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return 'reserved';
  if (a === 198 && (b === 18 || b === 19)) return 'reserved';
  if ((a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) {
    return 'reserved';
  }
  return 'public';
}

function ipv6Kind(bytes: number[]): AddressKind {
  const zero = (from: number, to: number) => bytes.slice(from, to).every((each) => each === 0);
  if (zero(0, 16)) return 'unspecified';
  if (zero(0, 15) && bytes[15] === 1) return 'loopback';
  const first = bytes[0] ?? 0;
  const second = bytes[1] ?? 0;
  if ((first & 0xfe) === 0xfc) return 'private';
  if (first === 0xfe && (second & 0xc0) === 0x80) return 'link-local';
  if (first === 0xff) return 'multicast';
  // Only the global unicast block, 2000::/3, routes; the documentation block within it does not.
  if ((first & 0xe0) !== 0x20) return 'reserved';
  if (first === 0x20 && second === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) {
    return 'reserved';
  }
  return 'public';
}

/** The IPv4 address an IPv6 one carries: mapped, compatible, NAT64 or 6to4. */
function carriedIpv4(bytes: number[]): number[] | undefined {
  const zero = (from: number, to: number) => bytes.slice(from, to).every((each) => each === 0);
  if (zero(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return bytes.slice(12);
  // IPv4-compatible, but not :: or ::1, which are IPv6's own.
  if (zero(0, 12) && !zero(12, 15)) return bytes.slice(12);
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    zero(4, 12)
  ) {
    return bytes.slice(12);
  }
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return bytes.slice(2, 6);
  return undefined;
}

/** Reads dotted-decimal IPv4, four parts of 0 to 255 with no leading zeros. */
function readIpv4(text: string): number[] | undefined {
  const parts = text.split('.');
  if (parts.length !== 4) return undefined;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return undefined;
    const value = Number(part);
    if (value > 255) return undefined;
    bytes.push(value);
  }
  return bytes;
}

/** Reads IPv6, with `::`, an IPv4 address at its end, and a zone, which it leaves out. */
function readIpv6(text: string): number[] | undefined {
  const zone = text.indexOf('%');
  const address = (zone >= 0 ? text.slice(0, zone) : text).toLowerCase();
  if (address === '' || !/^[0-9a-f:.]+$/.test(address)) return undefined;
  const halves = address.split('::');
  if (halves.length > 2) return undefined;
  const groupsOf = (half: string): number[] | undefined => {
    if (half === '') return [];
    const groups: number[] = [];
    const parts = half.split(':');
    for (const [at, part] of parts.entries()) {
      if (part.includes('.')) {
        if (at !== parts.length - 1) return undefined;
        const v4 = readIpv4(part);
        if (v4 === undefined) return undefined;
        groups.push(((v4[0] ?? 0) << 8) | (v4[1] ?? 0), ((v4[2] ?? 0) << 8) | (v4[3] ?? 0));
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(part)) return undefined;
      groups.push(parseInt(part, 16));
    }
    return groups;
  };
  const head = groupsOf(halves[0] ?? '');
  const tail = halves.length === 2 ? groupsOf(halves[1] ?? '') : [];
  if (head === undefined || tail === undefined) return undefined;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return undefined;
  const groups = [
    ...head,
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => 0),
    ...tail,
  ];
  return groups.flatMap((group) => [group >> 8, group & 0xff]);
}
