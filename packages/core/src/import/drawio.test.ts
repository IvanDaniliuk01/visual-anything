/**
 * The draw.io reader (ADR-0042, R37): one diagram in each of its files becomes the same plan; the
 * plan applies through `planToCommand` as one action; and hostile files are refused or read safely.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { encodeBase64 } from '../images/base64';
import { shownByScope } from '../scope';
import { MAX_FILLED_FILE, MAX_FILLED_LABEL, MAX_PLACEHOLDERS, readDrawio } from './drawio';
import compressed from './fixtures/checkout-compressed.drawio?raw';
import plain from './fixtures/checkout.drawio?raw';
import png from './fixtures/checkout.drawio.png?inline';
import svg from './fixtures/checkout.drawio.svg?raw';
import legacyPng from './fixtures/ops-legacy.drawio.png?inline';
import bareModel from './fixtures/ops.xml?raw';
import { IMPORT_LIMITS, planProblems, type ImportPlan } from './plan';
import { MAX_IMPORTED_NAME } from './reading';
import {
  applyPlan,
  bytesOfDataUrl,
  optionsFor,
  planOf,
  suggestedMapping,
  systemsProject,
} from './test/apply';
import { deflateBomb, deflateFixed, utf8 } from './test/deflate';

const options = optionsFor(systemsProject());

function read(content: string | Uint8Array, source = 'checkout.drawio'): ImportPlan {
  return planOf(readDrawio(content, source, options));
}

/** A one-page file holding these cells after the root and its layer. */
function page(cells: string, name = 'Page-1'): string {
  return `<mxfile><diagram id="p" name="${name}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`;
}

function vertex(
  id: string,
  label: string,
  parent = '1',
  geometry = 'x="0" y="0" width="120" height="60"',
) {
  return `<mxCell id="${id}" value="${label}" style="html=1;" vertex="1" parent="${parent}"><mxGeometry ${geometry} as="geometry"/></mxCell>`;
}

function edge(id: string, source: string | undefined, target: string | undefined, label = '') {
  const ends = `${source === undefined ? '' : ` source="${source}"`}${target === undefined ? '' : ` target="${target}"`}`;
  return `<mxCell id="${id}" value="${label}" style="html=1;" edge="1" parent="1"${ends}><mxGeometry relative="1" as="geometry"/></mxCell>`;
}

function refusal(content: string | Uint8Array): string {
  const outcome = readDrawio(content, 'hostile.drawio');
  if (outcome.ok) throw new Error('It was read.');
  return outcome.problems.join(' ');
}

