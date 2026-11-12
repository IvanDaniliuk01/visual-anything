/**
 * The video reader (ADR 0098, stage 2): an MP4 of H.264 or a WebM of VP8, VP9 or AV1, read strictly
 * by its container alone. The program decodes no frame: what it checks is that the browser, which
 * plays a video muted, is handed only one of the two containers and codecs it is meant to play, and
 * that every box or element tiles the file exactly. Anything else is refused.
 *
 * Cleaning keeps only what a player needs, and moves nothing, so that every offset the file holds
 * still points where it did: it leaves nothing that names a person, a place, a device or a time.
 *
 * - In an MP4, every box of `moov`, at any depth, is kept only when a player needs it (`KEPT`); every
 *   other one, `udta`, `meta` and `uuid` where phones keep a video's place and camera among them,
 *   becomes a `free` box of the same size, zeroed. Its headers' creation and modification times, its
 *   handlers' names, its compressor's name and its audio's vendor are zeroed, and so is what `free`,
 *   `skip` and `wide` boxes hold. A `colr` is kept only when it holds numbers (`nclx`, `nclc`), never
 *   an ICC profile; an `esds` keeps only its decoder configuration and sync layer, and a `dOps`,
 *   `btrt`, `pasp` and `clap` their numbers, what follows them zeroed. A fragmented MP4, one with two
 *   `ftyp`, and one that refers to data outside itself, are refused.
 * - In a WebM, Info keeps only its timestamp scale and duration, a track only what plays it, Cues only
 *   their times and positions, a BlockGroup only its block, duration and references; every other
 *   element, its title, date, writing programs, track names, tags, attachments, chapters, seek head,
 *   block additions, checksums and its header's DocTypeExtension among them, becomes a Void element
 *   of the same size. A track's codec data is kept only as its codec defines it (`cleanCodecData`):
 *   a Vorbis comment header's vendor and tags are zeroed, keeping their lengths.
 * - The frames themselves, in `mdat` or in a WebM's blocks, are not read, and neither is a codec's own
 *   configuration (H.264's `avcC`, AAC's decoder-specific information, AV1's sequence header).
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

/** What cleaning changed, said once each, in the order first met. */
class Cleaning {
  readonly #given: Uint8Array;
  #out: Uint8Array | undefined;
  readonly said: string[] = [];

  constructor(given: Uint8Array) {
    this.#given = given;
  }

  get bytes(): Uint8Array {
    return this.#out ?? this.#given;
  }

