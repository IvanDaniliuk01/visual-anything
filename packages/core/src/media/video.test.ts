import { describe, expect, it } from 'vitest';
import { VIDEO_CAPS, readVideo, videoFormatOf } from './video';
import {
  QUARTER_TURN,
  VORBIS_SETUP,
  VORBIS_STRINGS,
  WEBM,
  audioEntry,
  audioTrack,
  av1Config,
  avcC,
  box,
  cluster,
  codecPrivate,
  colr,
  dOps,
  descriptor,
  ebmlHeader,
  el,
  esds,
  ftyp,
  fullBox,
  h264Track,
  headerWithExtension,
  largeBox,
  mp4,
  obu,
  opusHead,
  PHONE_STRINGS,
  phoneMp4,
  placeBox,
  str,
  tags,
  tkhd,
  trackEntry,
  trak,
  uint,
  visualEntry,
  vorbisComments,
  vorbisIdentification,
  vorbisPrivate,
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

describe('readVideo: nothing names a person, a place, a device or a time', () => {
  const holds = (bytes: Uint8Array, said: string) => text(bytes).includes(said);

  it('keeps of an MP4 only what a player needs, at every depth, and moves nothing', () => {
    const bytes = phoneMp4();
    for (const said of PHONE_STRINGS) expect(holds(bytes, said)).toBe(true);
    const result = read(bytes);
    expect(result.value.bytes.length).toBe(bytes.length);
    for (const said of PHONE_STRINGS) expect(holds(result.value.bytes, said)).toBe(false);
    // The times it was made and changed, in mvhd, both tkhd and both mdhd.
    expect(result.value.bytes.join().includes([0xe1, 0xa2, 0xb3, 0xc4].join())).toBe(false);
    expect(result.removed).toEqual([
      '8 metadata boxes (udta, meta, uuid, other)',
      'the times it was made and changed',
      'the names of its tracks and encoder',
      'what its free boxes held',
    ]);
    expect(result.value).toMatchObject({ width: 64, height: 48 });
    const again = read(result.value.bytes);
    expect(again.value.bytes).toEqual(result.value.bytes);
    expect(again.removed).toEqual([]);
  });

  it.each([
    ['moof', mp4({ after: [box('moof', box('mfhd', new Uint8Array(8)))] })],
    ['mvex', mp4({ inMoov: [box('mvex', box('trex', new Uint8Array(24)))] })],
    ['sidx', mp4({ before: [box('sidx', new Uint8Array(4))] })],
  ])('refuses a fragmented MP4, whose %s it does not clean', (_, bytes) => {
    expect(refusal(bytes).message).toContain('fragmented');
  });

  it('refuses an MP4 that refers to data outside itself', () => {
    const outside = fullBox('url ', 0, new TextEncoder().encode('file:///Users/ana/a.mov'));
    const track = trak('vide', [visualEntry('avc1', 8, 8, avcC())], tkhd(8, 8));
    const bytes = mp4({ tracks: [track] });
    // Its dinf, empty, made to hold a reference to a file elsewhere.
    const at = text(bytes).indexOf('dinf') - 4;
    const dinf = box('dinf', fullBox('dref', 0, Uint8Array.of(0, 0, 0, 1), outside));
    const longer = Uint8Array.from([...bytes.subarray(0, at), ...dinf, ...bytes.subarray(at + 8)]);
    // The boxes that hold it grow by as much.
    const grow = (type: string) => {
      const start = text(longer).indexOf(type) - 4;
      const size = new DataView(longer.buffer).getUint32(start);
      new DataView(longer.buffer).setUint32(start, size + dinf.length - 8);
    };
    for (const type of ['moov', 'trak', 'mdia', 'minf']) grow(type);
    expect(refusal(longer).message).toContain('outside itself');
  });

  it('keeps of a WebM only what a player needs: no title, date, writer, track name or addition', () => {
    const bytes = webm({
      info: [
        str(0x7ba9, 'Ana at the desk'),
        uint(0x4461, 0x0a0b0c0d0e),
        str(0x4d80, 'Lavf'),
        str(0x5741, 'Pixel recorder'),
        el(0x73a4, new Uint8Array(16).fill(9)),
        el(0xbf, Uint8Array.of(1, 2, 3, 4)),
      ],
      tracks: [
        trackEntry(
          1,
          'V_VP9',
          str(0x536e, 'Ana camera'),
          el(WEBM.video, uint(WEBM.pixelWidth, 64), uint(WEBM.pixelHeight, 48), str(0x2fb523, 'x')),
        ),
      ],
      after: [
        el(0x114d9b74, el(0x4dbb, el(0x53ab, Uint8Array.of(0x15, 0x49, 0xa9, 0x66)))),
        el(
          WEBM.cluster,
          uint(WEBM.timestamp, 0),
          el(
            0xa0,
            el(0xa1, Uint8Array.of(0x81, 0, 0, 0x80, 1)),
            el(0x75a1, el(0xa6, uint(0xee, 1), str(0xa5, '+48.85 GPS'))),
          ),
        ),
        el(WEBM.cues, el(0xbb, uint(0xb3, 0), el(0xb7, uint(0xf7, 1), uint(0xf1, 9)))),
        tags(),
      ],
    });
    const result = read(bytes);
    expect(result.value.bytes.length).toBe(bytes.length);
    for (const said of ['Ana', 'Lavf', 'Pixel', '+48.85', 'front desk']) {
      expect(holds(result.value.bytes, said)).toBe(false);
    }
    expect(result.removed).toEqual([
      'its title',
      'the date it was made',
      'the programs that wrote it',
      'other elements',
      'checksums',
      'the names of its tracks',
      'its seek head',
      'block additions',
      'tags',
    ]);
    expect(result.value).toMatchObject({ width: 64, height: 48 });
    const again = read(result.value.bytes);
    expect(again.value.bytes).toEqual(result.value.bytes);
    expect(again.removed).toEqual([]);
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

describe('readVideo: a codec’s own data names nothing (A8’s review)', () => {
  const holds = (bytes: Uint8Array, said: string) => text(bytes).includes(said);
  const ascii = (said: string) => new TextEncoder().encode(said);
  const cleanedOnce = (bytes: Uint8Array) => {
    const result = read(bytes);
    expect(result.value.bytes.length).toBe(bytes.length);
    const again = read(result.value.bytes);
    expect(again.value.bytes).toEqual(result.value.bytes);
    expect(again.removed).toEqual([]);
    return result;
  };
  const vorbis = (data: Uint8Array) =>
    webm({ tracks: [vp9Track(), trackEntry(2, 'A_VORBIS', codecPrivate(data))] });
  const pixels = el(WEBM.video, uint(WEBM.pixelWidth, 8), uint(WEBM.pixelHeight, 8));

  it('zeroes a Vorbis track’s vendor and every tag, keeping their lengths so nothing moves', () => {
    const bytes = vorbis(vorbisPrivate());
    for (const said of VORBIS_STRINGS) expect(holds(bytes, said)).toBe(true);
    const result = cleanedOnce(bytes);
    for (const said of VORBIS_STRINGS) expect(holds(result.value.bytes, said)).toBe(false);
    expect(result.removed).toEqual(['the tags of its audio']);
    // Its identification and setup headers are kept as they were, and so are the lengths.
    const cleaned = text(result.value.bytes);
    expect(cleaned).toContain(text(vorbisIdentification()));
    expect(cleaned).toContain(text(VORBIS_SETUP));
    const comments = vorbisComments('ab', ['C=1']);
    const zeroed = Uint8Array.from(comments).fill(0, 11, 13).fill(0, 21, 24);
    expect(text(cleanedOnce(vorbis(vorbisPrivate(comments))).value.bytes)).toContain(text(zeroed));
  });

  it('reads Xiph lacing past 255 bytes', () => {
    const long = vorbisComments('v'.repeat(300), ['TITLE=' + 'x'.repeat(600)]);
    const result = cleanedOnce(vorbis(vorbisPrivate(long)));
    expect(holds(result.value.bytes, 'TITLE')).toBe(false);
  });

  it.each([
    ['not three headers', Uint8Array.of(1, 30, ...vorbisIdentification(), 0)],
    ['a lacing past its data', Uint8Array.of(2, 255, 255, 1, 1)],
    ['no comment header', vorbisPrivate(vorbisIdentification())],
    ['a vendor past its header', vorbisPrivate(Uint8Array.of(3, ...ascii('vorbis'), 99, 0, 0, 0))],
    [
      'a comment past its header',
      vorbisPrivate(vorbisComments('v', ['A=1']).map((b, at) => (at === 16 ? 200 : b))),
    ],
    ['no identification header', vorbisPrivate(undefined, VORBIS_SETUP)],
    ['no setup header', vorbisPrivate(undefined, undefined, vorbisIdentification())],
  ])('refuses Vorbis headers with %s', (_, data) => {
    expect(refusal(vorbis(data)).message).toContain('Vorbis');
  });

  it('keeps an OpusHead whole, and zeroes what follows it', () => {
    const plain = webm({ tracks: [vp9Track(), trackEntry(2, 'A_OPUS', codecPrivate(opusHead()))] });
    expect(read(plain).value.bytes).toEqual(plain);
    const more = Uint8Array.from([...opusHead(), ...ascii('OpusTags Ana')]);
    const bytes = webm({ tracks: [vp9Track(), trackEntry(2, 'A_OPUS', codecPrivate(more))] });
    const result = cleanedOnce(bytes);
    expect(holds(result.value.bytes, 'Ana')).toBe(false);
    expect(holds(result.value.bytes, 'OpusHead')).toBe(true);
    expect(result.removed).toEqual(['what its codec data held']);
  });

  it('refuses Opus data that is not an OpusHead', () => {
    const data = ascii('OpusTags vendor Ana');
    const bytes = webm({ tracks: [vp9Track(), trackEntry(2, 'A_OPUS', codecPrivate(data))] });
    expect(refusal(bytes).message).toContain('Opus');
  });

  it.each(['V_VP8', 'V_VP9'])('voids a %s track’s codec data, read from its frames', (codec) => {
    const track = trackEntry(1, codec, codecPrivate(ascii('Pixel 8 Pro')), pixels);
    const result = cleanedOnce(webm({ tracks: [track] }));
    expect(holds(result.value.bytes, 'Pixel')).toBe(false);
    expect(result.removed).toEqual(['what its codec data held']);
  });

  it('keeps an AV1 configuration’s sequence header, and zeroes its metadata and padding', () => {
    const sequence = obu(1, Uint8Array.of(0, 0, 0, 0x6a, 0xef));
    const data = av1Config(
      sequence,
      obu(5, Uint8Array.of(4, ...ascii('Ana'))),
      obu(15, Uint8Array.of(7, 7)),
    );
    const plain = webm({
      tracks: [trackEntry(1, 'V_AV1', codecPrivate(av1Config(sequence)), pixels)],
    });
    expect(read(plain).value.bytes).toEqual(plain);
    const result = cleanedOnce(
      webm({ tracks: [trackEntry(1, 'V_AV1', codecPrivate(data), pixels)] }),
    );
    expect(holds(result.value.bytes, 'Ana')).toBe(false);
    expect(text(result.value.bytes)).toContain(text(sequence));
    expect(result.removed).toEqual(['what its codec data held']);
  });

  it.each([
    ['not av1C', Uint8Array.of(0x01, 0, 0, 0)],
    ['an OBU past its data', av1Config(Uint8Array.of(0x0a, 9, 1))],
    ['a frame', av1Config(obu(6, Uint8Array.of(1, 2)))],
    ['an OBU without its size', av1Config(Uint8Array.of(0x08, 1, 2))],
  ])('refuses an AV1 configuration with %s', (_, data) => {
    const track = trackEntry(1, 'V_AV1', codecPrivate(data), pixels);
    expect(refusal(webm({ tracks: [track] })).message).toContain('AV1');
  });

  it('voids a DocTypeExtension in the EBML header, which names anything', () => {
    const result = cleanedOnce(webm({ header: headerWithExtension('Ana’s recorder') }));
    expect(holds(result.value.bytes, 'recorder')).toBe(false);
    expect(result.removed).toEqual(['its document type’s extensions']);
  });

  it('keeps a colr of numbers, and frees one that holds an ICC profile', () => {
    const video = (entry: Uint8Array) => mp4({ tracks: [trak('vide', [entry], tkhd(8, 8))] });
    const kept = video(visualEntry('avc1', 8, 8, avcC(), colr('nclx')));
    expect(read(kept).value.bytes).toEqual(kept);
    const result = cleanedOnce(video(visualEntry('avc1', 8, 8, avcC(), colr('prof'))));
    expect(holds(result.value.bytes, 'Pixel')).toBe(false);
    expect(holds(result.value.bytes, 'prof')).toBe(false);
    expect(result.removed).toEqual(['1 metadata box (other)']);
  });

  it('refuses a second ftyp', () => {
    expect(refusal(mp4({ after: [ftyp()] })).message).toContain('ftyp');
  });

  it('keeps an AAC description’s configuration, and zeroes descriptors a player does not read', () => {
    const audio = (description: Uint8Array) =>
      mp4({ tracks: [h264Track(8, 8), trak('soun', [audioEntry('mp4a', description)])] });
    const plain = audio(esds());
    expect(read(plain).value.bytes).toEqual(plain);
    const result = cleanedOnce(audio(esds(0, descriptor(0x0b, ascii('Ana')))));
    expect(holds(result.value.bytes, 'Ana')).toBe(false);
    expect(result.removed).toEqual(['what its descriptions held past what a player reads']);
  });

  it('refuses an AAC description that refers to data outside itself', () => {
    const bytes = mp4({
      tracks: [h264Track(8, 8), trak('soun', [audioEntry('mp4a', esds(0x40))])],
    });
    expect(refusal(bytes).message).toContain('outside itself');
  });

  it('keeps an Opus description’s numbers, and zeroes what follows them', () => {
    const audio = (description: Uint8Array) =>
      mp4({ tracks: [h264Track(8, 8), trak('soun', [audioEntry('Opus', description)])] });
    const plain = audio(dOps());
    expect(read(plain).value.bytes).toEqual(plain);
    const result = cleanedOnce(audio(dOps(ascii('Ana'))));
    expect(holds(result.value.bytes, 'Ana')).toBe(false);
    expect(result.removed).toEqual(['what its descriptions held past what a player reads']);
  });
});
