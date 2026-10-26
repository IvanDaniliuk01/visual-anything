/**
 * The named parts of an SVG image (ADR 0067): listed in document order from the cleaned view, with
 * outlines that apply transforms, viewports and `use`, fill by each shape's own rule and stroke as
 * bands; their main colors; a picture of each part alone, cleaned again; their outlines as free
 * geometry; the caps; the parts a replacement loses; and ADR 0027's attack corpus read through them.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fitOutline, flatPointCount, outlineHolds } from '../geometry/fit';
import { GEOMETRY_CAPS, readGeometry, type Outline } from '../geometry/outline';
import { readPathData } from '../geometry/path';
import { imagesOf } from './catalog';
import { checkImages } from './check';
import { cleanedImage, type CleanedImage } from './cleaned';
import {
  PART_CAPS,
  findPart,
  geometryOf,
  lostParts,
  namedPart,
  namedPartCount,
  partImageId,
  partPicture,
  partsOf,
  unknownPartProblem,
  type NamedPart,
} from './parts';
import { cleanSvg } from './svg';
import { HEART_PARTS, HEART_SVG } from './test/heart';
import { DESK, clinicPackage, imageProject, svgImage } from './test/project';
import { ATTACKS, NS, expectNothingRuns, tree, writeTree } from './test/svg-corpus';

let serial = 0;

/** The cleaned view of an SVG picture, as one of the clinic's images. */
function picture(svg: string, id = `clinic.picture-${++serial}`): CleanedImage {
  const cleaned = cleanedImage(svgImage(id, svg));
  if (!cleaned) throw new Error(`Cleaning refuses ${svg.slice(0, 200)}`);
  return cleaned;
}

function svg(viewBox: string, content: string): string {
  return `<svg viewBox="${viewBox}" ${NS}>${content}</svg>`;
}

function part(cleaned: CleanedImage, id: string): NamedPart {
  const found = namedPart(cleaned, id);
  if (!found) throw new Error(`No part ${id}`);
  return found;
}

/** Whether a part's outline holds a point in the image's own units. */
function holds(found: NamedPart, x: number, y: number, margin = 0): boolean {
  const { outline } = found;
  return outlineHolds(fitOutline(outline, outline.width, outline.height), { x, y }, margin);
}

function expectBounds(found: NamedPart, [x, y, width, height]: number[]): void {
  const { bounds } = found;
  expect(bounds.x).toBeCloseTo(x as number, 6);
  expect(bounds.y).toBeCloseTo(y as number, 6);
  expect(bounds.width).toBeCloseTo(width as number, 6);
  expect(bounds.height).toBeCloseTo(height as number, 6);
}

/** The points an outline flattens to, as named parts count them against their cap. */
function pointsOf(outline: Outline): number {
  const tolerance = (0.25 * Math.max(outline.width, outline.height)) / PART_CAPS.side;
  return outline.contours.reduce((sum, contour) => sum + flatPointCount(contour, tolerance), 0);
}

const SQUARE = 'M0 0h10v10h-10z';

