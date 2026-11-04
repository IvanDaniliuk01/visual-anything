import type { TourFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '../commands';
import { layOutFace } from '../faces/layout';
import { faceDrawingText } from '../faces/layout';
import { testProject } from '../test/fixtures';
import { STARTING_CAPTION_FACE, captionFaceInput, compileCaptionFace } from './caption-face';

const STEP = {
  viewState: { view: 'overview' },
  caption: { title: 'The system', text: 'It **reads** orders.' },
};

function created(captionFace?: unknown) {
  return executeCommand(testProject(), {
    type: 'create-tour',
    tour: { name: 'Look', steps: [STEP], ...(captionFace === undefined ? {} : { captionFace }) },
  } as Command);
}

describe('a tour’s caption look (ADR 0096)', () => {
  it('starts from a face that compiles and fills from the step’s caption', () => {
    const face = compileCaptionFace(STARTING_CAPTION_FACE, false);
    expect(face.problems.filter((each) => each.severity === 'error')).toEqual([]);
    const outcome = created(STARTING_CAPTION_FACE);
    if (!outcome.ok) throw new Error(outcome.problems[0]?.message);
    const tour = outcome.state.tours[0] as TourFile;
    expect(tour.captionFace).toEqual(STARTING_CAPTION_FACE);
    const drawing = layOutFace(face, captionFaceInput(tour, 0), { width: 400 });
    expect(drawing.fallback).toBeUndefined();
    expect(faceDrawingText(drawing)).toContain('The system');
    expect(faceDrawingText(drawing)).toContain('It reads orders.');
    expect(faceDrawingText(drawing)).toContain('1 / 1');
  });

  it('is refused at its line where the subset refuses its markup, and with more than a face’s parts', () => {
    const bad = created({ markup: ['<script>alert(1)</script>'] });
    expect(bad.ok).toBe(false);
    const sized = created({ markup: ['<p>{{name}}</p>'], size: 'content' });
    expect(sized.ok).toBe(false);
    const empty = created({ markup: [] });
    expect(empty.ok).toBe(false);
  });

  it('is changed and taken away by update-tour', () => {
    const outcome = created();
    if (!outcome.ok) throw new Error('refused');
    const id = outcome.state.tours[0]?.id as string;
    const given = executeCommand(outcome.state, {
      type: 'update-tour',
      id,
      changes: { captionFace: { markup: ['<p>{{name}}</p>'] } },
    });
    if (!given.ok) throw new Error(given.problems[0]?.message);
    expect(given.state.tours[0]?.captionFace).toEqual({ markup: ['<p>{{name}}</p>'] });
    const removed = executeCommand(given.state, {
      type: 'update-tour',
      id,
      changes: { captionFace: null },
    });
    if (!removed.ok) throw new Error('refused');
    expect(removed.state.tours[0]?.captionFace).toBeUndefined();
  });
});

describe('a caption card’s size (ADR 0096)', () => {
  const sized = (size: unknown) =>
    executeCommand(testProject(), {
      type: 'create-tour',
      tour: { name: 'Sized', steps: [{ ...STEP, caption: { title: 'T', size } }] },
    } as Command);

  it('is kept to three decimals, its height optional', () => {
    const outcome = sized({ width: 0.45678, height: 0.3 });
    if (!outcome.ok) throw new Error(outcome.problems[0]?.message);
    expect(outcome.state.tours[0]?.steps[0]?.caption.size).toEqual({ width: 0.457, height: 0.3 });
    const wide = sized({ width: 1 });
    if (!wide.ok) throw new Error('refused');
    expect(wide.state.tours[0]?.steps[0]?.caption.size).toEqual({ width: 1 });
  });

  it('is refused below a tenth of the screen, past all of it, or with more than a width and a height', () => {
    expect(sized({ width: 0.05 }).ok).toBe(false);
    expect(sized({ width: 0.5, height: 1.2 }).ok).toBe(false);
    expect(sized({ width: 0.5, depth: 1 }).ok).toBe(false);
  });
});
