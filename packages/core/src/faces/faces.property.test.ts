/**
 * The properties ADR 0083 asks of faces: a face never draws past its width (nor past its height when
 * it is sized by its shape); laying out is the same wherever it runs; hostile input is refused with
 * its code, line and column, and nothing in a face ever runs; and the caps hold.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../code/hash';
import { compileFace, type ResolvedFace } from './compile';
import {
  faceContentWidth,
  faceIgnoresHeight,
  layOutFace,
  overflowsIn,
  type FaceDrawing,
} from './layout';
import { ADR_FACE, face, input } from './test-faces';

const EPSILON = 1e-6;

const CLASSES = ['a', 'b', 'c', 'row', 'grid'];
const BOXES = ['div', 'p', 'section', 'header', 'footer', 'ul', 'li', 'span'];
const TEXTS = ['b', 'i', 'code', 'mark', 'small', 'sub', 'sup', 'u', 's', 'em', 'strong'];

/** Markup of random elements, slots and conditions, always well formed and within the subset. */
const markupArbitrary: fc.Arbitrary<string> = fc.letrec<{ node: string; nodes: string }>((tie) => ({
  node: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constantFrom(
      '{{name}}',
      '{{text}}',
      '{{long}}',
      '{{n}}',
      ' ',
      'word ',
      'x',
      '<br/>',
      '<detail/>',
      '<badges/>',
      '<icon/>',
      '<image ref="logo"/>',
    ),
    fc
      .tuple(fc.constantFrom(...BOXES, ...TEXTS), fc.subarray(CLASSES), fc.boolean(), tie('nodes'))
      .map(([tag, classes, conditional, inner]) => {
        const cls = classes.length === 0 ? '' : ` class="${classes.join(' ')} s-{{text}}"`;
        const condition = conditional ? ' if="n > 2"' : '';
        return `<${tag}${cls}${condition}>${inner}</${tag}>`;
      }),
    tie('nodes').map((inner) => `<each of="tags"><span class="a">{{item}}</span>${inner}</each>`),
    tie('nodes').map((inner) => `<each of="attributes"><p>{{key}}: {{value}}</p>${inner}</each>`),
  ),
  nodes: fc.array(tie('node'), { maxLength: 4 }).map((nodes) => nodes.join('')),
})).nodes;

const length = fc.oneof(
  fc.integer({ min: 0, max: 500 }).map((n) => `${n}px`),
  fc.integer({ min: 0, max: 100 }).map((n) => `${n}%`),
);
const declaration = fc.oneof(
  fc.constantFrom(
    'display: flex',
    'display: grid',
    'display: block',
    'flex-direction: column',
    'flex-wrap: wrap',
    'flex: 1',
    'flex: 0 0 auto',
    'flex-shrink: 0',
    'align-items: center',
    'align-items: end',
    'justify-content: space-between',
    'justify-content: center',
    'grid-template-columns: 80px 1fr auto',
    'grid-template-columns: auto auto',
    'grid-template-columns: 300px 300px',
    'white-space: nowrap',
    'line-clamp: 2',
    'overflow: hidden',
    'position: absolute',
    'text-align: right',
    'text-align: center',
    'font-weight: 700',
    'font-style: italic',
    'font-family: mono',
    'text-transform: uppercase',
    'background: var(--highlight)',
    'border: 2px solid #336699',
  ),
  fc
    .tuple(
      fc.constantFrom(
        'width',
        'height',
        'min-width',
        'max-width',
        'flex-basis',
        'min-height',
        'max-height',
      ),
      length,
    )
    .map(([p, v]) => `${p}: ${v}`),
  fc
    .tuple(
      fc.constantFrom(
        'padding',
        'margin',
        'gap',
        'top',
        'left',
        'right',
        'bottom',
        'border-radius',
      ),
      fc.integer({ min: 0, max: 60 }),
    )
    .map(([p, v]) => `${p}: ${v}px`),
  fc.integer({ min: 8, max: 32 }).map((size) => `font-size: ${size}px`),
  fc.constantFrom(1, 1.3, 2).map((h) => `line-height: ${h}`),
);
const styleArbitrary = fc
  .array(
    fc.tuple(
      fc.constantFrom(
        'face',
        ...BOXES,
        ...TEXTS,
        ...CLASSES.map((name) => `.${name}`),
        'div p',
        '.a b',
      ),
      fc.array(declaration, { maxLength: 6 }),
    ),
    { maxLength: 8 },
  )
  .map((rules) =>
    rules.map(([selector, declarations]) => `${selector} { ${declarations.join('; ')} }`),
  );