describe('readDrawio, on a plain file', () => {
  const plan = read(plain);

  it('makes each vertex an element, of the kind its style gives, named by its label as plain text', () => {
    expect(plan.format).toBe('drawio');
    expect(plan.source).toBe('checkout.drawio');
    expect(plan.elements.map((each) => [each.key, each.name, each.kind])).toEqual([
      ['1:shop', 'Shop', 'swimlane'],
      ['1:cart', 'Cart (Node.js)', 'rounded=1'],
      ['1:orders-db', 'Orders', 'shape=cylinder3'],
      ['1:customer', 'Customer', 'shape=umlActor'],
      ['1:payments', 'Payments for Billing', 'rectangle'],
      ['1:logo', 'Logo', 'shape=image'],
      ['1:resize', 'Resize images', 'shape=mxgraph.aws4.resourceIcon'],
      ['2:2', 'Monitor', 'ellipse'],
      ['2:3', 'Pager', 'text'],
    ]);
    expect(plan.elements.find((each) => each.key === '1:payments')).toMatchObject({
      sourceId: 'payments',
      description: 'Takes card payments.',
      attributes: {
        team: 'Billing',
        owner: 'Ana',
        tags: ['pci', 'external'],
        link: 'https://example.com/payments',
      },
    });
  });

  it('suggests a component for each kind and a relation type for each edge kind, from what the project uses', () => {
    expect(plan.kinds.elements.map((each) => [each.kind, each.count, each.suggested])).toEqual([
      ['swimlane', 1, 'systems.system'],
      ['rounded=1', 1, 'systems.box'],
      ['shape=cylinder3', 1, 'systems.database'],
      ['shape=umlActor', 1, 'systems.person'],
      ['rectangle', 1, 'systems.box'],
      ['shape=image', 1, 'systems.box'],
      ['shape=mxgraph.aws4.resourceIcon', 1, 'systems.box'],
      ['ellipse', 1, 'systems.box'],
      ['text', 1, 'systems.box'],
    ]);
    expect(plan.kinds.relations.map((each) => [each.kind, each.count, each.suggested])).toEqual([
      ['edge', 3, 'systems.communicates-with'],
      ['dashed=1', 1, 'systems.communicates-with'],
      ['endArrow=none', 1, 'relates-to'],
    ]);
    // Told nothing, a reader suggests what the built-in packages define.
    expect(planOf(readDrawio(plain, 'x.drawio')).kinds.elements[2]?.suggested).toBe(
      'systems.database',
    );
    // A project that uses no Systems suggests only what it has.
    const bare = planOf(readDrawio(plain, 'x.drawio', { uses: (id) => id === 'relates-to' }));
    expect(bare.kinds.elements.every((each) => each.suggested === undefined)).toBe(true);
    expect(bare.kinds.relations.map((each) => each.suggested)).toEqual([
      'relates-to',
      'relates-to',
      'relates-to',
    ]);
  });

  it('makes a vertex that holds others their container, and edges relations, also on relations', () => {
    expect(plan.containment).toEqual([
      { element: '1:cart', container: '1:shop' },
      { element: '1:orders-db', container: '1:shop' },
    ]);
    expect(
      plan.relations.map((each) => [each.key, each.from, each.to, each.kind, each.name]),
    ).toEqual([
      ['1:browses', '1:customer', '1:cart', 'edge', 'browses'],
      ['1:writes', '1:cart', '1:orders-db', 'dashed=1', 'writes'],
      ['1:pays', '1:cart', '1:payments', 'endArrow=none', 'pays & refunds'],
      ['1:audits', '1:payments', '1:writes', 'edge', 'audits'],
      ['2:4', '2:2', '2:3', 'edge', undefined],
    ]);
  });

  it('makes each page a view of what it holds, with positions relative to containers and waypoints on the canvas', () => {
    expect(plan.views.map((each) => [each.key, each.name, each.shows?.length])).toEqual([
      ['page:1', 'Checkout', 7],
      ['page:2', 'Ops', 2],
    ]);
    const [checkout, ops] = plan.views as [ImportPlan['views'][0], ImportPlan['views'][0]];
    expect(checkout.positions).toEqual([
      { element: '1:shop', x: 40, y: 40, width: 400, height: 260 },
      { element: '1:cart', container: '1:shop', x: 30, y: 60, width: 120, height: 60 },
      { element: '1:orders-db', container: '1:shop', x: 250, y: 150, width: 100, height: 80 },
      { element: '1:customer', x: 560, y: 80, width: 30, height: 60 },
      { element: '1:payments', x: 520, y: 240, width: 120, height: 60 },
      { element: '1:logo', x: 720, y: 20, width: 60, height: 60 },
      { element: '1:resize', x: 720, y: 140, width: 78, height: 78 },
    ]);
    // A waypoint of an edge inside the shop is relative to the shop in the file.
    expect(checkout.bendPoints).toEqual([
      {
        relation: '1:browses',
        points: [
          { x: 500, y: 110 },
          { x: 500, y: 160 },
        ],
      },
      { relation: '1:writes', points: [{ x: 130, y: 230 }] },
    ]);
    expect(ops.positions).toEqual([
      { element: '2:2', x: 80, y: 80, width: 120, height: 80 },
      { element: '2:3', x: 320, y: 100, width: 60, height: 30 },
    ]);
  });

  it('reports what matched nothing, quoted as the file writes it, with why', () => {
    expect(plan.unmatched).toEqual([
      {
        text: 'retries',
        why: 'An edge that is not connected at both ends becomes no relation.',
      },
      { text: 'notifies', why: 'It ends on "ghost", which the page does not hold.' },
      {
        text: 'shape=mxgraph.aws4.resourceIcon',
        why: 'A shape draws this draw.io stencil, which is left out; the component chosen for it draws it.',
      },
      {
        text: 'image',
        why: 'A shape shows an image, which is left out: images in imports are left out, and the component chosen for it draws it.',
      },
    ]);
  });

  it('applies as one action that one undo takes back, with each page a view of only what it holds', () => {
    const state = systemsProject();
    const { state: after, ids } = applyPlan(state, plan);
    const elementOf = (key: string) =>
      after.model.elements.find((each) => each.id === ids.get(key));
    expect(elementOf('1:orders-db')?.component).toBe('systems.database');
    expect(elementOf('1:customer')?.component).toBe('systems.person');
    expect(ids.get('1:shop')).toBe('shop');
    expect(
      after.model.relations.find(
        (each) => each.relationType === 'systems.is-part-of' && each.from === ids.get('1:cart'),
      )?.to,
    ).toBe(ids.get('1:shop'));
    expect(after.model.relations.find((each) => each.id === ids.get('1:audits'))?.to).toBe(
      ids.get('1:writes'),
    );
    const checkout = after.views.find((each) => each.id === ids.get('page:1'))!;
    expect(checkout.name).toBe('Checkout');
    expect(shownByScope(after, checkout).elements).toHaveLength(8);
    expect(checkout.positions).toContainEqual({
      element: ids.get('1:cart'),
      container: ids.get('1:shop'),
      x: 30,
      y: 60,
      width: 120,
      height: 60,
      pinned: true,
    });
    expect(checkout.routes?.[ids.get('1:writes')!]?.bendPoints).toEqual([{ x: 130, y: 230 }]);
    // What was in the project before stays out of the imported pages.
    expect(shownByScope(after, checkout).element('api')).toBe(false);
  });
});

