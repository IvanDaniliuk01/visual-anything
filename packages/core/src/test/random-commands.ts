/**
 * Random commands for the core's property tests: a project to start from, the intents a test draws,
 * and the command each intent makes on the project as it is. The invariants' tests and the versions'
 * tests share them.
 */
import fc from 'fast-check';
import type { FreeShape, Id, LimitList, ScopeRule, ViewFile } from '@visual-anything/schema';
import type {
  Command,
  UpdateComponentCommand,
  UpdateElementCommand,
  UpdateRelationCommand,
  UpdateRelationTypeCommand,
} from '../commands';
import { containmentTree, type Placement } from '../containment';
import { nestingTypesInView } from '../containers';
import type { ProjectSnapshot } from '../snapshot';
import { rotationFromDegrees } from '../space/math';
import { definitionsIn, modelIndexOf } from '../state';
import { testProject } from './fixtures';

export const COMPONENTS = ['test.box', 'test.service', 'test.database', 'essence'];
export const NESTING = ['test.inside', 'test.part-of'];
export const RELATION_TYPES = ['test.calls', 'test.reads', 'test.governs', ...NESTING];

/**
 * The test project with a second relation type that nests, so that containment is attempted across
 * two of them, as views that nest by both would show it.
 */
export function propertyProject(): ProjectSnapshot {
  const project = testProject();
  const [own, ...others] = project.packages;
  if (!own) throw new Error('The test project has no package.');
  const partOf = {
    id: 'test.part-of',
    name: 'is part of',
    derivesFrom: 'relates-to',
    direction: 'directed' as const,
    nests: true,
  };
  return {
    ...project,
    packages: [{ ...own, relationTypes: [...own.relationTypes, partOf] }, ...others],
  };
}

/** What to do next, in terms the current project turns into a command. */
export type Intent =
  | { kind: 'create-element'; component: number; container: number | null }
  | { kind: 'create-relation'; type: number; from: number; to: number }
  | { kind: 'move-end'; relation: number; end: 'from' | 'to'; target: number }
  | { kind: 'retype'; relation: number; type: number }
  | { kind: 'update-element'; element: number; component: number }
  | { kind: 'delete-elements'; picks: number[] }
  | { kind: 'delete-relations'; picks: number[] }
  | { kind: 'position'; picks: number[] }
  | { kind: 'batch'; first: number; second: number }
  | { kind: 'toggle-nests'; type: number }
  | { kind: 'rederive'; component: number; parent: number }
  | { kind: 'define'; relationType: boolean; parent: number }
  | { kind: 'remove-definition'; at: number; unused: boolean }
  | { kind: 'packages'; systems: boolean }
  | { kind: 'view'; action: 'create' | 'nesting' | 'delete'; at: number; types: number[] }
  | { kind: 'scenario'; action: 'create' | 'steps' | 'delete'; at: number; picks: number[] }
  | { kind: 'note'; action: 'create' | 'move' | 'delete'; at: number }
  | { kind: 'package' }
  | { kind: 'forget-positions'; at: number; picks: number[] }
  | { kind: 'restack'; at: number; picks: number[]; place: number; target: number }
  | {
      kind: 'change-container';
      at: number;
      picks: number[];
      to: number | null;
      positioned: boolean;
      relationType: number | null;
    }
  | { kind: 'update-component'; at: number; change: number; value: number }
  | { kind: 'update-relation-type'; at: number; change: number; value: number }
  | { kind: 'update-package'; value: number }
  | { kind: 'reorder'; picks: number[]; before: number | null }
  | { kind: 'pose'; picks: number[]; container: number; at: number; turn: number; out: boolean }
  | { kind: 'collapse'; at: number; picks: number[]; collapsed: boolean }
  | { kind: 'scope'; at: number; rule: number; picks: number[]; clear: boolean }
  | { kind: 'in-view'; at: number; picks: number[]; out: boolean }
  | { kind: 'component-appearance'; at: number; form: number; value: number }
  | { kind: 'relation-type-appearance'; at: number; form: number; value: number }
  | { kind: 'relation-appearance'; relation: number; form: number; value: number }
  | { kind: 'element-appearance'; element: number; form: number; value: number }
  | { kind: 'shape-color'; at: number; arrow: boolean; value: number }
  | { kind: 'undo' }
  | { kind: 'redo' };

