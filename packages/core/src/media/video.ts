/**
 * The video reader (ADR 0098, stage 2): an MP4 of H.264 or a WebM of VP8, VP9 or AV1, read strictly
 * by its container alone. The program decodes no frame: what it checks is that the browser, which
 * plays a video muted, is handed only one of the two containers and codecs it is meant to play, and
 * that every box or element tiles the file exactly. Anything else is refused.
 *
 * Cleaning moves nothing: an MP4's `udta`, `meta` and `uuid` boxes, where phones keep a video's place
 * and camera, become `free` boxes of the same size, zeroed, and a WebM's Tags, Attachments and
 * Chapters become Void elements of the same size, so that every offset the file holds still points
 * where it did.
 */
import { problem, type Problem } from '../problems';

/** The caps on a video's file. */
export const VIDEO_CAPS = {
  /** Bytes in, and kept: 50 MiB. */
  bytes: 50 * 1024 * 1024,
  /** Past this, the app says the file joins the project's git history: 25 MiB. */
  warning: 25 * 1024 * 1024,
  /** Pixels on a side. */
  side: 8_192,
  /** Boxes or elements read, in all. */
  parts: 1_000_000,
} as const;

/** The formats a video's file may have. */
export type VideoFormat = 'mp4' | 'webm';

/** A video as read: its format, its own size in pixels, and the bytes to keep. */
export interface VideoDocument {
  format: VideoFormat;
  width: number;
  height: number;
  bytes: Uint8Array;
}

export type VideoRead =
  { ok: true; value: VideoDocument; removed: string[] } | { ok: false; problem: Problem };

const TAKEN = 'Visual Anything takes H.264 in MP4, or VP8, VP9 or AV1 in WebM.';

/** The format a file's first bytes say it is, if a video's. */
export function videoFormatOf(bytes: Uint8Array): VideoFormat | undefined {
  if (bytes.length >= 12 && fourcc(bytes, 4) === 'ftyp') return 'mp4';
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return 'webm';
  }
  return undefined;
}

class Refusal extends Error {
  constructor(
    readonly code: 'invalid-video' | 'video-too-large',
    message: string,
  ) {
    super(message);
  }
}

function refuse(message: string): never {
  throw new Refusal('invalid-video', message);
}

/** Reads and cleans a video's file. Never throws on bytes. */
export function readVideo(bytes: Uint8Array): VideoRead {
  if (bytes.length > VIDEO_CAPS.bytes) {
    return {
      ok: false,
      problem: problem(
        'video-too-large',
        `The video is over ${VIDEO_CAPS.bytes / 1024 / 1024} MiB.`,
      ),
    };
  }
  const format = videoFormatOf(bytes);
  if (format === undefined) {
    return { ok: false, problem: problem('invalid-video', `The file is not a video. ${TAKEN}`) };
  }
  try {
    const read = format === 'mp4' ? readMp4(bytes) : readWebm(bytes);
    const { width, height } = read;
    if (width < 1 || height < 1) refuse(`The ${format.toUpperCase()} video gives no size.`);
    if (width > VIDEO_CAPS.side || height > VIDEO_CAPS.side) {
      throw new Refusal(
        'video-too-large',
        `The video is ${width} × ${height} pixels, past 8,192 pixels a side.`,
      );
    }
    return {
      ok: true,
      value: { format, width, height, bytes: read.bytes },
      removed: read.removed,
    };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, problem: problem(error.code, error.message) };
    return { ok: false, problem: problem('invalid-video', 'The video could not be read.') };
  }
}

interface Read {
  width: number;
  height: number;
  bytes: Uint8Array;
  removed: string[];
}

function fourcc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + 4));
}

/** A box's type as a message says it: its printable characters. */
function said(type: string): string {
  return type.replace(/[^\x20-\x7e]/g, '?');
}

function u32(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at] as number) * 0x1000000 +
    (((bytes[at + 1] as number) << 16) |
      ((bytes[at + 2] as number) << 8) |
      (bytes[at + 3] as number))
  );
}

function i32(bytes: Uint8Array, at: number): number {
  return u32(bytes, at) | 0;
}