describe('partsOf', () => {
  it('lists the named parts in document order, never what definitions, clip paths, masks or gradients hold', () => {
    const cleaned = picture(
      `<svg id="root" viewBox="0 0 100 100" ${NS}>` +
        `<defs><path id="def" d="${SQUARE}"/></defs>` +
        '<clipPath id="clip"><rect id="clip-rect" width="5" height="5"/></clipPath>' +
        '<mask id="mask"><rect id="mask-rect" width="5" height="5" fill="#FFFFFF"/></mask>' +
        '<linearGradient id="gradient"><stop id="stop" offset="0" stop-color="#000000"/></linearGradient>' +
        '<symbol id="symbol"><rect id="symbol-rect" width="5" height="5"/></symbol>' +
        `<g id="a"><path id="b" d="${SQUARE}"/><g id="c"><rect id="d" x="20" width="10" height="10"/></g></g>` +
        '<circle id="e" cx="50" cy="50" r="5"/>' +
        `<g id="empty"/><path id="hidden" d="${SQUARE}" display="none"/>` +
        `<g visibility="hidden"><path id="invisible" d="${SQUARE}"/><path id="shown" visibility="visible" d="${SQUARE}"/></g>` +
        `<path id="unpainted" d="${SQUARE}" fill="none"/>` +
        '<svg id="nested" x="60" y="60" width="20" height="20"><rect id="inside" width="10" height="10"/></svg>' +
        '</svg>',
    );
    expect(partsOf(cleaned).map((each) => each.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'shown',
      'nested',
      'inside',
    ]);
    expect(namedPartCount(cleaned)).toBe(8);
    expect(namedPart(cleaned, 'def')).toBeUndefined();
  });

  it('gives each part its outline, bounds and main color in the image’s units, from the top left of its view box', () => {
    const cleaned = picture(svg('-50 -50 100 80', '<circle id="dot" r="10" fill="#336699"/>'));
    const dot = part(cleaned, 'dot');
    expectBounds(dot, [40, 40, 20, 20]);
    expect(dot.outline).toMatchObject({ width: 100, height: 80, keepProportions: true });
    expect(dot.color).toBe('#336699');
    expect(holds(dot, 50, 50)).toBe(true);
    expect(holds(dot, 50, 61)).toBe(false);
    // Fitted to the rectangle its picture is drawn in, it lands where the picture draws it.
    const fitted = fitOutline(dot.outline, 200, 160);
    expect(outlineHolds(fitted, { x: 100, y: 100 })).toBe(true);
    expect(fitted.bounds.x).toBeCloseTo(80, 6);
  });

  it('applies translate, scale, rotate, matrix and skew transforms, nested and listed', () => {
    const cleaned = picture(
      svg(
        '0 0 200 200',
        '<rect id="moved" width="10" height="20" transform="translate(5 7)"/>' +
          '<rect id="scaled" width="10" height="20" transform="scale(2 3)"/>' +
          '<rect id="turned" width="10" height="20" transform="rotate(90)"/>' +
          '<rect id="turned-about" x="100" y="100" width="10" height="20" transform="rotate(180 105 110)"/>' +
          '<rect id="matrix" width="10" height="20" transform="matrix(1 0 0 1 30 40)"/>' +
          '<rect id="skewed" width="10" height="10" transform="skewX(45)"/>' +
          '<g id="outer" transform="translate(100 0)"><g id="inner" transform="scale(2)">' +
          '<rect id="deep" x="1" y="1" width="10" height="10" transform="translate(5 5)"/></g></g>' +
          '<rect id="listed" width="10" height="10" transform="translate(1, 2) scale(2)"/>' +
          '<rect id="misspelt" width="10" height="10" transform="Translate(50 50)"/>',
      ),
    );
    expectBounds(part(cleaned, 'moved'), [5, 7, 10, 20]);
    expectBounds(part(cleaned, 'scaled'), [0, 0, 20, 60]);
    expectBounds(part(cleaned, 'turned'), [-20, 0, 20, 10]);
    expectBounds(part(cleaned, 'turned-about'), [100, 100, 10, 20]);
    expectBounds(part(cleaned, 'matrix'), [30, 40, 10, 20]);
    expectBounds(part(cleaned, 'skewed'), [0, 0, 20, 10]);
    expectBounds(part(cleaned, 'deep'), [112, 12, 20, 20]);
    expectBounds(part(cleaned, 'inner'), [112, 12, 20, 20]);
    expectBounds(part(cleaned, 'listed'), [1, 2, 20, 20]);
    // A transform SVG cannot read leaves its element where it is.
    expectBounds(part(cleaned, 'misspelt'), [0, 0, 10, 10]);
  });

  it('resolves use, of shapes, groups, symbols and drawn parts, with the use’s paint', () => {
    const cleaned = picture(
      svg(
        '0 0 200 200',
        `<defs><path id="shape" d="${SQUARE}"/>` +
          '<g id="pair"><rect id="one" width="5" height="5"/><rect id="two" x="10" width="5" height="5"/></g></defs>' +
          '<symbol id="s" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol>' +
          '<use id="copy" href="#shape" x="20" y="30" transform="scale(2)"/>' +
          '<use id="pair-copy" href="#pair" x="100" y="100"/>' +
          '<use id="big" href="#s" y="100" width="50" height="50"/>' +
          '<circle id="drawn" cx="150" cy="20" r="10"/><use id="again" href="#drawn" y="50"/>' +
          '<use id="red" href="#shape" x="180" y="180" fill="#FF0000"/>',
      ),
    );
    expect(partsOf(cleaned).map((each) => each.id)).toEqual([
      'copy',
      'pair-copy',
      'big',
      'drawn',
      'again',
      'red',
    ]);
    expectBounds(part(cleaned, 'copy'), [40, 60, 20, 20]);
    expectBounds(part(cleaned, 'pair-copy'), [100, 100, 15, 5]);
    expectBounds(part(cleaned, 'big'), [0, 100, 50, 50]);
    expectBounds(part(cleaned, 'drawn'), [140, 10, 20, 20]);
    expectBounds(part(cleaned, 'again'), [140, 60, 20, 20]);
    expect(part(cleaned, 'red').color).toBe('#FF0000');
  });

  it('measures viewports, percentages and slices as SVG does, and draws path data up to its first error', () => {
    const cleaned = picture(
      svg(
        '0 0 200 100',
        '<defs><svg id="inner" viewBox="0 0 10 10" preserveAspectRatio="none"><rect width="10" height="10"/></svg></defs>' +
          '<use id="stretched" href="#inner" x="10" y="10" width="40" height="20"/>' +
          '<rect id="half" width="50%" height="50%" x="10%"/>' +
          '<path id="thin" d="M0 90 H200" fill="none" stroke="#000000" stroke-width="1%"/>' +
          '<symbol id="tall" viewBox="0 0 10 20" preserveAspectRatio="xMinYMin slice"><rect width="10" height="20"/></symbol>' +
          '<use id="sliced" href="#tall" y="50" width="40" height="40"/>' +
          '<path id="broken" d="M0 0 H10 V10 H0 Z M50 50 L60 x"/>',
      ),
    );
    expectBounds(part(cleaned, 'stretched'), [10, 10, 40, 20]);
    expectBounds(part(cleaned, 'half'), [20, 0, 100, 50]);
    const half = Math.sqrt((200 * 200 + 100 * 100) / 2) / 200;
    expectBounds(part(cleaned, 'thin'), [-half, 90 - half, 200 + 2 * half, 2 * half]);
    expectBounds(part(cleaned, 'sliced'), [0, 50, 40, 80]);
    expectBounds(part(cleaned, 'broken'), [0, 0, 10, 10]);
  });

  it('applies the outermost element’s own transform and paint to every part', () => {
    const cleaned = picture(
      `<svg viewBox="0 0 100 100" transform="translate(10 5)" fill="#00FF00" ${NS}>` +
        '<rect id="r" width="10" height="10"/><g id="g" transform="scale(2)"><rect id="s" width="5" height="5"/></g></svg>',
    );
    expectBounds(part(cleaned, 'r'), [10, 5, 10, 10]);
    expectBounds(part(cleaned, 's'), [10, 5, 10, 10]);
    expect(part(cleaned, 'r').color).toBe('#00FF00');
    const s = partPicture(cleaned, 's');
    expect(s?.kind === 'svg' && s.svg).toBe(
      `<svg fill="#00FF00" viewBox="10 5 10 10" ${NS}><g transform="translate(10 5) scale(2)"><rect height="5" id="s" width="5"/></g></svg>`,
    );
    const r = partPicture(cleaned, 'r');
    expect(r?.kind === 'svg' && r.svg).toBe(
      `<svg fill="#00FF00" viewBox="10 5 10 10" ${NS}><rect height="10" id="r" transform="translate(10 5)" width="10"/></svg>`,
    );
  });

  it('holds in a group what any part of it holds, and gives it the color of its largest filled shape', () => {
    const cleaned = picture(
      svg(
        '0 0 100 100',
        '<g id="organ" fill="#336699"><rect id="whole" width="60" height="60"/>' +
          '<rect id="inner" x="20" y="20" width="20" height="20" fill="#993333"/>' +
          '<circle id="lobe" cx="70" cy="30" r="20"/></g>',
      ),
    );
    const organ = part(cleaned, 'organ');
    expect(holds(organ, 30, 30)).toBe(true);
    expect(holds(organ, 55, 30)).toBe(true);
    expect(holds(organ, 85, 30)).toBe(true);
    expect(holds(organ, 80, 80)).toBe(false);
    expectBounds(organ, [0, 0, 90, 60]);
    expect(organ.color).toBe('#336699');
    expect(part(cleaned, 'inner').color).toBe('#993333');
    expect(holds(part(cleaned, 'whole'), 30, 30)).toBe(true);
    expect(holds(part(cleaned, 'inner'), 10, 10)).toBe(false);
  });

  it('holds what a part strokes as a band of its stroke’s width, transformed with it', () => {
    const cleaned = picture(
      svg(
        '0 0 100 100',
        '<path id="nerve" d="M10 50 H90" stroke="#FF0000" stroke-width="4" fill="none"/>' +
          '<rect id="framed" x="10" y="70" width="20" height="20" fill="#00FF00" stroke="#000000" stroke-width="2"/>' +
          '<g transform="scale(2)"><path id="thick" d="M5 5 H20" stroke="#000000" fill="none"/></g>' +
          '<line id="hair" x1="0" y1="0" x2="10" y2="0" stroke="#000000" stroke-width="0"/>' +
          '<line id="wire" x1="0" y1="95" x2="100" y2="95" stroke="#0000FF" stroke-width="2"/>',
      ),
    );
    const nerve = part(cleaned, 'nerve');
    expect(nerve.outline.contours.map((contour) => [contour.role, contour.width])).toEqual([
      ['line', 4],
    ]);
    expect(holds(nerve, 50, 51.9)).toBe(true);
    expect(holds(nerve, 50, 52.1)).toBe(false);
    expectBounds(nerve, [8, 48, 84, 4]);
    expect(nerve.color).toBe('#FF0000');
    const framed = part(cleaned, 'framed');
    expect(holds(framed, 9.5, 80)).toBe(true);
    expect(holds(framed, 8.5, 80)).toBe(false);
    expect(framed.color).toBe('#00FF00');
    expect(part(cleaned, 'thick').outline.contours[0]?.width).toBeCloseTo(2, 9);
    expect(namedPart(cleaned, 'hair')).toBeUndefined();
    expect(part(cleaned, 'wire').color).toBe('#0000FF');
  });

  it('fills by each shape’s own rule: nonzero by winding, even-odd by nesting, inherited', () => {
    const cleaned = picture(
      svg(
        '0 0 100 100',
        '<path id="nonzero" d="M0 0 H40 V40 H0 Z M10 10 H30 V30 H10 Z"/>' +
          '<path id="evenodd" fill-rule="evenodd" d="M50 0 H90 V40 H50 Z M60 10 H80 V30 H60 Z"/>' +
          '<g fill-rule="evenodd"><path id="inherited" d="M0 50 H40 V90 H0 Z M10 60 H30 V80 H10 Z"/></g>' +
          '<path id="reversed" d="M50 50 H90 V90 H50 Z M60 60 V80 H80 V60 Z"/>',
      ),
    );
    const nonzero = part(cleaned, 'nonzero');
    expect(holds(nonzero, 20, 20)).toBe(true);
    expect(nonzero.outline.contours.map((contour) => [contour.role, contour.nonzero])).toEqual([
      ['fill', true],
      ['fill', true],
    ]);
    expect(holds(part(cleaned, 'evenodd'), 70, 20)).toBe(false);
    expect(part(cleaned, 'evenodd').outline.contours.map((contour) => contour.role)).toEqual([
      'fill',
      'hole',
    ]);
    expect(holds(part(cleaned, 'inherited'), 20, 70)).toBe(false);
    expect(holds(part(cleaned, 'reversed'), 70, 70)).toBe(false);
    for (const [id, x, y] of [
      ['nonzero', 5, 5],
      ['evenodd', 55, 5],
      ['inherited', 5, 55],
      ['reversed', 55, 55],
    ] as const) {
      expect(holds(part(cleaned, id), x, y), id).toBe(true);
    }
  });

  it('reads main colors from named colors, functions, currentColor, groups and gradients’ middle stops', () => {
    const cleaned = picture(
      svg(
        '0 0 100 100',
        '<linearGradient id="g"><stop offset="0" stop-color="#111111"/><stop offset="0.5" stop-color="#222222"/>' +
          '<stop offset="1" stop-color="#333333"/></linearGradient><linearGradient id="h" href="#g"/>' +
          `<path id="graded" d="${SQUARE}" fill="url(#g)"/><path id="borrowed" d="${SQUARE}" fill="url(#h)"/>` +
          `<path id="named" d="${SQUARE}" fill="Red"/><path id="current" d="${SQUARE}" fill="currentColor" color="#123456"/>` +
          `<g fill="#ABCDEF"><path id="from-group" d="${SQUARE}"/></g><path id="default" d="${SQUARE}"/>` +
          `<path id="rgb" d="${SQUARE}" fill="rgb(255, 128, 0)"/><path id="hsl" d="${SQUARE}" fill="hsl(120, 100%, 25%)"/>` +
          `<path id="stroked" d="${SQUARE}" fill="none" stroke="#00AA00"/>` +
          `<g id="largest"><path d="M0 0h5v5z" fill="#FF0000"/><path d="M0 0h50v50h-50z" fill="#0000FF"/></g>` +
          `<g id="see-through"><path d="M0 0h50v50h-50z" fill="transparent"/><path d="M0 0h5v5h-5z" fill="#00FF00"/></g>`,
      ),
    );
    const colors = Object.fromEntries(partsOf(cleaned).map((each) => [each.id, each.color]));
    expect(colors).toEqual({
      graded: '#222222',
      borrowed: '#222222',
      named: '#FF0000',
      current: '#123456',
      'from-group': '#ABCDEF',
      default: '#000000',
      rgb: '#FF8000',
      hsl: '#008000',
      stroked: '#00AA00',
      largest: '#0000FF',
      'see-through': '#00FF00',
    });
  });

  it('lists at most 1,024 parts, in document order, and counts the rest', () => {
    const squares = Array.from(
      { length: 1100 },
      (_, at) => `<path d="M${at} 0h1v1z" id="p${at}"/>`,
    );
    const cleaned = picture(svg('0 0 1200 1', squares.join('')));
    const parts = partsOf(cleaned);
    expect(parts).toHaveLength(PART_CAPS.parts);
    expect(parts[0]?.id).toBe('p0');
    expect(parts.at(-1)?.id).toBe('p1023');
    expect(namedPartCount(cleaned)).toBe(1100);
    expect(namedPart(cleaned, 'p1050')).toBeUndefined();
  });

  it('flattens each outline to at most 4,096 points, simplified beyond that but where it was', () => {
    const wave = `M0 50${' c 5 -40 10 40 15 0'.repeat(1300)} V100 H0 Z`;
    const cleaned = picture(svg('0 0 19500 100', `<path id="wave" d="${wave}"/>`));
    const found = part(cleaned, 'wave');
    expect(pointsOf(found.outline)).toBeLessThanOrEqual(PART_CAPS.points);
    expect(
      found.outline.contours.every((contour) => contour.segments.every((s) => s.kind === 'line')),
    ).toBe(true);
    // Still where the wave was: inside below it, outside above its crests.
    expect(holds(found, 7.5, 90)).toBe(true);
    expect(holds(found, 7.5, 5)).toBe(false);
    expectBounds(found, [0, found.bounds.y, 19500, found.bounds.height]);
    // An outline within the cap keeps its curves.
    const small = picture(
      svg('0 0 100 100', '<path id="curve" d="M0 0 C 50 100 100 0 100 100 Z"/>'),
    );
    expect(part(small, 'curve').outline.contours[0]?.segments[0]?.kind).toBe('cubic');
  });

  it('reads each cleaned view once, and equal content once for every image that holds it', () => {
    const text = svg('0 0 10 10', `<path id="a" d="${SQUARE}"/>`);
    const first = picture(text, 'clinic.first');
    expect(partsOf(first)).toBe(partsOf(first));
    expect(partsOf(picture(text, 'clinic.second'))).toBe(partsOf(first));
    const bitmap = cleanedImage(DESK);
    expect(bitmap && partsOf(bitmap)).toEqual([]);
  });

  it('reads a heart’s chambers, vessels and nerve, its valves through use, and nothing of its text', () => {
    const heart = picture(HEART_SVG, 'clinic.heart');
    expect(partsOf(heart).map((each) => each.id)).toEqual(HEART_PARTS);
    const atrium = part(heart, 'right-atrium');
    // Inside the heart, translated by (20, 40).
    expect(holds(atrium, 20 + 105, 40 + 105)).toBe(true);
    expect(holds(part(heart, 'heart'), 20 + 105, 40 + 105)).toBe(true);
    expect(holds(part(heart, 'chambers'), 20 + 180, 40 + 250)).toBe(false);
    // The left ventricle's inner contour is a hole, by its own even-odd rule.
    expect(holds(part(heart, 'left-ventricle'), 20 + 230, 40 + 215)).toBe(false);
    expect(holds(part(heart, 'heart'), 20 + 230, 40 + 215)).toBe(true);
    expect(part(heart, 'body').color).toBe('#E0685C');
    expect(part(heart, 'aorta').color).toBe('#DC143C');
    expect(part(heart, 'pulmonary-artery').color).toBe('#466EBE');
    expect(part(heart, 'vagus-nerve').color).toBe('#FFD700');
    expect(part(heart, 'septum').outline.contours.every((contour) => contour.role === 'line')).toBe(
      true,
    );
    expect(part(heart, 'tricuspid-valve').color).toBe('#F2E4C9');
    expect(part(heart, 'heart').color).toBe('#E0685C');
    // The chambers take the style sheet's stroke.
    expect(holds(part(heart, 'right-atrium'), 20 + 59.5, 40 + 90)).toBe(true);
    expect(holds(part(heart, 'right-atrium'), 20 + 58.5, 40 + 90)).toBe(false);
  });
});

