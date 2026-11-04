/**
 * The look of a tour's caption cards (ADR 0096): a face (ADR 0083) filled from a step's caption,
 * compiled once for each face and for whether the card's height is fixed.
 */
import type { CaptionFace, TourFile } from '@visual-anything/schema';
import { compileFace, type CompiledFace } from '../faces/compile';
import type { FaceInput } from '../faces/input';

/** A starting look for a tour's captions: its title in bold over its text, with the step's number. */
export const STARTING_CAPTION_FACE: CaptionFace = {
  markup: [
    '<div class="card">',
    '  <p class="where">{{step}} / {{steps}}</p>',
    '  <p class="title">{{name}}</p>',
    '  <p>{{text}}</p>',
    '</div>',
  ],
  style: [
    '.card { display: flex; flex-direction: column; gap: 6px; }',
    '.where { color: var(--text-muted); font-size: 12px; }',
    '.title { font-size: 20px; font-weight: bold; }',
  ],
};

/**
 * A caption face compiled: laid out in the card's height when the step fixes one, and otherwise as
 * tall as its content.
 */
export function compileCaptionFace(face: CaptionFace, fixedHeight: boolean): CompiledFace {
  const byHeight = compiled.get(face) ?? new Map<boolean, CompiledFace>();
  compiled.set(face, byHeight);
  const kept = byHeight.get(fixedHeight);
  if (kept !== undefined) return kept;
  const made = compileFace({
    size: fixedHeight ? 'shape' : 'content',
    markup: face.markup,
    style: face.style ?? [],
    variants: [],
  });
  byHeight.set(fixedHeight, made);
  return made;
}

const compiled = new WeakMap<CaptionFace, Map<boolean, CompiledFace>>();

/**
 * What a caption face is filled from for a step: `{{name}}`, its title; `{{component}}`, the tour's
 * name; `{{text}}`, its text with its emphasis; `{{step}}` and `{{steps}}`.
 */
export function captionFaceInput(tour: TourFile, step: number): FaceInput {
  const caption = tour.steps[step]?.caption;
  return {
    name: caption?.title ?? '',
    component: tour.name,
    attributes: [
      { name: 'text', value: caption?.text, type: 'string', format: 'emphasis' },
      { name: 'step', value: step + 1, type: 'number' },
      { name: 'steps', value: tour.steps.length, type: 'number' },
    ],
  };
}