const words = fc.array(
  fc.oneof(
    fc.constantFrom(
      'a',
      'orders',
      'customer_identifier_hash',
      'Ünïcödé',
      '中文字',
      '😀',
      '**bold**',
      '`code`',
    ),
    fc.string({ maxLength: 12 }),
  ),
  { maxLength: 30 },
);

const faceArbitrary: fc.Arbitrary<ResolvedFace> = fc
  .tuple(markupArbitrary, styleArbitrary, fc.constantFrom<'content' | 'shape'>('content', 'shape'))
  .map(([markup, style, size]) =>
    face(markup === '' ? '<p>{{name}}</p>' : markup, style, { size }),
  );

const inputArbitrary = fc
  .record({
    text: words.map((each) => each.join(' ')),
    long: fc.string({ minLength: 0, maxLength: 300 }),
    n: fc.integer({ min: -5, max: 10 }),
    tags: fc.array(fc.oneof(fc.string({ maxLength: 10 }), fc.integer()), { maxLength: 40 }),
    detail: words,
    badges: fc.array(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 4 }),
  })
  .map(({ detail, badges, ...attributes }) =>
    input(attributes, {
      definitions: { text: { format: 'emphasis' } },
      detail: detail.map((text) => ({
        text: `${text} `,
        bold: text.length % 2 === 0,
        italic: false,
        strike: false,
        underline: false,
        code: false,
        highlight: false,
      })),
      badges,
      rowsHeight: 40,
    }),
  );

/** Every rectangle a drawing draws. */
function rects(drawing: FaceDrawing) {
  return [
    ...drawing.boxes,
    ...drawing.bands,
    ...drawing.images,
    ...drawing.regions,
    ...drawing.runs.map((run) => ({
      x: run.x,
      y: run.y - run.size,
      width: run.width,
      height: run.size,
    })),
  ];
}

