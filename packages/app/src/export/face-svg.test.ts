/**
 * Faces in the SVG (ADR 0083, F3): the face the canvas draws in a shape, written where and as the
 * canvas draws it: its boxes as the canvas's pieces, its runs placed by their own `x` and baseline in
 * Roboto's styles, its pictures as symbols, in its tokens' colors in the theme drawn, in place of the
 * shape's name and detail; the variant the most detailed level names, and a collapsed container's.
 */
import {
  facePalette,
  resolveFaceColor,
  robotoWidth,
  type FaceDrawing,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Face, LevelOfDetail } from '@visual-anything/schema';
import {
  BitmapFont,
  Cache,
  Graphics,
  Rectangle,
  RoundedRectangle,
  Texture,
  type GraphicsPath,
} from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drawFaceDrawing, faceLabel, type FaceLabel, type FacePictures } from '../canvas/faceDraw';
import { faceBoxPieces, faceRect, shapeFaceDrawing } from '../canvas/faces';
import { ownPictureOf, pictureOf } from '../canvas/images-draw';
import { buildScene, type ElementShape, type Scene } from '../canvas/scene';
import { shapeColors } from '../canvas/theme/paint';
import { picturesPackage } from '../test/exports';
import { CARD_FACE, FACES_VIEW, TABLE_FACE, facedProject, withFaces } from '../test/faces';
import { VIEW, usersAndOrders } from '../test/tables';
import { exportedFaceShow, faceSvg } from './face-svg';
import { writeSvg } from './svg';

function readSvg(text: string): Document {
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  const errors = document.getElementsByTagName('parsererror');
  if (errors.length > 0) throw new Error(`The SVG does not parse: ${errors[0]?.textContent}`);
  return document;
}

function shapeOf(scene: Scene, element: string): ElementShape {
  const found = scene.shapes.find((shape) => shape.element === element);
  if (!found) throw new Error(`No shape of ${element}.`);
  return found;
}

/** The group of a shape's drawing in an SVG. */
function groupOf(document: Document, key: string): Element {
  const group = document.querySelector(`g[data-part="shapes"] > g[data-shape="${key}"]`);
  if (!group) throw new Error(`No group for ${key}.`);
  return group;
}

/** The texts a group writes, each `<text>` joined. */
function textsOf(group: Element): string[] {
  return [...group.querySelectorAll('text')].map((text) => text.textContent ?? '');
}

const number = (element: Element, name: string) => Number(element.getAttribute(name) ?? 0);
const round = (value: number) => Math.round(value * 100) / 100;