describe('partPicture', () => {
  it('draws one part alone: in copies of its ancestors that keep their transforms and paint, with its definitions, in a view box of its bounds', () => {
    const cleaned = picture(
      svg(
        '0 0 100 100',
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#FF0000"/></linearGradient>' +
          '<clipPath id="c"><rect width="50" height="50"/></clipPath><linearGradient id="unused"/></defs>' +
          '<g id="outer" transform="translate(10 10)" fill="#00FF00" opacity="0.5">' +
          '<rect id="sibling" width="5" height="5"/>' +
          '<g clip-path="url(#c)"><rect id="part" x="10" y="10" width="20" height="20" fill="url(#g)"/></g></g>',
      ),
      'clinic.box',
    );
    const drawn = partPicture(cleaned, 'part');
    expect(drawn).toMatchObject({ kind: 'svg', id: 'clinic.box#part', width: 20, height: 20 });
    expect(drawn?.kind === 'svg' && drawn.svg).toBe(
      `<svg viewBox="20 20 20 20" ${NS}><defs><linearGradient id="g"><stop offset="0" stop-color="#FF0000"/></linearGradient>` +
        '<clipPath id="c"><rect height="50" width="50"/></clipPath></defs>' +
        '<g fill="#00FF00" opacity="0.5" transform="translate(10 10)"><g clip-path="url(#c)">' +
        '<rect fill="url(#g)" height="20" id="part" width="20" x="10" y="10"/></g></g></svg>',
    );
    expect(partPicture(cleaned, 'part')).toBe(drawn);
    expect(partPicture(cleaned, 'unused')).toBeUndefined();
    expect(partPicture(cleaned, 'nothing')).toBeUndefined();
  });

  it('brings what a use refers to, and keeps the original viewport where lengths or edges need it', () => {
    const cleaned = picture(
      svg(
        '0 0 100 100',
        '<symbol id="s" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol>' +
          '<use id="tile" href="#s" width="20%" height="20%"/><circle id="edge" cx="100" cy="50" r="10"/>',
      ),
    );
    const tile = partPicture(cleaned, 'tile');
    expect(tile?.kind === 'svg' && tile.svg).toContain('<symbol id="s" viewBox="0 0 10 10">');
    expect(tile?.kind === 'svg' && tile.svg).toContain(
      '<svg height="100" viewBox="0 0 100 100" width="100" x="0" y="0">',
    );
    expect(tile).toMatchObject({ width: 20, height: 20 });
    const edge = partPicture(cleaned, 'edge');
    expect(edge?.kind === 'svg' && edge.svg).toMatch(/^<svg viewBox="90 40 20 20"/);
    expect(edge?.kind === 'svg' && edge.svg).toContain('<svg height="100"');
  });

  it('draws each part of a heart as cleaning gives it, and cleaning it again changes nothing', () => {
    const heart = picture(HEART_SVG, 'clinic.heart');
    for (const each of partsOf(heart)) expectCleanPicture(heart, each);
    const valve = partPicture(heart, 'mitral-valve');
    expect(valve?.kind === 'svg' && valve.svg).toContain('id="valve"');
  });
});

