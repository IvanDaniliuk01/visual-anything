/**
 * Whether the app's placement may join the action before it (ADR 0065 and its clarification of W48):
 * only `set-positions`, every position unpinned, each of a shape the action created or moved into
 * another container, or of a shape beside a container the action made grow, moved only right or
 * down and kept its size. Anything else stays the person's own action.
 */
import type { ShapePosition } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import { placementJoins } from './placement-joins';
import type { ProjectSnapshot } from './snapshot';
import { sequentialIds, testProject } from './test/fixtures';

/** The project before and after an action. */
function acted(command: Command, start: ProjectSnapshot = testProject()) {
  const outcome = executeCommand(start, command, { newId: sequentialIds() });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return { previous: start, current: outcome.state };
}

const IN_SYSTEM: Command = {
  type: 'create-element',
  element: { id: 'cache', component: 'test.database', name: 'Cache' },
  containers: [{ container: 'system', relationType: 'test.inside' }],
};

const IN_WORLD: Command = {
  type: 'create-element',
  element: { id: 'queue', component: 'test.database', name: 'Queue' },
};

const positions = (...list: ShapePosition[]): Command => ({
  type: 'set-positions',
  view: 'overview',
  positions: list,
});

describe('a placement that joins the action before it', () => {
  it('places the shapes the action created, directly or in a batch', () => {
    const { previous, current } = acted(IN_SYSTEM);
    const placed = positions({ element: 'cache', container: 'system', x: 200, y: 40 });
    expect(placementJoins(previous, current, placed)).toEqual({ ok: true });
    const batch: Command = { type: 'batch', label: 'Lay out "Cache"', commands: [placed] };
    expect(placementJoins(previous, current, batch)).toEqual({ ok: true });
  });

  it('places a shape the action moved into another container', () => {
    const { previous, current } = acted({
      type: 'change-container',
      view: 'overview',
      to: 'system',
      shapes: [{ element: 'contract' }],
    });
    const placed = positions({ element: 'contract', container: 'system', x: 200, y: 160 });
    expect(placementJoins(previous, current, placed).ok).toBe(true);
  });

  it('moves the unpinned shapes beside a container the action made grow, right or down only', () => {
    // The project with a stored, unpinned shape beside the system.
    const start = testProject();
    const withNeighbour: ProjectSnapshot = {
      ...start,
      views: start.views.map((view) => ({
        ...view,
        positions: [...view.positions, { element: 'contract', x: 420, y: 0 }],
      })),
    };
    const { previous, current } = acted(IN_SYSTEM, withNeighbour);
    const pushed = positions(
      { element: 'cache', container: 'system', x: 200, y: 40 },
      { element: 'contract', x: 520, y: 0 },
    );
    expect(placementJoins(previous, current, pushed).ok).toBe(true);
    // Moved left, it does more than make room.
    const left = positions(
      { element: 'cache', container: 'system', x: 200, y: 40 },
      { element: 'contract', x: 300, y: 0 },
    );
    expect(placementJoins(previous, current, left).ok).toBe(false);
    // Resized, too.
    const resized = positions(
      { element: 'cache', container: 'system', x: 200, y: 40 },
      { element: 'contract', x: 520, y: 0, width: 300 },
    );
    expect(placementJoins(previous, current, resized).ok).toBe(false);
  });

  it('moves nothing beside the shapes an action added directly in World', () => {
    const start = testProject();
    const withNeighbour: ProjectSnapshot = {
      ...start,
      views: start.views.map((view) => ({
        ...view,
        positions: [...view.positions, { element: 'contract', x: 420, y: 0 }],
      })),
    };
    const { previous, current } = acted(IN_WORLD, withNeighbour);
    expect(
      placementJoins(previous, current, positions({ element: 'queue', x: 0, y: 400 })).ok,
    ).toBe(true);
    const pushed = positions(
      { element: 'queue', x: 0, y: 400 },
      { element: 'contract', x: 520, y: 0 },
    );
    expect(placementJoins(previous, current, pushed).ok).toBe(false);
  });

  it('is its own action for a pinned position, a shape that was there before, or another command', () => {
    const { previous, current } = acted(IN_SYSTEM);
    expect(
      placementJoins(
        previous,
        current,
        positions({ element: 'cache', container: 'system', x: 200, y: 40, pinned: true }),
      ).ok,
    ).toBe(false);
    // The API sat in the system before; moving it does more than place what the action added.
    expect(
      placementJoins(
        previous,
        current,
        positions(
          { element: 'cache', container: 'system', x: 200, y: 40 },
          { element: 'api', container: 'system', x: 20, y: 0 },
        ),
      ).ok,
    ).toBe(false);
    expect(
      placementJoins(previous, current, {
        type: 'update-element',
        id: 'cache',
        changes: { name: 'Store' },
      }).ok,
    ).toBe(false);
    expect(
      placementJoins(previous, current, {
        type: 'batch',
        label: 'Lay out and rename',
        commands: [
          positions({ element: 'cache', container: 'system', x: 200, y: 40 }),
          { type: 'update-element', id: 'cache', changes: { name: 'Store' } },
        ],
      }).ok,
    ).toBe(false);
  });

  it('places what an action added to a view it created, every shape there being new', () => {
    const { previous, current } = acted({
      type: 'create-view',
      view: { id: 'second', name: 'Second', perspective: { name: 'Deployment' } },
    });
    const placed: Command = {
      type: 'set-positions',
      view: 'second',
      positions: [{ element: 'system', x: 0, y: 0 }],
    };
    expect(placementJoins(previous, current, placed).ok).toBe(true);
  });
});