describe('faces in the SVG (ADR 0083)', () => {
  it('draws each shape’s face in place of its name and detail', () => {
    const project = facedProject();
    const scene = buildScene(project, FACES_VIEW);
    const document = readSvg(writeSvg(project, FACES_VIEW).text);
    for (const shape of scene.shapes) {
      const group = groupOf(document, shape.key);
      const faces = group.querySelectorAll('g[data-part="face"]');
      expect(faces, shape.key).toHaveLength(1);
      // Only the face writes text: the shape's own name and detail are not written beside it.
      expect(group.querySelectorAll('text').length).toBe(
        (faces[0] as Element).querySelectorAll('text').length,
      );
    }
    const mailer = groupOf(document, 'mailer');
    expect(textsOf(mailer)[0]).toBe('Mailer');
    expect(textsOf(mailer).join(' ')).toContain('Sends the reminders');
    // A column's name in Roboto Mono, its type in italics.
    const id = groupOf(document, shapeOf(scene, 'users-id').key);
    const spans = [...id.querySelectorAll('tspan')];
    expect(spans.find((span) => span.textContent === 'id')?.getAttribute('font-family')).toContain(
      'Roboto Mono',
    );
    expect(spans.find((span) => span.textContent === 'uuid')?.getAttribute('font-style')).toBe(
      'italic',
    );
  });

  it('writes the face in Roboto, which it was laid out in', () => {
    const document = readSvg(writeSvg(facedProject(), FACES_VIEW).text);
    const face = document.querySelector('g[data-part="face"]') as Element;
    expect(face.getAttribute('font-family')?.startsWith('Roboto,')).toBe(true);
  });

  it('draws a face as the canvas draws it: the same pieces, and runs where its glyphs start', () => {
    const project = facedProject();
    const scene = buildScene(project, FACES_VIEW);
    const document = readSvg(writeSvg(project, FACES_VIEW).text);
    let compared = 0;
    for (const shape of scene.shapes) {
      const drawing = shapeFaceDrawing(shape) as FaceDrawing;
      const at = faceRect(shape);
      const face = groupOf(document, shape.key).querySelector('g[data-part="face"]') as Element;

      // What the canvas fills and strokes, against the SVG's rectangles.
      const canvas = canvasRects(drawing, at, shape);
      const svg = [...face.querySelectorAll(':scope > rect')].map((rect) =>
        [
          number(rect, 'x'),
          number(rect, 'y'),
          number(rect, 'width'),
          number(rect, 'height'),
          number(rect, 'rx'),
        ].map(round),
      );
      expect(svg, shape.key).toEqual(canvas.rects);

      // Where the canvas puts each run's first glyph, against each `<tspan>`'s place.
      const spans = [...face.querySelectorAll('tspan')].map((span) => [
        number(span, 'x'),
        number(span, 'y'),
      ]);
      expect(spans, shape.key).toEqual(canvas.glyphs);
      compared += spans.length;
    }
    expect(compared).toBeGreaterThan(10);
  });

  it('draws its tokens in the colors of the theme drawn, on the shape’s fill', () => {
    const project = facedProject();
    const scene = buildScene(project, FACES_VIEW);
    const mailer = shapeOf(scene, 'mailer');
    for (const theme of ['light', 'dark'] as const) {
      const document = readSvg(writeSvg(project, FACES_VIEW, { theme }).text);
      const colors = shapeColors(mailer, theme);
      const palette = facePalette(theme, colors.fill, colors.stroke);
      const face = groupOf(document, 'mailer').querySelector('g[data-part="face"]') as Element;
      const fills = [...face.querySelectorAll('text')].map((text) => text.getAttribute('fill'));
      expect(new Set(fills)).toEqual(new Set([resolveFaceColor('text', palette)]));
    }
  });

  it('draws a collapsed container’s collapsed variant', () => {
    const project = facedProject({ collapsed: true });
    const document = readSvg(writeSvg(project, FACES_VIEW).text);
    expect(textsOf(groupOf(document, 'billing'))).toEqual(['Billing', '1 inside']);
  });

  it('draws the variant the most detailed level names, or the name where that level shows no face', () => {
    const levels = (deepest: LevelOfDetail): Face & { levels: LevelOfDetail[] } => ({
      ...CARD_FACE,
      variants: [{ id: 'far', markup: ['<b>{{name}} far</b>'] }],
      levels: [{ from: 0.2, shows: ['face'], face: 'far' }, deepest],
    });
    const drawn = (deepest: LevelOfDetail) => {
      const { levels: declared, ...face } = levels(deepest);
      const project = withAppearance(facedProject(), 'systems.service', {
        face,
        levels: declared,
      });
      const group = groupOf(readSvg(writeSvg(project, FACES_VIEW).text), 'mailer');
      return { texts: textsOf(group), faced: group.querySelector('g[data-part="face"]') !== null };
    };
    expect(drawn({ from: 0.6, shows: ['face'], face: 'far' })).toEqual({
      texts: ['Mailer far'],
      faced: true,
    });
    expect(drawn({ from: 0.6, shows: ['face'] }).texts[0]).toBe('Mailer');
    // Its name and detail, as an export writes them where no face shows.
    expect(drawn({ from: 0.6, shows: ['name'] })).toEqual({
      texts: ['Mailer', 'Service'],
      faced: false,
    });
    expect(exportedFaceShow({ levels: [{ from: 0.6, shows: ['name'] }] })).toBeUndefined();
    expect(exportedFaceShow({})).toEqual({});
  });

  it('gives a table the header its face makes, its band as tall', () => {
    const project = withFaces(usersAndOrders(), { 'data-modeling.table': TABLE_FACE });
    const users = shapeOf(buildScene(project, VIEW), 'users');
    expect(users.header).toBeGreaterThan(32);
    const group = groupOf(readSvg(writeSvg(project, VIEW).text), 'users');
    // The rule under the header lies at its foot.
    const rule = [...group.querySelectorAll(':scope > rect')].find(
      (rect) => number(rect, 'height') === 1.5 && rect.getAttribute('fill') !== 'none',
    ) as Element;
    expect(number(rule, 'y')).toBeCloseTo(users.rect.y + (users.header ?? 0) - 1.5, 1);
  });

  it('draws dashed borders as the canvas’s dashes', () => {
    const face: Face = {
      markup: ['<div class="box">{{name}}</div>'],
      style: ['.box { border: 1px dashed var(--stroke); padding: 4px; }'],
    };
    const project = withAppearance(facedProject(), 'systems.service', { face });
    const scene = buildScene(project, FACES_VIEW);
    const mailer = shapeOf(scene, 'mailer');
    const drawing = shapeFaceDrawing(mailer) as FaceDrawing;
    const dashes = drawing.boxes.flatMap((box) => faceBoxPieces(box, faceRect(mailer)));
    expect(dashes.length).toBeGreaterThan(8);
    const group = groupOf(readSvg(writeSvg(project, FACES_VIEW).text), 'mailer');
    expect(group.querySelectorAll('g[data-part="face"] > rect')).toHaveLength(dashes.length);
  });

  it('draws `<icon/>` as the shape’s own image, there only, and `<image/>` as one of its package', () => {
    const face: Face = {
      markup: ['<div class="row"><icon/><b>{{name}}</b><image ref="photo"/></div>'],
      style: ['.row { display: flex; gap: 4px; padding: 4px; }'],
    };
    const base = withAppearance(withPictures(facedProject()), 'systems.service', { face });
    const project: ProjectSnapshot = {
      ...base,
      model: {
        ...base.model,
        elements: base.model.elements.map((element) =>
          element.id === 'mailer'
            ? { ...element, appearance: { image: { image: 'pictures.icon' } } }
            : element,
        ),
      },
    };
    // The component's package is Systems, which holds no photo: the face draws only its icon.
    const document = readSvg(writeSvg(project, FACES_VIEW).text);
    const mailer = groupOf(document, 'mailer');
    expect(mailer.querySelectorAll('use')).toHaveLength(1);
    expect(mailer.querySelectorAll('g[data-part="face"] use')).toHaveLength(1);
    // An image of the component's own package, by its id there.
    const own = withPictureComponent(project, face);
    const page = readSvg(writeSvg(own, FACES_VIEW).text);
    expect(groupOf(page, 'mailer').querySelectorAll('g[data-part="face"] use')).toHaveLength(2);
  });

  it('places a face’s pictures on the canvas where the SVG places them, over its boxes', () => {
    const face: Face = {
      markup: ['<div class="row"><icon/><b>{{name}}</b><image ref="photo"/></div>'],
      style: ['.row { display: flex; gap: 4px; padding: 4px; background: var(--highlight); }'],
    };
    const base = withAppearance(withPictures(facedProject()), 'systems.service', { face });
    const project = withPictureComponent(
      {
        ...base,
        model: {
          ...base.model,
          elements: base.model.elements.map((element) =>
            element.id === 'mailer'
              ? { ...element, appearance: { image: { image: 'pictures.icon' } } }
              : element,
          ),
        },
      },
      face,
    );
    const mailer = shapeOf(buildScene(project, FACES_VIEW), 'mailer');
    expect(Object.keys(mailer.face?.pictures ?? {})).toEqual(['photo']);
    // The canvas leaves the icon its face draws to the face.
    expect(ownPictureOf(mailer)).toBe(mailer.image);
    expect(pictureOf(mailer)).toBeUndefined();

    // The canvas's face, its pictures drawn with textures of their own.
    const made = new Map<unknown, Texture>();
    const pictures: FacePictures = {
      textureFor: (picture) => {
        let texture = made.get(picture.image);
        if (!texture) {
          texture = new Texture({ source: Texture.WHITE.source });
          made.set(picture.image, texture);
        }
        return texture;
      },
    };
    const colors = shapeColors(mailer, 'light');
    const label = faceLabel(mailer, 'light', {}, colors.fill, pictures) as FaceLabel;
    const instructions = label.graphics.context.instructions;
    const isPicture = (each: (typeof instructions)[number]) =>
      each.action === 'texture' &&
      [...made.values()].includes((each.data as { image: Texture }).image);
    const drawn = instructions.filter(isPicture).map((each) => {
      const { dx, dy, dw, dh } = each.data as { dx: number; dy: number; dw: number; dh: number };
      return [dx, dy, dw, dh].map(round);
    });
    expect(drawn).toHaveLength(2);
    // Over the face's background, under its text.
    const first = instructions.findIndex(isPicture);
    expect(first).toBeGreaterThan(instructions.findIndex((each) => each.action === 'fill'));
    expect(first).toBeLessThan(instructions.findLastIndex((each) => each.action === 'texture'));

    // The SVG's, as `<use>`s in its face.
    const document = readSvg(writeSvg(project, FACES_VIEW).text);
    const uses = [...groupOf(document, 'mailer').querySelectorAll('g[data-part="face"] use')].map(
      (use) => ['x', 'y', 'width', 'height'].map((name) => round(number(use, name))),
    );
    expect(drawn).toEqual(uses);
  });

  it('writes nothing for a face drawing that draws nothing', () => {
    const empty: FaceDrawing = {
      width: 10,
      height: 10,
      cut: false,
      boxes: [],
      runs: [],
      bands: [],
      images: [],
      regions: [],
    };
    expect(faceSvg(empty, { x: 0, y: 0 }, facePalette('light', '#FFFFFF', '#000000'))).toBe('');
  });
});

