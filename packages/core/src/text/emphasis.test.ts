import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { stopwatch } from '../test/cpu';
import {
  type EmphasisBlock,
  type EmphasisRun,
  MAX_EMPHASIS_BLOCKS,
  MAX_EMPHASIS_RUNS,
  emphasisRuns,
  escapeEmphasis,
  parseEmphasis,
  plainText,
} from './emphasis';

const PLAIN = {
  bold: false,
  italic: false,
  strike: false,
  underline: false,
  code: false,
  highlight: false,
} as const;

/** A run with the given text and the named marks set. */
function run(text: string, ...marks: (keyof typeof PLAIN)[]): EmphasisRun {
  const flags: Record<keyof typeof PLAIN, boolean> = { ...PLAIN };
  for (const mark of marks) flags[mark] = true;
  return { text, ...flags };
}

const blocks = (text: string) => parseEmphasis(text, { blocks: true });

describe('emphasisRuns: the inline subset', () => {
  it('reads bold, italic, strikethrough, code, highlight and underline', () => {
    expect(emphasisRuns('**b** *i* _i_ ~~s~~ `c` ==h== ++u++')).toEqual([
      run('b', 'bold'),
      run(' '),
      run('i', 'italic'),
      run(' '),
      run('i', 'italic'),
      run(' '),
      run('s', 'strike'),
      run(' '),
      run('c', 'code'),
      run(' '),
      run('h', 'highlight'),
      run(' '),
      run('u', 'underline'),
    ]);
  });

  it('nests emphasis, except inside code', () => {
    expect(emphasisRuns('**bold _and italic_** `**not**`')).toEqual([
      run('bold ', 'bold'),
      run('and italic', 'bold', 'italic'),
      run(' '),
      run('**not**', 'code'),
    ]);
  });

  it('leaves identifiers, SQL and arithmetic as written', () => {
    for (const text of [
      'col_0_del',
      "'**'::text",
      'C++ and C++',
      'a * b * c',
      '2 ~~ 3',
      'x == y',
      'snake_case_name',
      '<u>not underlined</u>',
    ]) {
      expect(emphasisRuns(text)).toEqual([run(text)]);
    }
  });

  it('reads a backslash before punctuation as that character, and any other backslash as itself', () => {
    expect(emphasisRuns('\\*not\\* C:\\Users \\\\')).toEqual([run('*not* C:\\Users \\')]);
  });

  it('closes a code span only on a run of as many backticks as opened it', () => {
    expect(emphasisRuns('``a ` b`` and `c')).toEqual([run('a ` b', 'code'), run(' and `c')]);
  });

  it('writes a line break as a space in a text of one line, and takes no links there', () => {
    expect(emphasisRuns('one\ntwo [x](https://a.example)')).toEqual([
      run('one two [x](https://a.example)'),
    ]);
  });

  it('gives no runs for an empty text', () => {
    expect(emphasisRuns('')).toEqual([]);
    expect(parseEmphasis('', { blocks: false })).toEqual([]);
    expect(blocks('')).toEqual([]);
    expect(blocks('\n  \n')).toEqual([]);
  });
});

