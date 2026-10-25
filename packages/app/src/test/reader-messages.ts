/**
 * Everything the Structurizr, LikeC4 and draw.io readers say (ADR-0042): why they refuse a file and
 * why they leave out what matched nothing, from their fixtures and from hostile files made to say
 * each, for the tests of the core's messages in Spanish.
 */
import { readDrawio, readLikeC4, readStructurizr, type ImportRead } from '@visual-anything/core';
import workspace from '../../../core/src/import/fixtures/big-bank.structurizr.json';
import plain from '../../../core/src/import/fixtures/checkout.drawio?raw';
import model from '../../../core/src/import/fixtures/shop.likec4.json';

/** A one-page draw.io file holding these cells after the root and its layer. */
function page(cells: string, name = 'Page-1'): string {
  return `<mxfile><diagram name="${name}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`;
}

function vertex(id: string, label = id, parent = '1', style = 'html=1;'): string {
  return `<mxCell id="${id}" value="${label}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>`;
}

function edge(id: string, source?: string, target?: string, inside = ''): string {
  const ends = `${source === undefined ? '' : ` source="${source}"`}${target === undefined ? '' : ` target="${target}"`}`;
  return `<mxCell id="${id}" value="${id}" edge="1" parent="1"${ends}><mxGeometry relative="1" as="geometry">${inside}</mxGeometry></mxCell>`;
}

function object(id: string, label: string, values: string): string {
  return `<object label="${label}" placeholders="1" ${values} id="${id}"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></object>`;
}

/** Raw deflate of zeros in fixed-Huffman blocks: one literal, then matches of 258 at distance 1. */
function bomb(bytes: number): string {
  const out: number[] = [];
  let acc = 0;
  let count = 0;
  const bits = (value: number, length: number) => {
    for (let i = 0; i < length; i++) {
      acc |= ((value >>> i) & 1) << count;
      count += 1;
      if (count === 8) {
        out.push(acc);
        acc = 0;
        count = 0;
      }
    }
  };
  const code = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits((value >>> i) & 1, 1);
  };
  bits(1, 1);
  bits(1, 2);
  code(0x30, 8);
  for (let made = 1; made < bytes; made += 258) {
    code(0xc5, 8);
    code(0, 5);
  }
  code(0, 7);
  if (count > 0) out.push(acc);
  return btoa(out.map((byte) => String.fromCharCode(byte)).join(''));
}

/** A PNG picture of its signature and one chunk of this type and data, with a checksum that fails. */
function damagedPng(): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 1, 0x74, 0x45, 0x58, 0x74, 0x41, 0, 0,
    0, 0,
  ]);
}

/** A PNG picture with no diagram: its signature and its end. */
function emptyPng(): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
    0x60, 0x82,
  ]);
}

/** A Structurizr workspace of people in a chain of relationships, with these views. */
function people(count: number, views: object = {}, relationshipsPerPerson = 1): string {
  return JSON.stringify({
    model: {
      people: Array.from({ length: count }, (_, at) => ({
        id: `p${at}`,
        name: `P${at}`,
        relationships: Array.from({ length: relationshipsPerPerson }, (_, step) => ({
          id: `r${at}-${step}`,
          sourceId: `p${at}`,
          destinationId: `p${(at + 1) % count}`,
        })),
      })),
    },
    views,
  });
}

const XML_REFUSED = [
  '',
  '<a><b></a>',
  '<a>',
  '<a/><b/>',
  'text<a/>',
  '<a b=c/>',
  '<a b="1" b="2"/>',
  '<a b="1"c="2"/>',
  '<a b="x<y"/>',
  '<a b/>',
  '<a b="1/>',
  '<a>&</a>',
  '<a>&#0;</a>',
  '<a>&xxe;</a>',
  '<a><!-- </a>',
  '<a><![CDATA[ </a>',
  '<a><?pi </a>',
  '<a></a',
  '<a b="1"',
  '< a/>',
  '<a/><?xml version="1.0"?>',
  '<!DOCTYPE a [<!ENTITY b "c">]><a/>',
  '<!DOCTYPE a',
  '<!ENTITY a "b"><a/>',
  '<a/><!DOCTYPE a>',
  `<a>${'<b>'.repeat(257)}${'</b>'.repeat(257)}</a>`,
  `<a>${'<b/>'.repeat(500_001)}</a>`,
  `<a ${Array.from({ length: 1025 }, (_, at) => `a${at}="1"`).join(' ')}/>`,
];

