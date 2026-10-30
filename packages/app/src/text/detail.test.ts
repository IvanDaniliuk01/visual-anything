import { runsText, type DetailPart } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { detailPlainText, detailRunsOf } from './detail';

const parts: DetailPart[] = [
  { kind: 'component-name', text: 'Table' },
  { kind: 'attribute', attribute: 'note', text: 'the **orders** table' },
  { kind: 'attribute', attribute: 'default', text: "'**'::text" },
  { kind: 'badge', text: 'PK' },
];
const takes = (attribute: string) => attribute === 'note';

describe('a detail with text emphasis', () => {
  it('reads only the values that take emphasis, and keeps the rest as written', () => {
    const runs = detailRunsOf(parts, takes) ?? [];
    expect(runsText(runs)).toBe("Table · the orders table · '**'::text · PK");
    expect(runs.filter((run) => run.bold).map((run) => run.text)).toEqual(['orders']);
  });

  it('is drawn as written when no value that takes emphasis draws differently', () => {
    expect(detailRunsOf(parts, () => false)).toBeUndefined();
    expect(
      detailRunsOf([{ kind: 'attribute', attribute: 'note', text: 'plain' }], takes),
    ).toBeUndefined();
  });

  it('never pairs a marker left open in one value with one in the next', () => {
    const runs = detailRunsOf(
      [
        { kind: 'attribute', attribute: 'a', text: '**open' },
        { kind: 'attribute', attribute: 'b', text: 'close** and *it*' },
      ],
      () => true,
    );
    expect(runs?.some((run) => run.bold)).toBe(false);
    expect(runsText(runs ?? [])).toBe('**open · close** and it');
  });

  it('is announced by its plain text', () => {
    const detailRuns = detailRunsOf(parts, takes);
    expect(
      detailPlainText({ componentName: 'Table', detail: 'x', ...(detailRuns && { detailRuns }) }),
    ).toBe("Table · the orders table · '**'::text · PK");
    expect(detailPlainText({ componentName: 'Table', detail: 'as **written**' })).toBe(
      'as **written**',
    );
    expect(detailPlainText({ componentName: 'Table' })).toBe('Table');
  });
});
