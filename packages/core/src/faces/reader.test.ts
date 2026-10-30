import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { readMarkup, type MarkupElement } from './reader';

function refused(text: string) {
  const read = readMarkup(text);
  if (read.ok) throw new Error(`expected a refusal of ${text}`);
  return read;
}

describe('the strict reader of markup', () => {
  it('reads elements, attributes and text, with their lines and columns', () => {
    const read = readMarkup('<div class="head">\n  <b>{{name}}</b><br/>\n</div>');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const div = read.nodes[0] as MarkupElement;
    expect(div).toMatchObject({ name: 'div', line: 1, column: 1 });
    expect(div.attributes).toEqual([
      { name: 'class', value: 'head', line: 1, column: 6, valueAt: { line: 1, column: 13 } },
    ]);
    const b = div.children[1] as MarkupElement;
    expect(b).toMatchObject({ name: 'b', line: 2, column: 3 });
    expect(b.children).toEqual([{ kind: 'text', text: '{{name}}', line: 2, column: 6 }]);
    expect(div.children[2]).toMatchObject({ kind: 'element', name: 'br', children: [] });
  });

  it('reads the five entities and numeric ones, in text and in values', () => {
    const read = readMarkup(`<p title='a &quot;b&quot;'>&lt;b&gt; &amp; &apos;&#233;&#x1F600;</p>`);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const p = read.nodes[0] as MarkupElement;
    expect(p.attributes[0]?.value).toBe('a "b"');
    expect(p.children[0]).toMatchObject({ text: "<b> & 'é😀" });
  });

  it('skips comments', () => {
    const read = readMarkup('<!-- a note --><b>x</b>');
    expect(read.ok && read.nodes.map((node) => node.kind)).toEqual(['element']);
  });

  it.each([
    ['<div>', 1, 1, 'never closed'],
    ['<div></span>', 1, 6, 'closes "div"'],
    ['</b>', 1, 1, 'closes no open element'],
    ['<DIV/>', 1, 2, 'lowercase'],
    ['<p class=head/>', 1, 10, 'in quotes'],
    ['<p hidden/>', 1, 4, 'quoted value'],
    ['<p a="1" a="2"/>', 1, 10, 'twice'],
    ['<p>&nbsp;</p>', 1, 4, 'not an entity'],
    ['<p>a & b</p>', 1, 6, 'entity'],
    ['<p>&#0;</p>', 1, 4, 'not a character'],
    ['<!DOCTYPE html>', 1, 1, 'Doctypes'],
    ['<![CDATA[x]]>', 1, 1, 'CDATA'],
    ['<?xml version="1.0"?>', 1, 1, 'processing instructions'],
    ['<!-- a -- b -->', 1, 1, '"--"'],
    ['<p a="<"/>', 1, 7, '&lt;'],
    ['\n\n  <p', 3, 3, 'never ended'],
  ])('refuses %j at line %i, column %i', (text, line, column, said) => {
    const read = refused(text);
    expect(read.code).toBe('invalid-face');
    expect(read.at).toEqual({ line, column });
    expect(read.reason).toContain(said);
  });

  it('refuses elements nested past 16 levels as too large', () => {
    const deep = `${'<div>'.repeat(17)}${'</div>'.repeat(17)}`;
    const read = refused(deep);
    expect(read.code).toBe('face-too-large');
    expect(readMarkup(`${'<div>'.repeat(16)}${'</div>'.repeat(16)}`).ok).toBe(true);
  });

  it('never throws, and puts every refusal inside the text', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constantFrom(
              '<',
              '>',
              '/',
              '"',
              "'",
              '=',
              '&',
              ';',
              '#',
              'x',
              '-',
              '!',
              '?',
              ' ',
              '\n',
            ),
            fc.constantFrom(
              '<div>',
              '</div>',
              '<b>',
              '</b>',
              '<br/>',
              '&amp;',
              '<!--',
              '-->',
              'class="a"',
            ),
            fc.string({ maxLength: 4 }),
          ),
          { maxLength: 40 },
        ),
        (parts) => {
          const text = parts.join('');
          const read = readMarkup(text);
          if (read.ok) return;
          const lines = text.split('\n');
          expect(read.at.line).toBeGreaterThanOrEqual(1);
          expect(read.at.line).toBeLessThanOrEqual(lines.length);
          expect(read.at.column).toBeGreaterThanOrEqual(1);
          expect(read.at.column).toBeLessThanOrEqual(lines[read.at.line - 1]!.length + 1);
        },
      ),
    );
  });

  it('reads back text it was given escaped', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const clean = [...text].filter(xmlCharacter).join('');
        const escaped = clean.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        const read = readMarkup(`<p>${escaped}</p>`);
        expect(read.ok).toBe(true);
        if (!read.ok) return;
        const children = (read.nodes[0] as MarkupElement).children;
        expect(children.map((child) => (child.kind === 'text' ? child.text : '')).join('')).toBe(
          clean,
        );
      }),
    );
  });

  it('reads in time linear in the text', () => {
    const many = '<b>x</b>'.repeat(20_000);
    const started = performance.now();
    expect(readMarkup(many).ok).toBe(true);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

/** Whether XHTML allows a character in text. */
function xmlCharacter(character: string): boolean {
  const point = character.codePointAt(0)!;
  return (
    point === 0x9 ||
    point === 0xa ||
    point === 0xd ||
    (point >= 0x20 && point <= 0xd7ff) ||
    (point >= 0xe000 && point <= 0xfffd) ||
    point >= 0x10000
  );
}