/** The intents that set colors: run again with their colors in lower case, they change nothing. */
export const RECOLORS: ReadonlySet<Intent['kind']> = new Set([
  'component-appearance',
  'relation-type-appearance',
  'relation-appearance',
  'element-appearance',
]);

/** Every kind of command, each of which the random actions must manage to apply. */
export const COMMAND_TYPES: readonly Command['type'][] = [
  'create-element',
  'update-element',
  'delete',
  'create-relation',
  'update-relation',
  'create-package',
  'define-component',
  'remove-component',
  'define-relation-type',
  'remove-relation-type',
  'create-view',
  'update-view',
  'delete-view',
  'set-positions',
  'remove-positions',
  'create-free-shape',
  'update-free-shape',
  'delete-free-shapes',
  'create-scenario',
  'update-scenario',
  'delete-scenario',
  'update-project',
  'restack',
  'change-container',
  'update-component',
  'update-relation-type',
  'update-package',
  'reorder-elements',
  'set-poses',
  'set-collapsed',
  'set-scope',
  'add-to-view',
  'leave-out-of-view',
  'set-component-appearance',
  'set-relation-type-appearance',
  'batch',
];

export const index = fc.nat({ max: 1000 });
export const intent: fc.Arbitrary<Intent> = fc.oneof(
  fc.record({ kind: fc.constant('create-element'), component: index, container: fc.option(index) }),
  fc.record({ kind: fc.constant('create-relation'), type: index, from: index, to: index }),
  fc.record({
    kind: fc.constant('move-end'),
    relation: index,
    end: fc.constantFrom('from', 'to'),
    target: index,
  }),
  fc.record({ kind: fc.constant('retype'), relation: index, type: index }),
  fc.record({ kind: fc.constant('update-element'), element: index, component: index }),
  fc.record({
    kind: fc.constant('delete-elements'),
    picks: fc.array(index, { minLength: 1, maxLength: 3 }),
  }),
  fc.record({
    kind: fc.constant('delete-relations'),
    picks: fc.array(index, { minLength: 1, maxLength: 3 }),
  }),
  fc.record({
    kind: fc.constant('position'),
    picks: fc.array(index, { minLength: 1, maxLength: 3 }),
  }),
  fc.record({ kind: fc.constant('batch'), first: index, second: index }),
  fc.record({ kind: fc.constant('toggle-nests'), type: index }),
  fc.record({ kind: fc.constant('rederive'), component: index, parent: index }),
  // Definitions nothing uses yet, so that removing one is often allowed.
  {
    arbitrary: fc.record({
      kind: fc.constant('define'),
      relationType: fc.boolean(),
      parent: index,
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('remove-definition'),
      at: index,
      unused: fc.boolean(),
    }),
    weight: 3,
  },
  fc.record({ kind: fc.constant('packages'), systems: fc.boolean() }),
  {
    arbitrary: fc.record({
      kind: fc.constant('view'),
      action: fc.constantFrom('create', 'nesting', 'delete'),
      at: index,
      types: fc.array(index, { maxLength: 2 }),
    }),
    weight: 2,
  },
  fc.record({
    kind: fc.constant('scenario'),
    action: fc.constantFrom('create', 'steps', 'delete'),
    at: index,
    picks: fc.array(index, { minLength: 1, maxLength: 3 }),
  }),
  fc.record({
    kind: fc.constant('note'),
    action: fc.constantFrom('create', 'move', 'delete'),
    at: index,
  }),
  fc.constant({ kind: 'package' as const }),
  {
    arbitrary: fc.record({
      kind: fc.constant('restack'),
      at: index,
      picks: fc.array(index, { minLength: 1, maxLength: 3 }),
      place: fc.nat({ max: 3 }),
      target: index,
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('change-container'),
      at: index,
      picks: fc.array(index, { minLength: 1, maxLength: 3 }),
      to: fc.option(index),
      positioned: fc.boolean(),
      relationType: fc.option(index, { freq: 4 }),
    }),
    weight: 3,
  },
  fc.record({
    kind: fc.constant('forget-positions'),
    at: index,
    picks: fc.array(index, { minLength: 1, maxLength: 3 }),
  }),
  {
    arbitrary: fc.record({
      kind: fc.constant('update-component'),
      at: index,
      change: index,
      value: index,
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('update-relation-type'),
      at: index,
      change: index,
      value: index,
    }),
    weight: 2,
  },
  fc.record({ kind: fc.constant('update-package'), value: index }),
  {
    arbitrary: fc.record({
      kind: fc.constant('reorder'),
      picks: fc.array(index, { minLength: 1, maxLength: 3 }),
      before: fc.option(index),
    }),
    weight: 2,
  },
  // Poses (ADR 0076), in World or one of the element's containers, and now and then in what is not.
  {
    arbitrary: fc.record({
      kind: fc.constant('pose'),
      picks: fc.array(index, { minLength: 1, maxLength: 3 }),
      container: index,
      at: index,
      turn: index,
      out: fc.boolean(),
    }),
    weight: 3,
  },
  fc.record({
    kind: fc.constant('collapse'),
    at: index,
    picks: fc.array(index, { minLength: 1, maxLength: 3 }),
    collapsed: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant('scope'),
    at: index,
    rule: index,
    picks: fc.array(index, { maxLength: 2 }),
    clear: fc.boolean(),
  }),
  {
    arbitrary: fc.record({
      kind: fc.constant('in-view'),
      at: index,
      picks: fc.array(index, { minLength: 1, maxLength: 2 }),
      out: fc.boolean(),
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('component-appearance'),
      at: index,
      form: index,
      value: index,
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('relation-type-appearance'),
      at: index,
      form: index,
      value: index,
    }),
    weight: 2,
  },
  fc.record({
    kind: fc.constant('relation-appearance'),
    relation: index,
    form: index,
    value: index,
  }),
  fc.record({
    kind: fc.constant('element-appearance'),
    element: index,
    form: index,
    value: index,
  }),
  fc.record({ kind: fc.constant('shape-color'), at: index, arrow: fc.boolean(), value: index }),
  { arbitrary: fc.constant({ kind: 'undo' as const }), weight: 2 },
  { arbitrary: fc.constant({ kind: 'redo' as const }), weight: 1 },
);