function u16(bytes: Uint8Array, at: number): number {
  return ((bytes[at] as number) << 8) | (bytes[at + 1] as number);
}

// MP4 ---------------------------------------------------------------------------------------------

interface Box {
  type: string;
  start: number;
  /** Where its contents start, past its size and type. */
  body: number;
  end: number;
}

/** The brands of which one makes an MP4 the program takes. */
const BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'iso7',
  'iso8',
  'iso9',
  'mp41',
  'mp42',
  'avc1',
  'dash',
  'M4V ',
]);

/** The boxes an MP4 may hold at its top level. */
const TOP = new Set([
  'ftyp',
  'styp',
  'moov',
  'mdat',
  'moof',
  'mfra',
  'sidx',
  'free',
  'skip',
  'wide',
  'pdin',
  'udta',
  'meta',
  'uuid',
]);

/** The boxes cleaning overwrites, where phones keep a video's place and camera. */
const METADATA = new Set(['udta', 'meta', 'uuid']);

function readMp4(given: Uint8Array): Read {
  const parts = { count: 0 };
  const freed: string[] = [];
  let bytes = given;
  const free = (box: Box) => {
    if (bytes === given) bytes = given.slice();
    freed.push(box.type);
    bytes.set([0x66, 0x72, 0x65, 0x65], box.start + 4);
    bytes.fill(0, box.body, box.end);
  };
  const boxesIn = (start: number, end: number, top: boolean): Box[] =>
    boxes(given, start, end, top, parts);

  const top = boxesIn(0, given.length, true);
  if (top[0]?.type !== 'ftyp') refuse('The MP4 file does not start with its type, ftyp.');
  const brands = brandsOf(given, top[0]);
  if (!brands.some((brand) => BRANDS.has(brand))) {
    refuse(
      `The MP4 file's brand "${said(brands[0] ?? '')}" is not one Visual Anything plays: it takes ISO MP4 (isom, mp42, avc1). ${TAKEN}`,
    );
  }
  let moov: Box | undefined;
  let frames = false;
  for (const box of top) {
    if (!TOP.has(box.type)) {
      refuse(`The MP4 file holds a "${said(box.type)}" box, which Visual Anything does not take.`);
    }
    if (box.type === 'moov') {
      if (moov !== undefined) refuse('The MP4 file holds two moov boxes.');
      moov = box;
    }
    if (box.type === 'mdat') frames = true;
    if (METADATA.has(box.type)) free(box);
  }
  if (moov === undefined) refuse('The MP4 file has no moov box, which says what it holds.');
  if (!frames) refuse('The MP4 file holds no frames: it has no mdat box.');

  // Its tracks, and the metadata in moov and in each track.
  let video: { width: number; height: number } | undefined;
  let videos = 0;
  for (const child of boxesIn(moov.body, moov.end, false)) {
    if (METADATA.has(child.type)) free(child);
    if (child.type !== 'trak') continue;
    const track = readTrack(given, child, boxesIn, free);
    if (track.handler === 'vide') {
      videos += 1;
      video = track.size;
    } else if (track.handler !== 'soun') {
      refuse(
        `The MP4 file has a track of "${said(track.handler)}", which Visual Anything does not take: a video track and audio tracks only.`,
      );
    }
  }
  if (videos !== 1 || video === undefined) {
    refuse(
      `The MP4 file has ${videos === 0 ? 'no' : videos} video track${videos === 1 ? '' : 's'}: Visual Anything takes one video track.`,
    );
  }
  const kinds = [...METADATA].filter((kind) => freed.includes(kind));
  return {
    ...video,
    bytes,
    removed:
      freed.length === 0
        ? []
        : [`${freed.length} metadata box${freed.length === 1 ? '' : 'es'} (${kinds.join(', ')})`],
  };
}