  #writable(): Uint8Array {
    this.#out ??= this.#given.slice();
    return this.#out;
  }

  #say(what: string): void {
    if (!this.said.includes(what)) this.said.push(what);
  }

  /** Zeroes a stretch, saying so only when a byte of it was not zero already. */
  zero(start: number, end: number, what: string): void {
    const bytes = this.bytes;
    let changed = false;
    for (let at = start; at < end; at++) if (bytes[at] !== 0) changed = true;
    if (!changed) return;
    this.#writable().fill(0, start, end);
    this.#say(what);
  }

  /** Writes bytes over a stretch, saying so when they differ. */
  write(at: number, values: readonly number[], what: string): void {
    const bytes = this.bytes;
    if (values.every((value, each) => bytes[at + each] === value)) return;
    this.#writable().set(values, at);
    this.#say(what);
  }

  /** Overwrites a WebM element with a Void element of the same size, zeroed. */
  void(start: number, end: number, what: string): void {
    const bytes = this.bytes;
    if (bytes[start] === VOID) return;
    writeVoid(this.#writable(), start, end);
    this.#say(what);
  }
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

/** The boxes cleaning overwrites, where phones keep a video's place and camera. */
const METADATA = new Set(['udta', 'meta', 'uuid']);

/** The boxes that hold nothing a player reads, whose contents cleaning zeroes. */
const FILLER = new Set(['free', 'skip', 'wide']);

/**
 * The boxes kept in each container of `moov`, all a player needs of them; every other box there,
 * metadata or one Visual Anything does not know, becomes a `free` box, zeroed.
 */
const KEPT: Readonly<Record<string, ReadonlySet<string>>> = {
  moov: new Set(['mvhd', 'trak']),
  trak: new Set(['tkhd', 'mdia', 'edts', 'tref']),
  edts: new Set(['elst']),
  mdia: new Set(['mdhd', 'hdlr', 'minf']),
  minf: new Set(['vmhd', 'smhd', 'dinf', 'stbl']),
  dinf: new Set(['dref']),
  stbl: new Set([
    'stsd',
    'stts',
    'ctts',
    'cslg',
    'stss',
    'stps',
    'sdtp',
    'stsc',
    'stsz',
    'stz2',
    'stco',
    'co64',
    'sgpd',
    'sbgp',
    'subs',
  ]),
  // What a sample description holds after its fixed part.
  avc1: new Set(['avcC', 'btrt', 'pasp', 'colr', 'clap']),
  avc3: new Set(['avcC', 'btrt', 'pasp', 'colr', 'clap']),
  mp4a: new Set(['esds', 'btrt']),
  Opus: new Set(['dOps', 'btrt']),
};

/** The audio an MP4 may hold: AAC or Opus. */
const AUDIO_ENTRIES = new Set(['mp4a', 'Opus']);

/** The boxes `moof`, `mfra`, `sidx` and `styp`: a fragmented MP4, which the program does not clean. */
const FRAGMENTED = new Set(['moof', 'mfra', 'sidx', 'styp', 'mvex']);

function readMp4(given: Uint8Array): Read {
  const parts = { count: 0 };
  const cleaning = new Cleaning(given);
  let freed = 0;
  const kinds = new Set<string>();
  const free = (box: Box) => {
    freed += 1;
    kinds.add(METADATA.has(box.type) ? box.type : 'other');
    cleaning.write(box.start + 4, [0x66, 0x72, 0x65, 0x65], 'boxes');
    cleaning.zero(box.body, box.end, 'boxes');
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
  for (const [index, box] of top.entries()) {
    if (FRAGMENTED.has(box.type)) {
      refuse(
        'The MP4 file is fragmented, as a live recording writes it: Visual Anything takes an MP4 whose frames are all in mdat, or a WebM.',
      );
    }
    if (box.type === 'moov') {
      if (moov !== undefined) refuse('The MP4 file holds two moov boxes.');
      moov = box;
    } else if (box.type === 'mdat') {
      frames = true;
    } else if (METADATA.has(box.type)) {
      free(box);
    } else if (FILLER.has(box.type)) {
      cleaning.zero(box.body, box.end, 'filler');
    } else if (box.type === 'ftyp') {
      if (index > 0) refuse('The MP4 file holds its type, ftyp, twice.');
    } else {
      refuse(`The MP4 file holds a "${said(box.type)}" box, which Visual Anything does not take.`);
    }
  }
  if (moov === undefined) refuse('The MP4 file has no moov box, which says what it holds.');
  if (!frames) refuse('The MP4 file holds no frames: it has no mdat box.');

  // Every box of moov, at any depth: what a player needs is kept, its times and names zeroed, and
  // every other box becomes a free box.
  const tracks: { handler: string; size?: { width: number; height: number } }[] = [];
  const walk = (container: Box, handler?: string): void => {
    const kept = KEPT[container.type] ?? new Set<string>();
    const start = container.body + (ENTRY_SIZES[container.type] ?? 0);
    for (const box of boxesIn(start, container.end, false)) {
      if (FRAGMENTED.has(box.type)) {
        refuse(
          'The MP4 file is fragmented: Visual Anything takes an MP4 whose frames are all in mdat.',
        );
      }
      if (FILLER.has(box.type)) {
        cleaning.zero(box.body, box.end, 'filler');
        continue;
      }
      if (!kept.has(box.type)) {
        free(box);
        continue;
      }
      if (box.type === 'trak') {
        tracks.push(readTrack(given, box, boxesIn));
        walk(box, tracks.at(-1)?.handler);
      } else if (box.type === 'mvhd' || box.type === 'tkhd' || box.type === 'mdhd') {
        zeroTimes(given, box, cleaning);
      } else if (box.type === 'hdlr') {
        // Its name, as "Core Media Video", which can name the device or program that wrote it.
        if (box.end - box.body < 24) refuse('The MP4 file’s track handler is cut short.');
        cleaning.zero(box.body + 24, box.end, 'names');
      } else if (box.type === 'colr') {
        // Only numbers naming a color space; an ICC profile names a device, a creator and a date.
        const fixed = COLOR_NUMBERS[fourcc(given, box.body)];
        if (box.end - box.body < 4 || fixed === undefined) free(box);
        else if (box.end - box.body < fixed) refuse('The MP4 file’s colr is cut short.');
        else cleaning.zero(box.body + fixed, box.end, 'extra');
      } else if (box.type === 'esds') {
        cleanEsds(given, box, cleaning);
      } else if (box.type === 'dOps') {
        cleanOpusDescription(given, box, cleaning);
      } else if (FIXED_SIZES[box.type] !== undefined) {
        const fixed = FIXED_SIZES[box.type] as number;
        if (box.end - box.body < fixed) refuse(`The MP4 file's "${box.type}" box is cut short.`);
        cleaning.zero(box.body + fixed, box.end, 'extra');
      } else if (box.type === 'dref') {
        checkDataReferences(given, box, boxesIn);
      } else if (box.type === 'stsd') {
        if (box.end - box.body < 8) refuse('The MP4 file’s sample descriptions are cut short.');
        for (const entry of boxesIn(box.body + 8, box.end, false)) {
          cleanEntry(given, entry, handler, cleaning);
          walk(entry, handler);
        }
      } else if (KEPT[box.type] !== undefined) {
        walk(box, handler);
      }
    }
  };
  walk(moov);

  let video: { width: number; height: number } | undefined;
  let videos = 0;
  for (const track of tracks) {
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
  const removed: string[] = [];
  if (freed > 0) {
    const named = [...METADATA, 'other'].filter((kind) => kinds.has(kind));
    removed.push(`${freed} metadata box${freed === 1 ? '' : 'es'} (${named.join(', ')})`);
  }
  if (cleaning.said.includes('times')) removed.push('the times it was made and changed');
  if (cleaning.said.includes('names')) removed.push('the names of its tracks and encoder');
  if (cleaning.said.includes('filler')) removed.push('what its free boxes held');
  if (cleaning.said.includes('extra')) {
    removed.push('what its descriptions held past what a player reads');
  }
  return { ...video, bytes: cleaning.bytes, removed };
}

/** The size of each sample description's fixed part, before the boxes it holds. */
const ENTRY_SIZES: Readonly<Record<string, number>> = { avc1: 78, avc3: 78, mp4a: 28, Opus: 28 };

/** What `colr` holds after its type, by type: numbers only (`nclx`, `nclc`). */
const COLOR_NUMBERS: Readonly<Record<string, number>> = { nclx: 11, nclc: 10 };

/** Boxes of numbers alone, by their size: what follows is zeroed. */
const FIXED_SIZES: Readonly<Record<string, number>> = { btrt: 12, pasp: 8, clap: 32 };

/**
 * An AAC description, `esds`: its ES descriptor, of a stream in this file, keeps its decoder
 * configuration (`0x04`, with its decoder-specific information, `0x05`, the codec's own
 * configuration) and its sync layer (`0x06`); every other descriptor's contents, and whatever follows
 * the ES descriptor, are zeroed.
 */
function cleanEsds(bytes: Uint8Array, box: Box, cleaning: Cleaning): void {
  const broken = () => refuse('The MP4 file’s AAC description is not as MPEG-4 writes it.');
  const descriptorAt = (at: number, end: number) => {
    if (at + 2 > end) broken();
    const tag = bytes[at] as number;
    let size = 0;
    let body = at + 1;
    for (let each = 0; ; each++) {
      if (each === 4 || body >= end) broken();
      const byte = bytes[body] as number;
      body += 1;
      size = size * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) break;
    }
    if (size > end - body) broken();
    return { tag, body, end: body + size };
  };
  const zeroOthers = (from: number, end: number, kept: ReadonlySet<number>) => {
    for (let at = from; at < end;) {
      const inner = descriptorAt(at, end);
      if (!kept.has(inner.tag)) cleaning.zero(inner.body, inner.end, 'extra');
      else if (inner.tag === 0x04) {
        if (inner.end - inner.body < 13) broken();
        zeroOthers(inner.body + 13, inner.end, new Set([0x05]));
      }
      at = inner.end;
    }
  };
  if (box.end - box.body < 4) broken();
  const es = descriptorAt(box.body + 4, box.end);
  if (es.tag !== 0x03 || es.end - es.body < 3) broken();
  const flags = bytes[es.body + 2] as number;
  if ((flags & 0x40) !== 0) {
    refuse('The MP4 file refers to data outside itself, which Visual Anything does not take.');
  }
  const from = es.body + 3 + ((flags & 0x80) !== 0 ? 2 : 0) + ((flags & 0x20) !== 0 ? 2 : 0);
  if (from > es.end) broken();
  zeroOthers(from, es.end, new Set([0x04, 0x06]));
  cleaning.zero(es.end, box.end, 'extra');
}

/** An Opus description, `dOps`: its numbers kept, and whatever follows them zeroed. */
function cleanOpusDescription(bytes: Uint8Array, box: Box, cleaning: Cleaning): void {
  if (box.end - box.body < 11) refuse('The MP4 file’s Opus description is cut short.');
  const family = bytes[box.body + 10] as number;
  const own = family === 0 ? 11 : 13 + (bytes[box.body + 1] as number);
  if (box.end - box.body < own) refuse('The MP4 file’s Opus description is cut short.');
  cleaning.zero(box.body + own, box.end, 'extra');
}

/** Zeroes a header's creation and modification times: `mvhd`, `tkhd` or `mdhd`. */
function zeroTimes(bytes: Uint8Array, box: Box, cleaning: Cleaning): void {
  const long = bytes[box.body] === 1;
  const end = box.body + 4 + (long ? 16 : 8);
  if (box.end < end) refuse(`The MP4 file's ${box.type} is cut short.`);
  cleaning.zero(box.body + 4, end, 'times');
}

/** A data reference: only to the file itself, never to data elsewhere. */
function checkDataReferences(
  bytes: Uint8Array,
  dref: Box,
  boxesIn: (start: number, end: number, top: boolean) => Box[],
): void {
  if (dref.end - dref.body < 8) refuse('The MP4 file’s data references are cut short.');
  for (const entry of boxesIn(dref.body + 8, dref.end, false)) {
    const self = entry.end - entry.body === 4 && ((bytes[entry.body + 3] as number) & 1) === 1;
    if (entry.type !== 'url ' || !self) {
      refuse('The MP4 file refers to data outside itself, which Visual Anything does not take.');
    }
  }
}

/**
 * A sample description: a video track's must be H.264 with its configuration, and its compressor's
 * name is zeroed; an audio track's AAC or Opus, of version 0, its vendor zeroed.
 */
function cleanEntry(
  bytes: Uint8Array,
  entry: Box,
  handler: string | undefined,
  cleaning: Cleaning,
): void {
  if (handler === 'vide') {
    if (entry.type !== 'avc1' && entry.type !== 'avc3') {
      refuse(`The MP4 file's video is "${said(entry.type)}", not H.264. ${TAKEN}`);
    }
    if (entry.end - entry.body < 78) refuse('The MP4 file’s H.264 description is cut short.');
    cleaning.zero(entry.body + 42, entry.body + 74, 'names');
    return;
  }
  if (!AUDIO_ENTRIES.has(entry.type)) {
    refuse(`The MP4 file's audio is "${said(entry.type)}": Visual Anything takes AAC or Opus.`);
  }
  if (entry.end - entry.body < 28 || u16(bytes, entry.body + 8) !== 0) {
    refuse('The MP4 file’s audio description is not one of version 0.');
  }
  cleaning.zero(entry.body + 12, entry.body + 16, 'names');
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

/** A track: its handler and, for video, its size, from what it holds as given. */
function readTrack(
  bytes: Uint8Array,
  trak: Box,
  boxesIn: (start: number, end: number, top: boolean) => Box[],
): { handler: string; size?: { width: number; height: number } } {
  const inTrak = boxesIn(trak.body, trak.end, false);
  const mdia = only(inTrak, 'mdia', 'track');
  const inMdia = boxesIn(mdia.body, mdia.end, false);
  const hdlr = only(inMdia, 'hdlr', 'track');
  if (hdlr.end - hdlr.body < 12) refuse('The MP4 file’s track handler is cut short.');
  const handler = fourcc(bytes, hdlr.body + 8);
  if (handler !== 'vide') return { handler };

  const minf = only(inMdia, 'minf', 'video track');
  const stbl = only(boxesIn(minf.body, minf.end, false), 'stbl', 'video track');
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
  return {
    handler,
    size: headerSize(bytes, header) ?? own,
  };
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
const BLOCK_GROUP = 0xa0;
const VOID = 0xec;
const CRC = 0xbf;
const CODEC_PRIVATE = 0x63a2;
/** DocTypeExtension: a name and a version of free text, voided. */
const DOC_TYPE_EXTENSION = 0x4281;

/** What a Segment may hold, by id. */
const SEGMENT_PARTS = new Set([
  0x114d9b74, // SeekHead
  0x1549a966, // Info
  TRACKS,
  0x1c53bb6b, // Cues
  CLUSTER,
  0x1254c367, // Tags
  0x1941a469, // Attachments
  0x1043a770, // Chapters
  VOID,
  CRC,
]);

/**
 * What a master element keeps, by id: each child it keeps, with what that child keeps in turn when
 * it is a master cleaned too (`true` keeps it whole: numbers and codec data only). Every other child
 * becomes a Void element of the same size, and what it was is said.
 */
interface Kept {
  readonly [id: number]: Kept | true;
}

const NUMBERS = true;

/** A Segment's own parts kept: Info, Tracks and Cues cleaned, and Clusters, read apart. */
const SEGMENT_KEPT: Kept = {
  // Info: only how long a tick is and how long the video lasts; its title, date, writing programs
  // and ids are voided.
  0x1549a966: { 0x2ad7b1: NUMBERS, 0x4489: NUMBERS },
  [TRACKS]: {
    [TRACK_ENTRY]: {
      0xd7: NUMBERS, // TrackNumber
      0x73c5: NUMBERS, // TrackUID
      0x83: NUMBERS, // TrackType
      0xb9: NUMBERS, // FlagEnabled
      0x88: NUMBERS, // FlagDefault
      0x55aa: NUMBERS, // FlagForced
      0x9c: NUMBERS, // FlagLacing
      0x23e383: NUMBERS, // DefaultDuration
      0x86: NUMBERS, // CodecID
      [CODEC_PRIVATE]: NUMBERS, // CodecPrivate, read by its codec's rules in `cleanCodecData`
      0x56aa: NUMBERS, // CodecDelay
      0x56bb: NUMBERS, // SeekPreRoll
      0x22b59c: NUMBERS, // Language
      0xe0: {
        0xb0: NUMBERS,
        0xba: NUMBERS,
        0x54b0: NUMBERS,
        0x54ba: NUMBERS,
        0x54b2: NUMBERS,
        0x9a: NUMBERS, // FlagInterlaced
        0x9d: NUMBERS, // FieldOrder
        0x53b8: NUMBERS, // StereoMode
        0x53c0: NUMBERS, // AlphaMode
        0x54aa: NUMBERS,
        0x54bb: NUMBERS,
        0x54cc: NUMBERS,
        0x54dd: NUMBERS, // PixelCrop
        0x54b3: NUMBERS, // AspectRatioType
        0x55b0: NUMBERS, // Colour
        0x7670: NUMBERS, // Projection
      },
      0xe1: { 0xb5: NUMBERS, 0x78b5: NUMBERS, 0x9f: NUMBERS, 0x6264: NUMBERS },
    },
  },
  // Cues: when each cue falls and where its cluster is.
  0x1c53bb6b: {
    0xbb: {
      0xb3: NUMBERS,
      0xb7: {
        0xf7: NUMBERS,
        0xf1: NUMBERS,
        0xf0: NUMBERS,
        0xb2: NUMBERS,
        0x5378: NUMBERS,
        0xea: NUMBERS,
        0xdb: NUMBERS,
      },
    },
  },
};

/** What a BlockGroup keeps: its block, duration and references; its additions are voided. */
const BLOCK_GROUP_KEPT: Kept = { 0xa1: NUMBERS, 0x9b: NUMBERS, 0xfb: NUMBERS, 0x75a2: NUMBERS };

/** What a Cluster may hold: its timestamp, positions, blocks, Void and CRC-32. */
const CLUSTER_PARTS = new Set([0xe7, 0xa7, 0xab, 0xa3, BLOCK_GROUP, VOID, CRC]);

/** What an EBML header may hold. */
const HEADER_PARTS = new Set([
  0x4286,
  0x42f7,
  0x42f2,
  0x42f3,
  0x4282,
  0x4287,
  0x4285,
  DOC_TYPE_EXTENSION,
  VOID,
  CRC,
]);

/** What each element voided is said as. */
const VOIDED: Readonly<Record<number, string>> = {
  0x114d9b74: 'its seek head',
  0x1254c367: 'tags',
  0x1941a469: 'attachments',
  0x1043a770: 'chapters',
  0x7ba9: 'its title',
  0x4461: 'the date it was made',
  0x4d80: 'the programs that wrote it',
  0x5741: 'the programs that wrote it',
  0x536e: 'the names of its tracks',
  0x75a1: 'block additions',
  [CRC]: 'checksums',
  [DOC_TYPE_EXTENSION]: 'its document type’s extensions',
};

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
  const cleaning = new Cleaning(given);
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
  const voidOf = (part: Element) =>
    cleaning.void(part.start, part.end as number, VOIDED[part.id] ?? 'other elements');
  /** Keeps what a master keeps, at any depth, and voids every other child. */
  const clean = (master: Element, kept: Kept): void => {
    for (const child of children(master)) {
      if (child.id === VOID) continue;
      const rule = kept[child.id];
      if (rule === undefined) voidOf(child);
      else if (rule !== true) clean(child, rule);
    }
  };
  const cleanBlocks = (block: Element) => {
    if (block.id === BLOCK_GROUP) clean(block, BLOCK_GROUP_KEPT);
  };

  // Its header.
  const header = element(0, given.length);
  if (header.id !== EBML || header.end === undefined) refuse('The WebM file has no EBML header.');
  let docType = '';
  let readVersion = 1;
  for (const child of children(header)) {
    if (!HEADER_PARTS.has(child.id)) refuse(`The WebM file's header holds ${hex(child.id)}.`);
    if (child.id === DOC_TYPE_EXTENSION) voidOf(child);
    if (child.id === 0x4282) docType = text(given, child).replace(/\0+$/, '');
    if (child.id === 0x4285) readVersion = uint(given, child);
    if (child.id === 0x42f7 && uint(given, child) !== 1) {
      refuse('The WebM file’s EBML read version is not 1.');
    }
    if (child.id === 0x42f2 && uint(given, child) > 4) refuse('The WebM file’s ids are too long.');
    if (child.id === 0x42f3 && uint(given, child) > 8) {
      refuse('The WebM file’s sizes are too long.');
    }
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
        cleanBlocks(block);
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
        cleanBlocks(block);
      }
    } else if (part.id === TRACKS) {
      if (tracks !== undefined) refuse('The WebM file holds two lists of tracks.');
      tracks = part;
    }
    const rule = SEGMENT_KEPT[part.id];
    if (part.id === CLUSTER || part.id === VOID) {
      // Read above, or nothing.
    } else if (rule === undefined) {
      voidOf(part);
    } else if (rule !== true) {
      clean(part, rule);
    }
    at = part.end;
  }
  if (tracks === undefined) refuse('The WebM file lists no tracks.');
  const size = readTracks(given, tracks, children, cleaning);
  return { ...size, bytes: cleaning.bytes, removed: [...cleaning.said] };
}

function readTracks(
  bytes: Uint8Array,
  tracks: Element,
  children: (parent: Element) => Element[],
  cleaning: Cleaning,
): { width: number; height: number } {
  let videos = 0;
  let size = { width: 0, height: 0 };
  for (const entry of children(tracks)) {
    if (entry.id === VOID || entry.id === CRC) continue;
    if (entry.id !== TRACK_ENTRY) refuse(`The WebM file's tracks hold ${hex(entry.id)}.`);
    let type = 0;
    let codec = '';
    let video: Element | undefined;
    let data: Element | undefined;
    for (const part of children(entry)) {
      if (part.id === CODEC_PRIVATE) data = part;
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
    if (data !== undefined) cleanCodecData(bytes, codec, data, cleaning);
  }
  if (videos !== 1) {
    refuse(
      `The WebM file has ${videos === 0 ? 'no' : videos} video track${videos === 1 ? '' : 's'}: Visual Anything takes one video track.`,
    );
  }
  return size;
}

/**
 * A track's codec data, CodecPrivate, kept only as its codec defines it (A8's review):
 *
 * - Vorbis: its identification, comment and setup headers, in Xiph lacing. The comment header's
 *   vendor and every tag (ENCODER, DATE, ARTIST, LOCATION…) are zeroed, their lengths kept, so that
 *   nothing moves.
 * - Opus: an OpusHead, numbers only; whatever follows it is zeroed. WebM keeps no OpusTags.
 * - AV1: its configuration, av1C, whose sequence headers are kept, as the frames are; a metadata or
 *   padding OBU's contents are zeroed, and any other OBU is refused.
 * - VP8 and VP9: voided, since a player reads what they need from the frames.
 */
function cleanCodecData(bytes: Uint8Array, codec: string, data: Element, cleaning: Cleaning): void {
  const end = data.end as number;
  if (codec === 'A_VORBIS') {
    cleanVorbisHeaders(bytes, data.body, end, cleaning);
  } else if (codec === 'A_OPUS') {
    const notOpus = 'The WebM file’s Opus data is not an OpusHead, as Opus writes it.';
    const head = String.fromCharCode(...bytes.subarray(data.body, data.body + 8));
    if (end - data.body < 19 || head !== 'OpusHead') refuse(notOpus);
    const family = bytes[data.body + 18] as number;
    const own = family === 0 ? 19 : 21 + (bytes[data.body + 9] as number);
    if (end - data.body < own) refuse(notOpus);
    cleaning.zero(data.body + own, end, CODEC_DATA);
  } else if (codec === 'V_AV1') {
    cleanAv1Configuration(bytes, data.body, end, cleaning);
  } else {
    cleaning.void(data.start, end, CODEC_DATA);
  }
}

const CODEC_DATA = 'what its codec data held';

/** Vorbis's three headers, its comment header's vendor and tags zeroed. */
function cleanVorbisHeaders(
  bytes: Uint8Array,
  start: number,
  end: number,
  cleaning: Cleaning,
): void {
  const broken = (): never =>
    refuse('The WebM file’s Vorbis headers are not the three Vorbis writes.');
  if (bytes[start] !== 2) broken();
  // Xiph lacing: the first two headers' lengths, each as 255s and the rest; the third is what is left.
  const lengths: number[] = [];
  let at = start + 1;
  for (let header = 0; header < 2; header++) {
    let length = 0;
    for (;;) {
      if (at >= end) broken();
      const byte = bytes[at] as number;
      at += 1;
      length += byte;
      if (byte < 255) break;
    }
    lengths.push(length);
  }
  const [identification, comments] = lengths as [number, number];
  if (identification + comments >= end - at) broken();
  const isHeader = (from: number, type: number) =>
    bytes[from] === type && String.fromCharCode(...bytes.subarray(from + 1, from + 7)) === 'vorbis';
  const commentsAt = at + identification;
  const setupAt = commentsAt + comments;
  if (identification < 30 || !isHeader(at, 1)) broken();
  if (!isHeader(commentsAt, 3) || !isHeader(setupAt, 5)) broken();
  // The comment header: its vendor, then its tags, each a 32-bit length, little-endian, and text.
  const le32 = (from: number) => {
    if (from + 4 > setupAt) broken();
    return (
      (bytes[from] as number) +
      (bytes[from + 1] as number) * 0x100 +
      (bytes[from + 2] as number) * 0x10000 +
      (bytes[from + 3] as number) * 0x1000000
    );
  };
  let inside = commentsAt + 7;
  const zeroText = () => {
    const length = le32(inside);
    inside += 4;
    if (length > setupAt - inside) broken();
    cleaning.zero(inside, inside + length, TAGS);
    inside += length;
  };
  zeroText();
  const count = le32(inside);
  inside += 4;
  if (count > (setupAt - inside) / 4) broken();
  for (let each = 0; each < count; each++) zeroText();
  // Its framing bit, then nothing: whatever else the header holds is zeroed too.
  if (inside >= setupAt) broken();
  cleaning.zero(inside + 1, setupAt, TAGS);
}

const TAGS = 'the tags of its audio';

/** AV1's configuration, av1C: its four bytes, then OBUs, each with its size. */
function cleanAv1Configuration(
  bytes: Uint8Array,
  start: number,
  end: number,
  cleaning: Cleaning,
): void {
  const broken = (): never => refuse('The WebM file’s AV1 configuration is not as AV1 writes it.');
  if (end - start < 4 || bytes[start] !== 0x81) broken();
  for (let at = start + 4; at < end;) {
    const header = bytes[at] as number;
    const type = (header >> 3) & 0x0f;
    if ((header & 0x80) !== 0 || (header & 0x02) === 0) broken();
    let body = at + 1 + ((header & 0x04) !== 0 ? 1 : 0);
    // Its size, in LEB128.
    let size = 0;
    for (let each = 0; ; each++) {
      if (each === 8 || body >= end) broken();
      const byte = bytes[body] as number;
      body += 1;
      size += (byte & 0x7f) * 2 ** (7 * each);
      if ((byte & 0x80) === 0) break;
    }
    if (size > end - body) broken();
    // A sequence header is the codec's own, as the frames are; metadata and padding are zeroed.
    if (type === 5 || type === 15) cleaning.zero(body, body + size, CODEC_DATA);
    else if (type !== 1) broken();
    at = body + size;
  }
}

function videoSize(
  bytes: Uint8Array,
  video: Element | undefined,
  children: (parent: Element) => Element[],
): { width: number; height: number } {
  const values = new Map<number, number>();
  for (const part of video === undefined ? [] : children(video)) {
    if ([0xb0, 0xba, 0x54b0, 0x54ba, 0x54b2].includes(part.id)) {
      values.set(part.id, uint(bytes, part));
    }
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
  if ((element.end as number) - element.body > 256) {
    refuse(`The WebM file's ${hex(element.id)} is too long.`);
  }
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
