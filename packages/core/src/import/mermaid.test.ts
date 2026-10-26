/**
 * The Mermaid reader (ADR-0042): flowcharts, C4, ER and class diagrams become plans of elements,
 * relations, containment and one view; node shapes, classes, macros and edge styles become kinds with
 * the built-in suggestions; labels become plain text; and what it does not read, such as styles, links
 * and callbacks, is reported, never followed.
 */
import { describe, expect, it } from 'vitest';
import { IMPORT_LIMITS, type ImportPlan, type PlannedElement } from './plan';
import { C4, CLASSES, ER, FLOWCHART, HOSTILE } from './fixtures/mermaid';
import { MERMAID, readMermaid } from './mermaid';
import { MAX_IMPORTED_NAME } from './text';
import { systemsProject } from './fixtures/projects';
import { cpuNow } from '../test/cpu';

function read(text: string, name = 'diagram.mmd'): ImportPlan {
  const result = readMermaid({ name, text });
  if (!result.ok) throw new Error(result.problems.join(' '));
  return result.plan;
}

function element(plan: ImportPlan, key: string): PlannedElement {
  const found = plan.elements.find((each) => each.key === key);
  if (found === undefined) throw new Error(`No element "${key}".`);
  return found;
}

/** Each relation as from, to, kind and name. */
function relations(plan: ImportPlan): [string, string, string, string?][] {
  return plan.relations.map((relation) => [
    relation.from,
    relation.to,
    relation.kind,
    ...(relation.name === undefined ? [] : [relation.name]),
  ]) as [string, string, string, string?][];
}

function kinds(plan: ImportPlan, of: 'elements' | 'relations') {
  return Object.fromEntries(
    plan.kinds[of].map((kind) => [
      kind.kind,
      { label: kind.label, count: kind.count, suggested: kind.suggested },
    ]),
  );
}