/** The boxes that tile a stretch of the file exactly. */
function boxes(
  bytes: Uint8Array,
  start: number,
  end: number,
  top: boolean,
  parts: { count: number },
): Box[] {
  const found: Box[] = [];
  let at = start;
  while (at < end) {
    if (end - at < 8) refuse('A box of the MP4 file is cut short.');
    parts.count += 1;
    if (parts.count > VIDEO_CAPS.parts) refuse('The MP4 file holds too many boxes.');
    let size = u32(bytes, at);
    const type = fourcc(bytes, at + 4);
    let header = 8;
    if (size === 1) {
      if (end - at < 16) refuse(`The MP4 file's "${said(type)}" box is cut short.`);
      size = u32(bytes, at + 8) * 0x100000000 + u32(bytes, at + 12);
      header = 16;
    } else if (size === 0) {
      if (!top) refuse(`The MP4 file's "${said(type)}" box runs to the end of the file.`);
      size = end - at;
    }
    if (size < header || size > end - at) {
      refuse(
        `The MP4 file's "${said(type)}" box runs past ${top ? 'the end of the file' : 'the box it is in'}.`,
      );
    }
    found.push({ type, start: at, body: at + header, end: at + size });
    at += size;
  }
  return found;
}

function brandsOf(bytes: Uint8Array, ftyp: Box): string[] {
  if (ftyp.end - ftyp.body < 8) refuse('The MP4 file’s type, ftyp, is cut short.');
  const brands = [fourcc(bytes, ftyp.body)];
  for (let at = ftyp.body + 8; at + 4 <= ftyp.end; at += 4) brands.push(fourcc(bytes, at));
  return brands;
}

function only(found: readonly Box[], type: string, of: string): Box {
  const box = found.find((each) => each.type === type);
  if (box === undefined) refuse(`The MP4 file's ${of} has no ${type} box.`);
  return box;
}

/** A track: its handler and, for video, its size; its metadata freed. */
function readTrack(
  bytes: Uint8Array,
  trak: Box,
  boxesIn: (start: number, end: number, top: boolean) => Box[],
  free: (box: Box) => void,
): { handler: string; size?: { width: number; height: number } } {
  const inTrak = boxesIn(trak.body, trak.end, false);
  for (const box of inTrak) if (METADATA.has(box.type)) free(box);
  const mdia = only(inTrak, 'mdia', 'track');
  const inMdia = boxesIn(mdia.body, mdia.end, false);
  for (const box of inMdia) if (METADATA.has(box.type)) free(box);
  const hdlr = only(inMdia, 'hdlr', 'track');
  if (hdlr.end - hdlr.body < 12) refuse('The MP4 file’s track handler is cut short.');
  const handler = fourcc(bytes, hdlr.body + 8);
  if (handler !== 'vide') return { handler };

  const minf = only(inMdia, 'minf', 'video track');
  const inMinf = boxesIn(minf.body, minf.end, false);
  for (const box of inMinf) if (METADATA.has(box.type)) free(box);
  const stbl = only(inMinf, 'stbl', 'video track');
  const stsd = only(boxesIn(stbl.body, stbl.end, false), 'stsd', 'video track');
  if (stsd.end - stsd.body < 8) refuse('The MP4 file’s sample descriptions are cut short.');
  const entries = boxesIn(stsd.body + 8, stsd.end, false);
  if (entries.length === 0 || entries.length !== u32(bytes, stsd.body + 4)) {
    refuse('The MP4 file’s video track does not describe its samples.');
  }
  let own: { width: number; height: number } | undefined;
  for (const entry of entries) {
    if (entry.type !== 'avc1' && entry.type !== 'avc3') {
      refuse(`The MP4 file's video is "${said(entry.type)}", not H.264. ${TAKEN}`);
    }
    // A visual sample description's 78 bytes, then the boxes it holds.
    if (entry.end - entry.body < 78) refuse('The MP4 file’s H.264 description is cut short.');
    own ??= { width: u16(bytes, entry.body + 24), height: u16(bytes, entry.body + 26) };
    const avcC = boxesIn(entry.body + 78, entry.end, false).find((box) => box.type === 'avcC');
    if (avcC === undefined || avcC.end - avcC.body < 1 || bytes[avcC.body] !== 1) {
      refuse('The MP4 file’s H.264 video has no configuration of version 1 (avcC).');
    }
  }
  const header = inTrak.find((box) => box.type === 'tkhd');
  return { handler, size: headerSize(bytes, header) ?? (own) };
}

