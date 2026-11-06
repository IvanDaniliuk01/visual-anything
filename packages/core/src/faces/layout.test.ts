import { describe, expect, it } from 'vitest';
import { robotoWidth } from '../text/roboto';
import { compileFace } from './compile';
import {
  faceContentWidth,
  faceDrawingText,
  layOutFace,
  overflowsIn,
  type FaceDrawing,
} from './layout';
import { ADR_FACE, face, input } from './test-faces';

function draw(
  markup: string | string[],
  style: string | string[] = [],
  attributes: Parameters<typeof input>[0] = {},
  options: { width?: number; height?: number; size?: 'content' | 'shape' } & Parameters<
    typeof input
  >[1] = {},
): FaceDrawing {
  const { width = 200, height, size = 'content', ...more } = options;
  return layOutFace(compileFace(face(markup, style, { size })), input(attributes, more), {
    width,
    ...(height === undefined ? {} : { height }),
  });
}

const texts = (drawing: FaceDrawing) => drawing.runs.map((run) => run.text);

describe('laying a face out', () => {
  it('lays out the ADR example: a head with the name and a badge, the description, then the rows', () => {
    const drawing = layOutFace(
      compileFace(ADR_FACE),
      input(
        { status: 'frozen', descripcion: 'Every **order** a customer places, one per checkout.' },
        { definitions: { descripcion: { format: 'emphasis' } }, rowsHeight: 60 },
      ),
      { width: 240 },
    );
    expect(drawing.fallback).toBeUndefined();
    expect(faceDrawingText(drawing)).toBe(
      'orders\nfrozen\nEvery order a customer places, one per checkout.',
    );
    // The head's background, then the badge's, chosen by the status.
    expect(drawing.boxes.map((box) => box.background)).toEqual(['fill', '#9DC3E6']);
    const [head, badge] = drawing.boxes;
    expect(head).toMatchObject({ x: 0, y: 0, width: 240 });
    expect(badge!.x + badge!.width).toBeCloseTo(240 - 8);
    const name = drawing.runs[0]!;
    expect(name).toMatchObject({ text: 'orders', x: 8, size: 14, variant: 'bold', color: 'text' });
    const order = drawing.runs.find((run) => run.text === 'order')!;
    expect(order.variant).toBe('bold');
    expect(drawing.runs.find((run) => run.text.startsWith('Every'))!.color).toBe('text-muted');
    // The rows go under the face, which is their header.
    const rows = drawing.regions[0]!;
    expect(rows).toMatchObject({ kind: 'rows', x: 0, width: 240, height: 60 });
    expect(drawing.height).toBeCloseTo(rows.y + 60);
    expect(drawing.cut).toBe(false);
  });

  it('gives a line whose condition does not hold no height, padding and gap included', () => {
    const header = 'header { display: flex; height: 32px; }';
    const rule = 'p { padding: 4px 12px 6px; font-size: 11px; }';
    const without = draw(
      ['<header><b>{{name}}</b></header>', '<rows/>'],
      [header],
      {},
      {
        rowsHeight: 48,
      },
    );
    const hidden = draw(
      ['<header><b>{{name}}</b></header>', '<p if="note">{{note}}</p>', '<rows/>'],
      [header, rule],
      {},
      { rowsHeight: 48 },
    );
    expect(hidden.regions[0]!.y).toBe(32);
    expect(hidden.regions[0]!.y).toBe(without.regions[0]!.y);
    expect(hidden.height).toBe(without.height);
    // Nor does it take a gap of its own between what it stands between.
    const gapped = (markup: string[]) =>
      draw(
        markup,
        [header, rule, 'face { display: flex; flex-direction: column; row-gap: 8px; }'],
        {},
        {
          rowsHeight: 48,
        },
      );
    expect(
      gapped(['<header><b>{{name}}</b></header>', '<p if="note">{{note}}</p>', '<rows/>'])
        .regions[0]!.y,
    ).toBe(gapped(['<header><b>{{name}}</b></header>', '<rows/>']).regions[0]!.y);
    const shown = draw(
      ['<header><b>{{name}}</b></header>', '<p if="note">{{note}}</p>', '<rows/>'],
      [header, rule],
      { note: 'Every order.' },
      { rowsHeight: 48 },
    );
    expect(shown.regions[0]!.y).toBeGreaterThan(32);
  });

  it('leaves out what a condition hides, and writes a fallback for a missing value', () => {
    const drawing = layOutFace(compileFace(ADR_FACE), input({}), { width: 240 });
    expect(faceDrawingText(drawing)).toBe('orders');
    expect(drawing.boxes).toHaveLength(1);
    expect(texts(draw('<p>{{status ?? "—"}}</p>'))).toEqual(['—']);
    expect(
      texts(draw(`<p if="not status">none</p><p else="">{{status}}</p>`, [], { status: false })),
    ).toEqual(['none']);
  });

  it('compares as filters compare', () => {
    const markup = `<p if="rows >= 10">many</p><p else="rows > 0">few</p><p else="">none</p>`;
    expect(texts(draw(markup, [], { rows: 10 }))).toEqual(['many']);
    expect(texts(draw(markup, [], { rows: 3 }))).toEqual(['few']);
    expect(texts(draw(markup, [], { rows: 0 }))).toEqual(['none']);
    expect(
      texts(draw(`<p if="status in 'live' 'frozen'">yes</p>`, [], { status: 'LIVE ' })),
    ).toEqual(['yes']);
    expect(
      texts(
        draw(
          `<p if="status = 'orders'">yes</p>`,
          [],
          { status: '**orders**' },
          { definitions: { status: { format: 'emphasis' } } },
        ),
      ),
    ).toEqual(['yes']);
  });

  it('writes numbers with their unit, booleans by their name, lists with commas and text as text', () => {
    const drawing = draw(
      '<p>{{size}} {{nullable}} {{tags}} {{expr}}</p>',
      [],
      { size: 12, nullable: true, tags: ['a', 'b', 3], expr: '<b>**x**</b>' },
      { definitions: { size: { unit: 'GB' } }, width: 400 },
    );
    expect(faceDrawingText(drawing)).toBe('12 GB nullable a, b, 3 <b>**x**</b>');
    const plain = draw(
      '<p>{{d | plain}} {{d}}</p>',
      [],
      { d: '**x**' },
      { definitions: { d: { format: 'emphasis' } } },
    );
    expect(plain.runs.map((run) => [run.text, run.variant])).toEqual([
      ['**x** ', 'regular'],
      ['x', 'bold'],
    ]);
  });

  it('lists every attribute with <each of="attributes">, filtered, and says how many more', () => {
    const attributes = Object.fromEntries(
      Array.from({ length: 70 }, (_, at) => [`a${at}`, at + 1]),
    );
    const drawing = draw(
      '<div><each of="attributes" except="a1"><p>{{key}}: {{value}}</p></each><p if="more">+{{more}}</p></div>',
      [],
      attributes,
      { width: 300 },
    );
    const lines = faceDrawingText(drawing).split('\n');
    expect(lines).toHaveLength(65);
    expect(lines[0]).toBe('a0: 1');
    expect(lines[1]).toBe('a2: 3');
    expect(lines.at(-1)).toBe('+5');
    const only = draw('<each of="attributes" only="b a"><span>{{key}} </span></each>', [], {
      a: 1,
      b: 2,
      c: 3,
      d: '',
    });
    expect(faceDrawingText(only)).toBe('b a');
  });

  it('repeats over a list attribute, at most 32 times', () => {
    const drawing = draw(
      '<div class="tags"><each of="tags"><span class="tag">{{item}}</span></each></div>',
      '.tags { display: flex; flex-wrap: wrap; gap: 4px; } .tag { padding: 0 4px; background: var(--highlight); }',
      { tags: Array.from({ length: 40 }, (_, at) => `t${at}`) },
      { width: 120 },
    );
    expect(drawing.boxes).toHaveLength(32);
    for (const box of drawing.boxes) expect(box.x + box.width).toBeLessThanOrEqual(120 + 1e-6);
    expect(new Set(drawing.boxes.map((box) => box.y)).size).toBeGreaterThan(1);
  });

  it('picks rules by a class made from a value, reduced to [a-z0-9-]', () => {
    const drawing = draw(
      '<p class="status-{{status}}">x</p>',
      '.status-en-revision { background: #FFEEAA; }',
      { status: 'En Revisión' },
    );
    expect(drawing.boxes[0]?.background).toBe('#FFEEAA');
  });

  it('wraps text to its width, clamps it, and ends a cut line with "…"', () => {
    const words = 'one two three four five six seven eight nine ten eleven twelve';
    const drawing = draw(`<p>${words}</p>`, 'p { line-clamp: 2; }', {}, { width: 80 });
    expect(new Set(drawing.runs.map((run) => run.line)).size).toBe(2);
    expect(drawing.runs.at(-1)!.text.endsWith('…')).toBe(true);
    expect(drawing.cut).toBe(true);
    for (const run of drawing.runs) expect(run.x + run.width).toBeLessThanOrEqual(80 + 1e-6);
    const one = draw(`<p>${words}</p>`, 'p { white-space: nowrap; }', {}, { width: 80 });
    expect(one.runs).toHaveLength(1);
    expect(one.runs[0]!.text.endsWith('…')).toBe(true);
  });

  it('breaks a word longer than its line between characters', () => {
    const drawing = draw('<p>col_customer_identifier_hash</p>', [], {}, { width: 60 });
    expect(drawing.runs.map((run) => run.text).join('')).toBe('col_customer_identifier_hash');
    expect(new Set(drawing.runs.map((run) => run.line)).size).toBeGreaterThan(1);
  });

  it('cuts a face of size shape at its height', () => {
    const drawing = draw(
      '<p>a</p><p>b</p><p>c</p><p>d</p>',
      'p { font-size: 10px; }',
      {},
      { size: 'shape', height: 30 },
    );
    expect(drawing.height).toBe(30);
    expect(faceDrawingText(drawing)).toBe('a\nb…');
    expect(drawing.cut).toBe(true);
    for (const run of drawing.runs) expect(run.y).toBeLessThanOrEqual(30);
  });

  it('places a face inside a taller shape by justify-content on its root', () => {
    const drawing = draw(
      '<p>x</p>',
      'face { justify-content: center; } p { font-size: 10px; line-height: 20px; }',
      {},
      { size: 'shape', height: 100 },
    );
    expect(drawing.runs[0]!.y).toBeCloseTo(40 + 10 + 3.5);
  });

  it('shares a flex row out by flex-grow, and keeps a fixed width', () => {
    const drawing = draw(
      '<div class="row"><span class="a">a</span><span class="b">b</span><span class="c">c</span></div>',
      '.row { display: flex; } span { background: #EEEEEE; } .a { flex: 1; } .b { flex: 2; } .c { width: 50px; }',
      {},
      { width: 200 },
    );
    expect(drawing.boxes.map((box) => Math.round(box.width))).toEqual([50, 100, 50]);
    expect(drawing.boxes.map((box) => Math.round(box.x))).toEqual([0, 50, 150]);
  });

  it('shrinks what passes its width, never past the face', () => {
    const drawing = draw(
      '<div class="row"><span class="a">a</span><span class="b">b</span></div>',
      '.row { display: flex; } span { background: #EEEEEE; flex-shrink: 0; } .a { width: 150px; } .b { width: 150px; }',
      {},
      { width: 200 },
    );
    expect(drawing.boxes.map((box) => Math.round(box.x + box.width))).toEqual([150, 200]);
  });

  it('lays out a grid of px, fr and auto columns', () => {
    const drawing = draw(
      '<div class="g"><span>name</span><span>x</span><span>type</span><span>longer name</span><span>y</span><span>t</span></div>',
      '.g { display: grid; grid-template-columns: 40px 1fr auto; gap: 4px; } span { background: #EEEEEE; }',
      {},
      { width: 200 },
    );
    const [first, second, third] = drawing.boxes;
    expect(first).toMatchObject({ x: 0, width: 40 });
    expect(third!.x + third!.width).toBeCloseTo(200);
    expect(second!.x).toBeCloseTo(44);
    expect(drawing.boxes[3]!.y).toBeGreaterThan(first!.y);
  });

  it('places a badge absolutely against the face, after the flow', () => {
    const drawing = draw(
      '<p>name</p><span class="corner">!</span>',
      '.corner { position: absolute; top: 2px; right: 2px; background: #FFCC00; padding: 0 3px; }',
      {},
      { width: 100 },
    );
    const corner = drawing.boxes.at(-1)!;
    expect(corner.background).toBe('#FFCC00');
    expect(corner.x + corner.width).toBeCloseTo(98);
    expect(corner.y).toBe(2);
  });

  it('draws code, highlights, underline and strikethrough as bands', () => {
    const drawing = draw('<p><code>id</code> <mark>hot</mark> <u>u</u> <s>s</s></p>');
    expect(drawing.bands.map((band) => [band.kind, band.color])).toEqual([
      ['back', 'code-back'],
      ['back', 'highlight'],
      ['underline', 'text'],
      ['strike', 'text'],
    ]);
    expect(drawing.runs[0]).toMatchObject({ text: 'id', variant: 'mono' });
  });

  it('writes lists with their markers, the detail and the badges', () => {
    const drawing = draw(
      '<ul><li>a</li><li>b</li></ul><ol><li>c</li></ol><p><detail/> <badges/></p>',
      [],
      {},
      {
        detail: [
          {
            text: 'Table',
            bold: false,
            italic: false,
            strike: false,
            underline: false,
            code: false,
            highlight: false,
          },
        ],
        badges: ['PK', 'FK'],
      },
    );
    expect(faceDrawingText(drawing)).toBe('• a\n• b\n1. c\nTable PK FK');
  });

  it('places images by id, the icon, and the drawing region', () => {
    const drawing = draw(
      '<div class="r"><icon/><image ref="logo"/></div><drawing/>',
      '.r { display: flex; gap: 2px; }',
      {},
      { size: 'shape', height: 100 },
    );
    expect(drawing.images).toEqual([
      { kind: 'icon', x: 0, y: 0, width: 20, height: 20 },
      { kind: 'image', ref: 'logo', x: 22, y: 0, width: 24, height: 24 },
    ]);
    expect(drawing.regions).toEqual([{ kind: 'drawing', x: 0, y: 24, width: 200, height: 76 }]);
  });

  it('draws a variant, or for a collapsed container its collapsed one, or the face without contents', () => {
    const compiled = compileFace(
      face('<b>{{name}}</b><contents/>', [], {
        variants: [
          { id: 'far', markup: ['<i>{{name}}</i>'] },
          { id: 'shut', markup: ['<s>{{name}}</s>'] },
        ],
      }),
    );
    expect(layOutFace(compiled, input(), { width: 100, variant: 'far' }).runs[0]!.variant).toBe(
      'italic',
    );
    expect(layOutFace(compiled, input(), { width: 100 }).regions.map((each) => each.kind)).toEqual([
      'contents',
    ]);
    expect(layOutFace(compiled, input(), { width: 100, collapsed: true }).regions).toEqual([]);
    const withCollapsed = compileFace(
      face('<b>{{name}}</b><contents/>', [], {
        variants: [{ id: 'shut', markup: ['<s>{{name}}</s>'] }],
        collapsed: 'shut',
      }),
    );
    expect(layOutFace(withCollapsed, input(), { width: 100, collapsed: true }).bands[0]?.kind).toBe(
      'strike',
    );
  });

  it("draws the shape's name when the face cannot be drawn", () => {
    const drawing = layOutFace(compileFace(face('<script/>')), input(), { width: 100, height: 40 });
    expect(drawing.fallback).toMatchObject({ code: 'invalid-face', line: 1, column: 1 });
    expect(faceDrawingText(drawing)).toBe('orders');
    expect(drawing.runs[0]).toMatchObject({ variant: 'bold', size: 14 });
    const wide = robotoWidth('orders', 'bold', 14);
    expect(drawing.runs[0]!.x).toBeCloseTo((100 - wide) / 2);
  });

  it('draws the name when a face lays out past its caps', () => {
    const many = draw(
      '<each of="a"><each of="a"><b>{{item}}</b> </each></each>',
      [],
      { a: Array.from({ length: 32 }, (_, at) => at) },
      { width: 4000 },
    );
    expect(many.fallback).toMatchObject({ code: 'face-too-large' });
    const boxes = draw('<each of="a"><each of="a"><div/></each></each>', [], {
      a: Array.from({ length: 32 }, (_, at) => at),
    });
    expect(boxes.fallback?.reason).toContain('256 boxes');
  });
});