describe('a Mermaid flowchart', () => {
  const plan = read(FLOWCHART, 'checkout.mmd');

  it('reads its nodes in the order they first appear, with plain names and kinds', () => {
    expect(plan.format).toBe('mermaid-flowchart');
    expect(plan.source).toBe('checkout.mmd');
    expect(plan.elements.map((each) => [each.key, each.name, each.kind])).toEqual([
      ['shopper', 'Shopper', 'circle'],
      ['web', 'Web shop', 'rectangle'],
      ['cart', 'Cart service', 'class:service'],
      ['stock', 'Stock DB', 'cylinder'],
      ['pay', 'Payment provider', 'hexagon'],
      ['backend', 'Back end', 'subgraph'],
      ['worker', 'Order worker', 'class:service'],
    ]);
    expect(element(plan, 'stock').sourceId).toBe('stock');
  });

  it('turns a subgraph into containment, for what it mentions', () => {
    expect(plan.containment).toEqual([
      { element: 'cart', container: 'backend' },
      { element: 'stock', container: 'backend' },
      { element: 'worker', container: 'backend' },
    ]);
  });

  it('reads edges in each of their forms, chains and groups, with their labels as names', () => {
    expect(relations(plan)).toEqual([
      ['shopper', 'web', 'arrow', 'browses'],
      ['web', 'cart', 'arrow'],
      ['cart', 'stock', 'arrow', 'reads'],
      ['cart', 'pay', 'thick-arrow'],
      ['pay', 'worker', 'dotted-arrow'],
      ['pay', 'web', 'dotted-arrow'],
      ['worker', 'stock', 'line'],
    ]);
  });

  it('offers each kind with how the file writes it, how often, and a built-in suggestion', () => {
    expect(kinds(plan, 'elements')).toEqual({
      circle: { label: '(( ))', count: 1, suggested: 'systems.box' },
      rectangle: { label: '[ ]', count: 1, suggested: 'systems.box' },
      'class:service': { label: ':::service', count: 2, suggested: 'systems.service' },
      cylinder: { label: '[( )]', count: 1, suggested: 'systems.database' },
      hexagon: { label: '{{ }}', count: 1, suggested: 'systems.box' },
      subgraph: { label: 'subgraph', count: 1, suggested: 'systems.system' },
    });
    expect(kinds(plan, 'relations')).toEqual({
      arrow: { label: '-->', count: 3, suggested: 'systems.communicates-with' },
      'thick-arrow': { label: '==>', count: 1, suggested: 'systems.communicates-with' },
      'dotted-arrow': { label: '-.->', count: 2, suggested: 'systems.communicates-with' },
      line: { label: '---', count: 1, suggested: 'relates-to' },
    });
  });

  it('makes one view named by its title that shows what it holds', () => {
    expect(plan.views).toEqual([
      {
        key: 'view',
        name: 'Checkout',
        shows: ['shopper', 'web', 'cart', 'stock', 'pay', 'backend', 'worker'],
      },
    ]);
  });

  it('reports the styles and the link it does not read or follow, quoting them', () => {
    expect(plan.unmatched).toEqual([
      {
        text: 'classDef service fill:#dfe,stroke:#363',
        why: 'Styles are not read: the components’ appearances draw the shapes.',
      },
      {
        text: 'click pay "https://pay.example.com" "Open the provider"',
        why: 'Web addresses and callbacks are never followed.',
      },
      {
        text: 'style web fill:#ffd',
        why: 'Styles are not read: the components’ appearances draw the shapes.',
      },
    ]);
  });

  it('reads graph, directions, semicolons, edge ids, long arrows and every head', () => {
    const more = read(
      [
        'graph TD;',
        '  a-->b; b---c',
        '  c e1@==> d',
        '  d <--> e',
        '  e --o f',
        '  f --x g',
        '  g ----> h',
        '  h -.- i',
        '  i -. maybe .-> j',
        '  j == sure ==> k',
        '  k ~~~ l',
        '  m["A &quot;quoted&quot; name"] --> n>Flag]',
        '  o{Decide?} --> p[/In/] & q[\\Out\\] & r[/Wide\\] & s[\\Narrow/]',
        '  t([Stadium]) --> u(((Twice)))',
      ].join('\n'),
    );
    expect(relations(more)).toEqual([
      ['a', 'b', 'arrow'],
      ['b', 'c', 'line'],
      ['c', 'd', 'thick-arrow'],
      ['d', 'e', 'both'],
      ['e', 'f', 'circle'],
      ['f', 'g', 'cross'],
      ['g', 'h', 'arrow'],
      ['h', 'i', 'dotted-line'],
      ['i', 'j', 'dotted-arrow', 'maybe'],
      ['j', 'k', 'thick-arrow', 'sure'],
      ['m', 'n', 'arrow'],
      ['o', 'p', 'arrow'],
      ['o', 'q', 'arrow'],
      ['o', 'r', 'arrow'],
      ['o', 's', 'arrow'],
      ['t', 'u', 'arrow'],
    ]);
    expect(more.relations[2]?.sourceId).toBe('e1');
    expect(element(more, 'm').name).toBe('A "quoted" name');
    expect(['n', 'o', 'p', 'q', 'r', 's', 't', 'u'].map((key) => element(more, key).kind)).toEqual([
      'asymmetric',
      'rhombus',
      'parallelogram',
      'parallelogram-alt',
      'trapezoid',
      'trapezoid-alt',
      'stadium',
      'double-circle',
    ]);
    // An invisible line only spaces shapes out: it brings no relation, and says so.
    expect(more.unmatched).toContainEqual({
      text: 'k ~~~ l',
      why: 'An invisible line only spaces shapes out, so it brings no relation.',
    });
    expect(more.elements.map((each) => each.key)).toContain('l');
  });

  it('nests subgraphs, and a node goes to the first subgraph that mentions it', () => {
    const nested = read(
      [
        'flowchart TB',
        '  subgraph outer["Outer one"]',
        '    direction LR',
        '    subgraph inner',
        '      a --> b',
        '    end',
        '    c',
        '  end',
        '  subgraph Other title',
        '    a',
        '  end',
        '  outer --> c',
      ].join('\n'),
    );
    expect(nested.containment).toEqual([
      { element: 'inner', container: 'outer' },
      { element: 'a', container: 'inner' },
      { element: 'b', container: 'inner' },
      { element: 'c', container: 'outer' },
    ]);
    expect(element(nested, 'outer').name).toBe('Outer one');
    // A subgraph named by a title alone gets an id made of it, and holds only what is new to it.
    expect(element(nested, 'Other title').kind).toBe('subgraph');
    expect(nested.relations.map((each) => [each.from, each.to])).toContainEqual(['outer', 'c']);
  });

  it('refuses a subgraph that never ends, and reports an end with no subgraph', () => {
    const open = readMermaid({
      name: 'x.mmd',
      text: 'flowchart LR\n  subgraph one\n    a --> b\n',
    });
    expect(open).toEqual({
      ok: false,
      problems: ['The subgraph "one" that starts on line 2 never ends.'],
    });
    const loose = read('flowchart LR\n  a --> b\n  end\n');
    expect(loose.unmatched).toContainEqual({
      text: 'end',
      why: 'This line ends no subgraph, so it is not read.',
    });
  });

  it('keeps a node out of a subgraph it would hold, so that nothing sits inside itself', () => {
    const cycle = read(
      ['flowchart LR', '  subgraph a', '    b', '  end', '  subgraph b', '    a', '  end'].join(
        '\n',
      ),
    );
    expect(cycle.containment).toEqual([{ element: 'b', container: 'a' }]);
    expect(cycle.unmatched).toContainEqual({
      text: 'a',
      why: 'It would sit inside "b", which sits inside it, so it stays where it was.',
    });
  });

  it('reads the new shape syntax and reports its images', () => {
    const shapes = read(HOSTILE);
    expect(element(shapes, 'E')).toMatchObject({ name: 'Stock DB', kind: 'cylinder' });
    expect(element(shapes, 'F')).toMatchObject({ name: 'Logo', kind: 'rectangle' });
    expect(shapes.unmatched).toContainEqual({
      text: 'F@{ img: "https://example.com/logo.png", label: "Logo" }',
      why: 'Images in imports are left out; a component’s own image shows instead.',
    });
    const other = read('flowchart LR\n  d@{ shape: doc, label: "Spec" } --> e@{shape: rounded}');
    expect(kinds(other, 'elements')).toEqual({
      'shape:doc': { label: '@{ shape: doc }', count: 1, suggested: undefined },
      round: { label: '( )', count: 1, suggested: 'systems.box' },
    });
  });
});