/** A part's picture is what cleaning gives for it, cleaning it again changes nothing, and nothing in it runs. */
function expectCleanPicture(cleaned: CleanedImage, found: NamedPart): void {
  const drawn = partPicture(cleaned, found.id);
  expect(drawn, found.id).toBeDefined();
  if (drawn?.kind !== 'svg') return;
  const again = cleanSvg(drawn.svg);
  expect(again.ok && again.value).toEqual({
    svg: drawn.svg,
    width: drawn.width,
    height: drawn.height,
  });
  expect(again.ok && again.removed).toEqual([]);
  expect(drawn.width).toBeCloseTo(found.bounds.width, 6);
  expect(drawn.height).toBeCloseTo(found.bounds.height, 6);
  expectNothingRuns(drawn.svg);
}

/** A geometry read as free geometry, which must succeed. */
function readFree(cleaned: CleanedImage, id?: string): Outline {
  const geometry = geometryOf(cleaned, id);
  expect(geometry, id).toBeDefined();
  if (!geometry) throw new Error(`No geometry for ${id ?? 'the picture'}`);
  const read = readGeometry(geometry);
  if (!read.ok) throw new Error(`${id ?? 'the picture'}: ${read.message}`);
  const text = geometry.outline.reduce(
    (sum, contour) => sum + (contour.kind === 'path' ? contour.d.length : 0),
    0,
  );
  expect(text).toBeLessThanOrEqual(GEOMETRY_CAPS.text);
  expect(geometry.outline.length).toBeLessThanOrEqual(GEOMETRY_CAPS.contours);
  expect(geometry.keepProportions).toBe(true);
  return read.outline;
}

