/**
 * Faces in the scene (ADR 0083, F2): a shape whose appearance has a face carries it, with what fills
 * it; a face of size `content` gives its shape its height before layout; a face over rows or contents
 * gives its shape a header that its rows and contents go under; an anchored part draws none.
 */
import { layOutFace, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { CARD_FACE, COLUMN_FACE, SYSTEM_FACE, TABLE_FACE, withFaces } from '../test/faces';
import { VIEW, tablesProject, usersAndOrders } from '../test/tables';
import { faceContentHeight, faceHeader, faceRect, shapeFaceDrawing } from './faces';
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
