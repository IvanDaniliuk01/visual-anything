/**
 * Property tests for the rules the core enforces. Random sequences of commands, undos and redos run on
 * a project; after every step the project keeps its rules, and every action undoes exactly.
 */
import fc from 'fast-check';
import type { FileKind, Id, LimitList, ViewFile } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { checkProject } from './check';
import {
  executeCommand,
  previewChangeContainer,
  type Command,
  type ContainerChangePreview,
  type UpdateComponentCommand,
  type UpdateRelationTypeCommand,
} from './commands';
import { EMPTY_HISTORY, record, redo, undo, type History } from './history';
import { randomIds } from './ids';
import { containmentCycles, previewDelete } from './rules';
import type { ProjectSnapshot } from './snapshot';
import { containmentTree, type Placement } from './containment';
import { nestingTypesInView } from './containers';
import { definitionsIn, modelIndexOf } from './state';
import { testProject } from './test/fixtures';

const COMPONENTS = ['test.box', 'test.service', 'test.database', 'essence'];
const NESTING = ['test.inside', 'test.part-of'];
const RELATION_TYPES = ['test.calls', 'test.reads', 'test.governs', ...NESTING];

/**
 * The test project with a second relation type that nests, so that containment is attempted across
 * two of them, as views that nest by both would show it.
 */