describe('readDrawio, on every file a diagram comes in', () => {
  const expected = read(plain);
  const same = (plan: ImportPlan) => {
    expect({ ...plan, format: '', source: '' }).toEqual({ ...expected, format: '', source: '' });
  };

  it('reads compressed pages', () => {
    const plan = read(compressed);
    expect(plan.format).toBe('drawio');
    same(plan);
  });

  it('reads a .drawio.svg from its content attribute, past its DOCTYPE', () => {
    expect(svg).toContain('<!DOCTYPE svg PUBLIC');
    const plan = read(svg, 'checkout.drawio.svg');
    expect(plan.format).toBe('drawio-svg');
    same(plan);
  });

  it('reads a .drawio.png from its tEXt chunk, and an older one from its zTXt chunk', () => {
    const plan = read(bytesOfDataUrl(png), 'checkout.drawio.png');
    expect(plan.format).toBe('drawio-png');
    same(plan);
    const legacy = read(bytesOfDataUrl(legacyPng), 'ops-legacy.drawio.png');
    expect(legacy.views.map((each) => each.name)).toEqual(['ops-legacy']);
    expect(legacy.elements.map((each) => each.name)).toEqual(['Monitor', 'Pager']);
  });

  it('reads a bare model, as one page named after the file', () => {
    const plan = read(bareModel, 'ops.xml');
    expect(plan.views.map((each) => each.name)).toEqual(['ops']);
    expect(plan.relations).toHaveLength(1);
    // Bytes read as UTF-8 give the same.
    expect(read(utf8(bareModel), 'ops.xml')).toEqual(plan);
  });
});