// ——— The canvas's drawing, read back ——————————————————————————————————————————————————————————————

const KEYS = ['text', 'text-bold', 'text-italic', 'text-bold-italic', 'text-mono'].map(
  (each) => `visual-anything-${each}-bitmap`,
);

/** A font whose every glyph but the space is a white square drawn at its pen, with no offset. */
function fakeFont(): BitmapFont {
  const chars: Record<string, unknown> = {};
  for (let code = 32; code < 0x2030; code++) {
    chars[String.fromCharCode(code)] = {
      id: code,
      xOffset: 0,
      yOffset: 0,
      xAdvance: 8,
      kerning: {},
      texture: code === 32 ? undefined : Texture.WHITE,
    };
  }
  return {
    chars,
    fontMetrics: { fontSize: 16, ascent: 12, descent: 4 },
    ensureCharacters: () => undefined,
  } as unknown as BitmapFont;
}

beforeAll(() => {
  for (const key of KEYS) Cache.set(key, fakeFont());
});
afterAll(() => {
  for (const key of KEYS) Cache.remove(key);
});

/**
 * What the canvas draws of a face drawing at a place: the rectangles it fills and strokes, as
 * x, y, width, height and radius, and where each run's first glyph starts, at its baseline.
 */
function canvasRects(
  drawing: FaceDrawing,
  at: { x: number; y: number },
  shape: ElementShape,
): { rects: number[][]; glyphs: number[][] } {
  const graphics = new Graphics();
  drawFaceDrawing(graphics, drawing, at, facePalette('light', shape.fill, shape.stroke));
  const rects: number[][] = [];
  for (const instruction of graphics.context.instructions) {
    if (instruction.action !== 'fill' && instruction.action !== 'stroke') continue;
    const path = (instruction.data as { path: GraphicsPath }).path;
    for (const primitive of path.shapePath.shapePrimitives) {
      const { shape: drawn } = primitive;
      if (drawn instanceof RoundedRectangle) {
        rects.push([drawn.x, drawn.y, drawn.width, drawn.height, drawn.radius].map(round));
      } else if (drawn instanceof Rectangle) {
        rects.push([drawn.x, drawn.y, drawn.width, drawn.height, 0].map(round));
      }
    }
  }
  // The runs' first glyphs: drawn at the pen, past the spaces a run starts with.
  const glyphs = drawing.runs
    .filter((run) => run.text.trim() !== '')
    .map((run) => {
      const lead = run.text.length - run.text.trimStart().length;
      return [
        round(at.x + run.x + robotoWidth(run.text.slice(0, lead), run.variant, run.size)),
        round(at.y + run.y),
      ];
    });
  // Each glyph the canvas drew, its place: a run's first is among them.
  const drawn = graphics.context.instructions
    .filter((each) => each.action === 'texture')
    .map((each) => round((each.data as { dx: number }).dx));
  for (const [x] of glyphs)
    expect(drawn.some((each) => Math.abs(each - (x ?? 0)) <= 0.01)).toBe(true);
  return { rects, glyphs };
}