/** Changes to a component's traits and attributes, one of which an intent picks. */
export function componentChange(change: number, value: number): UpdateComponentCommand['changes'] {
  const colors = ['#112233', '#AABBCC', '#FFFFFF'];
  const changes: UpdateComponentCommand['changes'][] = [
    { appearance: { fill: pick(colors, value) ?? null } },
    { appearance: { width: value % 3 === 0 ? null : 40 + (value % 400) } },
    { appearance: { shape: pick(['rectangle', 'rounded-rectangle', null] as const, value) } },
    { appearance: { contentsAsRows: pick([true, false, null] as const, value) } },
    { appearance: { detail: { componentName: value % 2 === 0, attributes: ['owner'] } } },
    { appearance: { detail: null, connectionPoints: value % 2 === 0 ? [] : null } },
    {
      attributes: {
        set: [{ name: 'tier', type: 'string', choices: ['gold', 'silver'], default: 'gold' }],
      },
    },
    { attributes: { remove: ['tier'] } },
    { attributes: { rename: [{ from: 'owner', to: pick(['team', 'owner2'], value) ?? 'team' }] } },
    { attributes: { rename: [{ from: 'team', to: 'owner' }] } },
    { name: pick(['Renamed', 'Again'], value) ?? 'Renamed', description: null },
    { derivesFrom: pick(COMPONENTS, value) ?? 'essence' },
  ];
  return pick(changes, change) ?? {};
}

