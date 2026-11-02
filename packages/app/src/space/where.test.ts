/**
 * Where an element is in the physical-space panel, in words (ADR 0076), following the exploded view:
 * what the exploded view moves away from what it is posed or anchored in is said to be drawn that far
 * from its place, and what moves only with its container is not, since it is where it was from it.
 */
import { spaceOf } from '@visual-anything/core';
import type { Id, SpacePoint } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { translatorFor } from '../i18n';
import { workcell } from '../test/space';
import { whereIs, whereSelected } from './where';

const project = workcell();
const view = project.views[0];
if (!view) throw new Error('The workcell has a view.');
const space = spaceOf(project, view);
const t = translatorFor('en');

describe('where an element is, in words', () => {
  it('says where the poses put it while nothing is exploded', () => {
    expect(whereIs(t, project, space, 'elbow')).toBe('Elbow, anchored to the part “elbow” of Arm');
    expect(whereIs(t, project, space, 'camera', new Map())).toBe(
      'Camera, posed in Table, 80 cm from it',
    );
  });

  it('says how far the exploded view draws a part from its place', () => {
    const shifts = new Map<Id, SpacePoint>([['elbow', { x: 0, y: 0.3, z: 0.4 }]]);
    expect(whereIs(t, project, space, 'elbow', shifts)).toBe(
      'Elbow, anchored to the part “elbow” of Arm, drawn 50 cm from its place by the exploded view',
    );
    expect(whereSelected(t, project, space, ['elbow'], shifts)).toBe(
      'Elbow, anchored to the part “elbow” of Arm, drawn 50 cm from its place by the exploded view.',
    );
  });

  it('says nothing of a move it makes only with what it is in', () => {
    const shifts = new Map<Id, SpacePoint>([
      ['table', { x: 0.1, y: 0, z: 0 }],
      ['camera', { x: 0.1, y: 0, z: 0 }],
    ]);
    expect(whereIs(t, project, space, 'camera', shifts)).toBe(
      'Camera, posed in Table, 80 cm from it',
    );
    // What it is in moving and it not, which the worker never says, is a move of its own.
    const apart = new Map<Id, SpacePoint>([['table', { x: 0.1, y: 0, z: 0 }]]);
    expect(whereIs(t, project, space, 'camera', apart)).toBe(
      'Camera, posed in Table, 80 cm from it, drawn 10 cm from its place by the exploded view',
    );
  });

  it('reads in Spanish', () => {
    const shifts = new Map<Id, SpacePoint>([['elbow', { x: 0, y: 0.3, z: 0.4 }]]);
    expect(whereIs(translatorFor('es'), project, space, 'elbow', shifts)).toBe(
      'Elbow, anclado a la parte “elbow” de Arm, dibujado a 50 cm de su lugar por la explosión',
    );
  });
});
