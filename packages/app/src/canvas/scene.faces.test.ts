/**
 * Faces in the scene (ADR 0083, F2): a shape whose appearance has a face carries it, with what fills
 * it; a face of size `content` gives its shape its height before layout; a face over rows or contents
 * gives its shape a header that its rows and contents go under; an anchored part draws none.
 */
import { layOutFace, type CleanedImage, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import type { ShapePosition } from '@visual-anything/schema';
import { CARD_FACE, COLUMN_FACE, SYSTEM_FACE, TABLE_FACE, withFaces } from '../test/faces';
import { VIEW, tablesProject, usersAndOrders } from '../test/tables';
import {
  faceContentHeight,
  faceCounts,
  faceHeader,
  faceOptionsOf,
  faceRect,
  faceSignature,
  faceWidthIn,
  heightForFace,
  resetFaceCounts,
  shapeFaceDrawing,
  type ShapeFace,
} from './faces';
import { ROWS_HEADER, ROW_HEIGHT, headerMiddle, measureRows } from './rows';
import { buildScene, buildSceneAfresh, type ElementShape, type Scene } from './scene';

function shapeOf(scene: Scene, element: string): ElementShape {
  const found = scene.shapes.filter((shape) => shape.element === element);
  if (found.length !== 1) throw new Error(`Expected one shape of ${element}, got ${found.length}.`);
  return found[0] as ElementShape;
}

const TABLES = { 'data-modeling.table': TABLE_FACE, 'data-modeling.column': COLUMN_FACE };

/** A system holding a table, and a service of its own beside them, all with faces. */
function systemAndService(collapsed = false): ProjectSnapshot {
  return withFaces(
    tablesProject({
      tables: [{ id: 'users', in: 'billing', columns: [{ id: 'users-id', type: 'uuid' }] }],
      elements: [
        { id: 'billing', component: 'systems.system', name: 'Billing' },
        {
          id: 'mailer',
          component: 'systems.service',
          name: 'Mailer',
          attributes: {
            description: 'Sends the reminders and the receipts, every night, to every patient',
          },
        },
      ],
      positions: [{ element: 'mailer', x: 900, y: 0, height: 40 }],
      ...(collapsed ? { collapsed: ['billing'] } : {}),
    }),
    { ...TABLES, 'systems.system': SYSTEM_FACE, 'systems.service': CARD_FACE },
  );
}

describe('faces in the scene (ADR 0083)', () => {
  it('gives a table its face’s header, its rows under it', () => {
    const scene = buildScene(withFaces(usersAndOrders(), TABLES), VIEW);
    const users = shapeOf(scene, 'users');
    expect(users.face?.input.name).toBe('users');
    expect(users.face?.compiled.ok).toBe(true);
    const header = faceHeader(users.face!, users.rect.width, ROWS_HEADER);
    expect(header).toBeGreaterThan(ROWS_HEADER);
    expect(users.header).toBe(header);
    expect(users.rect.height).toBe(measureRows(users.rect.width, 3, header).height);
    ['users-id', 'users-email', 'users-name'].forEach((id, index) => {
      const row = shapeOf(scene, id);
      expect(row.rect.y).toBe(users.rect.y + header + index * ROW_HEIGHT);
      expect(row.rect.height).toBe(ROW_HEIGHT);
      // A row draws its own component's face in its band.
      expect(row.face?.input.name).toBe(row.name);
      expect(faceRect(row)).toEqual(row.rect);
    });
    // Its own relations attach beside its header, whatever its height.
    expect(headerMiddle(users.rect, users.header)).toBe(users.rect.y + header / 2);
    expect(faceRect(users).height).toBe(header);
  });

  it('lays a table’s face of size content out once for its header and the header drawn (A4)', () => {
    const content = { ...TABLE_FACE, size: 'content' as const };
    resetFaceCounts();
    const project = withFaces(usersAndOrders(), { ...TABLES, 'data-modeling.table': content });
    const users = shapeOf(buildSceneAfresh(project, VIEW), 'users');
    const before = faceCounts();
    const drawing = shapeFaceDrawing(users);
    expect(faceCounts().asked).toBe(before.asked + 1);
    expect(faceCounts().laidOut).toBe(before.laidOut);
    // The same drawing as laid out at the header's height, by the core.
    const face = users.face as NonNullable<ElementShape['face']>;
    expect(drawing).toEqual(layOutFace(face.compiled, face.input, faceOptionsOf(users)));
    // One of size shape fills the height it is given: laid out again for the header drawn.
    const shaped = shapeOf(buildSceneAfresh(withFaces(usersAndOrders(), TABLES), VIEW), 'users');
    const laid = faceCounts().laidOut;
    shapeFaceDrawing(shaped);
    expect(faceCounts().laidOut).toBe(laid + 1);
  });

  it('keeps the canvas’s header when a face is lower than it, and carries no header then', () => {
    const low = { ...TABLE_FACE, markup: ['<b>{{name}}</b>', '<rows/>'], style: [] };
    const scene = buildScene(withFaces(usersAndOrders(), { 'data-modeling.table': low }), VIEW);
    const users = shapeOf(scene, 'users');
    expect(users.face).toBeDefined();
    expect(users.header).toBeUndefined();
    expect(users.rect.height).toBe(measureRows(users.rect.width, 3).height);
  });

  it('gives a shape of its own the height of a face of size content, before layout', () => {
    const mailer = shapeOf(buildScene(systemAndService(), VIEW), 'mailer');
    // The stored height gives way, as rows give a table its height.
    expect(mailer.rect.height).not.toBe(40);
    expect(mailer.rect.height).toBe(faceContentHeight(mailer.face!, mailer.rect.width));
    const drawing = shapeFaceDrawing(mailer)!;
    expect(drawing.cut).toBe(false);
    expect(drawing.runs.map((run) => run.text).join('')).toContain('Mailer');
  });

  describe('a face of size content without a stored width (#15)', () => {
    // A row-like card whose one line does not wrap, cut at the appearance's width.
    const ROW_CARD = {
      size: 'content' as const,
      markup: ['<p>{{name}}</p>', '<small>{{component}}</small>'],
      style: ['face { padding: 4px 8px; }', 'p { white-space: nowrap; font-weight: 600; }'],
    };
    const NAME = 'Hugo Ferreyra (Paciente de prueba)';
    const POSITIONS: ShapePosition[] = [
      { element: 'by-hand', x: 0, y: 0 },
      { element: 'pinned', x: 0, y: 200, pinned: true },
      { element: 'sized', x: 0, y: 400, width: 150 },
      { element: 'short', x: 0, y: 600 },
    ];
    function cards(size: 'content' | 'shape' = 'content'): ProjectSnapshot {
      return withFaces(
        tablesProject({
          tables: [],
          elements: ['by-hand', 'pinned', 'sized', 'placed', 'short'].map((id) => ({
            id,
            component: 'systems.service',
            name: id === 'short' ? 'Ana' : NAME,
          })),
          positions: POSITIONS,
        }),
        { 'systems.service': { ...ROW_CARD, size } },
      );
    }
    /** The width the appearance gives, which a face of size `shape` keeps. */
    const appearanceWidth = () => shapeOf(buildScene(cards('shape'), VIEW), 'by-hand').rect.width;

    it('takes its content’s width whether a position was given by hand or layout placed it', () => {
      const project = cards();
      const scene = buildScene(project, VIEW);
      const widths = ['by-hand', 'pinned', 'placed'].map((id) => {
        const shape = shapeOf(scene, id);
        expect(shape.positioned).toBe(
          id === 'placed' ? 'placed' : id === 'pinned' ? 'pinned' : 'stored',
        );
        const drawing = shapeFaceDrawing(shape)!;
        expect(drawing.cut).toBe(false);
        expect(drawing.runs.map((run) => run.text)).toContain(NAME);
        expect(shape.rect.height).toBe(faceContentHeight(shape.face!, shape.rect.width));
        return shape.rect.width;
      });
      expect(widths[0]).toBeGreaterThan(appearanceWidth());
      expect(new Set(widths).size).toBe(1);
      expect(scene).toEqual(buildSceneAfresh(project, VIEW));
    });

    it('keeps the appearance’s width when what it says fits, and a stored width always', () => {
      const scene = buildScene(cards(), VIEW);
      const short = shapeOf(scene, 'short');
      expect(shapeFaceDrawing(short)!.cut).toBe(false);
      expect(short.rect.width).toBe(appearanceWidth());
      // A width stored by hand wins, the face cut in it.
      const sized = shapeOf(scene, 'sized');
      expect(sized.rect.width).toBe(150);
      expect(shapeFaceDrawing(sized)!.cut).toBe(true);
    });

    it('keeps the appearance’s width for a line clamp, the author’s own limit', () => {
      const clamped = withFaces(
        tablesProject({
          tables: [],
          elements: [
            {
              id: 'clamped',
              component: 'systems.service',
              name: 'Ana',
              attributes: { description: `${NAME}, ${NAME}, ${NAME}` },
            },
          ],
          positions: [{ element: 'clamped', x: 0, y: 0 }],
        }),
        {
          'systems.service': {
            size: 'content',
            markup: ['<b>{{name}}</b>', '<p>{{description}}</p>'],
            style: ['face { padding: 4px 8px; }', 'p { line-clamp: 1; }'],
          },
        },
      );
      const shape = shapeOf(buildScene(clamped, VIEW), 'clamped');
      expect(shapeFaceDrawing(shape)!.cut).toBe(true);
      expect(shape.rect.width).toBe(appearanceWidth());
    });

    it('takes the width in an ellipse’s, a person’s and a cylinder’s label area', () => {
      const kinds = ['ellipse', 'person', 'cylinder'] as const;
      const project = withFaces(
        tablesProject({
          tables: [],
          elements: kinds.map((kind) => ({
            id: kind,
            component: 'systems.service',
            name: NAME,
            appearance: { shape: kind },
          })),
          positions: kinds.map((kind, at) => ({ element: kind, x: at * 900, y: 0 })),
        }),
        { 'systems.service': ROW_CARD },
      );
      const scene = buildScene(project, VIEW);
      const whole = shapeOf(buildScene(cards(), VIEW), 'by-hand').rect.width;
      for (const kind of kinds) {
        const shape = shapeOf(scene, kind);
        expect(shape.kind).toBe(kind);
        const inside = faceWidthIn(kind, shape.rect.width);
        // Its label area is as wide as the face needs, and no wider than a unit more.
        expect(faceRect(shape).width).toBeCloseTo(inside);
        expect(inside).toBeGreaterThanOrEqual(whole);
        expect(inside).toBeLessThan(whole + (kind === 'ellipse' ? 1 : 0.001));
        if (kind === 'ellipse') expect(shape.rect.width).toBe(Math.ceil(whole / 0.7));
        else expect(shape.rect.width).toBe(whole);
        expect(shape.rect.height).toBe(
          heightForFace(kind, shape.rect.width, faceContentHeight(shape.face!, inside)),
        );
        const drawing = shapeFaceDrawing(shape)!;
        expect(drawing.runs.map((run) => run.text)).toContain(NAME);
        expect(drawing.cut).toBe(false);
      }
      expect(scene).toEqual(buildSceneAfresh(project, VIEW));
    });

    it('widens its container, and moves what sits after it there', () => {
      const held = (size: 'content' | 'shape') =>
        withFaces(
          tablesProject({
            tables: [],
            elements: [
              { id: 'billing', component: 'systems.system', name: 'Billing' },
              { id: 'long', component: 'systems.service', name: NAME },
              { id: 'next', component: 'systems.service', name: 'Ana' },
            ],
            relations: ['long', 'next'].map((id) => ({
              id: `${id}-in`,
              relationType: 'systems.is-part-of',
              from: id,
              to: 'billing',
            })),
            positions: [{ element: 'billing', x: 0, y: 0 }],
          }),
          { 'systems.service': { ...ROW_CARD, size } },
        );
      const before = buildScene(held('shape'), VIEW);
      const after = buildScene(held('content'), VIEW);
      const grown = shapeOf(after, 'long').rect.width - shapeOf(before, 'long').rect.width;
      expect(grown).toBeGreaterThan(0);
      expect(shapeOf(after, 'billing').rect.width).toBe(
        shapeOf(before, 'billing').rect.width + grown,
      );
      expect(shapeOf(after, 'next').rect.x).toBe(shapeOf(before, 'next').rect.x + grown);
      expect(shapeOf(after, 'next').rect.width).toBe(shapeOf(before, 'next').rect.width);
      expect(after).toEqual(buildSceneAfresh(held('content'), VIEW));
    });
  });

  it('signs a face by what it says, its pictures’ serials included (#15)', () => {
    const shape = shapeOf(buildScene(systemAndService(), VIEW), 'mailer');
    const face = shape.face!;
    const image = {} as CleanedImage;
    const withPicture = (serial: number): ShapeFace => ({
      ...face,
      pictures: { logo: { image, serial } },
    });
    // Faces that say the same, made apart, sign alike; another picture's serial signs otherwise.
    expect(faceSignature({ ...face })).toBe(faceSignature(face));
    expect(faceSignature(withPicture(1))).toBe(faceSignature(withPicture(1)));
    expect(faceSignature(withPicture(2))).not.toBe(faceSignature(withPicture(1)));
    expect(faceSignature(withPicture(1))).not.toBe(faceSignature(face));
    // Another value, too; and the signature stays short, whatever the face holds.
    const other = { ...face, input: { ...face.input, name: 'Other' } };
    expect(faceSignature(other)).not.toBe(faceSignature(face));
    expect(faceSignature(face).length).toBeLessThan(24);
    expect(faceSignature(undefined)).toBe('');
  });

  it('arranges a container’s contents under its face’s header', () => {
    const scene = buildScene(systemAndService(), VIEW);
    const billing = shapeOf(scene, 'billing');
    const users = shapeOf(scene, 'users');
    expect(billing.header).toBeGreaterThan(0);
    expect(billing.header).toBe(faceHeader(billing.face!, billing.rect.width, 48));
    expect(users.rect.y - billing.rect.y).toBeGreaterThanOrEqual(billing.header!);
  });

  it('draws a collapsed container’s collapsed variant, counting what it holds', () => {
    const billing = shapeOf(buildScene(systemAndService(true), VIEW), 'billing');
    expect(billing.collapsed).toBeDefined();
    expect(billing.face?.input.count).toBe(1);
    const drawing = shapeFaceDrawing(billing)!;
    expect(drawing.runs.map((run) => run.text).join('')).toContain('1 inside');
    expect(drawing.regions).toEqual([]);
  });

  it('draws a face that cannot be drawn as the shape’s name', () => {
    const broken = { markup: ['<script>{{name}}</script>'] };
    const scene = buildScene(withFaces(usersAndOrders(), { 'data-modeling.table': broken }), VIEW);
    const drawing = shapeFaceDrawing(shapeOf(scene, 'users'))!;
    expect(drawing.fallback?.code).toBe('invalid-face');
    expect(drawing.runs.map((run) => run.text).join('')).toBe('users');
  });

  it('lays a face out as the core does, in the rectangle the canvas draws it in', () => {
    const users = shapeOf(buildScene(withFaces(usersAndOrders(), TABLES), VIEW), 'users');
    const rect = faceRect(users);
    expect(shapeFaceDrawing(users)).toEqual(
      layOutFace(users.face!.compiled, users.face!.input, {
        width: rect.width,
        height: rect.height,
      }),
    );
    // Laid out once for each size and variant.
    expect(shapeFaceDrawing(users)).toBe(shapeFaceDrawing(users));
    expect(shapeFaceDrawing(users, { variant: 'far' })).not.toBe(shapeFaceDrawing(users));
  });

  it('equals one built from nothing, and keeps its face the same object when built again', () => {
    for (const project of [
      withFaces(usersAndOrders(), TABLES),
      systemAndService(),
      systemAndService(true),
    ]) {
      const first = buildScene(project, VIEW);
      expect(first).toEqual(buildSceneAfresh(project, VIEW));
      const again = buildScene({ ...project }, VIEW);
      for (const shape of first.shapes) {
        expect(again.shapes.find((each) => each.key === shape.key)?.face).toBe(shape.face);
      }
    }
  });
});