/** Changes to a relation type, one of which an intent picks. */
export function relationTypeChange(
  change: number,
  value: number,
): UpdateRelationTypeCommand['changes'] {
  const changes: UpdateRelationTypeCommand['changes'][] = [
    { nests: pick([true, false, null] as const, value) },
    { direction: pick(['directed', 'undirected', null] as const, value) },
    {
      limits: {
        from: pick<LimitList | 'any' | null>(['any', null, ['test.service'], ['test.box']], value),
      },
    },
    { limits: { to: pick<LimitList | 'any' | null>(['any', null, ['test.database']], value) } },
    {
      appearance: {
        dash: pick(['dashed', null] as const, value),
        width: value % 2 === 0 ? 3 : null,
      },
    },
    { attributes: { set: [{ name: 'weight', type: 'number', unit: 'kg' }] } },
    { attributes: { rename: [{ from: 'weight', to: 'mass' }] } },
    { name: 'renamed', derivesFrom: pick(RELATION_TYPES, value) ?? 'relates-to' },
  ];
  return pick(changes, change) ?? {};
}

export function pick<T>(list: readonly T[], at: number): T | undefined {
  return list.length === 0 ? undefined : list[at % list.length];
}

/** The command an intent stands for in this project, if it can stand for one. */
export function commandFor(state: ProjectSnapshot, wish: Intent): Command | undefined {
  const elements = state.model.elements.map((element) => element.id);
  const relations = state.model.relations.map((relation) => relation.id);
  const ends = [state.model.world.id, ...elements, ...relations];
  switch (wish.kind) {
    case 'create-element': {
      const container = wish.container === null ? undefined : pick(elements, wish.container);
      return {
        type: 'create-element',
        element: { component: pick(COMPONENTS, wish.component) as Id, name: 'New element' },
        ...(container
          ? { containers: [{ container, relationType: pick(NESTING, wish.component) as Id }] }
          : {}),
      };
    }
    case 'create-relation':
      return {
        type: 'create-relation',
        relation: {
          relationType: pick(RELATION_TYPES, wish.type) as Id,
          from: pick(ends, wish.from) as Id,
          to: pick(ends, wish.to) as Id,
        },
      };
    case 'move-end': {
      const relation = pick(relations, wish.relation);
      return relation === undefined
        ? undefined
        : {
            type: 'update-relation',
            id: relation,
            changes: { [wish.end]: pick(ends, wish.target) as Id },
          };
    }
    case 'retype': {
      const relation = pick(relations, wish.relation);
      return relation === undefined
        ? undefined
        : {
            type: 'update-relation',
            id: relation,
            changes: { relationType: pick(RELATION_TYPES, wish.type) },
          };
    }
    case 'update-element':
      return {
        type: 'update-element',
        id: pick([state.model.world.id, ...elements], wish.element) as Id,
        changes: { component: pick(COMPONENTS, wish.component), name: 'Renamed' },
      };
    case 'delete-elements':
      return elements.length === 0
        ? undefined
        : {
            type: 'delete',
            elements: [...new Set(wish.picks.map((at) => pick(elements, at) as Id))],
          };
    case 'delete-relations':
      return relations.length === 0
        ? undefined
        : {
            type: 'delete',
            relations: [...new Set(wish.picks.map((at) => pick(relations, at) as Id))],
          };
    case 'position': {
      if (elements.length === 0) return undefined;
      const ids = [...new Set(wish.picks.map((at) => pick(elements, at) as Id))];
      return {
        type: 'set-positions',
        view: 'overview',
        positions: ids.map((element, at) => ({ element, x: at * 10, y: 5 })),
      };
    }
    case 'batch': {
      const first = commandFor(state, {
        kind: 'create-relation',
        type: wish.first,
        from: wish.first,
        to: wish.second,
      });
      const second = commandFor(state, { kind: 'delete-relations', picks: [wish.second] });
      return first && second && { type: 'batch', label: 'Two at once', commands: [first, second] };
    }
    case 'toggle-nests': {
      const relationType = pick(ownPackage(state).relationTypes, wish.type);
      return (
        relationType && {
          type: 'define-relation-type',
          package: 'test',
          relationType: { ...relationType, nests: !relationType.nests },
        }
      );
    }
    case 'rederive': {
      const component = pick(ownPackage(state).components, wish.component);
      return (
        component && {
          type: 'define-component',
          package: 'test',
          component: { ...component, derivesFrom: pick(COMPONENTS, wish.parent) as Id },
        }
      );
    }
    case 'define':
      return wish.relationType
        ? {
            type: 'define-relation-type',
            package: 'test',
            relationType: {
              id: 'test.added-type',
              name: 'Added type',
              derivesFrom: pick(RELATION_TYPES, wish.parent) as Id,
            },
          }
        : {
            type: 'define-component',
            package: 'test',
            component: {
              id: 'test.added',
              name: 'Added',
              derivesFrom: pick(COMPONENTS, wish.parent) as Id,
            },
          };
    case 'remove-definition': {
      const own = ownPackage(state);
      const ids = [...own.components, ...own.relationTypes].map((definition) => definition.id);
      const used = new Set([
        ...state.model.elements.map((element) => element.component),
        ...state.model.relations.map((relation) => relation.relationType),
        ...state.packages.flatMap((file) =>
          [...file.components, ...file.relationTypes].map((definition) => definition.derivesFrom),
        ),
      ]);
      const unused = ids.filter((each) => !used.has(each));
      const id = pick(wish.unused && unused.length > 0 ? unused : ids, wish.at);
      if (id === undefined) return undefined;
      return own.components.some((component) => component.id === id)
        ? { type: 'remove-component', id }
        : { type: 'remove-relation-type', id };
    }
    case 'packages':
      return {
        type: 'update-project',
        changes: { packages: wish.systems ? ['test', 'systems'] : ['test'] },
      };
    case 'view': {
      const views = state.views.map((view) => view.id);
      const nestingRelationTypes = [...new Set(wish.types.map((at) => pick(NESTING, at) as Id))];
      switch (wish.action) {
        case 'create':
          return {
            type: 'create-view',
            view: {
              name: 'Another view',
              perspective: { name: 'Structure' },
              nestingRelationTypes,
            },
          };
        case 'nesting': {
          const view = pick(views, wish.at);
          return view === undefined
            ? undefined
            : { type: 'update-view', id: view, changes: { nestingRelationTypes } };
        }
        case 'delete': {
          // A view no scenario plays over, which can go; while there is none, one that is refused.
          const free = views.filter((id) => !state.scenarios.some((each) => each.view === id));
          const view = pick(free.length > 0 ? free : views, wish.at);
          return view === undefined ? undefined : { type: 'delete-view', id: view };
        }
      }
      return undefined;
    }
    case 'scenario': {
      const scenarios = state.scenarios.map((scenario) => scenario.id);
      const chosen = [...new Set(wish.picks.map((at) => pick(relations, at)))].filter(
        (id): id is Id => id !== undefined,
      );
      const steps = [{ description: 'A step.', relations: chosen }];
      switch (wish.action) {
        case 'create': {
          const view = pick(state.views, wish.at);
          return view && chosen.length > 0
            ? { type: 'create-scenario', scenario: { name: 'A story', view: view.id, steps } }
            : undefined;
        }
        case 'steps': {
          const scenario = pick(scenarios, wish.at);
          return scenario && chosen.length > 0
            ? { type: 'update-scenario', id: scenario, changes: { steps } }
            : undefined;
        }
        case 'delete': {
          const scenario = pick(scenarios, wish.at);
          return scenario === undefined ? undefined : { type: 'delete-scenario', id: scenario };
        }
      }
      return undefined;
    }
    case 'note': {
      const view = pick(state.views, wish.at);
      if (!view) return undefined;
      if (wish.action === 'create') {
        return {
          type: 'create-free-shape',
          view: view.id,
          shape: { kind: 'note', x: 0, y: 0, width: 120, height: 60, text: 'A note' },
        };
      }
      const note = pick(
        view.freeShapes.filter((shape) => shape.kind === 'note'),
        wish.at,
      );
      if (!note) return undefined;
      return wish.action === 'move'
        ? { type: 'update-free-shape', view: view.id, shape: { ...note, x: note.x + 10 } }
        : { type: 'delete-free-shapes', view: view.id, ids: [note.id] };
    }
    case 'package':
      return { type: 'create-package', package: { id: 'extra', name: 'Extra' } };
    case 'forget-positions': {
      const view = pick(state.views, wish.at);
      if (!view || view.positions.length === 0) return undefined;
      const positions = [...new Set(wish.picks.map((at) => pick(view.positions, at)))].flatMap(
        (position) =>
          position === undefined
            ? []
            : [
                {
                  element: position.element,
                  ...(position.container === undefined ? {} : { container: position.container }),
                },
              ],
      );
      return { type: 'remove-positions', view: view.id, positions };
    }
    case 'restack': {
      const view = pick(state.views, wish.at);
      if (!view) return undefined;
      const placements = placementsIn(state, view);
      const moves = [...new Set(wish.picks.map((at) => pick(placements, at)))].flatMap(
        (placement) => {
          if (!placement) return [];
          const siblings = placements.filter(
            (each) => each.container === placement.container && each.element !== placement.element,
          );
          const other = pick(siblings, wish.target);
          const places = [
            'front' as const,
            'back' as const,
            ...(other ? [{ inFrontOf: other.element }, { behind: other.element }] : []),
          ];
          return [
            {
              shape: {
                element: placement.element,
                ...(placement.container === undefined ? {} : { container: placement.container }),
              },
              to: pick(places, wish.place) ?? 'front',
            },
          ];
        },
      );
      return moves.length === 0 ? undefined : { type: 'restack', view: view.id, moves };
    }
    case 'change-container': {
      const view = pick(state.views, wish.at);
      if (!view) return undefined;
      const placements = placementsIn(state, view);
      const chosen = [...new Set(wish.picks.map((at) => pick(placements, at)))].filter(
        (placement) => placement !== undefined,
      );
      if (chosen.length === 0) return undefined;
      const to = wish.to === null ? undefined : pick(elements, wish.to);
      const relationType =
        wish.relationType === null ? undefined : pick(RELATION_TYPES, wish.relationType);
      return {
        type: 'change-container',
        view: view.id,
        ...(to === undefined ? {} : { to }),
        ...(relationType === undefined ? {} : { relationType }),
        shapes: chosen.map((placement, at) => ({
          element: placement.element,
          ...(placement.container === undefined ? {} : { from: placement.container }),
          ...(wish.positioned ? { at: { x: at * 20, y: 10 } } : {}),
        })),
      };
    }
    case 'update-component': {
      const component = pick(ownPackage(state).components, wish.at);
      return (
        component && {
          type: 'update-component',
          id: component.id,
          changes: componentChange(wish.change, wish.value),
        }
      );
    }
    case 'update-relation-type': {
      const relationType = pick(ownPackage(state).relationTypes, wish.at);
      return (
        relationType && {
          type: 'update-relation-type',
          id: relationType.id,
          changes: relationTypeChange(wish.change, wish.value),
        }
      );
    }
    case 'update-package':
      return {
        type: 'update-package',
        id: 'test',
        changes:
          wish.value % 2 === 0
            ? { name: `Test ${wish.value % 5}` }
            : { description: wish.value % 3 === 0 ? null : 'Ours.' },
      };
    case 'pose': {
      const model = modelIndexOf(state);
      // An element and, now and then, its first container, so that poses nest.
      const chosen = wish.picks.map((at) => pick(elements, at) as Id).filter(Boolean);
      const first = chosen[0];
      const above = first === undefined ? undefined : model.containersOf(first)[0];
      const picked = [...new Set([...chosen, ...(above && wish.turn % 2 === 0 ? [above] : [])])];
      if (picked.length === 0) return undefined;
      const poseOf = (id: Id, at: number) => {
        if (wish.out && at === 0) return null;
        const containers = model.containersOf(id);
        const container =
          wish.container % 5 === 4
            ? pick(elements, wish.container)
            : wish.container % 5 === 0
              ? undefined
              : pick(containers, wish.container + at);
        const turn =
          wish.turn % 3 === 0 ? undefined : rotationFromDegrees(0, (wish.turn % 8) * 45, 15);
        return {
          ...(container === undefined ? {} : { in: container }),
          at: { x: ((wish.at + at) % 7) - 3, y: (wish.at % 5) * 0.5, z: -(wish.at % 3) },
          ...(turn === undefined ? {} : { rotation: turn }),
        };
      };
      const [only] = picked;
      if (picked.length === 1 && only !== undefined && wish.at % 2 === 0) {
        return { type: 'update-element', id: only, changes: { pose: poseOf(only, 0) } };
      }
      return {
        type: 'set-poses',
        poses: picked.map((element, at) => ({ element, pose: poseOf(element, at) })),
      };
    }
    case 'reorder': {
      if (elements.length === 0) return undefined;
      const moving = [...new Set(wish.picks.map((at) => pick(elements, at) as Id))];
      const before = wish.before === null ? undefined : pick(elements, wish.before);
      return {
        type: 'reorder-elements',
        elements: moving,
        ...(before === undefined ? {} : { before }),
      };
    }
    case 'collapse': {
      const view = pick(state.views, wish.at);
      if (!view || elements.length === 0) return undefined;
      return {
        type: 'set-collapsed',
        view: view.id,
        elements: [...new Set(wish.picks.map((at) => pick(elements, at) as Id))],
        collapsed: wish.collapsed,
      };
    }
    case 'scope': {
      const view = pick(state.views, wish.at);
      if (!view) return undefined;
      if (wish.clear) return { type: 'set-scope', view: view.id, scope: null };
      const definitions = definitionsIn(state);
      const components = [...definitions.components.keys()];
      const relationTypes = [...definitions.relationTypes.keys()];
      const container = pick(elements, wish.rule);
      const rules: ScopeRule[] = [
        { kind: 'component', component: pick(components, wish.rule) as Id },
        ...(relationTypes.length > 0
          ? [{ kind: 'relation-type' as const, relationType: pick(relationTypes, wish.rule) as Id }]
          : []),
        ...(container === undefined
          ? []
          : [{ kind: 'contents' as const, container, depth: 1 + (wish.rule % 3) }]),
        { kind: 'attribute', attribute: 'owner', test: 'set' },
      ];
      const added = [
        ...new Set(wish.picks.map((at) => pick(elements, at)).filter((id) => id !== undefined)),
      ];
      return {
        type: 'set-scope',
        view: view.id,
        scope: {
          include: [pick(rules, wish.rule) as ScopeRule],
          ...(added.length > 0 ? { added } : {}),
        },
      };
    }
    case 'in-view': {
      const view = pick(state.views, wish.at);
      if (!view || elements.length === 0) return undefined;
      return {
        type: wish.out ? 'leave-out-of-view' : 'add-to-view',
        view: view.id,
        elements: [...new Set(wish.picks.map((at) => pick(elements, at) as Id))],
      };
    }
    case 'component-appearance': {
      const component = pick(APPEARANCE_TARGETS, wish.at) as Id;
      const color = (shift: number) => pick(COLORS, wish.value + shift) as string;
      switch (wish.form % 3) {
        case 0:
          return {
            type: 'set-component-appearance',
            component,
            appearance: {
              fill: color(0),
              ...(wish.value % 2 === 0 ? { stroke: color(1) } : {}),
              ...(wish.value % 3 === 0 ? { width: 40 + (wish.value % 300) } : {}),
            },
          };
        case 1:
          return {
            type: 'set-component-appearance',
            component,
            appearanceTraits: {
              fill: wish.value % 3 === 0 ? null : color(0),
              stroke: wish.value % 4 === 0 ? null : color(2),
            },
          };
        default:
          return { type: 'set-component-appearance', component, appearance: null };
      }
    }
    case 'relation-type-appearance': {
      const relationType = pick(RELATION_APPEARANCE_TARGETS, wish.at) as Id;
      switch (wish.form % 3) {
        case 0:
          return {
            type: 'set-relation-type-appearance',
            relationType,
            appearance: {
              stroke: pick(COLORS, wish.value) as string,
              ...(wish.value % 2 === 0 ? { dash: 'dashed' as const } : {}),
              ...(wish.value % 3 === 0 ? { width: 1 + (wish.value % 5) } : {}),
            },
          };
        case 1:
          return {
            type: 'set-relation-type-appearance',
            relationType,
            appearanceTraits: {
              stroke: wish.value % 3 === 0 ? null : pick(COLORS, wish.value),
              width: wish.value % 2 === 0 ? null : 2,
            },
          };
        default:
          return { type: 'set-relation-type-appearance', relationType, appearance: null };
      }
    }
    case 'relation-appearance': {
      const relation = pick(relations, wish.relation);
      if (relation === undefined) return undefined;
      const stroke = pick(COLORS, wish.value) as string;
      const changes = [
        { appearance: { stroke, ...(wish.value % 2 === 0 ? { width: 3 } : {}) } },
        {
          appearanceTraits: {
            stroke: wish.value % 3 === 0 ? null : stroke,
            dash: 'dotted' as const,
          },
        },
        { appearance: null },
      ][wish.form % 3] as UpdateRelationCommand['changes'];
      return { type: 'update-relation', id: relation, changes };
    }
    case 'element-appearance': {
      const element = pick([state.model.world.id, ...elements], wish.element) as Id;
      const fill = pick(COLORS, wish.value) as string;
      const changes = [
        { appearance: { fill, ...(wish.value % 2 === 0 ? { shape: 'ellipse' as const } : {}) } },
        { appearanceTraits: { stroke: wish.value % 3 === 0 ? null : fill } },
        { appearance: null },
      ][wish.form % 3] as UpdateElementCommand['changes'];
      return { type: 'update-element', id: element, changes };
    }
    case 'shape-color': {
      const view = pick(state.views, wish.at);
      if (!view) return undefined;
      const color = pick(COLORS, wish.value) as string;
      const kind = wish.arrow ? 'arrow' : 'note';
      const shape = view.freeShapes.find((each) => each.kind === kind);
      if (shape === undefined) {
        return wish.arrow
          ? {
              type: 'create-free-shape',
              view: view.id,
              shape: { kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 40, y: 8 }, stroke: color },
            }
          : undefined;
      }
      const rest = Object.fromEntries(
        Object.entries(shape).filter(([key]) => key !== 'fill' && key !== 'stroke'),
      ) as FreeShape;
      const colors =
        wish.value % 3 === 0
          ? {}
          : shape.kind === 'note'
            ? { fill: color, ...(wish.value % 2 === 0 ? { stroke: color } : {}) }
            : { stroke: color };
      return { type: 'update-free-shape', view: view.id, shape: { ...rest, ...colors } };
    }
    case 'undo':
    case 'redo':
      return undefined;
  }
}