/** What the three readers say, refusing and leaving out, each message once. */
export function readerMessages(): string[] {
  const reads: ImportRead[] = [];
  const drawio = (content: string | Uint8Array) => reads.push(readDrawio(content, 'file.drawio'));
  const structurizr = (text: string) => reads.push(readStructurizr(text, 'workspace.json'));
  const likec4 = (text: string) => reads.push(readLikeC4(text, 'model.json'));

  // draw.io: the fixture, then what each hostile file is made to say.
  drawio(plain);
  for (const text of XML_REFUSED) drawio(text);
  drawio(' '.repeat(32 * 1024 * 1024 + 1));
  drawio('<html></html>');
  drawio('<mxfile></mxfile>');
  drawio('<svg xmlns="http://www.w3.org/2000/svg"/>');
  drawio('<mxfile><diagram>not base64!</diagram></mxfile>');
  drawio('<mxfile><diagram>%%%</diagram></mxfile>');
  drawio('<mxfile><diagram>AAAA</diagram></mxfile>');
  drawio('<mxfile><diagram>%3Cother%2F%3E</diagram></mxfile>');
  drawio(`<mxfile><diagram>${bomb(33 * 1024 * 1024)}</diagram></mxfile>`);
  drawio(damagedPng());
  drawio(emptyPng());
  drawio(page('<mxCell value="no id" vertex="1" parent="1"/>'));
  drawio(page(vertex('a') + vertex('a')));
  drawio(
    page(
      vertex('a', 'A', 'b') +
        vertex('b', 'B', 'a') +
        vertex('d', 'D', 'gone') +
        vertex('x', 'x'.repeat(2000)) +
        vertex('s1', 'S1', '1', 'shape=mxgraph.aws4.lambda;') +
        vertex('s2', 'S2', '1', 'shape=mxgraph.aws4.lambda;') +
        vertex('i1', 'I1', '1', 'shape=image;image=x;') +
        vertex('i2', 'I2', '1', 'shape=image;image=x;') +
        edge('e1', 'd') +
        edge('e2', 'd', 'nowhere') +
        edge('e3', 'd', '1') +
        edge('e4', 'd', 'e5') +
        edge('e5', 'e4', 'd') +
        edge('e6', 'd', 'e1') +
        edge('e7', 'd', 'x', `<Array as="points">${'<mxPoint x="1" y="1"/>'.repeat(65)}</Array>`) +
        `<object label="L" link="javascript:alert(1)" id="l"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></object>`,
    ),
  );
  for (const lines of [501, 502]) {
    drawio(
      page(
        vertex('only') + Array.from({ length: lines }, (_, at) => edge(`d${at}`, 'only')).join(''),
      ),
    );
  }
  drawio(page(object('o', '%v% %v% %v% %v% %v%', `v="${'x'.repeat(997)}"`)));
  drawio(
    page(
      Array.from({ length: 1200 }, (_, at) =>
        object(`o${at}`, '%v% %v% %v%', `v="${'x'.repeat(300)}"`),
      ).join(''),
    ),
  );
  drawio(
    `<mxfile>${Array.from({ length: 501 }, (_, at) => `<diagram name="P${at}"/>`).join('')}</mxfile>`,
  );

  // Structurizr.
  structurizr(JSON.stringify(workspace));
  structurizr('{');
  structurizr('{"views": {}}');
  structurizr('{"model": {"people": [{"id": "1", "name": {}}]}}');
  structurizr('{"model": {"people": [{"id": "1", "name": "A"}, {"id": "1", "name": "B"}]}}');
  const deep = (depth: number): string =>
    depth === 0 ? '[]' : `[{"id": "n${depth}", "name": "N", "children": ${deep(depth - 1)}}]`;
  structurizr(`{"model": {"deploymentNodes": ${deep(65)}}}`);
  structurizr(
    JSON.stringify({
      model: {
        people: [
          {
            id: 'p',
            name: 'P',
            relationships: [{ id: 'r', destinationId: 'ghost' }],
          },
        ],
        deploymentNodes: [
          { id: 'n', name: 'N', containerInstances: [{ id: 'i', containerId: 'ghost' }] },
        ],
      },
      views: {
        systemLandscapeViews: [
          ...Array.from({ length: 501 }, (_, at) => ({ key: `V${at}`, elements: [{ id: 'p' }] })),
          { key: 'Ghost', elements: [{ id: 'ghost' }] },
        ],
        filteredViews: [{ key: 'Orphan', baseViewKey: 'Missing' }],
      },
    }),
  );
  structurizr(people(20_001));
  structurizr(people(10, {}, 5_001));
  structurizr(
    people(20_000, {
      systemLandscapeViews: [
        {
          key: 'All',
          elements: Array.from({ length: 20_000 }, (_, at) => ({ id: `p${at}` })),
        },
        { key: 'Pair', elements: [{ id: 'p0' }, { id: 'p1' }] },
      ],
      filteredViews: Array.from({ length: 10 }, (_, at) => ({
        key: `F${at}`,
        baseViewKey: 'All',
        mode: 'Exclude',
        tags: ['none'],
      })),
    }),
  );

  // LikeC4.
  likec4(JSON.stringify(model));
  likec4('{"views": {}}');
  likec4('{"elements": {"a": {"id": "a", "title": "A"}}}');
  likec4(`{"elements": {"a": {"id": "${'a.'.repeat(200)}a", "kind": "box"}}}`);
  likec4('{"elements": {"a": {"id": "x", "kind": "box"}, "b": {"id": "x", "kind": "box"}}}');
  likec4(
    JSON.stringify({
      elements: { a: { id: 'a', kind: 'box' } },
      relations: {
        r: { id: 'r', source: { model: 'a' }, target: { model: 'ghost' } },
      },
    }),
  );
  likec4(
    JSON.stringify({
      elements: { a: { id: 'a', kind: 'box' } },
      relations: {
        s: { id: 's', source: { model: 'a' }, target: { model: 'a' } },
        t: { id: 's', source: { model: 'a' }, target: { model: 'a' } },
      },
    }),
  );
  likec4(
    JSON.stringify({
      elements: { a: { id: 'a', kind: 'box' } },
      relations: {},
      deployments: {
        elements: {
          n: { id: 'n', kind: 'vm' },
          'n.i': { id: 'n.i', element: 'ghost' },
        },
      },
    }),
  );
  likec4(
    JSON.stringify({
      elements: {},
      deployments: { elements: { n: { id: 'n', kind: 'vm' }, m: { id: 'n', kind: 'vm' } } },
    }),
  );
  likec4(
    JSON.stringify({
      elements: { a: { id: 'a', kind: 'box' } },
      relations: {},
      deployments: {
        elements: { n: { id: 'n', kind: 'vm' }, 'n.i': { id: 'n.i', element: 'a' } },
        relations: {
          d: { id: 'd', source: { deployment: 'n.i', element: 'a' }, target: { deployment: 'n' } },
        },
      },
      views: {
        v: { id: 'v', nodes: [{ id: 'ghost' }], edges: [] },
        ...Object.fromEntries(
          Array.from({ length: 501 }, (_, at) => [
            `w${at}`,
            { id: `w${at}`, nodes: [], edges: [] },
          ]),
        ),
      },
    }),
  );
  likec4(
    JSON.stringify({
      elements: Object.fromEntries(
        Array.from({ length: 20_001 }, (_, at) => [`e${at}`, { id: `e${at}`, kind: 'box' }]),
      ),
    }),
  );
  likec4(
    JSON.stringify({
      elements: { a: { id: 'a', kind: 'box' } },
      relations: Object.fromEntries(
        Array.from({ length: 50_001 }, (_, at) => [
          `r${at}`,
          { id: `r${at}`, source: { model: 'a' }, target: { model: 'a' } },
        ]),
      ),
    }),
  );
  const nodes = Array.from({ length: 20_000 }, (_, at) => ({ id: `e${at}` }));
  likec4(
    JSON.stringify({
      elements: Object.fromEntries(nodes.map(({ id }) => [id, { id, kind: 'box' }])),
      relations: {},
      views: Object.fromEntries(
        Array.from({ length: 11 }, (_, at) => [`v${at}`, { id: `v${at}`, nodes, edges: [] }]),
      ),
    }),
  );

  const said = new Set<string>();
  for (const read of reads) {
    if (!read.ok) for (const problem of read.problems) said.add(problem);
    else for (const { why } of read.plan.unmatched) said.add(why);
  }
  return [...said];
}