/** A track header's display size, rounded, swapped for a quarter turn; none when it gives 0. */
function headerSize(
  bytes: Uint8Array,
  tkhd: Box | undefined,
): { width: number; height: number } | undefined {
  if (tkhd === undefined || tkhd.end - tkhd.body < 4) return undefined;
  const matrix = tkhd.body + 4 + (bytes[tkhd.body] === 1 ? 32 : 20) + 16;
  if (matrix + 44 > tkhd.end) refuse('The MP4 file’s track header is cut short.');
  const width = Math.round(u32(bytes, matrix + 36) / 0x10000);
  const height = Math.round(u32(bytes, matrix + 40) / 0x10000);
  if (width === 0 || height === 0) return undefined;
  const [a, b, c, d] = [0, 4, 12, 16].map((at) => i32(bytes, matrix + at)) as [
    number,
    number,
    number,
    number,
  ];
  const quarter = a === 0 && d === 0 && b !== 0 && c !== 0;
  return quarter ? { width: height, height: width } : { width, height };
}

// WebM --------------------------------------------------------------------------------------------

const EBML = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const CLUSTER = 0x1f43b675;
const TRACKS = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const VOID = 0xec;
const CRC = 0xbf;

/** What a Segment may hold, by id, and what cleaning overwrites of it. */
const SEGMENT_PARTS = new Map<number, string | undefined>([
  [0x114d9b74, undefined], // SeekHead
  [0x1549a966, undefined], // Info
  [TRACKS, undefined],
  [0x1c53bb6b, undefined], // Cues
  [CLUSTER, undefined],
  [0x1254c367, 'tags'],
  [0x1941a469, 'attachments'],
  [0x1043a770, 'chapters'],
  [VOID, undefined],
  [CRC, undefined],
]);

/** What a Cluster may hold: its timestamp, positions, blocks, Void and CRC-32. */
const CLUSTER_PARTS = new Set([0xe7, 0xa7, 0xab, 0xa3, 0xa0, VOID, CRC]);

/** What an EBML header may hold. */
const HEADER_PARTS = new Set([
  0x4286,
  0x42f7,
  0x42f2,
  0x42f3,
  0x4282,
  0x4287,
  0x4285,
  0x4281,
  VOID,
  CRC,
]);

const VIDEO_CODECS = new Set(['V_VP8', 'V_VP9', 'V_AV1']);
const AUDIO_CODECS = new Set(['A_OPUS', 'A_VORBIS']);

interface Element {
  id: number;
  start: number;
  body: number;
  /** Where it ends; undefined for one of unknown size. */
  end: number | undefined;
}

function hex(id: number): string {
  return `0x${id.toString(16).toUpperCase()}`;
}