function propertyProject(): ProjectSnapshot {
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
type Intent =
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
  | { kind: 'collapse'; at: number; picks: number[]; collapsed: boolean }
  | { kind: 'undo' }
  | { kind: 'redo' };

/** Every kind of command, each of which the random actions must manage to apply. */
const COMMAND_TYPES: readonly Command['type'][] = [
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
  'set-collapsed',
  'batch',
];

const index = fc.nat({ max: 1000 });
const intent: fc.Arbitrary<Intent> = fc.oneof(
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
  fc.record({
    kind: fc.constant('collapse'),
    at: index,
    picks: fc.array(index, { minLength: 1, maxLength: 3 }),
    collapsed: fc.boolean(),
  }),
  { arbitrary: fc.constant({ kind: 'undo' as const }), weight: 2 },
  { arbitrary: fc.constant({ kind: 'redo' as const }), weight: 1 },
);

/** Changes to a component's traits and attributes, one of which an intent picks. */
function componentChange(change: number, value: number): UpdateComponentCommand['changes'] {
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
function relationTypeChange(change: number, value: number): UpdateRelationTypeCommand['changes'] {
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

function pick<T>(list: readonly T[], at: number): T | undefined {
  return list.length === 0 ? undefined : list[at % list.length];
}

/** The command an intent stands for in this project, if it can stand for one. */
function commandFor(state: ProjectSnapshot, wish: Intent): Command | undefined {
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
    case 'undo':
    case 'redo':
      return undefined;
  }
}

/** Every anchored shape of a view: an element, and the container it sits in there. */
function placementsIn(state: ProjectSnapshot, view: ViewFile): { element: Id; container?: Id }[] {
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
function ownPackage(state: ProjectSnapshot) {
  const own = state.packages.find((file) => file.id === 'test');
  if (!own) throw new Error('The project lost its own package.');
  return own;
}

/** The rules every project keeps after any sequence of actions. */
function expectRulesKept(state: ProjectSnapshot) {
  expect(checkProject(state).errors).toEqual([]);
  const model = modelIndexOf(state);
  const all = [state.model.world.id, ...state.model.elements.map((element) => element.id)];
  expect(containmentCycles(model, all)).toEqual([]);
  for (const relation of state.model.relations) {
    expect(model.has(relation.from) && model.has(relation.to)).toBe(true);
  }
  // A stacking order is never empty, nor any list in it, and no list names anything twice. Each list
  // is kept for World or an element, and names only elements.
  const elements = new Set(state.model.elements.map((element) => element.id));
  for (const view of state.views) {
    if (!('stackingOrder' in view)) continue;
    const order = view.stackingOrder ?? {};
    expect(Object.keys(order).length).toBeGreaterThan(0);
    for (const [container, list] of Object.entries(order)) {
      expect(container === state.model.world.id || elements.has(container)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
      for (const id of list) expect(elements.has(id)).toBe(true);
    }
  }
  // The containers a view keeps collapsed: never an empty list, sorted, each once, only elements.
  for (const view of state.views) {
    if (!('collapsed' in view)) continue;
    const collapsed = view.collapsed ?? [];
    expect(collapsed.length).toBeGreaterThan(0);
    expect(collapsed).toEqual([...new Set(collapsed)].sort());
    for (const id of collapsed) expect(elements.has(id)).toBe(true);
  }
  // Every value a command set is one the published schema accepts, so every save succeeds. A file an
  // action left alone keeps its object, so each object is checked once.
  const files: [FileKind, object][] = [
    ['model', state.model],
    ...state.packages.map((file): [FileKind, object] => ['package', file]),
    ...state.views.map((view): [FileKind, object] => ['view', view]),
  ];
  for (const [kind, file] of files) {
    if (validated.has(file)) continue;
    expect(validateFile(kind, file)).toEqual({ ok: true, value: file });
    validated.add(file);
  }
}

/** The file contents already found valid. */
const validated = new WeakSet<object>();

describe('the rules of the core', () => {
  it('hold after any sequence of commands, undos and redos, and every action undoes exactly', () => {
    const seen = {
      applied: 0,
      deletes: 0,
      containerChanges: 0,
      undos: 0,
      kinds: new Set<string>(),
    };
    fc.assert(
      fc.property(
        fc.array(intent, { minLength: 10, maxLength: 60 }),
        fc.integer(),
        (wishes, seed) => {
          let random = seed;
          const newId = randomIds(() => {
            random = (random * 1103515245 + 12345) % 2147483648;
            return Math.abs(random) / 2147483648;
          });
          let state = propertyProject();
          let history: History = EMPTY_HISTORY;
          for (const wish of wishes) {
            if (wish.kind === 'undo' || wish.kind === 'redo') {
              const step = (wish.kind === 'undo' ? undo : redo)(state, history);
              if (step) {
                ({ state, history } = step);
                seen.undos += 1;
              }
              expectRulesKept(state);
              continue;
            }
            const command = commandFor(state, wish);
            if (!command) continue;
            const preview = command.type === 'delete' ? previewDelete(state, command) : undefined;
            const containerPreview =
              command.type === 'change-container'
                ? previewChangeContainer(state, command)
                : undefined;
            const outcome = executeCommand(state, command, { newId });
            // A change of container the preview lets through is never refused, and one it stops is.
            if (containerPreview) {
              expect(outcome.ok).toBe(containerPreview.problems.length === 0);
            }
            // Relation type limits only warn: a relation that does not nest, of a relation type
            // that exists, between ends that exist, is never refused.
            const definitions = definitionsIn(state);
            if (
              command.type === 'create-relation' &&
              definitions.relationTypes.has(command.relation.relationType) &&
              !definitions.nestingRelationTypes.has(command.relation.relationType)
            ) {
              expect(outcome.ok).toBe(true);
            }
            if (!outcome.ok) continue;
            const before = state;
            const after = outcome.state;
            expectRulesKept(after);
            if (preview) {
              expectDeletedExactly(before, after, preview);
              seen.deletes += 1;
            }
            if (containerPreview) {
              expectContainerChangedExactly(before, after, containerPreview);
              seen.containerChanges += 1;
            }
            seen.applied += 1;
            seen.kinds.add(command.type);

            const recorded = record(history, {
              label: outcome.label,
              author: 'user',
              operations: outcome.operations,
              inverse: outcome.inverse,
            });
            const undone = undo(after, recorded);
            // Exactly: a key left with an undefined value would not count as undone.
            expect(undone?.state).toStrictEqual(before);
            expect(redo(undone?.state ?? before, undone?.history ?? recorded)?.state).toEqual(
              after,
            );
            state = after;
            history = recorded;
          }
        },
      ),
      { numRuns: 150 },
    );
    // The sequences must do things, not only be refused.
    expect(seen.applied).toBeGreaterThan(1000);
    expect(seen.deletes).toBeGreaterThan(100);
    expect(seen.containerChanges).toBeGreaterThan(20);
    expect(seen.undos).toBeGreaterThan(100);
    // And every kind of command among them.
    expect([...seen.kinds].sort()).toEqual([...COMMAND_TYPES].sort());
    // Thousands of actions: on a loaded machine this takes longer than a test's default 5 seconds.
  }, 60_000);

  it('never lets containment form a cycle, however nesting is attempted', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(index, index), { maxLength: 60 }), (pairs) => {
        let state = propertyProject();
        for (const [from, to] of pairs) {
          const elements = [...state.model.elements.map((element) => element.id)];
          const outcome = executeCommand(state, {
            type: 'create-relation',
            relation: {
              relationType: pick(NESTING, from + to) as Id,
              from: pick(elements, from) as Id,
              to: pick(elements, to) as Id,
            },
          });
          if (outcome.ok) state = outcome.state;
          const all = state.model.elements.map((element) => element.id);
          expect(containmentCycles(modelIndexOf(state), all)).toEqual([]);
          // Putting a shape inside another from the canvas never forms one either.
          const view = state.views[0];
          if (view) {
            const placements = placementsIn(state, view);
            const shape = pick(placements, from);
            const into = pick(elements, to);
            if (shape && into) {
              const moved = executeCommand(state, {
                type: 'change-container',
                view: view.id,
                to: into,
                shapes: [
                  {
                    element: shape.element,
                    ...(shape.container === undefined ? {} : { from: shape.container }),
                  },
                ],
              });
              if (moved.ok) state = moved.state;
              expect(containmentCycles(modelIndexOf(state), all)).toEqual([]);
            }
          }
        }
      }),
    );
  });
});