describe('readDrawio, on hostile files', () => {
  it('refuses a billion laughs and an entity of its own', () => {
    const laughs =
      '<?xml version="1.0"?><!DOCTYPE mxfile [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>' +
      page(vertex('v', '&b;'));
    expect(refusal(laughs)).toBe(
      'The XML has a DOCTYPE with declarations of its own, which is not read.',
    );
    expect(refusal(page(vertex('v', '&xxe;')))).toBe(
      'The XML uses the entity "&xxe;", which is not read.',
    );
  });

  it('refuses a deflate bomb in a page, inside the 32 MiB it may inflate to', () => {
    const bomb = encodeBase64(deflateBomb(Math.ceil((33 * 1024 * 1024) / 258)));
    expect(bomb.length).toBeLessThan(400_000);
    expect(refusal(`<mxfile><diagram name="Bomb">${bomb}</diagram></mxfile>`)).toBe(
      'The compressed content inflates to over 32 MiB, the most an import reads.',
    );
    // Two pages share the budget: each under the cap, together over it.
    const head = utf8('<mxGraphModel>');
    const tail = utf8('</mxGraphModel>');
    const model = new Uint8Array(head.length + 17 * 1024 * 1024 + tail.length).fill(0x20);
    model.set(head);
    model.set(tail, model.length - tail.length);
    const half = encodeBase64(deflateFixed(model));
    expect(
      refusal(
        `<mxfile><diagram name="A">${half}</diagram><diagram name="B">${half}</diagram></mxfile>`,
      ),
    ).toBe('The compressed content inflates to over 32 MiB, the most an import reads.');
  });

  it('reads an edge to an id that does not exist, or to a layer, as matching nothing', () => {
    const plan = read(page(vertex('a', 'A') + edge('e1', 'a', 'nowhere') + edge('e2', 'a', '1')));
    expect(plan.relations).toEqual([]);
    expect(plan.unmatched).toEqual([
      { text: 'e1', why: 'It ends on "nowhere", which the page does not hold.' },
      { text: 'e2', why: 'It ends on a layer, which is no element.' },
    ]);
  });

  it('places a cycle of parents, and a parent not on the page, directly in World', () => {
    const plan = read(
      page(
        vertex('a', 'A', 'b') +
          vertex('b', 'B', 'a') +
          vertex('c', 'C', 'a', 'x="10" y="20" width="50" height="40"') +
          vertex('d', 'D', 'gone') +
          vertex('self', 'Self', 'self'),
      ),
    );
    expect(plan.containment).toEqual([{ element: '1:c', container: '1:a' }]);
    expect(plan.unmatched).toEqual([
      { text: 'D', why: 'Its container "gone" is not on the page, so it sits directly in World.' },
      {
        text: 'A',
        why: 'It sits inside itself through its containers, so it sits directly in World.',
      },
      {
        text: 'B',
        why: 'It sits inside itself through its containers, so it sits directly in World.',
      },
      {
        text: 'Self',
        why: 'It sits inside itself through its containers, so it sits directly in World.',
      },
    ]);
    expect(plan.views[0]?.positions).toContainEqual({
      element: '1:c',
      container: '1:a',
      x: 10,
      y: 20,
      width: 50,
      height: 40,
    });
    applyPlan(systemsProject(), plan);
  });

  it('drops edges that end on each other in a loop, and those that end on an edge that becomes none', () => {
    const plan = read(
      page(
        vertex('a', 'A') +
          vertex('b', 'B') +
          edge('e1', 'a', 'e2', 'one') +
          edge('e2', 'e1', 'b', 'two') +
          edge('e3', 'a', 'e4', 'three') +
          edge('e4', 'a', undefined, 'four') +
          edge('e5', 'e6', 'b', 'five') +
          edge('e6', 'a', 'b', 'six'),
      ),
    );
    expect(plan.relations.map((each) => [each.key, each.from, each.to])).toEqual([
      ['1:e6', '1:a', '1:b'],
      ['1:e5', '1:e6', '1:b'],
    ]);
    expect(plan.unmatched.map((each) => [each.text, each.why])).toEqual([
      ['four', 'An edge that is not connected at both ends becomes no relation.'],
      ['two', 'Its relations end on each other in a loop, so none of them becomes a relation.'],
      ['one', 'Its relations end on each other in a loop, so none of them becomes a relation.'],
      ['three', 'It ends on an edge that becomes no relation, so it becomes none either.'],
    ]);
    applyPlan(systemsProject(), plan);
  });

  it('turns HTML and scripts in labels into plain text', () => {
    const label = (html: string) =>
      html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const plan = read(
      page(
        vertex('a', label('<img src=x onerror="alert(1)"><b>Orders</b><script>alert(2)</script>')) +
          vertex('b', label('&lt;script&gt;alert(3)&lt;/script&gt;')) +
          vertex('c', label('<div onclick="x()">On<br>two lines</div>')),
      ),
    );
    expect(plan.elements.map((each) => each.name)).toEqual([
      'Orders',
      '<script>alert(3)</script>',
      'On two lines',
    ]);
  });

  it('never finds what every object inherits, by a style, a shape or an attribute’s name', () => {
    const plan = read(
      page(
        '<mxCell id="a" value="A" style="constructor;" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>' +
          '<mxCell id="b" value="B" style="toString;html=1;" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>' +
          '<mxCell id="c" value="C" style="shape=__proto__;" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>' +
          '<object label="D" __proto__="polluted" constructor="built" toString="said" hasOwnProperty="no" id="d"><mxCell style="__proto__;" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></object>' +
          '<mxCell id="e" value="E" style="startArrow=constructor;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>',
      ),
    );
    expect(plan.kinds.elements.map((each) => [each.kind, each.label])).toEqual([
      ['"constructor"', 'constructor'],
      ['"toString"', 'toString'],
      ['shape=__proto__', 'shape=__proto__'],
      ['"__proto__"', '__proto__'],
    ]);
    expect(plan.elements.map((each) => each.kind)).toEqual([
      '"constructor"',
      '"toString"',
      'shape=__proto__',
      '"__proto__"',
    ]);
    const attributes = plan.elements[3]?.attributes as Record<string, unknown>;
    expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
    expect(Object.keys(attributes)).toEqual([
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
    ]);
    expect(Object.hasOwn(attributes, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // Unmapped, such a kind is reported as unmapped, not mapped to what the prototype holds.
    const mapping = suggestedMapping(plan);
    expect(Object.keys(mapping.elements)).toHaveLength(4);
    const { state } = applyPlan(systemsProject(), plan, mapping);
    const d = state.model.elements.find((each) => each.name === 'D');
    expect(Object.hasOwn(d?.attributes ?? {}, '__proto__')).toBe(true);
    expect(d?.attributes?.constructor).toBe('built');
  });

  it('fills placeholders once, within caps on each label and on the whole file', () => {
    const object = (id: string, label: string, values: string) =>
      `<object label="${label}" placeholders="1" ${values} id="${id}"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></object>`;
    const value = 'x'.repeat(997);
    // Without caps, ten thousand placeholders of a kilobyte each would grow one label to ten million
    // characters, and a value that holds a placeholder would be filled in again.
    const plan = read(
      page(
        object('many', '%v%'.repeat(10_000), `v="${value}"`) +
          object('some', '%v% %v% %v% %v% %v%', `v="${value}"`) +
          object('again', 'Is %w%', 'w="%v%" v="never"'),
      ),
    );
    const [many, some, again] = plan.elements;
    expect(many?.name).toBe(`${'%v%'.repeat(333)}…`);
    expect(some?.name.length).toBe(MAX_IMPORTED_NAME);
    expect(again?.name).toBe('Is %v%');
    expect(plan.unmatched.map((each) => each.why)).toContain(
      `Its placeholders are filled in up to ${MAX_PLACEHOLDERS} of them and ${MAX_FILLED_LABEL.toLocaleString('en')} characters; the rest stay as written.`,
    );
    // Across a file, what placeholders add stops at its cap, reported once.
    const short = 'x'.repeat(300);
    const cells = Array.from({ length: 1200 }, (_, at) =>
      object(`c${at}`, '%v% %v% %v%', `v="${short}"`),
    ).join('');
    const file = read(page(cells));
    const filledCount = file.elements.filter((each) => !each.name.includes('%v%')).length;
    expect(filledCount).toBe(Math.floor(MAX_FILLED_FILE / (3 * 297)));
    expect(file.elements.at(-1)?.name).toBe('%v% %v% %v%');
    expect(file.unmatched.filter((each) => each.why.startsWith('Placeholders are'))).toEqual([
      {
        text: '%v% %v% %v%',
        why: 'Placeholders are filled in up to 1,000,000 characters across the file; the rest stay as written.',
      },
    ]);
  });

  it('drops many loops through a long chain of edges in time that grows with the edges', () => {
    // Each edge ends on the next and on the first, so every edge is in a loop through the whole chain;
    // marking each loop's members again for each would take hundreds of millions of steps.
    const length = 40_000;
    const cells =
      vertex('a', 'A') +
      Array.from({ length }, (_, at) =>
        edge(`e${at}`, at + 1 < length ? `e${at + 1}` : 'a', 'e0'),
      ).join('');
    const plan = read(page(cells));
    expect(plan.relations).toEqual([]);
    expect(plan.unmatched).toHaveLength(501);
    expect(plan.unmatched[0]?.why).toBe(
      'Its relations end on each other in a loop, so none of them becomes a relation.',
    );
  }, 15_000);

  it('cuts a name of a megabyte, and reports it', () => {
    const plan = read(page(vertex('a', 'x'.repeat(1024 * 1024))));
    expect(plan.elements[0]?.name).toHaveLength(MAX_IMPORTED_NAME);
    expect(plan.unmatched[0]?.why).toBe('The name is over 1,000 characters; it is cut there.');
    expect(plan.unmatched[0]?.text.length).toBeLessThanOrEqual(160);
  });

  it('reads 20,001 vertices, which the plan then refuses past the limit', () => {
    const cells = Array.from({ length: IMPORT_LIMITS.elements + 1 }, (_, at) =>
      vertex(`v${at}`, `V${at}`),
    ).join('');
    const plan = read(page(cells));
    expect(plan.elements).toHaveLength(20_001);
    expect(planProblems(systemsProject(), plan, suggestedMapping(plan))[0]).toMatch(
      /an import brings at most 20,000/,
    );
  });

  it('leaves out more waypoints than a route takes, and keeps coordinates on the canvas', () => {
    const points = Array.from({ length: 65 }, (_, at) => `<mxPoint x="${at}" y="0"/>`).join('');
    const plan = read(
      page(
        vertex('a', 'A', '1', 'x="1e300" y="NaN" width="-5" height="60"') +
          vertex('b', 'B') +
          `<mxCell id="e" value="many" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"><Array as="points">${points}</Array></mxGeometry></mxCell>`,
      ),
    );
    expect(plan.views[0]?.bendPoints).toBeUndefined();
    expect(plan.unmatched).toEqual([
      { text: 'many', why: 'Its 65 waypoints are left out: a route bends at most 64 times.' },
    ]);
    expect(plan.views[0]?.positions?.[0]).toEqual({
      element: '1:a',
      x: 10_000_000,
      y: 0,
      height: 60,
    });
    applyPlan(systemsProject(), plan);
  });

  it('refuses what is not a draw.io diagram, or damaged', () => {
    expect(refusal('<html><body>Hi</body></html>')).toBe(
      'The file is not a draw.io diagram: its outermost element is "html", not "mxfile".',
    );
    expect(refusal('<mxfile></mxfile>')).toBe('The draw.io file has no page.');
    expect(refusal(page(vertex('a', 'A') + vertex('a', 'B')))).toBe(
      'The page "Page-1" holds the id "a" twice.',
    );
    expect(refusal('<mxfile><diagram name="x">not base64!</diagram></mxfile>')).toBe(
      'The compressed content is not valid base64.',
    );
    expect(refusal('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')).toBe(
      'The SVG picture holds no draw.io diagram: its outermost element has no content.',
    );
    const bytes = bytesOfDataUrl(png);
    const damaged = bytes.slice();
    damaged[40] = (damaged[40] as number) ^ 0xff;
    expect(refusal(damaged)).toBe('A chunk of the PNG picture is damaged.');
    const picture = Uint8Array.from([
      ...bytes.subarray(0, 33),
      0,
      0,
      0,
      0,
      0x49,
      0x45,
      0x4e,
      0x44,
      0xae,
      0x42,
      0x60,
      0x82,
    ]);
    expect(refusal(picture)).toBe('The PNG picture holds no draw.io diagram.');
  });
});

describe('readDrawio, on any arrangement of cells', () => {
  it('gives a plan that applies as one action, whatever the parents and ends', () => {
    const cell = fc.record({
      edge: fc.boolean(),
      parent: fc.nat(12),
      source: fc.option(fc.nat(14), { nil: undefined }),
      target: fc.option(fc.nat(14), { nil: undefined }),
      x: fc.integer({ min: -500, max: 500 }),
      y: fc.integer({ min: -500, max: 500 }),
      points: fc.array(fc.record({ x: fc.integer(), y: fc.integer() }), { maxLength: 3 }),
    });
    // Ids 0 to 9 are cells, 10 the layer, 11 and up are not on the page.
    const id = (at: number) => (at < 10 ? `c${at}` : at === 10 ? '1' : `missing${at}`);
    fc.assert(
      fc.property(fc.array(cell, { minLength: 1, maxLength: 10 }), (cells) => {
        const text = page(
          cells
            .map((each, at) => {
              const geometry = `<mxGeometry x="${each.x}" y="${each.y}" width="80" height="40" as="geometry"><Array as="points">${each.points.map((point) => `<mxPoint x="${point.x}" y="${point.y}"/>`).join('')}</Array></mxGeometry>`;
              const ends = each.edge
                ? `${each.source === undefined ? '' : ` source="${id(each.source)}"`}${each.target === undefined ? '' : ` target="${id(each.target)}"`}`
                : '';
              return `<mxCell id="c${at}" value="Cell ${at}" ${each.edge ? 'edge' : 'vertex'}="1" parent="${id(each.parent)}"${ends}>${geometry}</mxCell>`;
            })
            .join(''),
        );
        const plan = read(text);
        applyPlan(systemsProject(), plan);
      }),
      { numRuns: 300 },
    );
  });
});