function readWebm(given: Uint8Array): Read {
  const parts = { count: 0 };
  const element = (at: number, within: number): Element => {
    parts.count += 1;
    if (parts.count > VIDEO_CAPS.parts) refuse('The WebM file holds too many elements.');
    return readElement(given, at, within);
  };
  const children = (parent: Element): Element[] => {
    const found: Element[] = [];
    const end = parent.end as number;
    for (let at = parent.body; at < end;) {
      const child = element(at, end);
      if (child.end === undefined) refuse(`The WebM file's ${hex(child.id)} has no size.`);
      found.push(child);
      at = child.end;
    }
    return found;
  };

  // Its header.
  const header = element(0, given.length);
  if (header.id !== EBML || header.end === undefined) refuse('The WebM file has no EBML header.');
  let docType = '';
  let readVersion = 1;
  for (const child of children(header)) {
    if (!HEADER_PARTS.has(child.id)) refuse(`The WebM file's header holds ${hex(child.id)}.`);
    if (child.id === 0x4282) docType = text(given, child).replace(/\0+$/, '');
    if (child.id === 0x4285) readVersion = uint(given, child);
    if (child.id === 0x42f7 && uint(given, child) !== 1)
      refuse('The WebM file’s EBML read version is not 1.');
    if (child.id === 0x42f2 && uint(given, child) > 4) refuse('The WebM file’s ids are too long.');
    if (child.id === 0x42f3 && uint(given, child) > 8)
      refuse('The WebM file’s sizes are too long.');
  }
  if (docType !== 'webm') refuse(`The file is "${said(docType)}", not webm. ${TAKEN}`);
  if (readVersion > 4) refuse(`The WebM file needs a reader of version ${readVersion}, past 4.`);

  // Its one Segment, to the end of the file.
  if (header.end >= given.length) refuse('The WebM file has no Segment.');
  const segment = element(header.end, given.length);
  if (segment.id !== SEGMENT) refuse('The WebM file holds no Segment after its header.');
  if (segment.end !== undefined && segment.end !== given.length) {
    refuse('The WebM file holds bytes past its Segment.');
  }
  const end = given.length;
  let bytes = given;
  const voided: string[] = [];
  let tracks: Element | undefined;
  for (let at = segment.body; at < end;) {
    const part = element(at, end);
    if (!SEGMENT_PARTS.has(part.id)) {
      refuse(`The WebM file's Segment holds ${hex(part.id)}, which Visual Anything does not take.`);
    }
    if (part.end === undefined) {
      if (part.id !== CLUSTER) refuse(`The WebM file's ${hex(part.id)} has no size.`);
      // A Cluster of unknown size runs to where the next element of the Segment starts.
      let inside = part.body;
      while (inside < end) {
        const peek = readElement(given, inside, end);
        if (SEGMENT_PARTS.has(peek.id) && peek.id !== VOID && peek.id !== CRC) break;
        const block = element(inside, end);
        if (!CLUSTER_PARTS.has(block.id) || block.end === undefined) {
          refuse(
            `The WebM file's Cluster holds ${hex(block.id)}, which Visual Anything does not take.`,
          );
        }
        inside = block.end;
      }
      at = inside;
      continue;
    }
    if (part.id === CLUSTER) {
      for (const block of children(part)) {
        if (!CLUSTER_PARTS.has(block.id)) {
          refuse(
            `The WebM file's Cluster holds ${hex(block.id)}, which Visual Anything does not take.`,
          );
        }
      }
    } else if (part.id === TRACKS) {
      if (tracks !== undefined) refuse('The WebM file holds two lists of tracks.');
      tracks = part;
    }
    const cleaned = SEGMENT_PARTS.get(part.id);
    if (cleaned !== undefined) {
      if (bytes === given) bytes = given.slice();
      writeVoid(bytes, part.start, part.end);
      voided.push(cleaned);
    }
    at = part.end;
  }
  if (tracks === undefined) refuse('The WebM file lists no tracks.');
  const size = readTracks(given, tracks, children);
  return { ...size, bytes, removed: [...new Set(voided)] };
}

function readTracks(
  bytes: Uint8Array,
  tracks: Element,
  children: (parent: Element) => Element[],
): { width: number; height: number } {
  let videos = 0;
  let size = { width: 0, height: 0 };
  for (const entry of children(tracks)) {
    if (entry.id === VOID || entry.id === CRC) continue;
    if (entry.id !== TRACK_ENTRY) refuse(`The WebM file's tracks hold ${hex(entry.id)}.`);
    let type = 0;
    let codec = '';
    let video: Element | undefined;
    for (const part of children(entry)) {
      if (part.id === 0x83) type = uint(bytes, part);
      if (part.id === 0x86) codec = text(bytes, part).replace(/\0+$/, '');
      if (part.id === 0xe0) video = part;
      if (part.id === 0x6d80) {
        refuse(
          'The WebM file’s track has content encodings: Visual Anything takes no encrypted or compressed track.',
        );
      }
    }
    if (type === 1) {
      videos += 1;
      if (!VIDEO_CODECS.has(codec)) {
        refuse(`The WebM file's video is "${said(codec)}". ${TAKEN}`);
      }
      size = videoSize(bytes, video, children);
    } else if (type === 2) {
      if (!AUDIO_CODECS.has(codec)) {
        refuse(`The WebM file's audio is "${said(codec)}": Visual Anything takes Opus or Vorbis.`);
      }
    } else {
      refuse(
        `The WebM file has a track of type ${type}, which Visual Anything does not take: a video track and audio tracks only.`,
      );
    }
  }
  if (videos !== 1) {
    refuse(
      `The WebM file has ${videos === 0 ? 'no' : videos} video track${videos === 1 ? '' : 's'}: Visual Anything takes one video track.`,
    );
  }
  return size;
}