/** A deletion removes exactly what its preview listed, and keeps every scenario step. */
function expectDeletedExactly(
  before: ProjectSnapshot,
  after: ProjectSnapshot,
  preview: ReturnType<typeof previewDelete>,
) {
  const removedElements = before.model.elements
    .map((element) => element.id)
    .filter((id) => !after.model.elements.some((element) => element.id === id));
  const removedRelations = before.model.relations
    .map((relation) => relation.id)
    .filter((id) => !after.model.relations.some((relation) => relation.id === id));
  expect(removedElements).toEqual(preview.elements);
  expect(removedRelations).toEqual(preview.relations);
  expect(after.scenarios).toEqual(before.scenarios);
  // No stacking list names, or is kept for, something deleted, and the lists lost what the preview said.
  const entries = (state: ProjectSnapshot) =>
    state.views.flatMap((view) =>
      Object.entries(view.stackingOrder ?? {}).flatMap(([container, list]) =>
        list.map((element) => JSON.stringify([view.id, container, element])),
      ),
    );
  const left = new Set(entries(after));
  const gone = entries(before).filter((entry) => !left.has(entry));
  expect(new Set(gone)).toEqual(
    new Set(
      preview.stacking.map((entry) => JSON.stringify([entry.view, entry.container, entry.element])),
    ),
  );
  for (const view of after.views) {
    for (const [container, list] of Object.entries(view.stackingOrder ?? {})) {
      expect(preview.elements).not.toContain(container);
      for (const element of list) expect(preview.elements).not.toContain(element);
    }
  }
  for (const relation of after.model.relations) {
    expect(preview.elements.includes(relation.from) || preview.elements.includes(relation.to)).toBe(
      false,
    );
  }
}

/**
 * A change of container deletes exactly the relations its preview listed, and no element; the steps
 * that played them stay, broken, as the preview said.
 */
function expectContainerChangedExactly(
  before: ProjectSnapshot,
  after: ProjectSnapshot,
  preview: ContainerChangePreview,
) {
  const left = new Set(after.model.relations.map((relation) => relation.id));
  const removed = before.model.relations
    .map((relation) => relation.id)
    .filter((id) => !left.has(id));
  expect(removed).toEqual(preview.relations);
  expect(preview.elements).toEqual([]);
  expect(after.model.elements).toEqual(before.model.elements);
  expect(after.scenarios).toEqual(before.scenarios);
  const gone = new Set(removed);
  const broken = before.scenarios.flatMap((scenario) =>
    scenario.steps
      .filter((step) => step.relations.some((id) => gone.has(id)))
      .map((step) => ({ scenario: scenario.id, step: step.id })),
  );
  expect(preview.brokenSteps).toEqual(broken);
}