describe('parseEmphasis with blocks', () => {
  it('keeps the paragraphs and lists captions already take (ADR 0058)', () => {
    expect(blocks('Three parts:\n- the bot\n- the API\n\n2. first\n3. then\nafter')).toEqual([
      { kind: 'paragraph', runs: [run('Three parts:')] },
      {
        kind: 'list',
        ordered: false,
        items: [
          { blocks: [{ kind: 'paragraph', runs: [run('the bot')] }] },
          { blocks: [{ kind: 'paragraph', runs: [run('the API')] }] },
        ],
      },
      {
        kind: 'list',
        ordered: true,
        start: 2,
        items: [
          { blocks: [{ kind: 'paragraph', runs: [run('first')] }] },
          { blocks: [{ kind: 'paragraph', runs: [run('then')] }] },
        ],
      },
      { kind: 'paragraph', runs: [run('after')] },
    ]);
  });

  it('keeps a line break inside a paragraph as a line break', () => {
    expect(blocks('one\n**two**  \nthree')).toEqual([
      { kind: 'paragraph', runs: [run('one\n'), run('two', 'bold'), run('\nthree')] },
    ]);
  });

  it('reads headings one to three, and writes deeper ones as the characters they are', () => {
    expect(blocks('# One\n## Two ##\n### *Three*\n#### Four')).toEqual([
      { kind: 'heading', level: 1, runs: [run('One')] },
      { kind: 'heading', level: 2, runs: [run('Two')] },
      { kind: 'heading', level: 3, runs: [run('Three', 'italic')] },
      { kind: 'paragraph', runs: [run('#### Four')] },
    ]);
  });

  it('nests lists to three levels, and writes a fourth as text', () => {
    const parsed = blocks('- a\n  - b\n    - c\n      - d');
    const level1 = parsed[0] as Extract<EmphasisBlock, { kind: 'list' }>;
    const level2 = level1.items[0]!.blocks[1] as Extract<EmphasisBlock, { kind: 'list' }>;
    const level3 = level2.items[0]!.blocks[1] as Extract<EmphasisBlock, { kind: 'list' }>;
    expect(level3.items[0]!.blocks).toEqual([{ kind: 'paragraph', runs: [run('c\n- d')] }]);
  });

  it('reads task items, done and open', () => {
    expect(blocks('- [ ] to do\n- [x] done')).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [
          { checked: false, blocks: [{ kind: 'paragraph', runs: [run('to do')] }] },
          { checked: true, blocks: [{ kind: 'paragraph', runs: [run('done')] }] },
        ],
      },
    ]);
  });

  it('reads quotes, rules and fenced code, whose content stays literal', () => {
    expect(blocks('> quoted **text**\n\n---\n\n```sql\nselect *\n  from **t**\n```')).toEqual([
      {
        kind: 'quote',
        blocks: [{ kind: 'paragraph', runs: [run('quoted '), run('text', 'bold')] }],
      },
      { kind: 'rule' },
      { kind: 'code', text: 'select *\n  from **t**' },
    ]);
  });

  it('reads a GitHub table with its alignments, and its cells with emphasis', () => {
    expect(blocks('| a | **b** | c |\n|:--|:-:|--:|\n| 1 | 2 \\| 3 |')).toEqual([
      {
        kind: 'table',
        align: ['left', 'center', 'right'],
        head: [[run('a')], [run('b', 'bold')], [run('c')]],
        rows: [[[run('1')], [run('2 | 3')], []]],
      },
    ]);
  });

  it('takes no table of more than 12 columns, and at most 50 rows', () => {
    const wide = `${'| a '.repeat(13)}|\n${'|---'.repeat(13)}|`;
    expect(blocks(wide).every((block) => block.kind === 'paragraph')).toBe(true);
    const long = `| a |\n|---|\n${'| r |\n'.repeat(60)}`;
    const [table, rest] = blocks(long);
    expect(table).toMatchObject({ kind: 'table' });
    expect((table as Extract<EmphasisBlock, { kind: 'table' }>).rows).toHaveLength(50);
    expect(rest).toMatchObject({ kind: 'paragraph' });
  });

  it('links http, https and mailto addresses only; any other address is its label as plain text', () => {
    expect(
      blocks(
        '[site](https://a.example/x) [mail](mailto:a@b.example) [bad](javascript:alert(1)) [rel](/x)',
      ),
    ).toEqual([
      {
        kind: 'paragraph',
        runs: [
          { ...run('site'), link: 'https://a.example/x' },
          run(' '),
          { ...run('mail'), link: 'mailto:a@b.example' },
          run(' bad rel'),
        ],
      },
    ]);
  });

  it('takes emphasis inside a link label, and no link inside a link', () => {
    expect(blocks('[**a** [b](https://b.example)](https://a.example)')).toEqual([
      {
        kind: 'paragraph',
        runs: [
          run('['),
          run('a', 'bold'),
          run(' '),
          { ...run('b'), link: 'https://b.example' },
          run('](https://a.example)'),
        ],
      },
    ]);
  });

  it('draws images and raw HTML as the characters they are', () => {
    expect(blocks('<b>x</b>')).toEqual([{ kind: 'paragraph', runs: [run('<b>x</b>')] }]);
  });

  it('writes the rest of a text as one plain paragraph past 500 blocks', () => {
    const text = Array.from({ length: 600 }, (_, at) => `p${at}`).join('\n\n');
    const parsed = blocks(text);
    expect(parsed).toHaveLength(MAX_EMPHASIS_BLOCKS + 1);
    expect(parsed.at(-1)).toEqual({
      kind: 'paragraph',
      runs: [run(Array.from({ length: 100 }, (_, at) => `p${at + 500}`).join('\n'))],
    });
  });

  it('writes the rest of a text as one plain run past 4,000 runs', () => {
    const runs = emphasisRuns('**a** '.repeat(3000));
    expect(runs).toHaveLength(MAX_EMPHASIS_RUNS);
    expect(runs.at(-1)).toEqual(run(runs.at(-1)!.text));
    expect(runs.map((part) => part.text).join('')).toBe('a '.repeat(3000));
  });
});