/** Whether free geometry holds what a part holds, at places away from both their edges. */
function expectSameHolding(found: NamedPart, free: Outline, steps = 24): void {
  const { bounds } = found;
  const fittedPart = fitOutline(found.outline, found.outline.width, found.outline.height);
  const scale = free.width / bounds.width;
  const fittedFree = fitOutline(free, free.width, free.height);
  const slack = Math.max(bounds.width, bounds.height) / 100;
  let compared = 0;
  for (let i = 0; i <= steps; i += 1) {
    for (let j = 0; j <= steps; j += 1) {
      const x = bounds.x + (bounds.width * i) / steps;
      const y = bounds.y + (bounds.height * j) / steps;
      const inPart = outlineHolds(fittedPart, { x, y });
      if (!inPart && outlineHolds(fittedPart, { x, y }, slack)) continue;
      const near = [
        [slack, 0],
        [-slack, 0],
        [0, slack],
        [0, -slack],
      ].some(
        ([dx, dy]) =>
          outlineHolds(fittedPart, { x: x + (dx as number), y: y + (dy as number) }) !== inPart,
      );
      if (near) continue;
      const point = { x: (x - bounds.x) * scale, y: (y - bounds.y) * scale };
      expect(outlineHolds(fittedFree, point), `${found.id} at ${x}, ${y}`).toBe(inPart);
      compared += 1;
    }
  }
  expect(compared).toBeGreaterThan(0);
}