// ——— Projects ——————————————————————————————————————————————————————————————————————————————————

/** A project whose component, by id, takes this appearance as a project appearance. */
function withAppearance(
  project: ProjectSnapshot,
  component: string,
  appearance: NonNullable<
    NonNullable<ProjectSnapshot['project']['appearances']>['components']
  >[string],
): ProjectSnapshot {
  const components = { ...project.project.appearances?.components, [component]: appearance };
  return {
    ...project,
    project: {
      ...project.project,
      appearances: { ...project.project.appearances, components },
    },
  };
}

/** A project with the package of pictures. */
function withPictures(project: ProjectSnapshot): ProjectSnapshot {
  return {
    ...project,
    project: { ...project.project, packages: [...project.project.packages, 'pictures'] },
    packages: [...project.packages, picturesPackage()],
  };
}

/** The project with the mailer of a component of the pictures package, which holds the photo. */
function withPictureComponent(project: ProjectSnapshot, face: Face): ProjectSnapshot {
  return {
    ...project,
    packages: project.packages.map((file) =>
      file.id === 'pictures'
        ? {
            ...file,
            components: [
              {
                id: 'pictures.mailer',
                name: 'Mailer',
                derivesFrom: 'systems.service',
                appearance: { face },
              },
            ],
          }
        : file,
    ),
    model: {
      ...project.model,
      elements: project.model.elements.map((element) =>
        element.id === 'mailer' ? { ...element, component: 'pictures.mailer' } : element,
      ),
    },
  };
}
