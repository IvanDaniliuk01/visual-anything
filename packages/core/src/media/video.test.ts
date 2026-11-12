import { describe, expect, it } from 'vitest';
import { VIDEO_CAPS, readVideo, videoFormatOf } from './video';
import {
  QUARTER_TURN,
  WEBM,
  audioTrack,
  avcC,
  box,
  cluster,
  ebmlHeader,
  el,
  ftyp,
  fullBox,
  h264Track,
  largeBox,
  mp4,
  placeBox,
  str,
  tags,
  tkhd,
  trackEntry,
  trak,
  uint,
  visualEntry,
  vp9Track,
  webm,
} from './test/videos';

function read(bytes: Uint8Array) {
  const result = readVideo(bytes);
  if (!result.ok) throw new Error(`Refused: ${result.problem.message}`);
  return result;
}

function refusal(bytes: Uint8Array) {
  const result = readVideo(bytes);
  if (result.ok) throw new Error('Taken');
  return result.problem;
}

const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe('videoFormatOf', () => {
  it('tells an MP4 by its ftyp and a WebM by its EBML header', () => {
    expect(videoFormatOf(mp4())).toBe('mp4');
    expect(videoFormatOf(webm())).toBe('webm');
    expect(videoFormatOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeUndefined();
    expect(videoFormatOf(new Uint8Array(0))).toBeUndefined();
  });
});

describe('readVideo: MP4', () => {
  it('reads an H.264 MP4, its size its track header’s, and keeps it as it is', () => {
    const bytes = mp4({ tracks: [h264Track(1280, 720), audioTrack()] });
    const result = read(bytes);
    expect(result.value).toMatchObject({ format: 'mp4', width: 1280, height: 720 });
    expect(result.value.bytes).toEqual(bytes);
    expect(result.removed).toEqual([]);
  });

  it('swaps the size of a video turned a quarter, as a phone held upright writes it', () => {
    const track = trak(
      'vide',
      [visualEntry('avc1', 1920, 1080, avcC())],
      tkhd(1920, 1080, QUARTER_TURN),
    );
    expect(read(mp4({ tracks: [track] })).value).toMatchObject({ width: 1080, height: 1920 });
  });

  it('takes its sample description’s size when the track header gives none', () => {
    const track = trak('vide', [visualEntry('avc3', 640, 480, avcC())], tkhd(0, 0));
    expect(read(mp4({ tracks: [track] })).value).toMatchObject({ width: 640, height: 480 });
  });

  it('overwrites udta, meta and uuid boxes with free boxes of the same size, moving nothing', () => {
    const bytes = mp4({
      tracks: [h264Track(320, 240, placeBox())],
      inMoov: [placeBox(), fullBox('meta', 0, box('hdlr', new Uint8Array(20)))],
      after: [box('uuid', new Uint8Array(16).fill(7), Uint8Array.of(1, 2, 3))],
    });
    const result = read(bytes);
    expect(result.value.bytes.length).toBe(bytes.length);
    expect(text(result.value.bytes)).not.toContain('xyz');
    expect(text(result.value.bytes)).not.toContain('udta');
    expect(text(result.value.bytes)).not.toContain('uuid');
    expect(result.removed).toEqual(['4 metadata boxes (udta, meta, uuid)']);
    // Cleaning what it wrote changes nothing more.
    const again = read(result.value.bytes);
    expect(again.value.bytes).toEqual(result.value.bytes);
    expect(again.removed).toEqual([]);
  });

  it('reads 64-bit sizes, and a last box that runs to the end of the file', () => {
    const open = mp4();
    const runs = Uint8Array.from(
      [...open, 0, 0, 0, 0, ...'mdat'].map((c) => (typeof c === 'string' ? c.charCodeAt(0) : c)),
    );
    expect(read(Uint8Array.from([...runs, 9, 9, 9])).value.format).toBe('mp4');
    expect(read(mp4({ after: [largeBox('free', new Uint8Array(4))] })).value.format).toBe('mp4');
  });

  it.each([
    ['a brand it does not know', mp4({ brand: ftyp('qt  ', ['qt  ']) }), 'brand'],
    ['no moov', Uint8Array.from([...ftyp(), ...box('mdat', new Uint8Array(4))]), 'moov'],
    ['two moov', mp4({ after: [box('moov')] }), 'moov'],
    ['a box it does not take at its top', mp4({ after: [box('junk', new Uint8Array(2))] }), 'junk'],
    ['bytes past its last box', Uint8Array.from([...mp4(), 1, 2, 3]), 'box'],
    ['no video track', mp4({ tracks: [audioTrack()] }), 'video track'],
    ['two video tracks', mp4({ tracks: [h264Track(), h264Track()] }), 'video track'],
    [
      'HEVC rather than H.264',
      mp4({ tracks: [trak('vide', [visualEntry('hvc1', 320, 240)])] }),
      'H.264',
    ],
    [
      'an encrypted video',
      mp4({ tracks: [trak('vide', [visualEntry('encv', 320, 240)])] }),
      'H.264',
    ],
    [
      'H.264 without its configuration',
      mp4({ tracks: [trak('vide', [visualEntry('avc1', 320, 240)])] }),
      'avcC',
    ],
    [
      'a configuration of another version',
      mp4({ tracks: [trak('vide', [visualEntry('avc1', 320, 240, avcC(2))])] }),
      'avcC',
    ],
    ['a track of text', mp4({ tracks: [h264Track(), trak('text', [])] }), 'text'],
    ['a side past 8,192 pixels', mp4({ tracks: [h264Track(9000, 240)] }), '8,192'],
  ])('refuses an MP4 with %s', (_, bytes, said) => {
    const problem = refusal(bytes);
    expect(problem.code).toBe(said === '8,192' ? 'video-too-large' : 'invalid-video');
    expect(problem.message).toContain(said);
  });

  it('refuses a box whose size runs past its container, or is too small to be one', () => {
    const bytes = mp4();
    const cut = bytes.slice(0, bytes.length - 3);
    expect(refusal(cut).code).toBe('invalid-video');
    const tiny = Uint8Array.from([...ftyp(), 0, 0, 0, 4, ...[0x6d, 0x6f, 0x6f, 0x76]]);
    expect(refusal(tiny).code).toBe('invalid-video');
  });

  it('never throws on any cut of a file', () => {
    const bytes = mp4({ tracks: [h264Track(320, 240, placeBox()), audioTrack()] });
    for (let end = 0; end < bytes.length; end += 3) {
      expect(() => readVideo(bytes.subarray(0, end))).not.toThrow();
    }
  });
});

describe('readVideo: WebM', () => {
  it('reads a VP9 WebM, its size its pixels’, and keeps it as it is', () => {
    const bytes = webm({ tracks: [vp9Track(640, 360), trackEntry(2, 'A_OPUS')] });
    const result = read(bytes);
    expect(result.value).toMatchObject({ format: 'webm', width: 640, height: 360 });
    expect(result.value.bytes).toEqual(bytes);
  });

  it('takes its display size when it gives one in pixels', () => {
    const track = vp9Track(640, 360, uint(WEBM.displayWidth, 720), uint(WEBM.displayHeight, 360));
    expect(read(webm({ tracks: [track] })).value).toMatchObject({ width: 720, height: 360 });
  });

  it('reads a live recording, its Segment and Clusters of unknown size', () => {
    const bytes = webm({ sized: false, after: [cluster(false), cluster(false), el(WEBM.cues)] });
    expect(read(bytes).value.format).toBe('webm');
  });

  it.each(['V_VP8', 'V_AV1'])('takes %s', (codec) => {
    const track = trackEntry(
      1,
      codec,
      el(WEBM.video, uint(WEBM.pixelWidth, 8), uint(WEBM.pixelHeight, 8)),
    );
    expect(read(webm({ tracks: [track] })).value.format).toBe('webm');
  });

  it('overwrites Tags and Attachments with Void elements of the same size', () => {
    const bytes = webm({ after: [cluster(), tags(), el(WEBM.attachments, str(0x466e, 'a.ttf'))] });
    const result = read(bytes);
    expect(result.value.bytes.length).toBe(bytes.length);
    expect(text(result.value.bytes)).not.toContain('front desk');
    expect(text(result.value.bytes)).not.toContain('a.ttf');
    expect(result.removed).toEqual(['tags', 'attachments']);
    const again = read(result.value.bytes);
    expect(again.value.bytes).toEqual(result.value.bytes);
    expect(again.removed).toEqual([]);
  });

  it('writes a Void of any size from 2 bytes up', () => {
    for (const length of [0, 1, 6, 7, 8, 126, 127, 300]) {
      const bytes = webm({ after: [cluster(), el(WEBM.tags, new Uint8Array(length))] });
      const result = read(bytes);
      expect(result.value.bytes.length).toBe(bytes.length);
      expect(read(result.value.bytes).removed).toEqual([]);
    }
  });

  it.each([
    ['another document type', webm({ header: ebmlHeader('matroska') }), 'webm'],
    ['a read version past 4', webm({ header: ebmlHeader('webm', 5) }), 'version'],
    ['no video track', webm({ tracks: [trackEntry(2, 'A_OPUS')] }), 'video track'],
    ['two video tracks', webm({ tracks: [vp9Track(), vp9Track()] }), 'video track'],
    [
      'a codec it does not take',
      webm({
        tracks: [
          trackEntry(
            1,
            'V_MPEG4/ISO/AVC',
            el(WEBM.video, uint(WEBM.pixelWidth, 8), uint(WEBM.pixelHeight, 8)),
          ),
        ],
      }),
      'V_MPEG4/ISO/AVC',
    ],
    ['audio it does not take', webm({ tracks: [vp9Track(), trackEntry(2, 'A_AAC')] }), 'A_AAC'],
    ['a subtitle track', webm({ tracks: [vp9Track(), trackEntry(17, 'S_TEXT/UTF8')] }), 'track'],
    [
      'content encodings',
      webm({
        tracks: [
          trackEntry(
            1,
            'V_VP9',
            el(WEBM.video, uint(WEBM.pixelWidth, 8), uint(WEBM.pixelHeight, 8)),
            el(WEBM.contentEncodings),
          ),
        ],
      }),
      'encod',
    ],
    ['no size', webm({ tracks: [trackEntry(1, 'V_VP9', el(WEBM.video))] }), 'size'],
    ['an element it does not take in its Segment', webm({ after: [el(0x1b538667)] }), 'Segment'],
    ['bytes past its Segment', Uint8Array.from([...webm(), 0xec, 0x80]), 'Segment'],
    ['a side past 8,192 pixels', webm({ tracks: [vp9Track(8193, 8)] }), '8,192'],
  ])('refuses a WebM with %s', (_, bytes, said) => {
    const problem = refusal(bytes);
    expect(problem.code).toBe(said === '8,192' ? 'video-too-large' : 'invalid-video');
    expect(problem.message).toContain(said);
  });

  it('never throws on any cut of a file', () => {
    const bytes = webm({
      tracks: [vp9Track(), trackEntry(2, 'A_OPUS')],
      after: [cluster(), tags()],
    });
    for (let end = 0; end < bytes.length; end += 2) {
      expect(() => readVideo(bytes.subarray(0, end))).not.toThrow();
    }
  });
});

describe('readVideo: caps', () => {
  it('refuses a file past 50 MiB before reading it', () => {
    const big = new Uint8Array(VIDEO_CAPS.bytes + 1);
    big.set(mp4());
    expect(refusal(big).code).toBe('video-too-large');
  });

  it('refuses what is neither', () => {
    expect(refusal(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9)).code).toBe('invalid-video');
  });
});
