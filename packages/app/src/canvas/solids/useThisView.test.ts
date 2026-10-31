/**
 * Use this view (ADR 0075): the camera a solid was turned to is kept in the appearance that shows the
 * solid, at the level the project can change, in one undoable action.
 */
import {
  applyOperations,
  definitionsIn,
  executeCommand,
  solidShownBy,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { ARM_ID, withSolids } from '../../test/solids';
import { storedCamera, commandForThisView } from './useThisView';

const TURNED = { azimuth: -45, elevation: 35, zoom: 1.5 };

describe('Use this view', () => {
  it('keeps the camera in the component’s appearance, the solid as it is shown', () => {
    const state = withSolids();
    const command = commandForThisView(state, 'arm', ARM_ID, TURNED);
    expect(command).toEqual({
      type: 'set-component-appearance',
      component: 'robotics.arm',
      appearanceTraits: { solid: { solid: ARM_ID, placement: 'parts', camera: TURNED } },
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
    const command = commandForThisView(state, 'pictured', ARM_ID, TURNED);
    expect(command).toEqual({
      type: 'update-element',
      id: 'pictured',
      changes: {
        appearanceTraits: { solid: { solid: ARM_ID, placement: 'drawing', camera: TURNED } },
      },
    });
    const outcome = executeCommand(state, command as NonNullable<typeof command>);
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    const pictured = outcome.state.model.elements.find((each) => each.id === 'pictured');
    expect(pictured?.appearance).toMatchObject({
      image: { placement: 'drawing' },
      solid: { solid: ARM_ID, placement: 'drawing', camera: TURNED },
      width: 200,
    });
  });

  it('keeps another trait changed meanwhile, changing the solid alone', () => {
    const state = withSolids();
    const forElement = commandForThisView(state, 'pictured', ARM_ID, TURNED);
    const forComponent = commandForThisView(state, 'arm', ARM_ID, TURNED);
    if (!forElement || !forComponent) throw new Error('Nothing to send.');
    // Meanwhile, the element's fill and the component's stroke change.
    const meanwhile = [
      {
        type: 'update-element' as const,
        id: 'pictured',
        changes: { appearanceTraits: { fill: '#AA3322' } },
      },
      {
        type: 'set-component-appearance' as const,
        component: 'robotics.arm',
        appearanceTraits: { stroke: '#2255AA' },
      },
    ].reduce((current, command) => {
      const outcome = executeCommand(current, command);
      if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
      return outcome.state;
    }, state);
    const after = [forElement, forComponent].reduce((current, command) => {
      const outcome = executeCommand(current, command);
      if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
      return outcome.state;
    }, meanwhile);
    const pictured = after.model.elements.find((each) => each.id === 'pictured');
    expect(pictured?.appearance?.fill).toBe('#AA3322');
    expect(pictured && solidShownBy(pictured, definitionsIn(after))?.camera).toEqual(TURNED);
    // A component of the project's own keeps its appearance in its package.
    const component = after.packages
      .flatMap((file) => file.components)
      .find((each) => each.id === 'robotics.arm');
    expect(component?.appearance?.stroke).toBe('#2255AA');
    expect(component?.appearance?.solid).toEqual({
      solid: ARM_ID,
      placement: 'parts',
      camera: TURNED,
    });
  });

  it('sends nothing for another solid, an element without one, or the camera it has', () => {
    const state = withSolids();
    expect(commandForThisView(state, 'arm', 'robotics.other', TURNED)).toBeUndefined();
    expect(commandForThisView(state, 'extra', ARM_ID, TURNED)).toBeUndefined();
    expect(commandForThisView(state, 'gone', ARM_ID, TURNED)).toBeUndefined();
    const once = executeCommand(
      state,
      commandForThisView(state, 'arm', ARM_ID, TURNED) as NonNullable<
        ReturnType<typeof commandForThisView>
      >,
    );
    if (!once.ok) throw new Error('Not applied.');
    expect(commandForThisView(once.state, 'arm', ARM_ID, TURNED)).toBeUndefined();
  });

  it('stores a camera without what it leaves at its defaults', () => {
    expect(storedCamera({ azimuth: 10, elevation: 5, zoom: 1, projection: 'perspective' })).toEqual(
      {
        azimuth: 10,
        elevation: 5,
      },
    );
    expect(storedCamera({ azimuth: 10, elevation: 5, projection: 'orthographic' })).toEqual({
      azimuth: 10,
      elevation: 5,
      projection: 'orthographic',
    });
  });
});