describe('geometryOf', () => {
  it('writes a part’s outline as free geometry that holds what it holds, its curves kept when it can', () => {
    const heart = picture(HEART_SVG, 'clinic.heart');
    const body = part(heart, 'body');
    const free = readFree(heart, 'body');
    expect(free.width).toBeCloseTo(body.bounds.width, 2);
    expect(free.height).toBeCloseTo(body.bounds.height, 2);
    expect(geometryOf(heart, 'body')?.outline[0]).toMatchObject({ kind: 'path' });
    const d = geometryOf(heart, 'body')?.outline[0];
    expect(d?.kind === 'path' && d.d).toContain('C');
    expectSameHolding(body, free);
    expect(geometryOf(heart, 'body')).toBe(geometryOf(heart, 'body'));
  });

  it('joins overlapping shapes, holes cut by their own rules, and bands of strokes, as their outline holds them', () => {
    const cleaned = picture(
      svg(
        '0 0 100 100',
        '<g id="organ" fill="#336699"><rect id="whole" width="60" height="60"/>' +
          '<rect x="20" y="20" width="20" height="20"/><circle cx="70" cy="30" r="20"/></g>' +
          '<g id="mixed"><path fill-rule="evenodd" d="M0 70 H40 V100 H0 Z M10 80 H30 V90 H10 Z"/>' +
          '<path d="M30 70 H70 V100 H30 Z M40 80 V90 H60 V80 Z"/></g>' +
          '<path id="nerve" d="M10 65 C 40 55 60 75 90 65" fill="none" stroke="#FF0000" stroke-width="4"/>',
      ),
    );
    for (const id of ['organ', 'mixed', 'nerve', 'whole'])
      expectSameHolding(part(cleaned, id), readFree(cleaned, id));
    readFree(cleaned);
  });

  it('writes a shape drawn twice in the same place once, so that even-odd does not cancel it', () => {
    const cleaned = picture(
      svg(
        '0 0 100 100',
        '<g id="twice"><path id="square" d="M10 10 H60 V60 H10 Z"/><use href="#square"/>' +
          '<path d="M60 10 V60 H10 V10 Z"/></g><rect id="side" x="60" y="10" width="20" height="50"/>' +
          '<g id="beside"><rect x="0" y="70" width="20" height="20"/><rect x="20" y="70" width="20" height="20"/></g>',
      ),
    );
    const free = readFree(cleaned, 'twice');
    expect(free.contours).toHaveLength(1);
    expectSameHolding(part(cleaned, 'twice'), free);
    expectSameHolding(part(cleaned, 'beside'), readFree(cleaned, 'beside'));
  });

  it('simplifies to free geometry’s caps: 64 contours, 2,000 segments and 32 KiB of path data', () => {
    const wave = `M0 50${' c 5 -40 10 40 15 0'.repeat(1300)} V100 H0 Z`;
    const big = picture(svg('0 0 19500 100', `<path id="wave" d="${wave}"/>`));
    const free = readFree(big, 'wave');
    let segments = 0;
    for (const contour of geometryOf(big, 'wave')?.outline ?? []) {
      const read = contour.kind === 'path' ? readPathData(contour.d) : undefined;
      if (read?.ok) segments += read.commands;
    }
    expect(segments).toBeLessThanOrEqual(GEOMETRY_CAPS.segments);
    expect(free.contours.length).toBeGreaterThan(0);
    const squares = Array.from(
      { length: 100 },
      (_, at) => `<path d="M${(at % 10) * 10} ${Math.floor(at / 10) * 10}h5v5h-5z"/>`,
    );
    const many = picture(svg('0 0 100 100', `<g id="grid">${squares.join('')}</g>`));
    expect(readFree(many, 'grid').contours.length).toBe(GEOMETRY_CAPS.contours);
  });

  it('gives nothing for an id that is no part', () => {
    expect(geometryOf(picture(HEART_SVG), 'shade')).toBeUndefined();
  });
});

