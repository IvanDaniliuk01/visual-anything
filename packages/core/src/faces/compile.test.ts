import { describe, expect, it } from 'vitest';
import { compileFace } from './compile';
import { faceMessage } from './problems';
import { ADR_FACE, face } from './test-faces';

function errorOf(markup: string, style = '') {
  const compiled = compileFace(face(markup, style));
  const error = compiled.problems.find((each) => each.severity === 'error');
  if (error === undefined) throw new Error(`expected ${markup} to be refused`);
  return error;
}

describe('compiling a face', () => {
  it('compiles the ADR example, once for every shape that shares it', () => {
    const compiled = compileFace(ADR_FACE);
    expect(compiled.ok).toBe(true);
    expect(compiled.problems).toEqual([]);
    expect(compiled.markup?.holds).toEqual(new Set(['rows']));
    expect([...compiled.variants.keys()]).toEqual(['far']);
    expect(compiled.attributes.map((each) => each.name)).toEqual([
      'status',
      'status',
      'status',
      'descripcion',
      'descripcion',
    ]);
    expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(compileFace({ ...ADR_FACE, markup: [...ADR_FACE.markup] })).toBe(compiled);
  });

  it.each([
    ['<script>alert(1)</script>', 1, 1, 'nothing in a face runs'],
    ['<p>\n  <img src="x.png"/>\n</p>', 2, 3, 'nothing in a face runs'],
    ['<a>x</a>', 1, 1, 'nothing in a face runs'],
    ['<svg/>', 1, 1, 'nothing in a face runs'],
    ['<style>p{}</style>', 1, 1, 'nothing in a face runs'],
    ['<template/>', 1, 1, 'nothing in a face runs'],
    ['<iframe/>', 1, 1, 'nothing in a face runs'],
    ['<marquee/>', 1, 1, 'not an element a face takes'],
    ['<div onclick="x()"/>', 1, 6, 'nothing in a face runs'],
    ['<div href="https://x"/>', 1, 6, 'nothing in a face is fetched'],
    ['<p id="x"/>', 1, 4, 'only class, style, if and else'],
    ['<rows/><p/>', 1, 1, 'last element'],
    ['<div><rows/></div>', 1, 6, 'last element'],
    ['<detail/><detail/>', 1, 10, 'once'],
    ['<p><rows/></p><contents/>', 1, 4, 'last element'],
    ['<br>x</br>', 1, 1, 'holds nothing'],
    ['<p>{{name</p>', 1, 4, 'never closed'],
    ['<p if="status ~ 1"/>', 1, 15, 'compares'],
    ['<p else=""/>', 1, 4, 'follows an element with "if"'],
    ['<each>x</each>', 1, 1, '"of"'],
    ['<each of="attributes" class="x"/>', 1, 23, 'makes no box'],
    ['<each of="tags" only="a"/>', 1, 1, 'with of="attributes"'],
    ['<image/>', 1, 1, 'ref="its id"'],
    ['<image ref="../x"/>', 1, 13, 'by the id'],
    ['<rows if="x"/>', 1, 7, 'takes no condition'],
  ])('refuses %j at line %i, column %i', (markup, line, column, said) => {
    const error = errorOf(markup);
    expect(error.code).toBe('invalid-face');
    expect([error.line, error.column]).toEqual([line, column]);
    expect(error.reason).toContain(said);
  });

  it('says where a problem is in its message', () => {
    expect(faceMessage(errorOf('<p>\n  <script/>\n</p>'))).toBe(
      'Line 2, column 3 of the markup: <script> is not part of a face: nothing in a face runs or is fetched.',
    );
    const variant = compileFace(
      face('<p/>', '', { variants: [{ id: 'far', markup: ['<b onload="x"/>'] }] }),
    );
    expect(faceMessage(variant.problems[0]!)).toBe(
      'Line 1, column 4 of the variant "far": "onload" is refused: nothing in a face runs.',
    );
  });

  it('reads if and else into a choice, else with a condition or without', () => {
    const compiled = compileFace(
      face(
        `<b if="status = 'live'">live</b>\n<b else="status = 'frozen'">frozen</b>\n<i else="">other</i>`,
      ),
    );
    expect(compiled.ok).toBe(true);
    const choice = compiled.markup!.nodes[0]!;
    expect(choice.kind).toBe('choice');
    if (choice.kind === 'choice')
      expect(choice.branches.map((each) => each.condition === undefined)).toEqual([
        false,
        false,
        true,
      ]);
  });

  it('holds faces to their caps', () => {
    const lines = Array.from({ length: 201 }, () => '<b>x</b>');
    expect(compileFace(face(lines)).problems[0]).toMatchObject({ code: 'face-too-large' });
    const variants = Array.from({ length: 9 }, (_, at) => ({ id: `v${at}`, markup: ['<b/>'] }));
    expect(compileFace(face('<b/>', '', { variants })).problems[0]).toMatchObject({
      code: 'face-too-large',
    });
    expect(compileFace(face(`<b>${'x'.repeat(2_001)}</b>`)).problems[0]).toMatchObject({
      code: 'invalid-face',
      line: 1,
    });
    expect(compileFace(face('<b/>', '', { collapsed: 'none-such' })).ok).toBe(false);
    expect(
      compileFace(face(`${'<div>'.repeat(17)}${'</div>'.repeat(17)}`)).problems[0],
    ).toMatchObject({ code: 'face-too-large' });
  });

  it('reports style it drops as warnings, and compiles still', () => {
    const compiled = compileFace(
      face('<p style="color: red; padding: 4px">x</p>', 'p { transform: none; }'),
    );
    expect(compiled.ok).toBe(true);
    expect(
      compiled.problems.map((each) => [each.severity, each.part.kind, each.line, each.column]),
    ).toEqual([
      ['warning', 'style', 1, 5],
      ['warning', 'markup', 1, 11],
    ]);
  });
});