describe('a Mermaid C4 diagram', () => {
  const plan = read(C4, 'clinic.mmd');

  it('reads people, systems, containers and boundaries, with technologies and descriptions', () => {
    expect(plan.format).toBe('mermaid-c4');
    expect(
      plan.elements.map((each) => [each.key, each.name, each.kind, each.description ?? '']),
    ).toEqual([
      ['patient', 'Patient', 'Person', 'Books appointments over WhatsApp.'],
      ['whatsapp', 'WhatsApp', 'System_Ext', "Meta's messaging service."],
      ['booking', 'Booking system', 'System_Boundary', ''],
      ['agent', 'Booking agent', 'Container', 'Answers patients and books slots.'],
      ['db', 'Appointments DB', 'ContainerDb', 'Holds slots and bookings.'],
      ['api', 'Appointments API', 'Container', 'Books and frees slots.'],
    ]);
    expect(element(plan, 'agent').attributes).toEqual({ technology: 'Python, Claude' });
    expect(element(plan, 'db').attributes).toEqual({ technology: 'PostgreSQL' });
    expect(plan.containment).toEqual([
      { element: 'agent', container: 'booking' },
      { element: 'db', container: 'booking' },
      { element: 'api', container: 'booking' },
    ]);
    expect(plan.views[0]?.name).toBe("Containers of the clinic's booking system");
  });

  it('reads relationships, turning Rel_Back around, with their technology', () => {
    expect(relations(plan)).toEqual([
      ['patient', 'whatsapp', 'Rel', 'Sends messages'],
      ['whatsapp', 'agent', 'Rel', 'Forwards messages'],
      ['agent', 'api', 'BiRel', 'Books slots'],
      ['api', 'db', 'Rel', 'Reads and writes'],
    ]);
    expect(plan.relations[3]?.attributes).toEqual({ technology: 'SQL' });
  });

  it('suggests the C4 starter package for each macro, told nothing of the project', () => {
    expect(kinds(plan, 'elements')).toEqual({
      Person: { label: 'Person', count: 1, suggested: 'c4.person' },
      System_Ext: { label: 'System_Ext', count: 1, suggested: 'c4.software-system' },
      System_Boundary: { label: 'System_Boundary', count: 1, suggested: 'c4.software-system' },
      Container: { label: 'Container', count: 2, suggested: 'c4.container' },
      ContainerDb: { label: 'ContainerDb', count: 1, suggested: 'systems.database' },
    });
    expect(kinds(plan, 'relations')).toEqual({
      Rel: { label: 'Rel', count: 3, suggested: 'c4.uses' },
      BiRel: { label: 'BiRel', count: 1, suggested: 'c4.uses' },
    });
  });

  it('suggests what the project uses, when told the project', () => {
    const result = readMermaid({ name: 'clinic.mmd', text: C4 }, { project: systemsProject() });
    if (!result.ok) throw new Error(result.problems.join(' '));
    expect(kinds(result.plan, 'elements').Person?.suggested).toBe('systems.person');
    expect(kinds(result.plan, 'elements').Container?.suggested).toBe('systems.service');
    expect(kinds(result.plan, 'relations').Rel?.suggested).toBe('systems.communicates-with');
  });

  it('reports links, styles and layout it does not follow or read', () => {
    expect(plan.unmatched).toEqual([
      {
        text: '$link="https://example.com/api"',
        why: 'Web addresses and callbacks are never followed.',
      },
      {
        text: 'UpdateRelStyle(patient, whatsapp, $textColor="blue")',
        why: 'Styles are not read: the components’ appearances draw the shapes.',
      },
      {
        text: 'UpdateLayoutConfig($c4ShapeInRow="3")',
        why: 'Layout settings are not read: Visual Anything lays the view out itself.',
      },
    ]);
  });

  it('refuses a boundary that never closes', () => {
    expect(
      readMermaid({
        name: 'x.mmd',
        text: 'C4Context\nSystem_Boundary(b, "B") {\n System(s, "S")\n',
      }),
    ).toEqual({ ok: false, problems: ['The boundary "b" that starts on line 2 never ends.'] });
  });
});

