/**
 * The Structurizr reader (ADR-0042, R36): a workspace in JSON becomes a plan whose views are scopes
 * with their manual layout, that applies as one action; hostile workspaces are refused or read safely.
 */
import { describe, expect, it } from 'vitest';
import { shownByScope } from '../scope';
import workspace from './fixtures/big-bank.structurizr.json';
import type { ImportPlan, PlannedView } from './plan';
import { readStructurizr } from './structurizr';
import { applyPlan, optionsFor, planOf, systemsProject } from './test/apply';

const text = JSON.stringify(workspace);
const options = optionsFor(systemsProject());

function read(json: string = text): ImportPlan {
  return planOf(readStructurizr(json, 'big-bank.json', options));
}

function refusal(json: string): string {
  const outcome = readStructurizr(json, 'hostile.json');
  if (outcome.ok) throw new Error('It was read.');
  return outcome.problems.join(' ');
}

function view(plan: ImportPlan, name: string): PlannedView {
  const found = plan.views.find((each) => each.name === name);
  if (!found) throw new Error(`No view "${name}".`);
  return found;
}

describe('readStructurizr', () => {
  const plan = read();

  it('makes people, systems, containers, components, deployment nodes and instances elements of their kinds', () => {
    expect(plan.format).toBe('structurizr');
    expect(plan.elements.map((each) => [each.key, each.name, each.kind])).toEqual([
      ['e:1', 'Personal Banking Customer', 'Person'],
      ['e:2', 'Internet Banking System', 'Software System'],
      ['e:4', 'Web Application', 'Container'],
      ['e:5', 'Single-Page Application', 'Container (WebBrowser)'],
      ['e:6', 'API Application', 'Container'],
      ['e:8', 'Accounts Summary Controller', 'Component'],
      ['e:7', 'Database', 'Container (Cylinder)'],
      ['e:3', 'Mainframe Banking System', 'Software System'],
      ['e:20', 'Big Bank plc', 'Deployment Node'],
      ['e:21', 'bigbank-api***', 'Deployment Node'],
      ['e:22', 'Apache Tomcat', 'Deployment Node'],
      ['e:23', 'API Application', 'Container Instance'],
      ['e:26', 'bigbank-db01', 'Deployment Node'],
      ['e:27', 'Oracle - Primary', 'Deployment Node'],
      ['e:24', 'Database', 'Container Instance (Cylinder)'],
      ['e:28', 'Firewall', 'Infrastructure Node'],
    ]);
    expect(plan.elements.find((each) => each.key === 'e:3')).toMatchObject({
      sourceId: '3',
      description:
        'Stores all of the core banking information about customers, accounts, transactions, etc.',
      attributes: {
        tags: ['Existing System'],
        location: 'Internal',
        url: 'https://example.com/mainframe',
        owner: 'Core banking',
      },
    });
    expect(plan.elements.find((each) => each.key === 'e:23')?.attributes).toEqual({
      environment: 'Live',
      instanceId: 1,
    });
    expect(plan.elements.find((each) => each.key === 'e:6')?.attributes).toEqual({
      technology: 'Java and Spring MVC',
    });
  });

  it('suggests a component for each kind and a relation type for each relationship kind', () => {
    expect(plan.kinds.elements.map((each) => [each.kind, each.count, each.suggested])).toEqual([
      ['Person', 1, 'systems.person'],
      ['Software System', 2, 'systems.system'],
      ['Container', 2, 'systems.service'],
      ['Container (WebBrowser)', 1, 'systems.service'],
      ['Component', 1, 'systems.box'],
      ['Container (Cylinder)', 1, 'systems.database'],
      ['Deployment Node', 5, 'systems.box'],
      ['Container Instance', 1, 'systems.service'],
      ['Container Instance (Cylinder)', 1, 'systems.database'],
      ['Infrastructure Node', 1, 'systems.box'],
    ]);
    expect(plan.kinds.relations.map((each) => [each.kind, each.count, each.suggested])).toEqual([
      ['Relationship', 8, 'systems.communicates-with'],
      ['Relationship (Asynchronous)', 1, 'systems.communicates-with'],
      ['containerId', 2, 'relates-to'],
    ]);
    // A project that uses the C4 starter package gets its components first.
    const c4 = planOf(
      readStructurizr(text, 'big-bank.json', {
        uses: (id) => id.startsWith('c4.') || id.startsWith('systems.'),
      }),
    );
    expect(c4.kinds.elements[0]?.suggested).toBe('c4.person');
    expect(c4.kinds.elements[5]?.suggested).toBe('systems.database');
    expect(c4.kinds.relations[0]?.suggested).toBe('c4.uses');
  });

  it('nests as Structurizr does, and keeps every relationship, implied ones and instances’ too', () => {
    expect(plan.containment).toEqual(
      [
        ['4', '2'],
        ['5', '2'],
        ['6', '2'],
        ['8', '6'],
        ['7', '2'],
        ['21', '20'],
        ['22', '21'],
        ['23', '22'],
        ['26', '20'],
        ['27', '26'],
        ['24', '27'],
        ['28', '26'],
      ].map(([element, container]) => ({ element: `e:${element}`, container: `e:${container}` })),
    );
    expect(plan.relations.map((each) => [each.key, each.from, each.to, each.name])).toEqual([
      ['r:11', 'e:1', 'e:4', 'Visits bigbank.com/ib using'],
      ['r:12', 'e:1', 'e:2', 'Visits bigbank.com/ib using'],
      ['r:18', 'e:2', 'e:3', 'Makes API calls to'],
      ['r:13', 'e:4', 'e:5', "Delivers to the customer's web browser"],
      ['r:14', 'e:5', 'e:6', 'Makes API calls to'],
      ['r:16', 'e:6', 'e:7', 'Reads from and writes to'],
      ['r:17', 'e:6', 'e:3', 'Makes API calls to'],
      ['r:15', 'e:8', 'e:7', 'Reads from and writes to'],
      ['r:25', 'e:23', 'e:24', 'Reads from and writes to'],
      ['instance:23', 'e:23', 'e:6', undefined],
      ['instance:24', 'e:24', 'e:7', undefined],
    ]);
    expect(plan.relations.find((each) => each.key === 'r:14')?.attributes).toEqual({
      technology: 'JSON/HTTPS',
      tags: ['Asynchronous'],
      interactionStyle: 'Asynchronous',
    });
  });

  it('makes each view show what it includes, at half the size, with its vertices as bend points', () => {
    expect(plan.views.map((each) => [each.name, each.shows])).toEqual([
      ['SystemContext', ['e:1', 'e:2', 'e:3']],
      ['Internet Banking System: containers', ['e:1', 'e:3', 'e:4', 'e:5', 'e:6', 'e:7']],
      ['Components', ['e:8', 'e:7']],
      ['SignIn', ['e:5', 'e:6']],
      ['LiveDeployment', ['e:20', 'e:21', 'e:22', 'e:23', 'e:26', 'e:27', 'e:24', 'e:28']],
      ['ContainersWithoutTheDatabase', ['e:1', 'e:3', 'e:4', 'e:5', 'e:6']],
    ]);
    const context = view(plan, 'SystemContext');
    expect(context.positions).toEqual([
      { element: 'e:1', x: 100, y: 50, width: 200, height: 200 },
      { element: 'e:2', x: 100, y: 350, width: 225, height: 150 },
      { element: 'e:3', x: 500, y: 350, width: 225, height: 150 },
    ]);
    expect(context.bendPoints).toEqual([{ relation: 'r:18', points: [{ x: 400, y: 425 }] }]);
    // A view laid out automatically keeps no positions of its own.
    expect(view(plan, 'Components').positions).toBeUndefined();
    // Containers in a view are drawn around what they hold, with room for their names.
    expect(view(plan, 'LiveDeployment').positions).toEqual([
      { element: 'e:20', x: 28, y: -44, width: 719, height: 592 },
      { element: 'e:21', container: 'e:20', x: 24, y: 48, width: 321, height: 294 },
      { element: 'e:22', container: 'e:21', x: 24, y: 48, width: 273, height: 222 },
      { element: 'e:23', container: 'e:22', x: 24, y: 48, width: 225, height: 150 },
      { element: 'e:26', container: 'e:20', x: 374, y: 48, width: 321, height: 520 },
      { element: 'e:27', container: 'e:26', x: 24, y: 48, width: 273, height: 222 },
      { element: 'e:24', container: 'e:27', x: 24, y: 48, width: 225, height: 150 },
      { element: 'e:28', container: 'e:26', x: 48, y: 346, width: 225, height: 150 },
    ]);
    expect(view(plan, 'ContainersWithoutTheDatabase').positions).toHaveLength(5);
  });

  it('reports what matched nothing: relationships a view leaves out, dynamic order, images and documentation', () => {
    expect(plan.unmatched).toEqual([
      {
        text: 'Internet Banking System: containers',
        why: 'A relationship between what the view shows is not in it, but a view shows every relation between what it shows.',
      },
      {
        text: 'SignIn',
        why: 'The order of its steps is left out; a scenario can be recorded over the view.',
      },
      { text: 'Orphan', why: 'Its base view "Missing" is not in the workspace.' },
      { text: 'Logo', why: 'Image views are left out: images in imports are left out.' },
      { text: 'documentation', why: 'Documentation and decisions are left out.' },
    ]);
  });

  it('applies as one action that one undo takes back, each view a scope with its positions', () => {
    const { state, ids } = applyPlan(systemsProject(), plan);
    expect(ids.get('e:2')).toBe('2');
    const live = state.views.find((each) => each.id === ids.get('view:5'))!;
    expect(live.name).toBe('LiveDeployment');
    expect(shownByScope(state, live).elements).toHaveLength(9);
    expect(live.positions).toContainEqual({
      element: '23',
      container: '22',
      x: 24,
      y: 48,
      width: 225,
      height: 150,
      pinned: true,
    });
    const context = state.views.find((each) => each.id === ids.get('view:1'))!;
    expect(shownByScope(state, context).relation('12')).toBe(true);
    expect(shownByScope(state, context).relation('11')).toBe(false);
    expect(context.routes?.['18']?.bendPoints).toEqual([{ x: 400, y: 425 }]);
    expect(state.model.elements.find((each) => each.id === '7')?.component).toBe(
      'systems.database',
    );
  });
});