describe('how wide a face of size content is (#15)', () => {
  const card = (style: string | string[], size: 'content' | 'shape' = 'content') =>
    compileFace(face(['<b>{{name}}</b>', '<p>{{who}}</p>'], style, { size }));
  const who = (text: string) => input({ who: text }, { name: 'Hugo' });
  const long = 'Hugo Ferreyra (Paciente de prueba, turno de la tarde)';

  it('keeps the least width when nothing is cut there', () => {
    const compiled = card('p { white-space: nowrap; }');
    expect(faceContentWidth(compiled, who('Hugo'), { least: 160, most: 640 })).toBe(160);
    // Text that wraps is never cut, however long.
    const wraps = card('face { padding: 8px; }');
    expect(faceContentWidth(wraps, who(`${long} ${long}`), { least: 160, most: 640 })).toBe(160);
  });

  it('takes the narrowest width at which nothing is cut, laid out whole there', () => {
    const compiled = card('face { padding: 0 8px; } p { white-space: nowrap; }');
    expect(layOutFace(compiled, who(long), { width: 160 }).cut).toBe(true);
    const width = faceContentWidth(compiled, who(long), { least: 160, most: 640 });
    expect(width).toBeGreaterThan(160);
    expect(width).toBeLessThan(640);
    expect(Number.isInteger(width)).toBe(true);
    const drawing = layOutFace(compiled, who(long), { width });
    expect(drawing.cut).toBe(false);
    expect(drawing.runs.map((run) => run.text)).toContain(long);
    // One unit narrower, it is cut.
    expect(layOutFace(compiled, who(long), { width: width - 1 }).cut).toBe(true);
    // As wide as its text, its padding included, to the unit.
    const text = drawing.runs.find((run) => run.text === long)!;
    expect(width).toBe(Math.ceil(text.width + 16));
  });

  it('keeps the least width for a line clamp, the author’s own limit', () => {
    const compiled = card('p { line-clamp: 1; }');
    expect(layOutFace(compiled, who(long), { width: 120 }).cut).toBe(true);
    expect(faceContentWidth(compiled, who(long), { least: 120, most: 640 })).toBe(120);
    // A clamped line that does not wrap is cut by its width, and grows.
    const nowrap = card('p { line-clamp: 1; white-space: nowrap; }');
    const width = faceContentWidth(nowrap, who(long), { least: 120, most: 640 });
    expect(width).toBeGreaterThan(120);
    expect(layOutFace(nowrap, who(long), { width }).cut).toBe(false);
  });

  it('grows past a wrapping paragraph beside the line that does not wrap, in a flex row', () => {
    const row = compileFace(
      face(
        ['<div class="row"><p class="name">{{who}}</p><p>{{name}} and more words here</p></div>'],
        ['.row { display: flex; gap: 4px; }', '.name { white-space: nowrap; }'],
        { size: 'content' },
      ),
    );
    const width = faceContentWidth(row, who(long), { least: 160, most: 640 });
    expect(width).toBeGreaterThan(160);
    expect(width).toBeLessThan(640);
    expect(overflowsIn(row, who(long), width)).toBe(false);
    expect(overflowsIn(row, who(long), width - 1)).toBe(true);
  });

  it('grows no wider than the most it is given, still cut there', () => {
    const compiled = card('p { white-space: nowrap; }');
    const endless = `${long} ${long} ${long} ${long}`;
    expect(faceContentWidth(compiled, who(endless), { least: 160, most: 400 })).toBe(400);
  });

  it('keeps the least width when no width keeps it from being cut', () => {
    // Its line sits in a box of its own fixed width, which no width of the face helps.
    const fixed = card('p { white-space: nowrap; width: 100px; }');
    expect(overflowsIn(fixed, who(long), 640)).toBe(true);
    expect(faceContentWidth(fixed, who(long), { least: 160, most: 640 })).toBe(160);
    // Cut by its own most height, which a width does not cut by: it keeps its width too.
    const low = card(['face { max-height: 10px; overflow: hidden; }', 'p { line-clamp: 2; }']);
    expect(layOutFace(low, who(long), { width: 160 }).cut).toBe(true);
    expect(faceContentWidth(low, who(long), { least: 160, most: 640 })).toBe(160);
  });

  it('keeps the least width for a face of size shape, and for one that cannot be drawn', () => {
    expect(
      faceContentWidth(card('p { white-space: nowrap; }', 'shape'), who(long), {
        least: 160,
        most: 640,
      }),
    ).toBe(160);
    const broken = compileFace(face('<script>{{name}}</script>', [], { size: 'content' }));
    expect(faceContentWidth(broken, who(long), { least: 160, most: 640 })).toBe(160);
  });
});