describe('a Mermaid ER diagram', () => {
  const plan = read(ER, 'shop.mmd');

  it('reads entities as tables and their attributes as columns inside them', () => {
    expect(plan.format).toBe('mermaid-er');
    expect(plan.elements.filter((each) => each.kind === 'entity').map((each) => each.key)).toEqual([
      'CUSTOMER',
      'ORDER',
      'LINE-ITEM',
      'DELIVERY-ADDRESS',
      'INVOICE',
    ]);
    expect(element(plan, 'CUSTOMER.name')).toEqual({
      key: 'CUSTOMER.name',
      sourceId: 'CUSTOMER.name',
      name: 'name',
      kind: 'attribute',
      description: 'The full name',
      attributes: { type: 'string' },
    });
    expect(element(plan, 'CUSTOMER.custNumber').attributes).toEqual({
      type: 'string',
      primaryKey: true,
    });
    expect(element(plan, 'LINE-ITEM.productCode').attributes).toEqual({
      type: 'string',
      primaryKey: true,
      foreignKey: true,
    });
    expect(element(plan, 'DELIVERY-ADDRESS.street').attributes).toEqual({
      type: 'string',
      unique: true,
    });
    expect(plan.containment).toContainEqual({
      element: 'ORDER.deliveryAddress',
      container: 'ORDER',
    });
  });

  it('reads relationships with their cardinalities, in symbols and in words', () => {
    expect(relations(plan)).toEqual([
      ['CUSTOMER', 'ORDER', 'identifying', 'places'],
      ['ORDER', 'LINE-ITEM', 'identifying', 'contains'],
      ['CUSTOMER', 'DELIVERY-ADDRESS', 'non-identifying', 'uses'],
      ['CUSTOMER', 'INVOICE', 'identifying', 'is billed'],
    ]);
    expect(plan.relations.map((each) => each.attributes)).toEqual([
      { fromCardinality: 'exactly one', toCardinality: 'zero or more' },
      { fromCardinality: 'exactly one', toCardinality: 'one or more' },
      { fromCardinality: 'one or more', toCardinality: 'one or more' },
      { fromCardinality: 'exactly one', toCardinality: 'zero or more' },
    ]);
  });

  it('suggests tables, columns and references', () => {
    expect(kinds(plan, 'elements')).toEqual({
      entity: { label: 'ENTITY { }', count: 5, suggested: 'data-modeling.table' },
      attribute: { label: 'type name', count: 9, suggested: 'data-modeling.column' },
    });
    expect(kinds(plan, 'relations')).toEqual({
      identifying: { label: '--', count: 3, suggested: 'data-modeling.references' },
      'non-identifying': { label: '..', count: 1, suggested: 'data-modeling.references' },
    });
  });
});

