/**
 * What imports say (ADR-0042), gathered for the catalog's tests: every refusal, every reason why
 * something matched nothing and every label the core's readers and the prepared import write, from
 * files made to say them. What the files quote is people's text, so only the reasons are gathered.
 */
import {
  IMPORT_LIMITS,
  planProblems,
  prepareImport,
  readImport,
  suggestMapping,
  type ImportPlan,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { loadSample } from './sample';

/** Files whose reading says each thing a reader can say. */
const FILES: readonly { name: string; text: string }[] = [
  // Mermaid flowcharts.
  {
    name: 'flow.mmd',
    text: [
      '---',
      'title: Checkout',
      '---',
      'flowchart LR',
      '  %%{init: {"theme": "forest"}}%%',
      '  a((A)) -->|x| b[B] --- c[(C)]',
      '  a ~~~ c',
      '  subgraph s [S]',
      '    a',
      '  end',
      '  subgraph t',
      '    s',
      '  end',
      '  subgraph a',
      '    t',
      '  end',
      '  end',
      '  classDef k fill:#fff',
      '  style a fill:#fff',
      '  click a "https://example.com"',
      '  d@{ img: "https://example.com/x.png" }',
      '  a -->',
      `  e["${'x'.repeat(1_200)}"]`,
    ].join('\n'),
  },
  { name: 'open.mmd', text: 'flowchart LR\n  subgraph s\n  a' },
  { name: 'front.mmd', text: '---\ntitle: x\nflowchart LR' },
  { name: 'seq.mmd', text: 'sequenceDiagram\n  A->>B: hi' },
  { name: 'none.mmd', text: '%% nothing' },
  // C4, ER and class diagrams.
  {
    name: 'c4.mmd',
    text: [
      'C4Context',
      'title T',
      'Person(p, "P", $link="https://example.com", $sprite="x")',
      'System_Boundary(b, "B") {',
      '  System(s, "S", "D")',
      '}',
      '}',
      'Rel(p, ghost, "uses")',
      'Rel(p)',
      'UpdateElementStyle(p, $bgColor="red")',
      'UpdateLayoutConfig($c4ShapeInRow="3")',
      'Unknown thing',
      `System(long, "${'y'.repeat(20_000)}")`,
    ].join('\n'),
  },
  { name: 'c4-open.mmd', text: 'C4Context\nSystem_Boundary(b, "B") {' },
  {
    name: 'er.mmd',
    text: [
      'erDiagram',
      '  A ||--o{ B : has',
      '  A {',
      '    string name',
      '    string name',
      '    not an attribute line here',
      '  }',
      '  style A fill:#fff',
      '  nonsense',
    ].join('\n'),
  },
  { name: 'er-open.mmd', text: 'erDiagram\n  A {\n  string x' },
  {
    name: 'class.mmd',
    text: [
      'classDiagram',
      '  note "N"',
      '  click A href "https://example.com"',
      '  cssClass "A" k',
      '  what is this',
    ].join('\n'),
  },
  { name: 'class-open.mmd', text: 'classDiagram\n  class A {\n  +x' },
  { name: 'space-open.mmd', text: 'classDiagram\n  namespace N {\n  class A' },
  // Spreadsheets.
  {
    name: 'model.csv',
    text: [
      'id,name,component,container,,owner,owner,__proto__',
      'a,A,Service,nowhere,x,1,2,3',
      'a,Again,,,,,,',
      ',,,,,only,,',
      '',
      'from,to,kind',
      'a,ghost,calls',
      'a,,calls',
    ].join('\n'),
  },
  { name: 'quote.csv', text: 'name\n"never' },
  { name: 'odd.csv', text: 'owner\nA' },
  { name: 'empty.csv', text: '\n' },
  {
    name: 'rows.csv',
    text: `name\n${'x\n'.repeat(IMPORT_LIMITS.elements + IMPORT_LIMITS.relations + 1_001)}`,
  },
  // JSON.
  { name: 'broken.json', text: '{"elements": [' },
  { name: 'neither.json', text: '{"nodes": []}' },
  {
    name: 'deep.json',
    text: `{"elements":[{"name":"a","attributes":{"x":${'['.repeat(70)}${']'.repeat(70)}}}]}`,
  },
  { name: 'keys.json', text: '{"extra":1,"elements":[{"name":"","color":"red"},{"id":"b"}]}' },
  {
    name: 'simple.json',
    text: JSON.stringify({
      elements: [
        { id: 'a', name: 'A', container: 'nowhere', attributes: { __proto__: 1 } },
        { id: 'a', name: 'Again' },
      ],
      relations: [
        { from: 'a', to: 'ghost' },
        { from: 'a', to: 'a', description: 'D' },
      ],
    }).replace('"attributes":{}', '"attributes":{"__proto__":1}'),
  },
  {
    name: 'model.vamodel',
    text: JSON.stringify({
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'a', component: 'systems.box', name: 'A', appearance: { fill: '#FFFFFF' } },
        { id: 'a', component: 'systems.box', name: 'A' },
      ],
      relations: [
        { id: 'r', relationType: 'relates-to', from: 'a', to: 'world' },
        { id: 'g', relationType: 'relates-to', from: 'a', to: 'ghost' },
        { id: 'b', relationType: 'relates-to', from: 'a', to: 'c' },
        { id: 'c', relationType: 'relates-to', from: 'a', to: 'b' },
        { id: 'd', relationType: 'relates-to', from: 'a', to: 'g' },
        { id: 'd', relationType: 'relates-to', from: 'a', to: 'a' },
      ],
    }),
  },
  {
    name: 'bad.vamodel',
    text: '{"world":{"id":"w","component":"essence","name":"W","appearance":{"fill":"red"}},"elements":[],"relations":[]}',
  },
  { name: 'notes.txt', text: 'Just some words.' },
];

