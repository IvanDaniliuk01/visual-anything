/**
 * The sample beyond boxes (M8b): `examples/beyond-boxes` opens through the program's loader with no
 * warning, its heart is a picture drawn for Visual Anything whose named parts its chambers, septum,
 * valves and vessels are anchored to, its lungs are free geometry that reads, one view draws its lines
 * curved and one relation type straight, and its scenario of blood through the heart has no broken
 * step. Its card waits in `sources/card.html` to be imported as a drawing (ADR 0068).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  GEOMETRY_CAPS,
  PART_CAPS,
  SVG_CAPS,
  anchoredElements,
  automaticRouteStyleOf,
  cleanSvg,
  findPart,
  geometryFindings,
  imagesIn,
  isBroken,
  isOutside,
  partsOf,
  readGeometry,
  scenarioTimeline,
  shippingProblems,
  unknownPartWarnings,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { fileKindOf, type FreeGeometry, type SvgImage } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { buildScene, type ElementShape } from '@visual-anything/app/src/canvas/scene';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadProject, type LoadedProject } from './project';

const FOLDER = resolve(import.meta.dirname, '../../../examples/beyond-boxes');
const PICTURE = 'heart.heart-picture';

/** The heart's named parts, in the picture's document order. */
const PARTS = [
  'superior-vena-cava',
  'inferior-vena-cava',
  'pulmonary-artery',
  'aorta',
  'pulmonary-veins',
  'right-atrium',
  'right-ventricle',
  'left-atrium',
  'left-ventricle',
  'septum',
  'tricuspid-valve',
  'pulmonary-valve',
  'mitral-valve',
  'aortic-valve',
];

let loaded: LoadedProject;
let project: ProjectSnapshot;

beforeAll(async () => {
  const opened = await loadProject(FOLDER);
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  loaded = opened;
  project = opened.project;
});

function picture(): SvgImage {
  const image = project.packages
    .flatMap((each) => each.images ?? [])
    .find((each) => each.id === PICTURE);
  if (image?.kind !== 'svg') throw new Error('The heart package draws no heart.');
  return image;
}

function shapeOf(shapes: readonly ElementShape[], element: string): ElementShape {
  const found = shapes.find((shape) => shape.element === element);
  if (!found) throw new Error(`No shape of ${element}.`);
  return found;
}

