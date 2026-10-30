import { describe, expect, it } from 'vitest';
import { parseCondition, parseSlot, parseTemplate } from './slots';
import { cascade, computeStyle, INITIAL_STYLE, readStyle, type Matched } from './style';

function rules(text: string) {
  const read = readStyle(text);
  if (!read.ok) throw new Error(read.reason);
  return read;
}

function styleOf(text: string, element: Matched, ancestors: Matched[] = []) {
  return computeStyle(INITIAL_STYLE, cascade(rules(text).rules, element, ancestors));
}

describe('the style subset', () => {
  it('reads the ADR example', () => {
    const read = rules(
      [
        '.head { display: flex; gap: 6px; padding: 8px; background: var(--fill); }',
        '.head b { flex: 1; font-size: 14px; line-clamp: 1; }',
        '.badge { padding: 2px 6px; border-radius: 4px; font-size: 11px; background: var(--highlight); }',
        '.status-frozen { background: #9DC3E6; }',
        '.desc { padding: 0 8px 8px; font-size: 11px; color: var(--text-muted); line-clamp: 3; }',
      ].join('\n'),
    );
    expect(read.dropped).toEqual([]);
    expect(read.rules).toHaveLength(5);
    const head = styleOf(
      read.rules.length
        ? '.head { display: flex; gap: 6px; padding: 8px; background: var(--fill); }'
        : '',
      { name: 'div', classes: ['head'] },
    );
    expect(head).toMatchObject({
      display: 'flex',
      rowGap: 6,
      columnGap: 6,
      paddingTop: 8,
      paddingLeft: 8,
      background: 'fill',
    });
  });

  it('applies rules by specificity, then by place, and inherits text properties', () => {
    const text =
      'b { color: #111111; } .x { color: #222222; } b { font-size: 20px; } div b.x { color: #333333; }';
    expect(styleOf(text, { name: 'b', classes: [] }).color).toBe('#111111');
    expect(styleOf(text, { name: 'b', classes: ['x'] }).color).toBe('#222222');
    expect(styleOf(text, { name: 'b', classes: ['x'] }, [{ name: 'div', classes: [] }]).color).toBe(
      '#333333',
    );
    const parent = styleOf('p { color: #444444; font-weight: 700; padding: 4px; }', {
      name: 'p',
      classes: [],
    });
    const child = computeStyle(parent, []);
    expect(child).toMatchObject({ color: '#444444', bold: true, paddingTop: 0 });
  });

  it('matches descendants through any ancestors, the face itself among them', () => {
    const face: Matched = { name: 'face', classes: [] };
    const text = '.head b { font-size: 14px; } face p { font-size: 9px; }';
    expect(
      styleOf(text, { name: 'b', classes: [] }, [
        face,
        { name: 'div', classes: ['head'] },
        { name: 'span', classes: [] },
      ]).fontSize,
    ).toBe(14);
    expect(styleOf(text, { name: 'b', classes: [] }, [face]).fontSize).toBe(11);
    expect(styleOf(text, { name: 'p', classes: [] }, [face]).fontSize).toBe(9);
  });

  it('drops what the subset does not take, at its line and column', () => {
    const read = rules(
      [
        '@import url(x.css);',
        'p { color: red; font-size: 40px; transform: rotate(4deg); }',
        'a > b { color: #000000; }',
        'p { background: url(x.png); color: #123456 !important; }',
        '@media print { p { color: #000000; } }',
        'p { font-family: "Comic Sans"; }',
      ].join('\n'),
    );
    expect(read.dropped.map(({ line, column }) => [line, column])).toEqual([
      [1, 1],
      [2, 5],
      [2, 17],
      [2, 34],
      [3, 1],
      [4, 5],
      [4, 29],
      [5, 1],
      [6, 5],
    ]);
    expect(read.dropped[0]!.reason).toContain('"@" rules');
    expect(read.dropped[2]!.reason).toContain('8 to 32 px');
  });

  it('refuses a style past 128 rules', () => {
    const read = readStyle(
      Array.from({ length: 129 }, (_, at) => `.c${at} { color: #000000; }`).join('\n'),
    );
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.at).toEqual({ line: 129, column: 1 });
  });

  it('reads the properties of the subset', () => {
    const style = styleOf(
      `p { display: grid; grid-template-columns: 80px 1fr auto; width: 50%; max-width: 200px; margin: 1px 2px;
        position: absolute; top: 4px; right: 4px; border: 1px dashed var(--stroke); border-bottom: none;
        overflow: hidden; font-weight: 600; font-style: italic; font-family: mono; line-height: 1.5;
        text-align: center; text-decoration: underline line-through; text-transform: uppercase;
        white-space: nowrap; align-items: center; justify-content: space-between; flex: 2 0 10px; }`,
      { name: 'p', classes: [] },
    );
    expect(style).toMatchObject({
      display: 'grid',
      gridColumns: [{ px: 80 }, { fr: 1 }, 'auto'],
      width: { percent: 50 },
      maxWidth: { px: 200 },
      marginTop: 1,
      marginRight: 2,
      position: 'absolute',
      top: 4,
      right: 4,
      borderTop: { width: 1, style: 'dashed', color: 'stroke' },
      overflowHidden: true,
      bold: true,
      italic: true,
      mono: true,
      lineHeight: { multiple: 1.5 },
      textAlign: 'center',
      underline: true,
      strike: true,
      textTransform: 'uppercase',
      nowrap: true,
      alignItems: 'center',
      justifyContent: 'space-between',
      flexGrow: 2,
      flexShrink: 0,
      flexBasis: { px: 10 },
    });
    expect(style.borderBottom).toBeUndefined();
  });
});