describe('lostParts', () => {
  it('gives the anchored parts the picture had and the new one lacks, each once, in order', () => {
    const before = picture(HEART_SVG);
    const after = picture(
      HEART_SVG.replace('id="left-ventricle"', 'id="lv"').replace('id="aorta"', 'id="aorta-2"'),
    );
    expect(
      lostParts(before, after, ['aorta', 'left-ventricle', 'body', 'missing', 'aorta']),
    ).toEqual(['aorta', 'left-ventricle']);
    expect(lostParts(before, before, ['aorta'])).toEqual([]);
    expect(lostParts(before, undefined, ['aorta'])).toEqual(['aorta']);
    expect(lostParts(undefined, after, ['aorta'])).toEqual([]);
  });
});

describe('finding the part an appearance names', () => {
  const heartImage = svgImage('clinic.heart', HEART_SVG, 'Heart');
  const catalog = imagesOf([clinicPackage([heartImage])]);

  it('finds it in the image named, or in the one its container shows with its parts', () => {
    expect(findPart({ part: 'aorta', image: 'clinic.heart' }, catalog)).toMatchObject({
      imageId: 'clinic.heart',
      part: { id: 'aorta', color: '#DC143C' },
    });
    expect(findPart({ part: 'aorta' }, catalog, 'clinic.heart')?.part.id).toBe('aorta');
    expect(findPart({ part: 'aorta' }, catalog)).toBeUndefined();
    expect(findPart({ part: 'lv', image: 'clinic.heart' }, catalog)).toBeUndefined();
    expect(findPart({ part: 'aorta', image: 'clinic.unknown' }, catalog)).toBeUndefined();
  });

  it('warns unknown-part for a part its image lacks, and leaves an image no package defines to unknown-image', () => {
    const owner = { id: 'lv', label: 'The element "Left ventricle"' };
    const lacking = unknownPartProblem({ part: 'lv', image: 'clinic.heart' }, catalog, owner);
    expect(lacking).toMatchObject({ code: 'unknown-part', subjects: ['lv', 'clinic.heart'] });
    expect(lacking?.message).toContain('"lv"');
    expect(
      unknownPartProblem({ part: 'aorta', image: 'clinic.heart' }, catalog, owner),
    ).toBeUndefined();
    expect(unknownPartProblem({ part: 'lv' }, catalog, owner)).toBeUndefined();
    expect(unknownPartProblem({ part: 'lv' }, catalog, owner, 'clinic.heart')?.code).toBe(
      'unknown-part',
    );
    expect(
      unknownPartProblem({ part: 'lv', image: 'clinic.unknown' }, catalog, owner),
    ).toBeUndefined();
  });

  it('says which image a part names, for in-use', () => {
    expect(partImageId({ part: 'aorta', image: 'clinic.heart' })).toBe('clinic.heart');
    expect(partImageId({ part: 'aorta' })).toBeUndefined();
    expect(partImageId('none')).toBeUndefined();
    expect(partImageId(undefined)).toBeUndefined();
  });
});

describe('checking a project’s images', () => {
  it('warns too-many-parts for a picture with more named parts than it lists', () => {
    const squares = Array.from(
      { length: 1030 },
      (_, at) => `<path d="M${at} 0h1v1z" id="p${at}"/>`,
    );
    const atlas = svgImage('clinic.atlas', svg('0 0 1100 1', squares.join('')), 'Atlas');
    const { warnings } = checkImages(imageProject([atlas]));
    const warning = warnings.find((each) => each.code === 'too-many-parts');
    expect(warning).toMatchObject({ subjects: ['clinic.atlas', 'clinic'] });
    expect(warning?.message).toContain('1,030');
    expect(
      checkImages(imageProject()).warnings.some((each) => each.code === 'too-many-parts'),
    ).toBe(false);
  });
});