describe('a Mermaid class diagram', () => {
  const plan = read(CLASSES, 'farm.mmd');

  it('reads classes with their labels, generics, annotations and members', () => {
    expect(plan.format).toBe('mermaid-class');
    expect(plan.elements.map((each) => [each.key, each.name, each.kind])).toEqual([
      ['Animal', 'Animal', 'annotation:abstract'],
      ['Duck', 'Duck of the pond', 'class'],
      ['Pond', 'Pond<T>', 'class'],
      ['Fish', 'Fish', 'class'],
      ['Egg', 'Egg', 'class'],
      ['Swimmer', 'Swimmer', 'annotation:interface'],
      ['Water', 'Water', 'namespace'],
    ]);
    expect(element(plan, 'Animal').attributes).toEqual({
      members: ['+String name', '+int age', '+makeSound() void', '+isMammal() bool'],
    });
    expect(plan.containment).toEqual([
      { element: 'Fish', container: 'Water' },
      { element: 'Pond', container: 'Water' },
    ]);
    expect(plan.views[0]?.name).toBe('farm');
  });

  it('reads each kind of relationship, toward the end it points at, with multiplicities', () => {
    expect(relations(plan)).toEqual([
      ['Duck', 'Animal', 'inheritance'],
      ['Fish', 'Animal', 'inheritance', 'is a'],
      ['Duck', 'Egg', 'aggregation', 'lays'],
      ['Pond', 'Duck', 'composition'],
      ['Duck', 'Pond', 'dependency', 'swims in'],
      ['Duck', 'Swimmer', 'realization'],
    ]);
    expect(plan.relations[2]?.attributes).toEqual({ fromMultiplicity: '1', toMultiplicity: '*' });
    expect(kinds(plan, 'relations').inheritance).toEqual({
      label: '<|--',
      count: 2,
      suggested: undefined,
    });
  });

  it('reports notes, links and callbacks', () => {
    expect(plan.unmatched).toEqual([
      {
        text: 'note "Animals of the farm"',
        why: 'Notes are not read: add notes on the canvas instead.',
      },
      {
        text: 'click Duck href "https://example.com/duck"',
        why: 'Web addresses and callbacks are never followed.',
      },
      {
        text: 'link Fish "https://example.com/fish"',
        why: 'Web addresses and callbacks are never followed.',
      },
      {
        text: 'callback Animal "showAnimal"',
        why: 'Web addresses and callbacks are never followed.',
      },
    ]);
  });
});