describe('readStructurizr, on hostile workspaces', () => {
  it('refuses what is not a workspace, with where it is wrong', () => {
    expect(refusal('{')).toBe('The file is not JSON.');
    expect(refusal('[]')).toBe('The workspace\'s "(the file)" is not what Structurizr writes.');
    expect(refusal('{"views": {}}')).toBe(
      'The file is not a Structurizr workspace: it has no model.',
    );
    expect(refusal('{"model": {"people": [{"id": "1", "name": {}}]}}')).toBe(
      'The workspace\'s "model.people[0].name" is not what Structurizr writes.',
    );
    expect(
      refusal('{"model": {"people": [{"id": "1", "name": "A"}, {"id": "1", "name": "B"}]}}'),
    ).toBe('The workspace holds the id "1" twice.');
    expect(refusal('{"model": {"softwareSystems": {"id": "1"}}}')).toBe(
      'The workspace\'s "model.softwareSystems" is not what Structurizr writes.',
    );
    const deep = (depth: number): string =>
      depth === 0 ? '[]' : `[{"id": "n${depth}", "name": "N", "children": ${deep(depth - 1)}}]`;
    expect(refusal(`{"model": {"deploymentNodes": ${deep(65)}}}`)).toBe(
      'The workspace nests its deployment over 64 levels deep.',
    );
  });

  it('reads a relationship to an id that does not exist as matching nothing', () => {
    const plan = read(
      JSON.stringify({
        model: {
          people: [
            {
              id: 'p',
              name: 'P',
              relationships: [
                { id: 'r', sourceId: 'p', destinationId: 'ghost', description: 'Uses' },
              ],
            },
          ],
        },
      }),
    );
    expect(plan.relations).toEqual([]);
    expect(plan.unmatched).toEqual([
      { text: 'Uses', why: 'It ends on "ghost", which the workspace does not hold.' },
    ]);
  });

  it('keeps names as plain text and never finds what every object inherits, by a tag or a property', () => {
    // Written out, since an object literal would take __proto__ as its prototype.
    const plan = read(
      '{"model": {"people": [{"id": "p", "name": "<script>alert(1)</script>\u202E Mallory", ' +
        '"tags": "Element,Person,__proto__,constructor", ' +
        '"properties": {"__proto__": "x", "constructor": "y", "toString": "z"}, ' +
        '"url": "javascript:alert(1)"}], ' +
        '"customElements": [{"id": "c", "name": "C", "tags": "Element,toString"}]}, ' +
        '"views": {"configuration": {"styles": {"elements": ' +
        '[{"tag": "constructor", "shape": "Hexagon"}, {"tag": "__proto__"}]}}}}',
    );
    const [person, custom] = plan.elements as [
      ImportPlan['elements'][0],
      ImportPlan['elements'][0],
    ];
    expect(person.name).toBe('<script>alert(1)</script> Mallory');
    expect(person.kind).toBe('Person (Hexagon)');
    const attributes = person.attributes as Record<string, unknown>;
    expect(Object.keys(attributes)).toEqual(['tags', '__proto__', 'constructor', 'toString']);
    expect(attributes.tags).toEqual(['__proto__', 'constructor']);
    expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
    expect(custom.kind).toBe('Custom Element');
    expect(plan.unmatched).toEqual([
      { text: 'javascript:alert(1)', why: 'A link that is not a web address is left out.' },
    ]);
    const { state } = applyPlan(systemsProject(), plan);
    expect(
      Object.hasOwn(
        state.model.elements.find((each) => each.id === 'p')?.attributes ?? {},
        '__proto__',
      ),
    ).toBe(true);
  });
});

