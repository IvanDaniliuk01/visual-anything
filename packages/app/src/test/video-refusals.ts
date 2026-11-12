/**
 * What the core's video reader refuses (ADR 0098, stage 2), as its reasons say it, and as they reach
 * the person when a video is dropped, pasted or chosen: the files its own tests refuse, fragmented
 * ones, and every cut of a few files, which reach the reasons for a box or an element cut short. The
 * core-messages test reads each through the Spanish templates.
 */
import { readVideo } from '@visual-anything/core';
import {
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
  mp4,
  placeBox,
  tags,
  tkhd,
  trackEntry,
  trak,
  uint,
  visualEntry,
  vp9Track,
  webm,
} from '../../../core/src/media/test/videos';

/** One thing the reader said, and the file that made it say so. */
export interface VideoSaid {
  command: string;
  message: string;
}

const pixels = el(WEBM.video, uint(WEBM.pixelWidth, 8), uint(WEBM.pixelHeight, 8));

/** Files the reader refuses, each for a reason of its own. */
const REFUSED: readonly (readonly [string, Uint8Array])[] = [
  ['not a video', Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])],
  ['too large', new Uint8Array(50 * 1024 * 1024 + 1)],
  ['an mp4 of a brand it does not know', mp4({ brand: ftyp('qt  ', ['qt  ']) })],
  ['an mp4 without moov', Uint8Array.from([...ftyp(), ...box('mdat', new Uint8Array(4))])],
  ['an mp4 with two moov', mp4({ after: [box('moov')] })],
  ['an mp4 with a box it does not take', mp4({ after: [box('junk', new Uint8Array(2))] })],
  ['an mp4 with bytes past its boxes', Uint8Array.from([...mp4(), 1, 2, 3])],
  ['an mp4 without video', mp4({ tracks: [audioTrack()] })],
  ['an mp4 with two videos', mp4({ tracks: [h264Track(), h264Track()] })],
  ['an mp4 of HEVC', mp4({ tracks: [trak('vide', [visualEntry('hvc1', 320, 240)])] })],
  ['an mp4 without avcC', mp4({ tracks: [trak('vide', [visualEntry('avc1', 320, 240)])] })],
  [
    'an mp4 of another avcC',
    mp4({ tracks: [trak('vide', [visualEntry('avc1', 320, 240, avcC(2))])] }),
  ],
  ['an mp4 with a text track', mp4({ tracks: [h264Track(), trak('text', [])] })],
  ['an mp4 past 8,192 pixels', mp4({ tracks: [h264Track(9000, 240)] })],
  [
    'an mp4 of no size',
    mp4({ tracks: [trak('vide', [visualEntry('avc1', 0, 0, avcC())], tkhd(0, 0))] }),
  ],
  [
    'an mp4 with audio it does not take',
    mp4({ tracks: [h264Track(), trak('soun', [box('mp3 ', new Uint8Array(28))])] }),
  ],
  ['a fragmented mp4', mp4({ after: [box('moof', box('mfhd', new Uint8Array(8)))] })],
  ['an mp4 of extends', mp4({ inMoov: [box('mvex', box('trex', new Uint8Array(24)))] })],
  ['an mp4 of a segment index', mp4({ before: [box('sidx', new Uint8Array(4))] })],
  ['a webm of another type', webm({ header: ebmlHeader('matroska') })],
  ['a webm of a later version', webm({ header: ebmlHeader('webm', 5) })],
  ['a webm without video', webm({ tracks: [trackEntry(2, 'A_OPUS')] })],
  ['a webm with two videos', webm({ tracks: [vp9Track(), vp9Track()] })],
  ['a webm of H.264', webm({ tracks: [trackEntry(1, 'V_MPEG4/ISO/AVC', pixels)] })],
  ['a webm of AAC', webm({ tracks: [vp9Track(), trackEntry(2, 'A_AAC')] })],
  ['a webm with subtitles', webm({ tracks: [vp9Track(), trackEntry(17, 'S_TEXT/UTF8')] })],
  [
    'a webm with encodings',
    webm({
      tracks: [trackEntry(1, 'V_VP9', pixels, el(WEBM.contentEncodings))],
    }),
  ],
  ['a webm of no size', webm({ tracks: [trackEntry(1, 'V_VP9', el(WEBM.video))] })],
  ['a webm with a chapter it does not take', webm({ after: [el(0x1b538667)] })],
  ['a webm with bytes past its Segment', Uint8Array.from([...webm(), 0xec, 0x80])],
  ['a webm past 8,192 pixels', webm({ tracks: [vp9Track(8193, 8)] })],
  ['a webm with two track lists', webm({ after: [el(WEBM.tracks)] })],
  ['a webm whose header holds more', webm({ header: el(0x1a45dfa3, el(0x4321)) })],
];

/** Files cut at every length, which the reader refuses as cut short, each in its own words. */
const CUT: readonly (readonly [string, Uint8Array])[] = [
  ['an mp4', mp4({ tracks: [h264Track(320, 240, placeBox()), audioTrack()] })],
  ['a webm', webm({ tracks: [vp9Track(), trackEntry(2, 'A_OPUS')], after: [cluster(), tags()] })],
  ['an mp4 of a fullBox', Uint8Array.from([...ftyp(), ...fullBox('moov', 0)])],
];

/** Every distinct reason the reader gives for these files, once each. */
export function videoRefusals(): VideoSaid[] {
  const said = new Map<string, string>();
  const note = (command: string, bytes: Uint8Array) => {
    const read = readVideo(bytes);
    if (!read.ok && !said.has(read.problem.message)) said.set(read.problem.message, command);
  };
  for (const [name, bytes] of REFUSED) note(`video: ${name}`, bytes);
  for (const [name, bytes] of CUT) {
    for (let end = 1; end < bytes.length; end += 1) {
      note(`video: ${name} cut at ${end}`, bytes.subarray(0, end));
    }
  }
  return [...said].map(([message, command]) => ({ command, message }));
}