describe('hostile Mermaid', () => {
  it('turns HTML, script tags and entities in labels into plain text, and runs nothing', () => {
    const plan = read(HOSTILE);
    expect(plan.elements.slice(0, 4).map((each) => each.name)).toEqual([
      'Bold name',
      'Pic',
      '"quoted" & #hash',
      'D',
    ]);
    expect(plan.relations[2]?.name).toBe('link');
    expect(plan.unmatched).toContainEqual({
      text: '%%{init: {"securityLevel": "loose"}}%%',
      why: 'Directives are not read.',
    });
    expect(plan.unmatched).toContainEqual({
      text: 'click A call alert("x")',
      why: 'Web addresses and callbacks are never followed.',
    });
  });

  it('cuts a label of a megabyte to a name, and says so', () => {
    const plan = read(`flowchart LR\n  a["${'x'.repeat(1024 * 1024)}"] --> b`);
    expect(Array.from(element(plan, 'a').name)).toHaveLength(MAX_IMPORTED_NAME);
    expect(plan.unmatched).toContainEqual({
      text: `${'x'.repeat(119)}…`,
      why: 'The name is over 1,000 characters; it is cut there.',
    });
  });

  it('refuses more elements than an import brings, without reading on', () => {
    const lines = ['flowchart LR'];
    for (let at = 0; at <= IMPORT_LIMITS.elements; at++) lines.push(`  n${at}`);
    const start = cpuNow();
    expect(readMermaid({ name: 'big.mmd', text: lines.join('\n') })).toEqual({
      ok: false,
      problems: ['The file holds more than 20,000 elements; an import brings at most 20,000.'],
    });
    expect(cpuNow() - start).toBeLessThan(5_000);
  });

  it('reads 20,000 nodes and their edges in a few seconds at most', () => {
    const lines = ['flowchart LR'];
    for (let at = 1; at < IMPORT_LIMITS.elements; at++) lines.push(`  n${at - 1} --> n${at}`);
    const start = cpuNow();
    const plan = read(lines.join('\n'));
    expect(cpuNow() - start).toBeLessThan(5_000);
    expect(plan.elements).toHaveLength(IMPORT_LIMITS.elements);
    expect(plan.relations).toHaveLength(IMPORT_LIMITS.elements - 1);
  });

  it('reads lines made to make patterns backtrack quickly, reporting those too long to read', () => {
    const long = 1024 * 1024;
    const texts = [
      `classDiagram\n  ${'o'.repeat(long)}`,
      `classDiagram\n  class A${' '.repeat(long)}x`,
      `classDiagram\n  <<${' '.repeat(long)}x`,
      `classDiagram\n  class A["${'x'.repeat(10_000)}"]${' '.repeat(6_000)}x`,
      `erDiagram\n  A {\n    string name${' ,'.repeat(long / 2)}x\n  }`,
      `erDiagram\n  A {${' '.repeat(10_000)}x`,
      `C4Context\n  System(a, "A")${' '.repeat(10_000)}x`,
      `C4Context\n  Rel(${'a'.repeat(long)}`,
      `flowchart LR\n  a@{ label: x${' '.repeat(long)}y }`,
      `flowchart LR\n  a -- ${'-'.repeat(long)}`,
      `flowchart LR\n  a ${'-.'.repeat(long / 2)}`,
    ];
    for (const text of texts) {
      const start = cpuNow();
      readMermaid({ name: 'hostile.mmd', text });
      expect(cpuNow() - start, text.slice(0, 40)).toBeLessThan(2_000);
    }
    const tooLong = read(`classDiagram\n  class A["${'x'.repeat(20_000)}"]`);
    expect(tooLong.unmatched[0]?.why).toBe(
      'This line is longer than 16,384 characters, so it is not read.',
    );
  });

  it('refuses diagrams it does not read, and text that holds none', () => {
    expect(readMermaid({ name: 's.mmd', text: 'sequenceDiagram\n  A->>B: hi' })).toEqual({
      ok: false,
      problems: [
        '"sequenceDiagram" diagrams are not read: Visual Anything reads Mermaid flowcharts, and C4, ER and class diagrams.',
      ],
    });
    expect(readMermaid({ name: 'e.mmd', text: '  \n%% only a comment\n' })).toEqual({
      ok: false,
      problems: ['The text holds no Mermaid diagram.'],
    });
  });

  it('reports a line it cannot read, and reads on', () => {
    const plan = read('flowchart LR\n  a --> b\n  a -->\n  c --> d');
    expect(plan.unmatched).toEqual([
      { text: 'a -->', why: 'This line is not read: it is not a shape, an arrow or a subgraph.' },
    ]);
    expect(relations(plan)).toEqual([
      ['a', 'b', 'arrow'],
      ['c', 'd', 'arrow'],
    ]);
  });
});

describe('the Mermaid reader', () => {
  it('recognizes Mermaid by its name or its first keyword', () => {
    expect(MERMAID.recognizes({ name: 'x.mmd', text: '' })).toBe(true);
    expect(MERMAID.recognizes({ name: 'pasted', text: '%% hi\nflowchart LR\n a-->b' })).toBe(true);
    expect(MERMAID.recognizes({ name: 'pasted', text: 'erDiagram\n A ||--o{ B : has' })).toBe(true);
    expect(MERMAID.recognizes({ name: 'pasted', text: 'name,component\nA,B' })).toBe(false);
  });
});