/** Every part of a picture read within its caps, with a clean picture and free geometry of its own. */
function expectSafeParts(cleaned: CleanedImage): void {
  const parts = partsOf(cleaned);
  expect(parts.length).toBeLessThanOrEqual(PART_CAPS.parts);
  for (const each of parts) {
    expect(pointsOf(each.outline), each.id).toBeLessThanOrEqual(PART_CAPS.points);
    expect(each.color).toMatch(/^#[0-9A-F]{6}$/);
    expect(Number.isFinite(each.bounds.width) && each.bounds.width > 0).toBe(true);
    expectCleanPicture(cleaned, each);
    const geometry = geometryOf(cleaned, each.id);
    if (geometry) expect(readGeometry(geometry).ok, each.id).toBe(true);
  }
}

describe('the attack corpus, read for parts', () => {
  it.each(ATTACKS)('%s stays safe, within its caps, and never throws', (_name, text) => {
    const result = cleanSvg(text);
    if (!result.ok) return;
    const start = Date.now();
    const cleaned = picture(text);
    expectSafeParts(cleaned);
    const whole = geometryOf(cleaned);
    if (whole) expect(readGeometry(whole).ok).toBe(true);
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it('reads fuzzed pictures safely: every part’s picture is what cleaning gives for it', () => {
    fc.assert(
      fc.property(fc.array(tree, { maxLength: 4 }), (children) => {
        const text =
          `<svg viewBox="0 0 100 100" ${NS}>` +
          `<path id="a" d="M0 0h1v1z"/><linearGradient id="b"/>${children.map(writeTree).join('')}</svg>`;
        if (!cleanSvg(text).ok) return;
        expectSafeParts(picture(text));
      }),
      { numRuns: 200 },
    );
  });
});

// --- Parts in document order, with their transforms applied ----------------------------------------

type Matrix = [number, number, number, number, number, number];

interface Built {
  svg: string;
  /** Parts in document order, each with the points its rectangles' corners land on. */
  parts: { id: string; corners: [number, number][] }[];
}

const number = (low: number, high: number) =>
  fc.integer({ min: low * 100, max: high * 100 }).map((value) => value / 100);

/** A transform written as SVG writes one, with the matrix it is. */
const transform: fc.Arbitrary<[string, Matrix]> = fc.oneof(
  fc
    .tuple(number(-50, 50), number(-50, 50))
    .map(([x, y]): [string, Matrix] => [`translate(${x} ${y})`, [1, 0, 0, 1, x, y]]),
  fc
    .tuple(number(0.2, 3), number(0.2, 3))
    .map(([x, y]): [string, Matrix] => [`scale(${x} ${y})`, [x, 0, 0, y, 0, 0]]),
  fc
    .tuple(number(-180, 180), number(-20, 20), number(-20, 20))
    .map(([a, cx, cy]): [string, Matrix] => {
      const r = (a * Math.PI) / 180;
      const [cos, sin] = [Math.cos(r), Math.sin(r)];
      return [
        `rotate(${a} ${cx} ${cy})`,
        [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy],
      ];
    }),
  fc
    .tuple(number(-2, 2), number(-2, 2), number(-2, 2), number(-2, 2), number(-9, 9), number(-9, 9))
    .map((m): [string, Matrix] => [`matrix(${m.join(' ')})`, m]),
  fc.constant<[string, Matrix]>(['', [1, 0, 0, 1, 0, 0]]),
);

function times(outer: Matrix, inner: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

interface Spec {
  transform: [string, Matrix];
  rect: [number, number, number, number] | undefined;
  children: Spec[];
}

const spec: fc.Arbitrary<Spec> = fc.letrec<{ node: Spec }>((tie) => ({
  node: fc.record({
    transform,
    rect: fc.option(fc.tuple(number(-20, 20), number(-20, 20), number(1, 20), number(1, 20)), {
      nil: undefined,
    }),
    children: fc.oneof(
      { depthSize: 'small', maxDepth: 5 },
      fc.constant<Spec[]>([]),
      fc.array(tie('node'), { minLength: 1, maxLength: 3 }),
    ),
  }),
})).node;

/** Writes random groups and rectangles, each with an id, and says where each part's corners land. */
function build(specs: readonly Spec[]): Built {
  const parts: Built['parts'] = [];
  const write = (node: Spec, outer: Matrix): { text: string; corners: [number, number][] } => {
    const id = `n${parts.length}`;
    const entry = { id, corners: [] as [number, number][] };
    parts.push(entry);
    const m = times(outer, node.transform[1]);
    const attribute = node.transform[0] ? ` transform="${node.transform[0]}"` : '';
    if (node.rect && node.children.length === 0) {
      const [x, y, w, h] = node.rect;
      for (const [px, py] of [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ] as const) {
        entry.corners.push([m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]]);
      }
      return {
        text: `<rect id="${id}" x="${x}" y="${y}" width="${w}" height="${h}"${attribute}/>`,
        corners: entry.corners,
      };
    }
    const children = node.children.map((child) => write(child, m));
    entry.corners = children.flatMap((child) => child.corners);
    return {
      text: `<g id="${id}"${attribute}>${children.map((child) => child.text).join('')}</g>`,
      corners: entry.corners,
    };
  };
  const body = specs.map((node) => write(node, [1, 0, 0, 1, 0, 0]).text).join('');
  return {
    svg: svg('-100 -100 400 400', body),
    parts: parts.filter((each) => each.corners.length > 0),
  };
}

describe('parts, under random transforms', () => {
  it('come in document order, with their transforms applied', () => {
    fc.assert(
      fc.property(fc.array(spec, { minLength: 1, maxLength: 4 }), (specs) => {
        const built = build(specs);
        const result = cleanSvg(built.svg);
        if (!result.ok) return;
        const cleaned = picture(built.svg);
        const parts = partsOf(cleaned);
        const expected = built.parts.filter((each) => {
          const xs = each.corners.map(([x]) => x);
          const ys = each.corners.map(([, y]) => y);
          // A part flattened to nothing by a transform draws nothing, and is no part.
          return (
            Math.max(...xs) - Math.min(...xs) > 1e-9 && Math.max(...ys) - Math.min(...ys) > 1e-9
          );
        });
        expect(parts.map((each) => each.id)).toEqual(expected.map((each) => each.id));
        for (const each of expected) {
          const xs = each.corners.map(([x]) => x + 100);
          const ys = each.corners.map(([, y]) => y + 100);
          const found = part(cleaned, each.id);
          const size = Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys);
          expect(found.bounds.x).toBeCloseTo(Math.min(...xs), 6);
          expect(found.bounds.y).toBeCloseTo(Math.min(...ys), 6);
          expect(Math.abs(found.bounds.width - (Math.max(...xs) - Math.min(...xs)))).toBeLessThan(
            1e-6 * (1 + size),
          );
          expect(Math.abs(found.bounds.height - (Math.max(...ys) - Math.min(...ys)))).toBeLessThan(
            1e-6 * (1 + size),
          );
        }
        for (const each of parts) expectCleanPicture(cleaned, each);
      }),
      { numRuns: 150 },
    );
  });
});