describe('readStructurizr, on workspaces at the limits', () => {
  /** A workspace of people in a chain of relationships, with these views. */
  function large(count: number, views: object): string {
    const people = Array.from({ length: count }, (_, at) => ({
      id: `p${at}`,
      name: `Person ${at}`,
      tags: 'Element,Person',
      ...(at + 1 < count
        ? { relationships: [{ id: `r${at}`, sourceId: `p${at}`, destinationId: `p${at + 1}` }] }
        : {}),
    }));
    return JSON.stringify({ model: { people }, views });
  }

  it('reads a view of 20,000 elements and hundreds of filtered views of it, within the shapes views may show', () => {
    const all = {
      key: 'Everyone',
      elements: Array.from({ length: 20_000 }, (_, at) => ({ id: `p${at}`, x: at, y: at })),
      relationships: [],
    };
    const filtered = Array.from({ length: 600 }, (_, at) => ({
      key: `Filtered ${at}`,
      baseViewKey: 'Everyone',
      mode: 'Exclude',
      tags: ['Nobody has this tag'],
    }));
    const text = large(20_000, { systemLandscapeViews: [all], filteredViews: filtered });
    const started = Date.now();
    const plan = read(text);
    const elapsed = Date.now() - started;
    // The base view and nine filtered views show 200,000 shapes; the rest are left out and reported.
    expect(plan.views).toHaveLength(10);
    expect(plan.views.reduce((sum, each) => sum + (each.shows?.length ?? 0), 0)).toBe(200_000);
    expect(plan.unmatched[0]).toEqual({
      text: 'Everyone',
      why: '19,999 relationships between what the view shows are not in it, but a view shows every relation between what it shows.',
    });
    expect(plan.unmatched.filter((each) => each.why.startsWith('The view is left out'))[0]).toEqual(
      {
        text: 'Filtered 9',
        why: 'The view is left out: the views would show over 200,000 shapes in all.',
      },
    );
    // A pass per view over every relationship, and filtering every filtered view, would take minutes.
    expect(elapsed).toBeLessThan(10_000);
  }, 60_000);

  it('brings at most 500 views, and refuses past the elements an import brings', () => {
    const views = Array.from({ length: 501 }, (_, at) => ({
      key: `View ${at}`,
      elements: [{ id: `p${at % 10}` }],
    }));
    const plan = read(large(10, { systemLandscapeViews: views }));
    expect(plan.views).toHaveLength(500);
    expect(plan.unmatched.at(-1)).toEqual({
      text: 'View 500',
      why: 'The view is left out: an import brings at most 500 views.',
    });
    expect(refusal(large(20_001, {}))).toBe(
      'The file holds 20,001 elements; an import brings at most 20,000.',
    );
  }, 60_000);
});
