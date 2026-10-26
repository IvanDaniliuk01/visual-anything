import {
  flattenOutline,
  imagesIn,
  outlineLabelArea,
  partPicture,
  partsOf,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element as ModelElement, Overlay, ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { textWidth } from './measure';
import type { Rect } from '../canvas/geometry';
import { outlineAt } from '../canvas/outlines';
import { drawnCurve } from '../canvas/routing/curves';
import { buildScene, buildSceneAfresh, standsFor, type ElementShape } from '../canvas/scene';
import { shapeColors } from '../canvas/theme/paint';
import { setCurrentLanguage } from '../i18n/language';
import { FRAME, ORGANS_ID, beyondBoxes } from '../test/beyond';
import { SAMPLE_VIEW, collapsedSample, drawnBounds, pathPoints, richSample } from '../test/exports';
import { loadSample } from '../test/sample';
import { usersAndOrders, VIEW as TABLES_VIEW } from '../test/tables';
import { THEMES } from '../theme/themes';
import { SVG_MARGIN, writeSvg } from './svg';

/** The view of the project beyond boxes (`test/beyond.ts`). */
const BEYOND_VIEW = 'anatomy';

/** The project beyond boxes, its view and its elements changed. */
function beyond(
  view: Partial<ViewFile> = {},
  elements: Record<string, Partial<ModelElement>> = {},
): ProjectSnapshot {
  const project = beyondBoxes(BEYOND_VIEW);
  return {
    ...project,
    model: {
      ...project.model,
      elements: project.model.elements.map((element) => ({
        ...element,
        ...elements[element.id],
      })),
    },
    views: project.views.map((each) => ({ ...each, ...view })),
  };
}

/** An SVG read back by a browser's XML parser, as a reader of the file would read it. */
function readSvg(text: string): Document {
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  const errors = document.getElementsByTagName('parsererror');
  if (errors.length > 0) throw new Error(`The SVG does not parse: ${errors[0]?.textContent}`);
  return document;
}

/** Whether two rectangles are the same, each side within `within`. */
function expectSameRect(actual: Rect | undefined, expected: Rect | undefined, within = 0.01): void {
  expect(actual).toBeDefined();
  expect(expected).toBeDefined();
  const a = actual as Rect;
  const b = expected as Rect;
  expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(within);
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(within);
  expect(Math.abs(a.x + a.width - (b.x + b.width))).toBeLessThanOrEqual(within);
  expect(Math.abs(a.y + a.height - (b.y + b.height))).toBeLessThanOrEqual(within);
}

/** The view box an SVG says it shows. */
function viewBoxOf(document: Document): Rect {
  const [x = 0, y = 0, width = 0, height = 0] = (
    document.documentElement.getAttribute('viewBox') ?? ''
  )
    .split(' ')
    .map(Number);
  return { x, y, width, height };
}

const PROJECTS: [string, () => ProjectSnapshot, string][] = [
  ['the sample', loadSample, SAMPLE_VIEW],
  ['the sample with pictures, an arrow and a curve', richSample, SAMPLE_VIEW],
  ['the sample with a collapsed container', () => collapsedSample(), SAMPLE_VIEW],
  ['tables with their rows', () => usersAndOrders(), TABLES_VIEW],
  [
    'free geometry, a drawing with parts and automatic curves',
    () => beyond({ routeStyle: 'curved' }),
    BEYOND_VIEW,
  ],
  [
    'free geometry and automatic straight lines',
    () => beyond({ routeStyle: 'straight' }),
    BEYOND_VIEW,
  ],
];

describe('writeSvg', () => {
  describe.each(PROJECTS)('of %s', (_name, make, viewId) => {
    it('draws exactly the scene’s bounds, and shows them with a margin around', () => {
      const project = make();
      const scene = buildScene(project, viewId);
      const drawing = writeSvg(project, viewId);
      const document = readSvg(drawing.text);
      // Rounded to hundredths as written; flattened curves may fall a little inside.
      expectSameRect(drawnBounds(document), scene.bounds, 0.6);
      expectSameRect(drawing.bounds, scene.bounds);
      const margin = {
        x: (scene.bounds?.x ?? 0) - SVG_MARGIN,
        y: (scene.bounds?.y ?? 0) - SVG_MARGIN,
        width: (scene.bounds?.width ?? 0) + 2 * SVG_MARGIN,
        height: (scene.bounds?.height ?? 0) + 2 * SVG_MARGIN,
      };
      expectSameRect(viewBoxOf(document), margin);
      expectSameRect(drawing.viewBox, margin);
    });

    it('names each shape’s element and each line’s relations, in the order the canvas draws them', () => {
      const project = make();
      const scene = buildScene(project, viewId);
      const document = readSvg(writeSvg(project, viewId).text);
      const shapes = [...document.querySelectorAll('g[data-part="shapes"] > g')];
      const order = scene.drawing ?? scene.shapes.map((_shape, at) => at);
      expect(shapes.map((shape) => shape.getAttribute('data-shape'))).toEqual(
        order.map((at) => scene.shapes[at]?.key),
      );
      expect(shapes.map((shape) => shape.getAttribute('data-element'))).toEqual(
        order.map((at) => scene.shapes[at]?.element),
      );
      const lines = [...document.querySelectorAll('g[data-part="relations"] > g')];
      expect(
        lines.map((line) =>
          (line.getAttribute('data-relation') ?? line.getAttribute('data-relations'))?.split(' '),
        ),
      ).toEqual(scene.relations.map((line) => [...standsFor(line)]));
      const free = [...document.querySelectorAll('g[data-part="free-shapes"] > g')];
      expect(free.map((each) => each.getAttribute('data-free-shape'))).toEqual([
        ...scene.notes.map((note) => note.id),
        ...scene.arrows.map((arrow) => arrow.id),
      ]);
    });

    it('writes the same file from the scene the canvas drew and from one made afresh', () => {
      const project = make();
      buildScene(project, viewId);
      const once = writeSvg(project, viewId).text;
      expect(writeSvg(structuredClone(project), viewId).text).toBe(once);
      expect(buildSceneAfresh(project, viewId).bounds).toEqual(buildScene(project, viewId).bounds);
    });
  });

  it('takes its title and description from the view, and says where its long description is', () => {
    const project = loadSample();
    const view = project.views.find((each) => each.id === SAMPLE_VIEW);
    const document = readSvg(writeSvg(project, SAMPLE_VIEW, { outlineFile: 'overview.md' }).text);
    const svg = document.documentElement;
    expect(svg.querySelector(':scope > title')?.textContent).toBe(view?.name);
    const desc = svg.querySelector(':scope > desc')?.textContent ?? '';
    expect(desc.startsWith(view?.description ?? '')).toBe(true);
    expect(desc).toContain('“overview.md”');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-labelledby')).toBe('va-title');
    expect(svg.getAttribute('aria-describedby')).toBe('va-desc');
    expect(svg.querySelector('metadata')?.textContent).toContain('System overview');
  });

  it('writes every name and detail inside its shape', () => {
    const project = richSample();
    const scene = buildScene(project, SAMPLE_VIEW);
    const document = readSvg(writeSvg(project, SAMPLE_VIEW).text);
    for (const shape of scene.shapes) {
      const group = document.querySelector(`g[data-shape="${shape.key}"]`);
      for (const text of group?.querySelectorAll(':scope > text') ?? []) {
        const lines =
          text.querySelectorAll('tspan').length > 0 ? [...text.querySelectorAll('tspan')] : [text];
        const size = Number(text.getAttribute('font-size'));
        const bold = text.getAttribute('font-weight') === '600';
        for (const line of lines) {
          const x = Number(line.getAttribute('x'));
          const y = Number(line.getAttribute('y'));
          const width = textWidth(line.textContent ?? '', size, bold);
          const anchor = text.getAttribute('text-anchor') ?? 'start';
          const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
          const room = shape.image?.band ?? shape.rect;
          expect(left, line.textContent ?? '').toBeGreaterThanOrEqual(room.x - 0.01);
          expect(left + width, line.textContent ?? '').toBeLessThanOrEqual(
            room.x + room.width + 0.01,
          );
          expect(y).toBeGreaterThan(room.y);
          expect(y).toBeLessThan(room.y + room.height);
        }
      }
    }
    const long = document.querySelector('g[data-element="appointments-api"] text');
    expect(long?.textContent).toContain('…');
  });

  it('draws in the dark theme: its canvas, and built-in colors in their dark shades', () => {
    const project = loadSample();
    const scene = buildScene(project, SAMPLE_VIEW);
    const document = readSvg(writeSvg(project, SAMPLE_VIEW, { theme: 'dark' }).text);
    expect(document.querySelector('rect[data-part="background"]')?.getAttribute('fill')).toBe(
      THEMES.dark.canvas.background,
    );
    const api = scene.shapes.find((shape) => shape.element === 'appointments-api');
    expect(api?.dark).toBeDefined();
    const body = document.querySelector('g[data-element="appointments-api"] > rect');
    expect(body?.getAttribute('fill')).toBe(api?.dark?.fill);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('writes each picture once and uses it on every shape that shows it', () => {
    const document = readSvg(writeSvg(richSample(), SAMPLE_VIEW).text);
    const symbols = [...document.querySelectorAll('defs > symbol')];
    // The icon, the icon as a silhouette, and the bitmap.
    expect(symbols).toHaveLength(3);
    const uses = [...document.querySelectorAll('g[data-part="shapes"] use')];
    expect(
      uses.map((use) => use.closest('[data-element]')?.getAttribute('data-element')).sort(),
    ).toEqual(['booking-agent', 'reminder-service', 'whatsapp']);
    for (const use of uses) {
      const id = use.getAttribute('href')?.slice(1);
      expect(symbols.some((symbol) => symbol.getAttribute('id') === id)).toBe(true);
    }
    const tinted = document.querySelector('g[data-element="whatsapp"] use')?.getAttribute('href');
    const silhouette = document.querySelector(`symbol[id="${tinted?.slice(1)}"]`);
    expect(silhouette?.innerHTML).toContain('#B42318');
    expect(document.querySelector('image')?.getAttribute('href')).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it('leaves out the pictures its reader cannot draw, and says so', () => {
    const drawing = writeSvg(richSample(), SAMPLE_VIEW, { bitmaps: ['jpeg'] });
    const document = readSvg(drawing.text);
    expect(document.querySelector('image')).toBeNull();
    expect(drawing.lost).toEqual(['Pictures in PNG are left out: this format cannot hold them.']);
  });

  it('draws a collapsed container on its sheet, with what it holds as aggregated relations', () => {
    const project = collapsedSample();
    const scene = buildScene(project, SAMPLE_VIEW);
    const document = readSvg(writeSvg(project, SAMPLE_VIEW).text);
    const scheduling = document.querySelector('g[data-element="scheduling"]');
    // Its sheet and its body.
    expect(scheduling?.querySelectorAll(':scope > rect:not([data-part])').length).toBe(2);
    // "3 inside" on a line of its own, or first on the detail's, as the canvas writes it, so that
    // cutting the header's text to its width never cuts the count.
    expect(scheduling?.textContent).toMatch(/3 inside/);
    const aggregated = scene.relations.filter((line) => line.aggregate);
    expect(aggregated.length).toBeGreaterThan(0);
    expect(document.querySelectorAll('g[data-relations]').length).toBe(aggregated.length * 2);
  });

  it('draws a curved route as a curve, and a dashed one with its dashes', () => {
    const document = readSvg(writeSvg(richSample(), SAMPLE_VIEW).text);
    const curve = document.querySelector(
      'g[data-part="relations"] g[data-relation="agent-to-api"] path',
    );
    expect(curve?.getAttribute('d')).toMatch(/C/);
    const project = loadSample();
    const scene = buildScene(project, SAMPLE_VIEW);
    const dashed = scene.relations.find((line) => line.dash !== 'solid');
    expect(dashed).toBeDefined();
    const line = document.querySelector(
      `g[data-part="relations"] g[data-relation="${dashed?.relation}"] path`,
    );
    expect(line?.getAttribute('stroke-dasharray')).toMatch(/^\d/);
  });

  it('writes hostile names as text: markup, entities, CDATA ends and control characters', () => {
    const project = loadSample();
    const hostile = '<script>alert(1)</script> & &amp; ]]> \u0001 "\'';
    const changed: ProjectSnapshot = {
      ...project,
      model: {
        ...project.model,
        elements: project.model.elements.map((element) =>
          element.id === 'patient' ? { ...element, name: hostile } : element,
        ),
      },
      views: project.views.map((view) => ({ ...view, name: hostile, description: hostile })),
    };
    const text = writeSvg(changed, SAMPLE_VIEW).text;
    const document = readSvg(text);
    expect(document.querySelector('script')).toBeNull();
    expect(text).not.toContain('<script');
    expect(document.documentElement.querySelector('title')?.textContent).toBe(
      hostile.replace('\u0001', '\uFFFD'),
    );
    const patient = document.querySelector('g[data-element="patient"]');
    expect(patient?.textContent).toContain('<script>');
  });

  it('writes a view that draws nothing as an empty drawing, and says so', () => {
    const project = loadSample();
    const empty: ProjectSnapshot = {
      ...project,
      model: { ...project.model, elements: [], relations: [] },
      views: project.views.map((view) => ({ ...view, positions: [], freeShapes: [] })),
    };
    const drawing = writeSvg(empty, SAMPLE_VIEW);
    readSvg(drawing.text);
    expect(drawing.bounds).toBeUndefined();
    expect(drawing.lost).toEqual(['The view draws nothing.']);
  });

  it('carries the attribution of the packages it draws from', () => {
    const project = loadSample();
    const recorded: ProjectSnapshot = {
      ...project,
      packages: project.packages.map((file) =>
        file.id === 'clinic'
          ? { ...file, license: 'CC-BY-4.0', attribution: 'Drawn by the clinic' }
          : file,
      ),
    };
    const drawing = writeSvg(recorded, SAMPLE_VIEW);
    // Every package the view draws from, the built-in Systems among them since W31 recorded its license.
    expect(drawing.attribution).toEqual([
      'Systems · CC0-1.0 · Visual Anything contributors',
      'Clinic · CC-BY-4.0 · Drawn by the clinic',
    ]);
    expect(readSvg(drawing.text).querySelector('metadata')?.textContent).toContain(
      'Clinic · CC-BY-4.0 · Drawn by the clinic',
    );
  });

  it('says what it lost in the language the app reads in', () => {
    setCurrentLanguage('es');
    const drawing = writeSvg(richSample(), SAMPLE_VIEW, { bitmaps: [] });
    expect(drawing.lost.join(' ')).not.toMatch(/left out/);
  });

  it('refuses a view the project does not have', () => {
    expect(() => writeSvg(loadSample(), 'nowhere')).toThrow(/no view "nowhere"/);
  });
});

describe('the legend of an SVG', () => {
  const team: Overlay = {
    id: 'team',
    name: 'Team',
    of: 'elements',
    attribute: 'owner',
    channel: 'fill',
    mapping: {
      kind: 'discrete',
      cases: [
        { value: 'Scheduling team', color: '#FFFF00' },
        { value: 'Patient experience', color: '#FFFF33', label: 'Patients' },
      ],
      otherwise: '#6B7280',
    },
  };
  const rate: Overlay = {
    id: 'rate',
    of: 'relations',
    attribute: 'rate',
    channel: 'size',
    mapping: {
      kind: 'continuous',
      stops: [
        { at: 0, size: 0.5 },
        { at: 100, size: 2 },
      ],
    },
  };

  /** The sample with its view's overlays. */
  function withOverlays(overlays: Overlay[]): ProjectSnapshot {
    const project = loadSample();
    return {
      ...project,
      views: project.views.map((view) => (view.id === SAMPLE_VIEW ? { ...view, overlays } : view)),
    };
  }

  /** Every text a part of an SVG writes, line by line. */
  function textsIn(part: Element | null): string[] {
    return [...(part?.querySelectorAll('text') ?? [])].flatMap((text) =>
      text.querySelectorAll('tspan').length > 0
        ? [...text.querySelectorAll('tspan')].map((span) => span.textContent ?? '')
        : [text.textContent ?? ''],
    );
  }

  it('writes it below the drawing as text, each overlay in a group of its own', () => {
    const project = withOverlays([team, rate]);
    const drawing = writeSvg(project, SAMPLE_VIEW);
    const document = readSvg(drawing.text);
    const legend = document.querySelector('svg > g[data-part="legend"]');
    expect(legend).not.toBeNull();
    // In front of everything, after the free shapes.
    expect(legend?.previousElementSibling?.getAttribute('data-part')).toBe('free-shapes');
    const parts = [...(legend?.querySelectorAll(':scope > g[data-overlay]') ?? [])];
    expect(parts.map((part) => part.getAttribute('data-overlay'))).toEqual(['team', 'rate']);
    expect(textsIn(parts[0] ?? null)).toEqual(
      expect.arrayContaining([
        'Team',
        'Fill by owner',
        'Scheduling team',
        'Patients',
        'Any other value',
      ]),
    );
    expect(textsIn(parts[1] ?? null)).toEqual(['rate', 'Line width by rate', '0 ×0.5', '100 ×2']);
    // Its texts are among those the PDF checks its font for.
    expect(drawing.texts).toEqual(expect.arrayContaining(['Team', 'Patients', '100 ×2']));
    // Its swatches are drawn in the overlay's colors.
    expect(parts[0]?.querySelector('rect[fill="#FFFF00"]')).not.toBeNull();
  });

  it('never covers the drawing: the view box grows below the scene’s bounds to hold it', () => {
    const project = withOverlays([team]);
    const scene = buildScene(project, SAMPLE_VIEW);
    const drawing = writeSvg(project, SAMPLE_VIEW);
    const document = readSvg(drawing.text);
    const bounds = scene.bounds as Rect;
    const drawn = {
      x: bounds.x - SVG_MARGIN,
      y: bounds.y - SVG_MARGIN,
      width: bounds.width + 2 * SVG_MARGIN,
      height: bounds.height + 2 * SVG_MARGIN,
    };
    // The drawing is as it was, and the legend lies wholly below it.
    expectSameRect(drawnBounds(document), bounds, 0.6);
    const legend = drawing.legend as Rect;
    expect(legend.x).toBeCloseTo(drawn.x);
    expect(legend.y).toBeCloseTo(drawn.y + drawn.height);
    expect(legend.height).toBeGreaterThan(0);
    for (const each of document.querySelectorAll(
      'g[data-part="legend"] rect, g[data-part="legend"] text, g[data-part="legend"] tspan',
    )) {
      const y = Number(each.getAttribute('y'));
      if (each.getAttribute('y') !== null) expect(y).toBeGreaterThanOrEqual(legend.y - 0.01);
    }
    expectSameRect(drawing.viewBox, {
      ...drawn,
      width: Math.max(drawn.width, legend.width),
      height: drawn.height + legend.height,
    });
    expectSameRect(viewBoxOf(document), drawing.viewBox);
    // The canvas's color lies under the legend too.
    const background = document.querySelector('rect[data-part="background"]');
    expect(Number(background?.getAttribute('height'))).toBeCloseTo(drawing.viewBox.height);
  });

  it('says what it warns about its colors, in the language the app reads in', () => {
    const english = readSvg(writeSvg(withOverlays([team]), SAMPLE_VIEW).text);
    const warned = textsIn(english.querySelector('g[data-part="legend"]')).join(' ');
    expect(warned).toContain(
      '"Scheduling team" and "Patients" of "Team" are 1.0:1 apart, under 3:1.',
    );

    setCurrentLanguage('es');
    const spanish = readSvg(writeSvg(withOverlays([team]), SAMPLE_VIEW).text);
    const said = textsIn(spanish.querySelector('g[data-part="legend"]')).join(' ');
    expect(said).toContain('Relleno según owner');
    expect(said).toContain('Cualquier otro valor');
    expect(said).toContain('"Scheduling team" y "Patients" de "Team" están a 1.0:1, menos de 3:1.');
  });

  it('measures its warnings against the canvas of the theme it is drawn in', () => {
    const dark = readSvg(writeSvg(withOverlays([team]), SAMPLE_VIEW, { theme: 'dark' }).text);
    const said = textsIn(dark.querySelector('g[data-part="legend"]')).join(' ');
    expect(said).not.toContain('against the light canvas');
    const light = readSvg(writeSvg(withOverlays([team]), SAMPLE_VIEW).text);
    expect(textsIn(light.querySelector('g[data-part="legend"]')).join(' ')).toContain(
      'against the light canvas',
    );
  });

  it('writes none while no overlay is on, and keeps the view box to the drawing', () => {
    for (const overlays of [[], [{ ...team, off: true }]]) {
      const drawing = writeSvg(withOverlays(overlays), SAMPLE_VIEW);
      expect(readSvg(drawing.text).querySelector('g[data-part="legend"]')).toBeNull();
      expect(drawing.legend).toBeUndefined();
    }
  });
});

// --- Beyond boxes (M8b, ADR 0066, ADR 0067, ADR 0069) -----------------------------------------------

/** The first shape of an element in the view beyond boxes. */
function shapeIn(project: ProjectSnapshot, element: string): ElementShape {
  const found = buildScene(project, BEYOND_VIEW).shapes.find((shape) => shape.element === element);
  if (!found) throw new Error(`No shape draws "${element}".`);
  return found;
}

/** Where a shape's own outline lies on the canvas, measured on its flattening, as the canvas draws it. */
function outlineBounds(shape: ElementShape): Rect {
  const placed = outlineAt(shape);
  if (!placed) throw new Error(`"${shape.element}" has no outline.`);
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const contour of flattenOutline(placed.fitted)) {
    for (let at = 0; at < contour.points.length; at += 2) {
      const x = (contour.points[at] as number) + placed.x;
      const y = (contour.points[at + 1] as number) + placed.y;
      x1 = Math.min(x1, x);
      y1 = Math.min(y1, y);
      x2 = Math.max(x2, x);
      y2 = Math.max(y2, y);
    }
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** The group a shape's element is drawn in. */
function groupOf(document: Document, element: string): Element {
  const group = document.querySelector(`g[data-part="shapes"] > g[data-element="${element}"]`);
  if (!group) throw new Error(`The drawing has no group for "${element}".`);
  return group;
}

/** The symbol a use draws. */
function symbolOf(document: Document, use: Element): Element {
  const id = use.getAttribute('href')?.slice(1) ?? '';
  const symbol = document.querySelector(`defs > symbol[id="${id}"]`);
  if (!symbol) throw new Error(`No symbol "${id}".`);
  return symbol;
}

/** What a group draws by outlines: each use of an outline's symbol, with its symbol, in order. */
function outlineUses(document: Document, group: Element): { use: Element; symbol: Element }[] {
  return [...group.querySelectorAll(':scope > use')]
    .map((use) => ({ use, symbol: symbolOf(document, use) }))
    .filter(({ symbol }) => symbol.getAttribute('id')?.startsWith('va-outline-'));
}

/** The bounds of the paths a group draws through outlines' symbols, where its uses place them. */
function usedOutlineBounds(document: Document, group: Element): Rect | undefined {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const { use, symbol } of outlineUses(document, group)) {
    const [vx = 0, vy = 0, vw = 1, vh = 1] = (symbol.getAttribute('viewBox') ?? '')
      .split(' ')
      .map(Number);
    const number = (name: string) => Number(use.getAttribute(name) ?? 0);
    const scaleX = number('width') / vw;
    const scaleY = number('height') / vh;
    for (const path of symbol.querySelectorAll('path')) {
      for (const point of pathPoints(path.getAttribute('d') ?? '')) {
        const x = number('x') + (point.x - vx) * scaleX;
        const y = number('y') + (point.y - vy) * scaleY;
        x1 = Math.min(x1, x);
        y1 = Math.min(y1, y);
        x2 = Math.max(x2, x);
        y2 = Math.max(y2, y);
      }
    }
  }
  return x1 > x2 ? undefined : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** The texts a group writes, line by line. */
function writtenIn(group: Element): string[] {
  return [...group.querySelectorAll(':scope > text')].flatMap((text) =>
    text.querySelectorAll('tspan').length > 0
      ? [...text.querySelectorAll('tspan')].map((span) => span.textContent ?? '')
      : [text.textContent ?? ''],
  );
}

describe('writeSvg beyond boxes', () => {
  it('draws free geometry as a path filled by the even-odd rule, its hole cut, where the scene’s outline lies', () => {
    const project = beyond();
    const framed = shapeIn(project, 'framed');
    const document = readSvg(writeSvg(project, BEYOND_VIEW).text);
    const group = groupOf(document, 'framed');
    // Its own outline, never its kind's rectangle.
    expect(group.querySelector(':scope > rect')).toBeNull();
    const uses = outlineUses(document, group);
    expect(uses).toHaveLength(1);
    const [{ use, symbol }] = uses as [{ use: Element; symbol: Element }];
    const paths = [...symbol.querySelectorAll('path')];
    expect(paths).toHaveLength(1);
    expect(paths[0]?.getAttribute('fill-rule')).toBe('evenodd');
    // The square, and the square cut from it, each a subpath of the one path.
    expect(paths[0]?.getAttribute('d')?.match(/M/g)).toHaveLength(2);
    expect(use.getAttribute('fill')).toBe(framed.fill);
    expect(use.getAttribute('stroke')).toMatch(/^#[0-9A-F]{6}$/i);
    expect(Number(use.getAttribute('stroke-width'))).toBe(1.5);
    expectSameRect(usedOutlineBounds(document, group), outlineBounds(framed), 0.6);
    // Its name and detail in its outline's label area, a side of the frame, cut to its width.
    const placed = outlineAt(framed);
    const area = placed && outlineLabelArea(placed.fitted);
    expect(area?.height).toBeGreaterThanOrEqual(40);
    const texts = [...group.querySelectorAll(':scope > text')];
    expect(texts).toHaveLength(2);
    expect(texts[0]?.textContent).toMatch(/^fra/);
    expect(texts[1]?.textContent).toMatch(/^Cha/);
    for (const text of texts) {
      const x = Number(text.getAttribute('x'));
      const y = Number(text.getAttribute('y'));
      expect(x).toBeCloseTo((placed?.x ?? 0) + (area?.x ?? 0) + (area?.width ?? 0) / 2);
      expect(y).toBeGreaterThan((placed?.y ?? 0) + (area?.y ?? 0));
      expect(y).toBeLessThan((placed?.y ?? 0) + (area?.y ?? 0) + (area?.height ?? 0));
    }
  });

  it('draws a container with free geometry by its outline, and a collapsed one on its sheet', () => {
    // A slab without a hole, whose label area is wide enough for a header.
    const base = beyond(
      {},
      {
        framed: {
          appearance: {
            geometry: {
              width: 200,
              height: 100,
              outline: [{ kind: 'polygon', points: '0,0 200,10 190,100 10,90' }],
            },
            width: 200,
            height: 100,
          },
        },
      },
    );
    const holding = (collapsed: boolean): ProjectSnapshot => ({
      ...base,
      model: {
        ...base.model,
        elements: [
          ...base.model.elements,
          { id: 'cell', component: 'anatomy.chamber', name: 'cell' },
        ],
        relations: [
          ...base.model.relations,
          { id: 'cell-in-framed', relationType: 'anatomy.is-part-of', from: 'cell', to: 'framed' },
        ],
      },
      views: base.views.map((view) => ({
        ...view,
        ...(collapsed ? { collapsed: ['framed'] } : {}),
      })),
    });
    const open = holding(false);
    const framed = shapeIn(open, 'framed');
    expect(framed.holdsContents).toBe(true);
    const document = readSvg(writeSvg(open, BEYOND_VIEW).text);
    const group = groupOf(document, 'framed');
    expect(group.querySelector(':scope > rect:not([data-part])')).toBeNull();
    expectSameRect(usedOutlineBounds(document, group), outlineBounds(framed), 0.6);
    // Its name, from the top left of its label area, as a container's header writes it.
    const placed = outlineAt(framed);
    const area = placed && outlineLabelArea(placed.fitted);
    const name = group.querySelector(':scope > text');
    expect(Number(name?.getAttribute('y'))).toBeLessThan(
      (placed?.y ?? 0) + (area?.y ?? 0) + (area?.height ?? 0) / 2,
    );

    const collapsed = holding(true);
    const folded = shapeIn(collapsed, 'framed');
    expect(folded.collapsed).toBeDefined();
    const drawn = readSvg(writeSvg(collapsed, BEYOND_VIEW).text);
    const uses = outlineUses(drawn, groupOf(drawn, 'framed'));
    // Its sheet, its outline offset behind it, then its outline.
    expect(uses).toHaveLength(2);
    expect(uses[0]?.symbol).toBe(uses[1]?.symbol);
    expect(Number(uses[0]?.use.getAttribute('x')) - Number(uses[1]?.use.getAttribute('x'))).toBe(5);
    expect(Number(uses[0]?.use.getAttribute('y')) - Number(uses[1]?.use.getAttribute('y'))).toBe(5);
    expect(groupOf(drawn, 'framed').textContent).toContain('1 inside');
  });

  it('writes each outline once, however many shapes draw it', () => {
    const base = beyond();
    const project: ProjectSnapshot = {
      ...base,
      model: {
        ...base.model,
        elements: [
          ...base.model.elements,
          {
            id: 'framed-too',
            component: 'anatomy.chamber',
            name: 'framed too',
            appearance: { geometry: FRAME, width: 200, height: 100 },
          },
        ],
      },
      views: base.views.map((view) => ({
        ...view,
        positions: [...view.positions, { element: 'framed-too', x: 1100, y: 300 }],
      })),
    };
    const document = readSvg(writeSvg(project, BEYOND_VIEW).text);
    const first = outlineUses(document, groupOf(document, 'framed'));
    const second = outlineUses(document, groupOf(document, 'framed-too'));
    expect(first.map(({ symbol }) => symbol)).toEqual(second.map(({ symbol }) => symbol));
    expect(Number(second[0]?.use.getAttribute('x'))).toBeCloseTo(
      Number(first[0]?.use.getAttribute('x')) + 300,
    );
  });

  it('draws a drawing with parts as its picture under its name, and its parts as nothing more while nothing changes them', () => {
    const project = beyond();
    const body = shapeIn(project, 'body');
    const document = readSvg(writeSvg(project, BEYOND_VIEW).text);
    const group = groupOf(document, 'body');
    const pictures = [...group.querySelectorAll(':scope > use')];
    expect(pictures).toHaveLength(1);
    const picture = pictures[0] as Element;
    expectSameRect(
      {
        x: Number(picture.getAttribute('x')),
        y: Number(picture.getAttribute('y')),
        width: Number(picture.getAttribute('width')),
        height: Number(picture.getAttribute('height')),
      },
      body.picture?.rect,
    );
    // The whole picture, once.
    expect(symbolOf(document, picture).querySelectorAll('path')).toHaveLength(3);
    // Its name in its header, above the picture.
    const name = [...group.querySelectorAll(':scope > text')].find(
      (text) => text.textContent === 'Body',
    );
    expect(Number(name?.getAttribute('y'))).toBeLessThan(body.picture?.rect.y ?? 0);
    // Each anchored part writes its name over its place in the picture, and draws nothing else.
    for (const part of ['left', 'right']) {
      const drawn = groupOf(document, part);
      expect(drawn.querySelectorAll('rect, ellipse, circle, path, use')).toHaveLength(0);
      expect(writtenIn(drawn)).toEqual([part]);
    }
    // Its other contents are ordinary shapes below the picture.
    const twin = groupOf(document, 'twin').querySelector(':scope > rect');
    expect(Number(twin?.getAttribute('y'))).toBeGreaterThan(
      (body.picture?.rect.y ?? 0) + (body.picture?.rect.height ?? 0),
    );
  });

  it('draws over an anchored part what changes it: an overlay’s fill, stroke and badge, and its opacity as a veil of the drawing’s fill', () => {
    const overlays: Overlay[] = [
      {
        id: 'heat',
        of: 'elements',
        attribute: 'state',
        channel: 'fill',
        mapping: { kind: 'discrete', cases: [{ value: 'hot', color: '#FF0000' }] },
      },
      {
        id: 'edge',
        of: 'elements',
        attribute: 'state',
        channel: 'stroke',
        mapping: {
          kind: 'discrete',
          cases: [
            { value: 'hot', color: '#000000' },
            { value: 'cold', color: '#0000FF' },
          ],
        },
      },
      {
        id: 'mark',
        of: 'elements',
        attribute: 'state',
        channel: 'badge',
        mapping: { kind: 'discrete', cases: [{ value: 'hot', text: 'HOT' }] },
      },
      {
        id: 'fade',
        of: 'elements',
        attribute: 'state',
        channel: 'opacity',
        mapping: { kind: 'discrete', cases: [{ value: 'cold', opacity: 0.4 }] },
      },
    ];
    const project = beyond(
      { overlays },
      { left: { attributes: { state: 'hot' } }, right: { attributes: { state: 'cold' } } },
    );
    const [left, right, body] = ['left', 'right', 'body'].map((id) => shapeIn(project, id)) as [
      ElementShape,
      ElementShape,
      ElementShape,
    ];
    const document = readSvg(writeSvg(project, BEYOND_VIEW).text);
    // As the canvas's part layer: over every shape, under the relations.
    const layer = document.querySelector('svg > g[data-part="parts"]');
    expect(layer?.previousElementSibling?.getAttribute('data-part')).toBe('shapes');
    expect(layer?.nextElementSibling?.getAttribute('data-part')).toBe('casings');
    const marksOf = (element: string): Element => {
      const group = layer?.querySelector(`:scope > g[data-element="${element}"]`);
      if (!group) throw new Error(`Nothing is drawn over "${element}".`);
      return group;
    };
    // The parts' marks in the drawing's order, the picture's.
    expect(
      [...(layer?.querySelectorAll(':scope > g') ?? [])].map((each) =>
        each.getAttribute('data-element'),
      ),
    ).toEqual(['left', 'right']);

    const hot = marksOf('left');
    // Its fill fills its part's outline, then its stroke strokes it two units wide, as the canvas does.
    expect(
      outlineUses(document, hot).map(({ use }) => [
        use.getAttribute('fill'),
        use.getAttribute('stroke'),
        use.getAttribute('stroke-width'),
      ]),
    ).toEqual([
      ['#FF0000', null, null],
      ['none', '#000000', '2'],
    ]);
    expectSameRect(usedOutlineBounds(document, hot), outlineBounds(left), 0.6);
    // Its badge at its label point, under its name, over a halo of its fill.
    const badge = [...hot.querySelectorAll(':scope > text')];
    expect(badge.map((text) => [text.textContent, text.getAttribute('stroke')])).toEqual([
      ['HOT', '#FF0000'],
      ['HOT', null],
    ]);
    const name = groupOf(document, 'left').querySelector(':scope > text');
    expect(name?.textContent).toBe('left');
    expect(Number(badge[1]?.getAttribute('y'))).toBeGreaterThan(Number(name?.getAttribute('y')));

    const cold = marksOf('right');
    const veiled = outlineUses(document, cold);
    expect(veiled).toHaveLength(2);
    // A veil of the drawing's fill over its part, of one less the overlay's opacity.
    expect(veiled[0]?.use.getAttribute('fill')).toBe(shapeColors(body, 'light').fill);
    expect(Number(veiled[0]?.use.getAttribute('fill-opacity'))).toBeCloseTo(0.6);
    // Its stroke in the overlay's color, as the canvas strokes it.
    expect(veiled[1]?.use.getAttribute('stroke')).toBe('#0000FF');
    expect(right.part?.inDrawing).toBe(true);
    expectSameRect(usedOutlineBounds(document, cold), outlineBounds(right), 0.6);
    // A view whose parts nothing changes writes no such layer.
    expect(writeSvg(beyond(), BEYOND_VIEW).text).not.toContain('data-part="parts"');
  });

  it('draws a part on its own as its outline in its main color, and its part’s picture over it', () => {
    const project = beyond();
    const loose = shapeIn(project, 'loose');
    const document = readSvg(writeSvg(project, BEYOND_VIEW).text);
    const group = groupOf(document, 'loose');
    expect(group.querySelector(':scope > rect')).toBeNull();
    const [body] = outlineUses(document, group);
    expect(body?.use.getAttribute('fill')).toBe(loose.part?.color);
    expect(body?.use.getAttribute('fill')).toBe('#27AE60');
    expectSameRect(usedOutlineBounds(document, group), outlineBounds(loose), 0.6);
    const uses = [...group.querySelectorAll(':scope > use')];
    expect(uses).toHaveLength(2);
    expect(uses[0]).toBe(body?.use);
    const use = uses[1] as Element;
    // The ring alone, as the core writes its picture, not the whole picture of organs.
    const cleaned = imagesIn(project).shown(ORGANS_ID);
    expect(cleaned).toBeDefined();
    const ring = cleaned && partPicture(cleaned, 'ring');
    expect(ring?.kind).toBe('svg');
    const viewBox = ring?.kind === 'svg' ? /viewBox="([^"]+)"/.exec(ring.svg)?.[1] : undefined;
    expect(symbolOf(document, use).getAttribute('viewBox')).toBe(viewBox);
    expect(cleaned && partsOf(cleaned).map((part) => part.id)).toEqual(['left', 'right', 'ring']);
    expectSameRect(
      {
        x: Number(use.getAttribute('x')),
        y: Number(use.getAttribute('y')),
        width: Number(use.getAttribute('width')),
        height: Number(use.getAttribute('height')),
      },
      outlineBounds(loose),
      0.6,
    );
  });

  it('draws automatic curves as the canvas draws them, and automatic straight lines as one segment', () => {
    const curved = beyond({ routeStyle: 'curved' });
    const scene = buildScene(curved, BEYOND_VIEW);
    expect(scene.relations.length).toBeGreaterThan(0);
    const document = readSvg(writeSvg(curved, BEYOND_VIEW).text);
    const routes = [...document.querySelectorAll('g[data-part="relations"] > g')];
    expect(scene.relations.filter((line) => line.curve).length).toBeGreaterThan(1);
    scene.relations.forEach((line, at) => {
      expect(line.style).toBe('curved');
      expect(line.hand).toBeUndefined();
      const d = routes[at]?.querySelector('path')?.getAttribute('d') ?? '';
      if (!line.curve) {
        // A line between parts that touch runs over them, as the canvas draws it (ADR 0067).
        expect(d).not.toMatch(/C/);
        expect(pathPoints(d)[0]?.x).toBeCloseTo(line.route[0]?.x ?? NaN, 1);
        return;
      }
      const spans = drawnCurve(line);
      expect(spans.length).toBeGreaterThan(0);
      expect(d).toMatch(/^M[^C]*C/);
      const points = pathPoints(d);
      const end = spans.at(-1)?.to;
      expect(points[0]?.x).toBeCloseTo(spans[0]?.from.x ?? NaN, 1);
      expect(points[0]?.y).toBeCloseTo(spans[0]?.from.y ?? NaN, 1);
      expect(points.at(-1)?.x).toBeCloseTo(end?.x ?? NaN, 1);
      expect(points.at(-1)?.y).toBeCloseTo(end?.y ?? NaN, 1);
    });

    const straight = beyond({ routeStyle: 'straight' });
    const lines = buildScene(straight, BEYOND_VIEW).relations;
    const drawn = readSvg(writeSvg(straight, BEYOND_VIEW).text);
    const straightRoutes = [...drawn.querySelectorAll('g[data-part="relations"] > g')];
    lines.forEach((line, at) => {
      expect(line.style).toBe('straight');
      expect(line.route).toHaveLength(2);
      const d = straightRoutes[at]?.querySelector('path')?.getAttribute('d') ?? '';
      expect(d).toMatch(/^M[^LC]+L[^LC]+$/);
      expect(pathPoints(d)[0]?.x).toBeCloseTo(line.route[0]?.x ?? NaN, 1);
      expect(pathPoints(d)[0]?.y).toBeCloseTo(line.route[0]?.y ?? NaN, 1);
    });
  });

  it('draws free geometry in the theme’s colors', () => {
    const project = beyond();
    const framed = shapeIn(project, 'framed');
    const document = readSvg(writeSvg(project, BEYOND_VIEW, { theme: 'dark' }).text);
    const [first] = outlineUses(document, groupOf(document, 'framed'));
    expect(first?.use.getAttribute('fill')).toBe(shapeColors(framed, 'dark').fill);
  });

  it('carries the attribution of the package whose picture a part on its own draws', () => {
    const base = beyond();
    const project: ProjectSnapshot = {
      ...base,
      packages: base.packages.map((pkg) => ({ ...pkg, license: 'CC0-1.0' })),
      model: {
        ...base.model,
        // Only the part on its own shows the picture of organs, and nothing is of the anatomy's components.
        elements: base.model.elements
          .filter((element) => element.id === 'loose')
          .map((element) => ({ ...element, component: 'essence' })),
        relations: [],
      },
    };
    expect(writeSvg(project, BEYOND_VIEW).attribution).toEqual(['Anatomy · CC0-1.0']);
  });
});
