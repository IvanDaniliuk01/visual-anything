/**
 * Use this view (ADR 0075): the camera a solid was turned to is kept in the appearance that shows the
 * solid, at the level the project can change, in one undoable action.
 */
import { applyOperations, definitionsIn, executeCommand, solidShownBy } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { ARM_ID, withSolids } from '../../test/solids';
import { storedCamera, useThisViewCommand } from './useThisView';

const TURNED = { azimuth: -45, elevation: 35, zoom: 1.5 };

describe('Use this view', () => {
  it('keeps the camera in the component’s appearance, the solid as it is shown', () => {
    const state = withSolids();
    const command = useThisViewCommand(state, 'arm', ARM_ID, TURNED);
    expect(command).toEqual({
      type: 'set-component-appearance',
      component: 'robotics.arm',
      appearance: { solid: { solid: ARM_ID, placement: 'parts', camera: TURNED } },
    });
    const outcome = executeCommand(state, command as NonNullable<typeof command>);
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    const arm = outcome.state.model.elements.find((each) => each.id === 'arm');
    expect(arm && solidShownBy(arm, definitionsIn(outcome.state))?.camera).toEqual(TURNED);
    // One action, which an undo takes back whole.
    expect(outcome.label).not.toBe('');
    expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(state);
  });

  it('keeps it in the element’s own appearance when that names the solid', () => {
    const state = withSolids();
    const command = useThisViewCommand(state, 'pictured', ARM_ID, TURNED);
    expect(command).toMatchObject({
      type: 'update-element',
      id: 'pictured',
      changes: {
        appearance: {
          image: { placement: 'drawing' },
          solid: { solid: ARM_ID, placement: 'drawing', camera: TURNED },
          width: 200,
        },
      },
    });
    const outcome = executeCommand(state, command as NonNullable<typeof command>);
    expect(outcome.ok).toBe(true);
  });

  it('sends nothing for another solid, an element without one, or the camera it has', () => {
    const state = withSolids();
    expect(useThisViewCommand(state, 'arm', 'robotics.other', TURNED)).toBeUndefined();
    expect(useThisViewCommand(state, 'extra', ARM_ID, TURNED)).toBeUndefined();
    expect(useThisViewCommand(state, 'gone', ARM_ID, TURNED)).toBeUndefined();
    const once = executeCommand(
      state,
      useThisViewCommand(state, 'arm', ARM_ID, TURNED) as NonNullable<
        ReturnType<typeof useThisViewCommand>
      >,
    );
    if (!once.ok) throw new Error('Not applied.');
    expect(useThisViewCommand(once.state, 'arm', ARM_ID, TURNED)).toBeUndefined();
  });

  it('stores a camera without what it leaves at its defaults', () => {
    expect(storedCamera({ azimuth: 10, elevation: 5, zoom: 1, projection: 'perspective' })).toEqual({
      azimuth: 10,
      elevation: 5,
    });
    expect(storedCamera({ azimuth: 10, elevation: 5, projection: 'orthographic' })).toEqual({
      azimuth: 10,
      elevation: 5,
      projection: 'orthographic',
    });
  });
});
