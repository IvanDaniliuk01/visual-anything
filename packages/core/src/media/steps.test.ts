/** Steps that show pictures, videos and link cards (ADR 0098, stage 4). */
import fc from 'fast-check';
import type { FreeShape, LinkCard, Picture, ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import {
  choosesPictures,
  missingShown,
  showableOf,
  shownPictures,
  stepPicturesProblems,
  withoutMissingShown,
} from './steps';

const ref = (hash: string, format: Picture['media']['format']) => ({
  hash: hash.repeat(64),
  format,
  width: 640,
  height: 360,
  bytes: 1000,
});

const photo: Picture = {
  kind: 'picture',
  id: 'photo',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  media: ref('a', 'jpeg'),
};
const video: Picture = { ...photo, id: 'video', media: ref('b', 'mp4') };
const card: LinkCard = {
  kind: 'link',
  id: 'card',
  x: 0,
  y: 0,
  width: 320,
  height: 112,
  url: 'https://example.com/',
  title: 'Example',
};
const note: FreeShape = { kind: 'note', id: 'note', x: 0, y: 0, width: 10, height: 10, text: 'Hi' };
const view: Pick<ViewFile, 'freeShapes'> = { freeShapes: [note, photo, video, card] };

describe('what a step can show', () => {
  it('is the pictures, videos and link cards of its view, never a note or an arrow', () => {
    expect(showableOf(view).map((shape) => shape.id)).toEqual(['photo', 'video', 'card']);
  });

  it('is chosen once one step lists some', () => {
    expect(choosesPictures([])).toBe(false);
    expect(choosesPictures([{}, { shows: [] }])).toBe(false);
    expect(choosesPictures([{}, { shows: ['photo'] }])).toBe(true);
  });
});

describe('shownPictures', () => {
  it('hides nothing when the steps do not choose, as before', () => {
    expect(shownPictures(view, [{}], false)).toBeUndefined();
    expect(shownPictures(undefined, [{ shows: ['photo'] }], true)).toBeUndefined();
  });

  it('hides what the step does not list, never a note, and plays its videos', () => {
    const shown = shownPictures(view, [{ shows: ['video'], playing: ['video'] }], true);
    expect([...(shown?.hidden ?? [])]).toEqual(['photo', 'card']);
    expect(shown?.playing).toEqual(['video']);
  });

  it('hides all of them on a step that lists none, in steps that choose', () => {
    expect([...(shownPictures(view, [{}], true)?.hidden ?? [])]).toEqual([
      'photo',
      'video',
      'card',
    ]);
  });

  it('shows what any step an aggregated step stands for shows', () => {
    const shown = shownPictures(view, [{ shows: ['photo'] }, { shows: ['card'] }], true);
    expect([...(shown?.hidden ?? [])]).toEqual(['video']);
  });

  it('leaves out what the view no longer holds, and plays no picture that is not a video', () => {
    const shown = shownPictures(
      view,
      [{ shows: ['gone', 'photo', 'video'], playing: ['gone', 'photo', 'video'] }],
      true,
    );
    expect(shown?.playing).toEqual(['video']);
    expect([...(shown?.hidden ?? [])]).toEqual(['card']);
  });

  it('never hides what a step shows and always hides the rest (property)', () => {
    const ids = ['photo', 'video', 'card', 'gone'];
    fc.assert(
      fc.property(fc.subarray(ids), fc.subarray(ids), (shows, playing) => {
        const shown = shownPictures(view, [{ shows, playing }], true);
        if (!shown) return false;
        for (const shape of showableOf(view)) {
          expect(shown.hidden.has(shape.id)).toBe(!shows.includes(shape.id));
        }
        for (const id of shown.playing) {
          expect(shows).toContain(id);
          expect(id).toBe('video');
        }
        return true;
      }),
    );
  });
});

describe('stepPicturesProblems', () => {
  it('finds nothing in a step that shows and plays what its view holds', () => {
    expect(stepPicturesProblems(view, { shows: ['photo', 'video'], playing: ['video'] })).toEqual(
      [],
    );
  });

  it('says what the view does not hold, a note included', () => {
    expect(
      stepPicturesProblems(view, { shows: ['note', 'gone'] }).map((each) => [
        each.code,
        each.subject,
      ]),
    ).toEqual([
      ['unknown-free-shape', 'note'],
      ['unknown-free-shape', 'gone'],
    ]);
  });

  it('refuses to play what the step does not show, or what is no video', () => {
    expect(
      stepPicturesProblems(view, { shows: ['photo'], playing: ['photo', 'video'] }).map((each) => [
        each.code,
        each.subject,
      ]),
    ).toEqual([
      ['invalid-command', 'photo'],
      ['invalid-command', 'video'],
    ]);
  });

  it('lists what is gone, and takes it out of both lists', () => {
    const step = { shows: ['gone', 'video', 'photo'], playing: ['gone', 'video'] };
    expect(missingShown(view, step)).toEqual(['gone']);
    expect(withoutMissingShown(view, step)).toEqual({
      shows: ['video', 'photo'],
      playing: ['video'],
    });
    expect(withoutMissingShown(view, { shows: ['gone'], playing: ['gone'] })).toEqual({});
  });
});