describe('faces, whatever they hold', () => {
  it('never draw past their width, nor past their height when the shape sizes them', () => {
    fc.assert(
      fc.property(
        faceArbitrary,
        inputArbitrary,
        fc.integer({ min: 0, max: 400 }),
        fc.option(fc.integer({ min: 0, max: 300 }), { nil: undefined }),
        (resolved, data, width, height) => {
          const drawing = layOutFace(compileFace(resolved), data, {
            width,
            ...(height === undefined ? {} : { height }),
          });
          expect(drawing.width).toBe(width);
          for (const rect of rects(drawing)) {
            expect(rect.x).toBeGreaterThanOrEqual(-EPSILON);
            expect(rect.x + rect.width).toBeLessThanOrEqual(width + EPSILON);
          }
          if (resolved.size === 'shape' && height !== undefined) {
            expect(drawing.height).toBe(height);
            for (const each of [
              ...drawing.boxes,
              ...drawing.bands,
              ...drawing.images,
              ...drawing.regions,
            ]) {
              expect(each.y).toBeGreaterThanOrEqual(-EPSILON);
              expect(each.y + each.height).toBeLessThanOrEqual(height + EPSILON);
            }
          }
          expect(drawing.runs.length).toBeLessThanOrEqual(256);
          expect(drawing.boxes.length).toBeLessThanOrEqual(256);
          for (const run of drawing.runs) {
            expect(run.text).not.toBe('');
            expect(Number.isFinite(run.x) && Number.isFinite(run.y)).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('lay out alike at any height when they say they ignore it, as a table’s header does (A4)', () => {
    let ignoring = 0;
    fc.assert(
      fc.property(
        faceArbitrary,
        inputArbitrary,
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 300 }),
        fc.boolean(),
        (resolved, data, width, height, collapsed) => {
          const compiled = compileFace(resolved);
          if (!faceIgnoresHeight(compiled)) return;
          ignoring += 1;
          const options = { width, ...(collapsed ? { collapsed } : {}) };
          const free = layOutFace(compiled, data, options);
          const given = layOutFace(compiled, data, { ...options, height });
          // One too large to lay out is drawn as its name instead, at the height given.
          expect(given.fallback === undefined).toBe(free.fallback === undefined);
          if (free.fallback === undefined) expect(given).toEqual(free);
        },
      ),
      { numRuns: 300 },
    );
    expect(ignoring).toBeGreaterThan(20);
    expect(faceIgnoresHeight(compileFace(ADR_FACE))).toBe(ADR_FACE.size === 'content');
  });

  it('take a width between the least and the most, uncut there unless at either end (#15)', () => {
    let grown = 0;
    fc.assert(
      fc.property(
        faceArbitrary,
        inputArbitrary,
        fc.integer({ min: 0, max: 300 }),
        fc.integer({ min: 0, max: 400 }),
        (resolved, data, least, more) => {
          const compiled = compileFace(resolved);
          const most = least + more;
          const width = faceContentWidth(compiled, data, { least, most });
          expect(width).toBeGreaterThanOrEqual(least);
          expect(width).toBeLessThanOrEqual(most);
          // Only text cut by its width makes it wider: never a clamp, nor a height.
          const cutAt = (at: number) => overflowsIn(compiled, data, at);
          if (resolved.size === 'shape' || !cutAt(least)) expect(width).toBe(least);
          if (width > least && width < most) {
            grown += 1;
            // A whole width at which no text is cut by its width.
            expect(Number.isInteger(width)).toBe(true);
            expect(cutAt(width)).toBe(false);
          }
        },
      ),
      { numRuns: 80 },
    );
    expect(grown).toBeGreaterThan(0);
  });

  it('lay out the same, run after run, as data only', () => {
    fc.assert(
      fc.property(
        faceArbitrary,
        inputArbitrary,
        fc.integer({ min: 0, max: 400 }),
        (resolved, data, width) => {
          const first = layOutFace(compileFace(resolved), data, { width });
          const again = layOutFace(
            compileFace({ ...resolved, markup: [...resolved.markup] }),
            structuredClone(data),
            { width },
          );
          expect(again).toEqual(first);
          // A drawing is plain data: it survives JSON whole.
          expect(JSON.parse(JSON.stringify(first))).toEqual(first);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('lay out to the same unit wherever they run: a known face gives a known drawing', () => {
    const drawing = layOutFace(
      compileFace(ADR_FACE),
      input(
        {
          status: 'frozen',
          descripcion:
            'Every **order** a customer places, one per checkout, with its `total` and ==state==.',
        },
        { definitions: { descripcion: { format: 'emphasis' } }, rowsHeight: 60 },
      ),
      { width: 240 },
    );
    // Written by this test once: it changes only if the engine or the widths change on purpose.
    expect(drawing.runs.map((run) => `${run.text}@${run.x.toFixed(3)},${run.y.toFixed(3)}`))
      .toMatchInlineSnapshot(`
      [
        "orders@8.000,22.000",
        "frozen@194.837,21.000",
        "Every @8.000,45.300",
        "order@37.051,45.300",
        " a customer places, one per@63.440,45.300",
        "checkout, with its @8.000,59.600",
        "total@95.780,59.600",
        " and @128.780,59.600",
        "state@152.496,59.600",
        ".@177.180,59.600",
      ]
    `);
    expect(sha256(JSON.stringify(drawing))).toMatchInlineSnapshot(
      `"8ebc7127c7e99c40edc4b2c703f98246287e2fd261a6fb8ac6004fc94b69269c"`,
    );
  });

  it('use nothing that differs between Node and the browser', () => {
    const folder = fileURLToPath(new URL('.', import.meta.url));
    const sources = readdirSync(folder)
      .filter(
        (name) => name.endsWith('.ts') && !name.includes('.test.') && name !== 'test-faces.ts',
      )
      .map((name) => [name, readFileSync(join(folder, name), 'utf8')] as const);
    sources.push(['roboto.ts', readFileSync(join(folder, '../text/roboto.ts'), 'utf8')]);
    expect(sources.length).toBeGreaterThan(8);
    const platform =
      /\b(globalThis|window|document|navigator|process|require|Intl|performance|fetch|eval|Function|setTimeout|setInterval|XMLHttpRequest|WebAssembly|Worker)\b|\bimport\(|toLocale|localeCompare|Math\.random|Date\b/;
    for (const [name, source] of sources) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(platform.exec(code)?.[0], name).toBeUndefined();
      for (const found of code.matchAll(/from '([^']+)'/g)) {
        expect(
          found[1]!.startsWith('.') || found[1] === '@visual-anything/schema',
          `${name}: ${found[1]}`,
        ).toBe(true);
      }
    }
  });
});

describe('hostile faces', () => {
  const hostile = fc.oneof(
    fc.constantFrom(
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<img src="x" onerror="alert(1)"/>',
      '<div onclick="steal()">x</div>',
      '<a href="javascript:alert(1)">x</a>',
      '<svg><script>x</script></svg>',
      '<iframe src="https://evil"/>',
      '<div style="background: url(https://evil/x.png)">x</div>',
      '<p>&xxe;</p>',
      '<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><p>&xxe;</p>',
      '<![CDATA[<script>x</script>]]>',
      '<?php echo 1 ?>',
      '<template><b>x</b></template>',
      '<object data="x"/>',
      '<p>{{constructor.constructor("alert(1)")()}}</p>',
      '<p>{{__proto__}}',
      '<p if="1; alert(1)">x</p>',
      '<image ref="javascript:alert(1)"/>',
      '<each of="attributes" onmouseover="x"/>',
      // Found by the property: text that looks like a handler, outside any tag, is harmless text.
      ' onb=',
    ),
    fc
      .array(
        fc.constantFrom(
          '<',
          '>',
          '/',
          '"',
          "'",
          '=',
          '&',
          ';',
          '{{',
          '}}',
          'script',
          'on',
          ' ',
          '\n',
          'p',
          'b',
        ),
        { maxLength: 30 },
      )
      .map((parts) => parts.join('')),
  );

  it('are refused with their code, line and column, or read as harmless text', () => {
    fc.assert(
      fc.property(hostile, (markup) => {
        const lines = markup.split('\n');
        const compiled = compileFace(face(lines));
        for (const problem of compiled.problems) {
          expect(['invalid-face', 'face-too-large']).toContain(problem.code);
          // Every refusal carries a place in the text it refuses.
          expect(problem.line).toBeGreaterThanOrEqual(1);
          expect(problem.line).toBeLessThanOrEqual(lines.length);
          expect(problem.column).toBeGreaterThanOrEqual(1);
          expect(problem.column).toBeLessThanOrEqual(lines[problem.line - 1]!.length + 1);
        }
        // An event handler is refused as an attribute, inside a tag; outside one, " onb=" is text.
        if (/<(script|img|a|svg|iframe|template|object)\b|<[^<>]*\son\w+=|<!|<\?/.test(markup)) {
          expect(compiled.ok).toBe(false);
          expect(compiled.problems.some((each) => each.severity === 'error')).toBe(true);
        }
        // Whatever it holds, laying it out answers data, and the name stands in for a face that fails.
        const drawing = layOutFace(compiled, input(), { width: 120, height: 60 });
        if (!compiled.ok) expect(drawing.fallback).toBeDefined();
        expect(JSON.parse(JSON.stringify(drawing))).toEqual(drawing);
      }),
      { numRuns: 400 },
    );
  });

  it('are refused past their caps at a line and a column of the part that passes them', () => {
    const part = fc
      .array(fc.oneof(fc.integer({ min: 0, max: 40 }), fc.integer({ min: 1_990, max: 2_010 })), {
        maxLength: 260,
      })
      .map((lengths) => lengths.map((length) => `<p>${'x'.repeat(length)}`.slice(0, length)));
    fc.assert(
      fc.property(
        part,
        part,
        fc.array(part, { maxLength: 10 }),
        (markup, style, variantMarkups) => {
          const variants = variantMarkups.map((each, at) => ({ id: `v${at}`, markup: each }));
          const compiled = compileFace(face(markup, style, { variants }));
          for (const problem of compiled.problems) {
            if (problem.severity !== 'error') continue;
            const text =
              problem.part.kind === 'markup'
                ? markup
                : problem.part.kind === 'style'
                  ? style
                  : variants.find((each) => each.id === (problem.part as { id: string }).id)!
                      .markup;
            expect(problem.line, problem.reason).toBeGreaterThanOrEqual(1);
            expect(problem.column, problem.reason).toBeGreaterThanOrEqual(1);
            // A variant's own first line, for its count, may be its only and empty line.
            expect(problem.line).toBeLessThanOrEqual(Math.max(1, text.length));
            expect(problem.column).toBeLessThanOrEqual((text[problem.line - 1] ?? '').length + 1);
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('write what values hold as text, never as markup', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '<script>alert(1)</script>',
          '<b onclick="x">y</b>',
          '{{name}}',
          '&lt;',
          '"><img src=x>',
        ),
        (value) => {
          const drawing = layOutFace(compileFace(face('<p>{{v}}</p>')), input({ v: value }), {
            width: 2000,
          });
          expect(drawing.runs.map((run) => run.text).join('')).toBe(value);
          expect(drawing.boxes).toEqual([]);
          expect(drawing.images).toEqual([]);
        },
      ),
    );
  });

  it('hold to their caps, and stay quick, however much they repeat', () => {
    const repeated = face(
      '<each of="a"><each of="a"><each of="a"><span>{{item}}</span></each></each></each>',
      [],
      { size: 'content' },
    );
    const data = input({ a: Array.from({ length: 1000 }, (_, at) => at) });
    const started = Date.now();
    const drawing = layOutFace(compileFace(repeated), data, { width: 300 });
    expect(drawing.fallback?.code).toBe('face-too-large');
    expect(Date.now() - started).toBeLessThan(2_000);
    const wide = face(
      Array.from({ length: 200 }, () => `<p>${'{{long}}'.repeat(8)}</p>`),
      [],
    );
    const many = layOutFace(compileFace(wide), input({ long: 'word '.repeat(400) }), {
      width: 300,
    });
    expect(many.fallback?.code).toBe('face-too-large');
    expect(many.runs.length).toBeLessThanOrEqual(256);
  });
});