function videoSize(
  bytes: Uint8Array,
  video: Element | undefined,
  children: (parent: Element) => Element[],
): { width: number; height: number } {
  const values = new Map<number, number>();
  for (const part of video === undefined ? [] : children(video)) {
    if ([0xb0, 0xba, 0x54b0, 0x54ba, 0x54b2].includes(part.id))
      values.set(part.id, uint(bytes, part));
  }
  const width = values.get(0xb0) ?? 0;
  const height = values.get(0xba) ?? 0;
  if (width < 1 || height < 1) refuse('The WebM file’s video gives no size in pixels.');
  const shownWidth = values.get(0x54b0);
  const shownHeight = values.get(0x54ba);
  if ((values.get(0x54b2) ?? 0) === 0 && shownWidth && shownHeight) {
    return { width: shownWidth, height: shownHeight };
  }
  return { width, height };
}

/** An element at a place: its id, with its marker bits, and its size; within `end`. */
function readElement(bytes: Uint8Array, at: number, end: number): Element {
  const first = bytes[at];
  if (first === undefined || at >= end) refuse('An element of the WebM file is cut short.');
  const idLength = leading(first) + 1;
  if (idLength > 4) refuse('An element of the WebM file has no valid id.');
  if (at + idLength > end) refuse('An element of the WebM file is cut short.');
  let id = 0;
  for (let each = 0; each < idLength; each++) id = id * 256 + (bytes[at + each] as number);
  const sizeAt = at + idLength;
  const sizeFirst = bytes[sizeAt];
  if (sizeFirst === undefined || sizeAt >= end) refuse(`The WebM file's ${hex(id)} is cut short.`);
  const sizeLength = leading(sizeFirst) + 1;
  if (sizeLength > 8) refuse(`The WebM file's ${hex(id)} has no valid size.`);
  if (sizeAt + sizeLength > end) refuse(`The WebM file's ${hex(id)} is cut short.`);
  let size = sizeFirst & (0xff >> sizeLength);
  let unknown = size === 0xff >> sizeLength;
  for (let each = 1; each < sizeLength; each++) {
    const byte = bytes[sizeAt + each] as number;
    size = size * 256 + byte;
    unknown &&= byte === 0xff;
  }
  const body = sizeAt + sizeLength;
  if (unknown) return { id, start: at, body, end: undefined };
  if (size > end - body) refuse(`The WebM file's ${hex(id)} runs past what holds it.`);
  return { id, start: at, body, end: body + size };
}

/** How many zero bits a variable-length number's first byte starts with. */
function leading(byte: number): number {
  let count = 0;
  for (let mask = 0x80; mask > 0 && (byte & mask) === 0; mask >>= 1) count += 1;
  return count;
}

function uint(bytes: Uint8Array, element: Element): number {
  const end = element.end as number;
  if (end - element.body > 8) refuse(`The WebM file's ${hex(element.id)} is too long a number.`);
  let value = 0;
  for (let at = element.body; at < end; at++) value = value * 256 + (bytes[at] as number);
  return value;
}

function text(bytes: Uint8Array, element: Element): string {
  if ((element.end as number) - element.body > 256)
    refuse(`The WebM file's ${hex(element.id)} is too long.`);
  return String.fromCharCode(...bytes.subarray(element.body, element.end));
}

/** Overwrites an element with a Void element of the same size, zeroed. */
function writeVoid(bytes: Uint8Array, start: number, end: number): void {
  const total = end - start;
  const length = Math.min(8, total - 1);
  let rest = total - 1 - length;
  bytes.fill(0, start, end);
  bytes[start] = VOID;
  for (let at = start + length; at > start; at -= 1) {
    bytes[at] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  bytes[start + 1] = (bytes[start + 1] as number) | (0x80 >> (length - 1));
}