describe('plainText', () => {
  it('drops every marker it read, and keeps the ones it did not', () => {
    expect(plainText('the **orders** table, `status` and C++')).toBe(
      'the orders table, status and C++',
    );
  });

  it('writes blocks a line each, a link as its label and a table cell by cell', () => {
    expect(
      plainText(
        '# Title\n- [x] one\n- two\n\n[site](https://a.example)\n\n| a | b |\n|---|---|\n| 1 | 2 |',
      ),
    ).toBe('Title\none\ntwo\nsite\na\tb\n1\t2');
  });

  it('reads a text of one line without blocks when asked', () => {
    expect(plainText('# not a heading', { blocks: false })).toBe('# not a heading');
    expect(plainText('# a heading')).toBe('a heading');
  });
});

describe('escapeEmphasis', () => {
  it('leaves words, identifiers inside words and most punctuation as they are', () => {
    expect(escapeEmphasis('the user_id of a row, at 3.5 - or C:\\Users')).toBe(
      'the user_id of a row, at 3.5 - or C:\\Users',
    );
  });

  it('escapes what would be read as markers', () => {
    expect(escapeEmphasis('**a** _b_ `c` [d](e) ++f++ ==g== ~~h~~ |')).toBe(
      '\\*\\*a\\*\\* \\_b\\_ \\`c\\` \\[d](e) \\++f\\++ \\==g\\== \\~~h\\~~ \\|',
    );
    expect(escapeEmphasis('# h\n> q\n- l\n1. n\n2) m\n~~~')).toBe(
      '\\# h\n\\> q\n\\- l\n1\\. n\n2\\) m\n\\~\\~\\~',
    );
  });
});

/** Any text, with the characters the reader treats specially much more often than chance would. */
const anyText = fc
  .array(
    fc.oneof(
      fc.constantFrom(
        '*',
        '**',
        '_',
        '~~',
        '~',
        '`',
        '``',
        '==',
        '++',
        '+',
        '[',
        ']',
        '(',
        ')',
        '\\',
        '|',
        '#',
        '>',
        '-',
        '1.',
        '2)',
        ':',
        '!',
        '<',
        ' ',
        '  ',
        '\t',
        '\n',
        '\n\n',
        '- [ ] ',
        '---',
        '```',
        'https://a.example',
        'a',
        'b',
        'é',
        '日',
      ),
      fc.string({ maxLength: 4 }),
    ),
    { maxLength: 40 },
  )
  .map((parts) => parts.join(''));