describe('slots and conditions', () => {
  it('reads slots in text', () => {
    const read = parseTemplate(
      '{{name}} — {{attr "Fecha de alta" ?? "—"}} {{descripcion | plain}}',
    );
    expect(read).toEqual({
      ok: true,
      value: [
        { ref: { kind: 'name' }, plain: false },
        ' — ',
        { ref: { kind: 'attribute', name: 'Fecha de alta' }, plain: false, fallback: '—' },
        ' ',
        { ref: { kind: 'attribute', name: 'descripcion' }, plain: true },
      ],
    });
  });

  it('refuses slots it cannot read', () => {
    expect(parseTemplate('a {{name')).toMatchObject({ ok: false, offset: 2 });
    expect(parseSlot('name | upper')).toMatchObject({ ok: false });
    expect(parseSlot('name ?? —')).toMatchObject({ ok: false });
    expect(parseSlot('plain')).toMatchObject({ ok: false });
    expect(parseSlot('attr ""')).toMatchObject({ ok: false });
  });

  it('reads conditions', () => {
    expect(parseCondition('status')).toEqual({
      ok: true,
      value: { kind: 'has', ref: { kind: 'attribute', name: 'status' }, not: false },
    });
    expect(parseCondition('not archived')).toMatchObject({
      ok: true,
      value: { kind: 'has', not: true },
    });
    expect(parseCondition("status = 'live'")).toMatchObject({
      ok: true,
      value: { op: '=', values: ['live'] },
    });
    expect(parseCondition("status in 'live' 'frozen'")).toMatchObject({
      ok: true,
      value: { op: 'in', values: ['live', 'frozen'] },
    });
    expect(parseCondition('rows >= 10')).toMatchObject({
      ok: true,
      value: { op: '>=', values: [10] },
    });
    expect(parseCondition('attr "Fecha de alta" != "x"')).toMatchObject({
      ok: true,
      value: { op: '!=', ref: { name: 'Fecha de alta' } },
    });
  });

  it('refuses conditions it cannot read', () => {
    expect(parseCondition("rows < 'ten'")).toMatchObject({ ok: false });
    expect(parseCondition('status ~ 1')).toMatchObject({ ok: false });
    expect(parseCondition("status = 'a' 'b'")).toMatchObject({ ok: false });
    expect(parseCondition('not status = 1')).toMatchObject({ ok: false });
    expect(parseCondition('')).toMatchObject({ ok: false });
  });
});
