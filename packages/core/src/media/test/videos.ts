/**
 * Small MP4 and WebM files written byte by byte for the video reader's tests (ADR 0098, stage 2):
 * their containers only, with a few bytes standing for frames, which the reader never decodes.
 */

const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

function joined(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function u32(value: number): Uint8Array {
  return Uint8Array.of(value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function u16(value: number): Uint8Array {
  return Uint8Array.of((value >>> 8) & 0xff, value & 0xff);
}

// MP4 ---------------------------------------------------------------------------------------------

/** An MP4 box: its 32-bit size, its type, then its contents. */
export function box(type: string, ...contents: Uint8Array[]): Uint8Array {
  const body = joined(contents);
  return joined([u32(8 + body.length), ascii(type), body]);
}

/** An MP4 box written with a 64-bit size. */
export function largeBox(type: string, ...contents: Uint8Array[]): Uint8Array {
  const body = joined(contents);
  return joined([u32(1), ascii(type), u32(0), u32(16 + body.length), body]);
}

/** A full box: a box whose contents start with a version and flags. */
export function fullBox(type: string, version: number, ...contents: Uint8Array[]): Uint8Array {
  return box(type, Uint8Array.of(version, 0, 0, 0), ...contents);
}

/** `ftyp`, with its major brand and compatible ones. */
export function ftyp(major = 'isom', compatible: readonly string[] = ['isom', 'iso2', 'avc1']) {
  return box('ftyp', ascii(major), u32(0x200), ...compatible.map(ascii));
}

const IDENTITY = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
/** The matrix of a quarter turn, as a phone held upright writes it. */
export const QUARTER_TURN = [0, 0x10000, 0, 0xffff0000, 0, 0, 0, 0, 0x40000000];

/** A track header: its display size in 16.16 and its matrix. */
export function tkhd(width: number, height: number, matrix = IDENTITY): Uint8Array {
  return fullBox(
    'tkhd',
    0,
    new Uint8Array(4 * 5), // created, changed, track, reserved, duration
    new Uint8Array(8 + 2 + 2 + 2 + 2), // reserved, layer, group, volume, reserved
    ...matrix.map(u32),
    u32(Math.round(width * 0x10000)),
    u32(Math.round(height * 0x10000)),
  );
}

/** A handler box naming what a track holds: `vide`, `soun`, …, and its name, empty by default. */
export function hdlr(handler: string, name = ''): Uint8Array {
  return fullBox('hdlr', 0, u32(0), ascii(handler), new Uint8Array(12), ascii(`${name}\0`));
}

/** An H.264 configuration, `avcC`, of a version. */
export function avcC(version = 1): Uint8Array {
  return box('avcC', Uint8Array.of(version, 0x64, 0x00, 0x1f, 0xff, 0xe0, 0x00));
}

/** A visual sample description of a codec, its size in pixels, with the boxes it holds. */
export function visualEntry(
  codec: string,
  width: number,
  height: number,
  ...inside: Uint8Array[]
): Uint8Array {
  return box(
    codec,
    new Uint8Array(6),
    u16(1), // data reference
    new Uint8Array(16),
    u16(width),
    u16(height),
    u32(0x480000),
    u32(0x480000),
    u32(0),
    u16(1),
    new Uint8Array(32),
    u16(0x18),
    u16(0xffff),
    ...inside,
  );
}

/** A track of a handler whose sample descriptions are these entries. */
export function trak(
  handler: string,
  entries: readonly Uint8Array[],
  header: Uint8Array = tkhd(0, 0),
  ...more: Uint8Array[]
): Uint8Array {
  const stsd = fullBox('stsd', 0, u32(entries.length), ...entries);
  return box(
    'trak',
    header,
    box(
      'mdia',
      fullBox('mdhd', 0, new Uint8Array(20)),
      hdlr(handler),
      box('minf', box('dinf'), box('stbl', stsd, fullBox('stts', 0, u32(0)))),
    ),
    ...more,
  );
}

/** An H.264 video track of a size. */
export function h264Track(width = 320, height = 240, ...more: Uint8Array[]): Uint8Array {
  return trak('vide', [visualEntry('avc1', width, height, avcC())], tkhd(width, height), ...more);
}

/** An AAC audio track. */
export function audioTrack(): Uint8Array {
  return trak('soun', [box('mp4a', new Uint8Array(28))]);
}

/** `udta` with a phone's place, as `©xyz`. */
export function placeBox(): Uint8Array {
  return box('udta', box('©xyz', ascii('+48.8584+002.2945/')));
}

/** An MP4: `ftyp`, then `moov` with these tracks, then `mdat`, and any boxes after. */
export function mp4({
  tracks = [h264Track()],
  brand = ftyp(),
  inMoov = [],
  after = [],
  before = [],
}: {
  tracks?: readonly Uint8Array[];
  brand?: Uint8Array;
  inMoov?: readonly Uint8Array[];
  after?: readonly Uint8Array[];
  before?: readonly Uint8Array[];
} = {}): Uint8Array {
  return joined([
    brand,
    ...before,
    box('moov', fullBox('mvhd', 0, new Uint8Array(96)), ...tracks, ...inMoov),
    box('mdat', Uint8Array.of(0, 0, 0, 2, 0x65, 0x88)),
    ...after,
  ]);
}

// WebM --------------------------------------------------------------------------------------------

/** An EBML element's id, written with its marker bits as it is read. */
function idBytes(id: number): Uint8Array {
  const bytes: number[] = [];
  for (let rest = id; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest % 256);
  return Uint8Array.from(bytes);
}

/** An EBML size, in the fewest bytes, or of a length given. */
function sizeBytes(size: number, length?: number): Uint8Array {
  let bytes = length ?? 1;
  while (length === undefined && size >= 2 ** (7 * bytes) - 1) bytes += 1;
  const out = new Uint8Array(bytes);
  let rest = size;
  for (let at = bytes - 1; at >= 0; at -= 1) {
    out[at] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  out[0] = (out[0] as number) | (0x80 >> (bytes - 1));
  return out;
}

/** An EBML element of known size. */
export function el(id: number, ...contents: Uint8Array[]): Uint8Array {
  const body = joined(contents);
  return joined([idBytes(id), sizeBytes(body.length), body]);
}

/** An EBML element of unknown size, as a live recording writes its Segment and Clusters. */
export function unsized(id: number, ...contents: Uint8Array[]): Uint8Array {
  return joined([
    idBytes(id),
    Uint8Array.of(0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff),
    ...contents,
  ]);
}

/** An unsigned integer element. */
export function uint(id: number, value: number): Uint8Array {
  const bytes: number[] = [];
  for (let rest = value; rest > 0 || bytes.length === 0; rest = Math.floor(rest / 256)) {
    bytes.unshift(rest % 256);
  }
  return el(id, Uint8Array.from(bytes));
}

/** A string element. */
export function str(id: number, text: string): Uint8Array {
  return el(id, ascii(text));
}

export const WEBM = {
  ebml: 0x1a45dfa3,
  docType: 0x4282,
  docTypeReadVersion: 0x4285,
  segment: 0x18538067,
  info: 0x1549a966,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackType: 0x83,
  codec: 0x86,
  video: 0xe0,
  pixelWidth: 0xb0,
  pixelHeight: 0xba,
  displayWidth: 0x54b0,
  displayHeight: 0x54ba,
  contentEncodings: 0x6d80,
  cluster: 0x1f43b675,
  timestamp: 0xe7,
  simpleBlock: 0xa3,
  tags: 0x1254c367,
  attachments: 0x1941a469,
  cues: 0x1c53bb6b,
  void: 0xec,
} as const;

/** The EBML header of a document type. */
export function ebmlHeader(docType = 'webm', readVersion = 2): Uint8Array {
  return el(
    WEBM.ebml,
    uint(0x4286, 1),
    uint(0x42f7, 1),
    uint(0x42f2, 4),
    uint(0x42f3, 8),
    str(WEBM.docType, docType),
    uint(0x4287, 4),
    uint(WEBM.docTypeReadVersion, readVersion),
  );
}

/** A track entry of a type, 1 video or 2 audio, and a codec, with what else it holds. */
export function trackEntry(type: number, codec: string, ...more: Uint8Array[]): Uint8Array {
  return el(
    WEBM.trackEntry,
    uint(0xd7, type),
    uint(0x73c5, type),
    uint(WEBM.trackType, type),
    str(WEBM.codec, codec),
    ...more,
  );
}

/** A VP9 video track of a size. */
export function vp9Track(width = 640, height = 360, ...more: Uint8Array[]): Uint8Array {
  return trackEntry(
    1,
    'V_VP9',
    el(WEBM.video, uint(WEBM.pixelWidth, width), uint(WEBM.pixelHeight, height), ...more),
  );
}

/** A cluster holding two blocks. */
export function cluster(sized = true): Uint8Array {
  const parts = [
    uint(WEBM.timestamp, 0),
    el(WEBM.simpleBlock, Uint8Array.of(0x81, 0, 0, 0x80, 1, 2, 3)),
    el(WEBM.simpleBlock, Uint8Array.of(0x81, 0, 33, 0x00, 4, 5)),
  ];
  return sized ? el(WEBM.cluster, ...parts) : unsized(WEBM.cluster, ...parts);
}

/** A WebM: its header, then a Segment with Info, these tracks, and these elements after. */
export function webm({
  tracks = [vp9Track()],
  header = ebmlHeader(),
  after = [cluster()],
  sized = true,
  info = [],
}: {
  tracks?: readonly Uint8Array[];
  header?: Uint8Array;
  after?: readonly Uint8Array[];
  sized?: boolean;
  info?: readonly Uint8Array[];
} = {}): Uint8Array {
  const contents = [
    el(WEBM.info, uint(0x2ad7b1, 1_000_000), ...info),
    el(WEBM.tracks, ...tracks),
    ...after,
  ];
  return joined([
    header,
    sized ? el(WEBM.segment, ...contents) : unsized(WEBM.segment, ...contents),
  ]);
}

/** Tags naming a title, as a muxer writes them. */
export function tags(): Uint8Array {
  return el(
    WEBM.tags,
    el(0x7373, el(0x67c8, str(0x45a3, 'TITLE'), str(0x4487, 'At the front desk'))),
  );
}

/** A time in seconds since 1904, as a phone writes when a video was made. */
const MADE = u32(0xe1a2b3c4);

/**
 * An MP4 as a phone writes one: the times it was made and changed, its handlers' and compressor's
 * names, its audio's vendor, and its place and serial number in boxes a player never reads, at
 * every depth.
 */
export function phoneMp4(): Uint8Array {
  const times = (rest: number) => [MADE, MADE, new Uint8Array(rest)];
  const entry = box(
    'avc1',
    new Uint8Array(6),
    u16(1),
    new Uint8Array(16),
    u16(64),
    u16(48),
    u32(0x480000),
    u32(0x480000),
    u32(0),
    u16(1),
    Uint8Array.of(10, ...ascii('Pixel AVC'), ...new Uint8Array(22)),
    u16(0x18),
    u16(0xffff),
    avcC(),
    box('uuid', new Uint8Array(16), ascii('serial 4411')),
  );
  const audio = box('mp4a', new Uint8Array(8), u16(0), u16(0), ascii('appl'), new Uint8Array(12));
  const track = (handler: string, name: string, sample: Uint8Array, header: Uint8Array) =>
    box(
      'trak',
      header,
      box(
        'mdia',
        fullBox('mdhd', 0, ...times(12)),
        hdlr(handler, name),
        box(
          'minf',
          box(
            'dinf',
            fullBox(
              'dref',
              0,
              u32(1),
              fullBox('url ', 0).map((b, i) => (i === 11 ? 1 : b)),
            ),
          ),
          box(
            'stbl',
            fullBox('stsd', 0, u32(1), sample),
            fullBox('stts', 0, u32(0)),
            box('gps ', ascii('+48.85')),
          ),
          box('udta', ascii('+48.85')),
        ),
      ),
      box('meta', ascii('Owner Ana')),
    );
  const header = fullBox(
    'tkhd',
    0,
    ...times(12),
    new Uint8Array(16),
    ...IDENTITY.map(u32),
    u32(64 * 0x10000),
    u32(48 * 0x10000),
  );
  return joined([
    ftyp(),
    box(
      'moov',
      fullBox('mvhd', 0, ...times(88)),
      track('vide', 'Core Media Video', entry, header),
      track('soun', 'Core Media Audio', audio, tkhd(0, 0)),
      box('iods', ascii('Pixel 8 Pro')),
    ),
    box('free', ascii('Pixel 8 Pro')),
    box('mdat', Uint8Array.of(0, 0, 0, 2, 0x65, 0x88)),
  ]);
}

/** Its strings a cleaned file must not hold. */
export const PHONE_STRINGS = ['Pixel', 'serial', 'Core Media', 'appl', '+48.85', 'Owner', 'Ana'];
