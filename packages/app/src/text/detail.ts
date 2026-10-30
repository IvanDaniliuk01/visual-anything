/**
 * A shape's detail with text emphasis (ADR 0082). A detail is its parts joined by " · ": the
 * component's name, attribute values and badges. Only the values of attributes whose definition takes
 * text emphasis are read for it, each on its own, so that a marker left open in one value never pairs
 * with one in the next, and the component's name, the other values and badges stay as written.
 */
import { emphasisRuns, runsText, type DetailPart, type EmphasisRun } from '@visual-anything/core';
import { drawsDifferently } from './drawn';

const SEPARATOR = ' · ';

/**
 * The runs a detail is drawn with, or `undefined` when it is drawn as written: when none of its
 * parts is a value that takes emphasis and draws differently from its source.
 */
export function detailRunsOf(
  parts: readonly DetailPart[],
  takesEmphasis: (attribute: string) => boolean,
): EmphasisRun[] | undefined {
  const emphasised = (part: DetailPart) =>
    part.kind === 'attribute' &&
    takesEmphasis(part.attribute) &&
    drawsDifferently(part.text, false);
  if (!parts.some(emphasised)) return undefined;
  const runs: EmphasisRun[] = [];
  parts.forEach((part, at) => {
    if (at > 0) runs.push(plain(SEPARATOR));
    if (emphasised(part)) runs.push(...emphasisRuns(part.text));
    else runs.push(plain(part.text));
  });
  return runs;
}

/** A detail's runs with a part written as it is after them, as an overlay's badge is. */
export function runsWithPart(runs: readonly EmphasisRun[], text: string): EmphasisRun[] {
  return runs.length === 0 ? [plain(text)] : [...runs, plain(SEPARATOR), plain(text)];
}

/** What a shape's detail says, without its markers: for announcements and the hover card's title. */
export function detailPlainText(shape: {
  detail?: string;
  componentName: string;
  detailRuns?: readonly EmphasisRun[];
}): string {
  return shape.detailRuns ? runsText(shape.detailRuns) : (shape.detail ?? shape.componentName);
}

function plain(text: string): EmphasisRun {
  return {
    text,
    bold: false,
    italic: false,
    strike: false,
    underline: false,
    code: false,
    highlight: false,
  };
}