/** Things the same name matches several times, in the project and in a file. */
function twins(state: ProjectSnapshot): ProjectSnapshot {
  return {
    ...state,
    model: {
      ...state.model,
      elements: [
        ...state.model.elements,
        { id: 'twin-1', component: 'systems.box', name: 'Twin' },
        { id: 'twin-2', component: 'systems.box', name: 'Twin' },
      ],
    },
  };
}

/** Every reason, refusal and label imports write, with what wrote it. */
export function importMessages(): { command: string; message: string }[] {
  const said: { command: string; message: string }[] = [];
  const sample = loadSample();
  const project = twins(sample);
  const read = (name: string, text: string, options = {}) => {
    const result = readImport({ name, text }, { project, ...options });
    if (!result.ok) {
      for (const problem of result.problems) said.push({ command: name, message: problem });
      return undefined;
    }
    for (const { why } of result.plan.unmatched) said.push({ command: name, message: why });
    return result.plan;
  };
  for (const { name, text } of FILES) read(name, text);
  read('key.csv', 'name\nA', { key: 'email' });
  read('twins.csv', 'name,owner\nTwin,x', { key: 'name' });
  read('twin-ends.csv', 'from,to\nTwin,A\nX,X\nX,Y', {});
  read('format', '', { format: 'visio' });
  read(
    'many.json',
    JSON.stringify({
      elements: Array.from({ length: IMPORT_LIMITS.elements + 1 }, () => ({ name: 'n' })),
    }),
  );
  read(
    'many.json',
    JSON.stringify({
      relations: Array.from({ length: IMPORT_LIMITS.relations + 1 }, () => ({
        from: 'a',
        to: 'b',
      })),
    }),
  );
  read(
    'many.mmd',
    `flowchart LR\n${Array.from({ length: IMPORT_LIMITS.elements + 1 }, (_, at) => `  n${at}`).join('\n')}`,
  );
  read(
    'chain.mmd',
    `flowchart LR\n${Array.from({ length: IMPORT_LIMITS.relations + 1 }, (_, at) => `  a --> b${at % 3}`).join('\n')}`,
  );
  read(
    'unlisted.mmd',
    `flowchart LR\n${Array.from({ length: 600 }, () => '  click a x').join('\n')}`,
  );
  read('long.json', JSON.stringify({ elements: [{ name: 'n', description: 'd'.repeat(20_000) }] }));
  // The plan's problems, and the prepared import's label and reasons.
  const plan = read(
    'again.csv',
    'from,to,kind\npatient,booking-agent,communicates with',
  ) as ImportPlan;
  const prepared = prepareImport(sample, plan, suggestMapping(sample, plan));
  if (prepared.ok) {
    said.push({ command: 'import', message: prepared.command.label });
    for (const { why } of prepared.plan.unmatched) said.push({ command: 'import', message: why });
  }
  const flow = read('nested.mmd', 'flowchart LR\n  subgraph s\n    a --> b\n  end') as ImportPlan;
  for (const problem of planProblems(sample, flow, {
    elements: { rectangle: 'nope.box' },
    relations: {},
  })) {
    said.push({ command: 'plan', message: problem });
  }
  const many = Array.from({ length: IMPORT_LIMITS.elements + 1 }, (_, at) => ({
    key: `e${at}`,
    name: 'E',
    kind: 'rectangle',
  }));
  const relations = Array.from({ length: IMPORT_LIMITS.relations + 1 }, (_, at) => ({
    key: `r${at}`,
    from: 'e0',
    to: 'e1',
    kind: 'arrow',
  }));
  for (const problem of planProblems(
    sample,
    { ...flow, elements: many, relations, containment: [], views: [] },
    { elements: { rectangle: 'systems.box' }, relations: { arrow: 'relates-to' } },
  )) {
    said.push({ command: 'plan', message: problem });
  }
  for (const problem of planProblems(
    sample,
    {
      ...flow,
      elements: [...flow.elements, flow.elements[0]!],
      relations: [{ key: 'r', from: 'a', to: 'ghost', kind: 'arrow' }],
      containment: [{ element: 'a', container: 'ghost' }],
      views: Array.from({ length: IMPORT_LIMITS.views + 1 }, (_, at) => ({
        key: `v${at}`,
        name: 'V',
        positions:
          at === 0
            ? Array.from({ length: IMPORT_LIMITS.places + 1 }, () => ({ element: 'a', x: 0, y: 0 }))
            : [],
      })),
    },
    { elements: {}, relations: {} },
  )) {
    said.push({ command: 'plan', message: problem });
  }
  return said;
}