describe('the sample beyond boxes', () => {
  it('opens with no warning, and every file is written as the program writes it', () => {
    expect(loaded.warnings).toEqual([]);
    expect(project.views.map((view) => view.id).sort()).toEqual(['circulation', 'heart']);
    const files = readdirSync(FOLDER, { recursive: true, encoding: 'utf8' })
      .map((path) => path.replaceAll('\\', '/'))
      .flatMap((path) => {
        const kind = fileKindOf(path);
        return kind === undefined ? [] : [{ path, kind }];
      });
    expect(files.length).toBe(6);
    for (const { path, kind } of files) {
      const text = readFileSync(join(FOLDER, path), 'utf8');
      expect(formatFile(kind, JSON.parse(text) as never), path).toBe(text);
    }
  });

  it('ships its heart as drawn for Visual Anything, under CC0-1.0 (ADR 0047)', () => {
    const [file] = project.packages;
    expect(project.packages.map((each) => each.id)).toEqual(['heart']);
    if (!file) throw new Error('No package.');
    expect(shippingProblems(file)).toEqual([]);
    expect(file).toMatchObject({ license: 'CC0-1.0', attribution: 'Visual Anything contributors' });
    expect(picture()).toMatchObject({ source: 'Drawn for Visual Anything', license: 'CC0-1.0' });
  });

  it('stores its heart exactly as the cleaner writes sources/heart.svg, within the caps', () => {
    const source = readFileSync(join(FOLDER, 'sources', 'heart.svg'), 'utf8');
    const cleaned = cleanSvg(source);
    if (!cleaned.ok) throw new Error(cleaned.problem.message);
    const stored = picture();
    expect(
      stored.svg,
      'sources/heart.svg changed: store it again as the cleaner writes it, with Replace image… or define-image.',
    ).toBe(cleaned.value.svg);
    expect({ width: stored.width, height: stored.height }).toEqual({
      width: cleaned.value.width,
      height: cleaned.value.height,
    });
    expect(stored.svg.length).toBeLessThanOrEqual(SVG_CAPS.output);
  });

  it('names its chambers, septum, valves and main vessels as parts, each drawing something', () => {
    const shown = imagesIn(project).shown(PICTURE);
    if (!shown) throw new Error('The heart is not drawn.');
    const parts = partsOf(shown);
    expect(parts.map((each) => each.id)).toEqual(PARTS);
    expect(parts.length).toBeLessThanOrEqual(PART_CAPS.parts);
    for (const part of parts) {
      expect(part.bounds.width, part.id).toBeGreaterThan(0);
      expect(part.bounds.height, part.id).toBeGreaterThan(0);
    }
  });

  it('reads every free geometry it holds, within the caps', () => {
    const geometries: FreeGeometry[] = [
      ...project.packages.flatMap((file) =>
        file.components.flatMap((each) => {
          const geometry = each.appearance?.geometry;
          return typeof geometry === 'object' ? [geometry] : [];
        }),
      ),
      ...project.model.elements.flatMap((each) => {
        const geometry = each.appearance?.geometry;
        return typeof geometry === 'object' ? [geometry] : [];
      }),
    ];
    expect(geometries.length).toBeGreaterThan(0);
    for (const geometry of geometries) {
      const read = readGeometry(geometry);
      if (!read.ok) throw new Error(read.message);
      expect(read.outline.contours.length).toBeLessThanOrEqual(GEOMETRY_CAPS.contours);
    }
    const findings = geometryFindings(project);
    expect(findings.warnings).toEqual([]);
    expect(findings.drawnAsKind.size).toBe(0);
  });

  it('finds the part of every element anchored to one', () => {
    const anchored = anchoredElements(project);
    expect(anchored.map(({ element }) => element.id).sort()).toEqual([...PARTS].sort());
    const catalog = imagesIn(project);
    for (const { element, part, images } of anchored) {
      expect(images, element.id).toEqual([PICTURE]);
      for (const image of images) {
        expect(findPart(part, catalog, image)?.part.id, element.id).toBe(part.part);
      }
    }
    expect(unknownPartWarnings(project)).toEqual([]);
  });

  it('draws the heart with its parts, its parts in their places, and below the picture what no part draws', () => {
    const { shapes } = buildScene(project, 'heart');
    const heart = shapeOf(shapes, 'heart');
    if (!heart.picture) throw new Error('The heart is not drawn with its parts.');
    for (const id of PARTS) {
      const shape = shapeOf(shapes, id);
      expect(shape.part, id).toEqual(expect.objectContaining({ part: id, inDrawing: true }));
      expect(shape.outline, id).toBeDefined();
    }
    const node = shapeOf(shapes, 'sinoatrial-node');
    expect(node.part).toBeUndefined();
    expect(node.containerShape).toBe(heart.key);
    expect(node.rect.y).toBeGreaterThanOrEqual(heart.picture.rect.y + heart.picture.rect.height);
    // The lungs are drawn by their free geometry.
    expect(shapeOf(shapes, 'lungs').outline).toBeDefined();
  });

  it('draws the parts of the heart on their own where no drawing holds them', () => {
    const { shapes } = buildScene(project, 'circulation');
    expect(shapes.some((shape) => shape.element === 'heart')).toBe(false);
    const own = PARTS.filter((id) => id !== 'septum');
    for (const id of own) {
      const shape = shapeOf(shapes, id);
      expect(shape.part, id).toEqual(expect.objectContaining({ part: id, inDrawing: false }));
      expect(shape.outline, id).toBeDefined();
    }
  });

  it('curves the heart’s lines, keeps the circulation’s orthogonal, and draws pacing straight in both', () => {
    const style = (viewId: string, relationId: string) => {
      const view = project.views.find((each) => each.id === viewId);
      const relation = project.model.relations.find((each) => each.id === relationId);
      if (!view || !relation) throw new Error(`No ${viewId} or ${relationId}.`);
      return automaticRouteStyleOf(project, view, relation);
    };
    expect(style('heart', 'left-ventricle-to-aortic-valve')).toBe('curved');
    expect(style('heart', 'sinoatrial-node-paces-right-atrium')).toBe('straight');
    expect(style('circulation', 'left-ventricle-to-aortic-valve')).toBe('orthogonal');
    expect(style('circulation', 'sinoatrial-node-paces-right-atrium')).toBe('straight');
    const lines = buildScene(project, 'heart').relations;
    const line = (id: string) => lines.find((each) => each.relation === id);
    expect(line('aorta-to-body')?.style).toBe('curved');
    expect(line('sinoatrial-node-paces-right-atrium')?.style).toBe('straight');
  });

  it('plays blood from the venae cavae to the aorta, with no broken step and every step in its view', () => {
    const [scenario] = project.scenarios;
    if (!scenario) throw new Error('No scenario.');
    const timeline = scenarioTimeline(project, scenario);
    expect(timeline.entries.some(isBroken)).toBe(false);
    expect(timeline.entries.some(isOutside)).toBe(false);
    expect(scenario.steps[0]?.relations).toEqual([
      'superior-vena-cava-to-right-atrium',
      'inferior-vena-cava-to-right-atrium',
    ]);
    expect(scenario.steps.at(-1)?.relations).toEqual(['aortic-valve-to-aorta']);
    expect(scenario.steps.some((step) => step.dataIn !== undefined)).toBe(true);
    expect(scenario.steps.some((step) => step.dataOut !== undefined)).toBe(true);
  });
});

