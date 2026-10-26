import type { ProjectSnapshot } from '@visual-anything/core';
import type { Overlay } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { textWidth } from './measure';
import type { Rect } from '../canvas/geometry';
import { buildScene, buildSceneAfresh, standsFor } from '../canvas/scene';
import { setCurrentLanguage } from '../i18n/language';
import { SAMPLE_VIEW, collapsedSample, drawnBounds, richSample } from '../test/exports';
import { loadSample } from '../test/sample';
import { usersAndOrders, VIEW as TABLES_VIEW } from '../test/tables';
import { THEMES } from '../theme/themes';
import { SVG_MARGIN, writeSvg } from './svg';

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