/** Colors the actions set, some written in lower case, which commands store in capitals. */
export const COLORS = ['#112233', '#aabbcc', '#FFFFFF', '#d6336c'];
/** Components whose appearance the actions change: own, built in, and one no package defines. */
export const APPEARANCE_TARGETS = [
  'test.box',
  'test.service',
  'essence',
  'systems.service',
  'systems.ai-agent',
  'nowhere.thing',
];
export const RELATION_APPEARANCE_TARGETS = [
  'test.calls',
  'test.reads',
  'relates-to',
  'systems.writes-to',
  'test.inside',
];

/** A command with every color in it written in lower case. */
export function lowerCased(command: Command): Command {
  return JSON.parse(
    JSON.stringify(command).replace(/#[0-9A-F]{6}/gi, (color) => color.toLowerCase()),
  ) as Command;
}

/** Every anchored shape of a view: an element, and the container it sits in there. */
export function placementsIn(
  state: ProjectSnapshot,
  view: ViewFile,
): { element: Id; container?: Id }[] {
  const types = new Set(nestingTypesInView(state, view));
  const placements: { element: Id; container?: Id }[] = [];
  const visit = (tree: readonly Placement[]) => {
    for (const placement of tree) {
      placements.push({
        element: placement.element,
        ...(placement.container === undefined ? {} : { container: placement.container }),
      });
      visit(placement.contents);
    }
  };
  visit(containmentTree(state.model, (type) => types.has(type)));
  return placements;
}

/** The project's own package, whose definitions the actions change. */
export function ownPackage(state: ProjectSnapshot) {
  const own = state.packages.find((file) => file.id === 'test');
  if (!own) throw new Error('The project lost its own package.');
  return own;
}