/** The elements ADR 0068's allow-list keeps, and the properties its styles may set. */
const HTML_ELEMENTS = new Set(
  (
    'html body div span p section article header footer main aside nav figure figcaption blockquote ' +
    'pre h1 h2 h3 h4 h5 h6 ul ol li dl dt dd code strong em b i u s small sub sup mark br hr ' +
    'table caption thead tbody tfoot tr th td'
  ).split(' '),
);
const HTML_PROPERTIES =
  /^(display|flex(-[a-z]+)?|justify-content|align-(items|self|content)|order|grid(-[a-z]+)?|(min-|max-)?(width|height)|margin(-[a-z]+)?|padding(-[a-z]+)?|(row-|column-)?gap|border(-[a-z]+)*|background-color|background(-image)?|color|font-(size|weight|style)|line-height|letter-spacing|text-(align|decoration|transform)|white-space|word-break|opacity|position|top|right|bottom|left|overflow|transform)$/;

describe('the card to import as a drawing (ADR 0068)', () => {
  const html = readFileSync(join(FOLDER, 'sources', 'card.html'), 'utf8');

  it('is static HTML with inline styles only, from the allow-list', () => {
    expect(html.length).toBeLessThanOrEqual(512 * 1024);
    for (const [, name] of html.matchAll(/<\/?([a-zA-Z][\w-]*)/g)) {
      expect(HTML_ELEMENTS.has(name?.toLowerCase() ?? ''), name).toBe(true);
    }
    for (const [, attribute] of html.matchAll(/\s([a-zA-Z-:]+)\s*=/g)) {
      expect(attribute, 'only style attributes').toBe('style');
    }
    for (const [, style] of html.matchAll(/style="([^"]*)"/g)) {
      for (const declaration of (style ?? '').split(';')) {
        if (declaration.trim() === '') continue;
        const [property = '', value = ''] = declaration.split(':').map((each) => each.trim());
        expect(HTML_PROPERTIES.test(property), property).toBe(true);
        expect(value, property).toMatch(/^[-+.,%#()\w\s/]*$/);
        expect(value, property).not.toMatch(/url\(/i);
      }
    }
  });
});