describe('properties', () => {
  it('reads an escaped text of one line back as one plain run equal to it', () => {
    fc.assert(
      fc.property(
        anyText.map((text) => text.replace(/[\r\n]/g, '')),
        (text) => {
          const parsed = parseEmphasis(escapeEmphasis(text), { blocks: false });
          expect(parsed).toEqual(text === '' ? [] : [{ kind: 'paragraph', runs: [run(text)] }]);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('reads an escaped text of several lines back as plain paragraphs of its lines', () => {
    fc.assert(
      fc.property(anyText, (text) => {
        const parsed = blocks(escapeEmphasis(text));
        const lines = text.split(/\r\n|\r|\n/).map((line) => line.replace(/^[ \t]+|[ \t]+$/g, ''));
        const paragraphs = lines
          .join('\n')
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.replace(/^\n+|\n+$/g, ''))
          .filter((paragraph) => paragraph !== '');
        expect(parsed).toEqual(
          paragraphs.map((paragraph) => ({ kind: 'paragraph', runs: [run(paragraph)] })),
        );
      }),
      { numRuns: 2000 },
    );
  });

  it('never throws, and gives runs and blocks that hold text', () => {
    fc.assert(
      fc.property(anyText, fc.boolean(), (text, withBlocks) => {
        const parsed = parseEmphasis(text, { blocks: withBlocks });
        const check = (list: EmphasisBlock[]) => {
          for (const block of list) {
            if (block.kind === 'paragraph' || block.kind === 'heading') {
              for (const part of block.runs) expect(part.text).not.toBe('');
            } else if (block.kind === 'list') {
              for (const item of block.items) check(item.blocks);
            } else if (block.kind === 'quote') check(block.blocks);
          }
        };
        check(parsed);
        expect(typeof plainText(text)).toBe('string');
      }),
      { numRuns: 3000 },
    );
  });

  it('never keeps a marker it matched in the plain text', () => {
    type Tree = { mark?: keyof typeof PLAIN; children: (string | Tree)[] };
    const word = fc.stringMatching(/^[a-z0-9]{1,6}$/);
    const tree: fc.Arbitrary<Tree> = fc.letrec<{ tree: Tree }>((own) => ({
      tree: fc.record({
        mark: fc.constantFrom('bold', 'italic', 'strike', 'underline', 'highlight', 'code'),
        children: fc.array(fc.oneof({ depthSize: 'small' }, word, own('tree')), { maxLength: 3 }),
      }),
    })).tree;
    const open: Record<string, string> = {
      bold: '**',
      italic: '_',
      strike: '~~',
      underline: '++',
      highlight: '==',
      code: '`',
    };
    /** The source text and its expected runs, each word with the marks around it. */
    const write = (node: Tree, marks: (keyof typeof PLAIN)[]): [string, EmphasisRun[]] => {
      const inner = node.mark === 'code' ? [...marks, 'code' as const] : [...marks, node.mark!];
      if (node.mark === 'code') {
        const text =
          node.children.map((child) => (typeof child === 'string' ? child : 'x')).join(' ') || 'x';
        return [`\`w ${text} w\``, [run(`w ${text} w`, ...inner)]];
      }
      const parts: [string, EmphasisRun[]][] = [
        ['w', [run('w', ...inner)]],
        ...node.children.map((child): [string, EmphasisRun[]] =>
          typeof child === 'string' ? [child, [run(child, ...inner)]] : write(child, inner),
        ),
        ['w', [run('w', ...inner)]],
      ];
      const runs: EmphasisRun[] = [];
      parts.forEach(([, partRuns], at) => {
        if (at > 0) runs.push(run(' ', ...inner));
        runs.push(...partRuns);
      });
      const marker = open[node.mark!]!;
      return [`${marker}${parts.map(([source]) => source).join(' ')}${marker}`, runs];
    };
    const merged = (runs: EmphasisRun[]) =>
      runs.reduce<EmphasisRun[]>((all, part) => {
        const last = all.at(-1);
        if (
          last &&
          JSON.stringify({ ...last, text: '' }) === JSON.stringify({ ...part, text: '' })
        ) {
          all[all.length - 1] = { ...last, text: last.text + part.text };
        } else all.push(part);
        return all;
      }, []);
    fc.assert(
      fc.property(fc.array(tree, { minLength: 1, maxLength: 3 }), (trees) => {
        const written = trees.map((node) => write(node, []));
        const source = written.map(([text]) => text).join(' x ');
        const expected = merged(
          written.flatMap(([, runs], at) => (at > 0 ? [run(' x '), ...runs] : runs)),
        );
        expect(emphasisRuns(source)).toEqual(expected);
        expect(plainText(source)).toBe(expected.map((part) => part.text).join(''));
      }),
      { numRuns: 1000 },
    );
  });

  it('takes time that grows linearly with the text, whatever it holds', () => {
    const shapes: ((n: number) => string)[] = [
      (n) => '*a'.repeat(n),
      (n) => '**a_'.repeat(n),
      (n) => '_a*'.repeat(n),
      (n) => '[a]('.repeat(n),
      (n) => '[('.repeat(n),
      (n) => '['.repeat(n) + ']'.repeat(n),
      (n) => '[a](https://x "'.repeat(n),
      (n) => Array.from({ length: Math.sqrt(n) }, (_, at) => '`'.repeat(at + 1) + 'a').join(''),
      (n) => '`a``'.repeat(n),
      (n) => '~~a=='.repeat(n),
      (n) => '\\'.repeat(n),
      (n) => 'a_b '.repeat(n),
      (n) => '> '.repeat(n) + 'a',
      (n) => '- a\n  '.repeat(n),
      (n) => `| a ${'| b '.repeat(10)}|\n${'|---'.repeat(11)}|\n${'| c '.repeat(n)}|\n`,
      (n) => '# a  #  b   '.repeat(n),
      (n) => `a${' '.repeat(n)}b \n`,
      (n) => '- [x] *a\n'.repeat(n),
      (n) => '```\n'.repeat(n),
      (n) => '***a\n\n'.repeat(n),
    ];
    /** The time one reading takes, read again and again for long enough that a coarse clock counts. */
    const once = (text: string) => {
      const elapsed = stopwatch();
      let times = 0;
      let took: number;
      do {
        parseEmphasis(text, { blocks: true });
        times++;
        took = elapsed();
      } while (took < 60);
      return took / times;
    };
    // The least of three readings: a collection or a busy machine only ever makes one slower.
    const timeOf = (text: string) => {
      parseEmphasis(text, { blocks: true });
      return Math.min(once(text), once(text), once(text));
    };
    for (const shape of shapes) {
      const small = shape(2_000);
      const large = shape(16_000);
      const ratio = timeOf(large) / timeOf(small) / (large.length / small.length);
      expect(ratio, shape.toString()).toBeLessThan(4);
    }
  });
});
