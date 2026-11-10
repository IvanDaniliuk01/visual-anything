/**
 * Text emphasis in the text exports (ADR 0082): the outline writes it as CommonMark and GitHub's
 * Markdown, escaped as every text is; Mermaid and Structurizr write plain text and say so.
 */
import { parseEmphasis, plainText, type ProjectSnapshot } from '@visual-anything/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { setCurrentLanguage } from '../i18n/language';
import { SAMPLE_VIEW } from '../test/exports';
import { loadSample } from '../test/sample';
import { markdownOfEmphasis } from './markdown';
import { writeMermaid } from './mermaid';
import { writeOutline } from './outline';
import { losesEmphasis } from './plain-texts';
import { writeStructurizr } from './structurizr';

const LOST = 'text emphasis (bold, italic and the rest) is written as plain text';

describe('markdownOfEmphasis', () => {
  it('writes runs with CommonMark’s and GitHub’s markers, highlight as <mark> and underline as <ins>', () => {
    expect(markdownOfEmphasis('**b** *i* ~~s~~ `c` ==h== ++u++ ***bi***')).toBe(
      '**b** *i* ~~s~~ `c` <mark>h</mark> <ins>u</ins> ***bi***',
    );
  });

  it('nests marks as the runs change, and keeps spaces outside the markers', () => {
    expect(markdownOfEmphasis('**bold _and italic_ again**')).toBe('**bold *and italic* again**');
    expect(markdownOfEmphasis('*a **b***')).toBe('*a **b***');
  });

  it('escapes everything else, as the outline escapes every text', () => {
    expect(markdownOfEmphasis('<script>x</script> \\*not\\* [a](javascript:x) #1 & co')).toBe(
      '\\<script\\>x\\</script\\> \\*not\\* a \\#1 &amp; co',
    );
  });

  it('writes a link to an allowed address, and only those', () => {
    expect(
      markdownOfEmphasis('[**docs**](https://docs.example/a_b) and [mail](mailto:a@b.example)'),
    ).toBe('[**docs**](<https://docs.example/a_b>) and [mail](<mailto:a@b.example>)');
  });

  it('writes blocks: headings, lists, tasks, quotes, rules, code and tables', () => {
    expect(
      markdownOfEmphasis(
        '# Title\n\n- one\n  - **two**\n- [x] done\n\n3. three\n\n> quoted\n\n---\n\n```\n**raw** ```x\n```\n\n| a | b |\n|:-:|--|\n| `1` | 2 |',
      ),
    ).toBe(
      [
        '# Title',
        '',
        '- one',
        '  - **two**',
        '- [x] done',
        '',
        '3. three',
        '',
        '> quoted',
        '',
        '---',
        '',
        '````',
        '**raw** ```x',
        '````',
        '',
        '| a | b |',
        '| :-: | --- |',
        '| `1` | 2 |',
      ].join('\n'),
    );
  });

  it('keeps a line break in a paragraph as one, and a line that would start a block as text', () => {
    expect(markdownOfEmphasis('one\n\\- two\n3\\. three')).toBe('one\\\n\\- two\\\n3\\. three');
  });

  it('writes Math as its TeX as written, unescaped, and a dollar that is text escaped (ADR 0106)', () => {
    expect(markdownOfEmphasis('**Area** $\\pi r_*^2$, $$\\sum$$ and $`a_b`$ for \\$5')).toBe(
      '**Area** $\\pi r_*^2$, $$\\sum$$ and $`a_b`$ for \\$5',
    );
    expect(markdownOfEmphasis('**bold $x$**')).toBe('**bold $x$**');
    expect(markdownOfEmphasis('| a |\n|---|\n| $\\|x\\|$ |')).toBe('| a |\n| --- |\n| $\\|x\\|$ |');
  });

  it('writes a math block between $$ lines, or in a math fence when $$ cannot hold it', () => {
    expect(markdownOfEmphasis('Sum:\n\n$$\n\\sum_i\n  x_i\n$$\n\n$$e^x$$')).toBe(
      'Sum:\n\n$$\n\\sum_i\n  x_i\n$$\n\n$$\ne^x\n$$',
    );
    expect(markdownOfEmphasis('```math\na\n$$\nb\n```\n\n```math\n```')).toBe(
      '```math\na\n$$\nb\n```\n\n```math\n```',
    );
    expect(markdownOfEmphasis('- $$x$$')).toBe('- $$\n  x\n  $$');
  });

  it('writes text that reads back as the same text, whatever it holds', () => {
    // Read back without <mark> and <ins>, which GitHub keeps but the core's reader does not take.
    const anyText = fc
      .array(
        fc.oneof(
          fc.constantFrom('*', '**', '_', '~~', '`', '[', ']', '(', ')', '\\', '|', '#', '>', '-'),
          fc.constantFrom(' ', '\n', '\n\n', '1.', 'a', 'b', 'https://x.example', '<', '&'),
          fc.constantFrom('$', '$$', '$x$', '\\$', '$`', '1', '$$\n', '```math\n'),
        ),
        { maxLength: 30 },
      )
      .map((parts) => parts.join(''));
    fc.assert(
      fc.property(anyText, (text) => {
        const written = markdownOfEmphasis(text).replace(/&amp;/g, '&');
        expect(plainText(written)).toBe(plainText(text));
      }),
      { numRuns: 1500 },
    );
  });
});

function withEmphasis(): ProjectSnapshot {
  const project = loadSample();
  return {
    ...project,
    model: {
      ...project.model,
      elements: project.model.elements.map((element, at) =>
        at === 1 ? { ...element, description: 'Holds the **orders** table.' } : element,
      ),
    },
    views: project.views.map((view) =>
      view.id === SAMPLE_VIEW
        ? {
            ...view,
            description: 'The **whole** system:\n\n- the `api`\n- ==what changes==',
            freeShapes: [
              ...view.freeShapes,
              {
                id: 'note-emphasis',
                kind: 'note' as const,
                x: 0,
                y: 900,
                width: 200,
                height: 80,
                text: 'Read the ~~old~~ **new** table.\n\n- [ ] check',
              },
            ],
          }
        : view,
    ),
  };
}

describe('the outline in Markdown', () => {
  it('writes descriptions and notes with their emphasis and blocks', () => {
    setCurrentLanguage('en');
    const { text } = writeOutline(withEmphasis(), SAMPLE_VIEW);
    expect(text).toContain('The **whole** system:\n\n- the `api`\n- <mark>what changes</mark>\n');
    expect(text).toContain('- Read the ~~old~~ **new** table.\n\n  - [ ] check\n');
  });
});

describe('Mermaid and Structurizr', () => {
  it('write emphasised texts as plain text, and say so among what they lost', () => {
    setCurrentLanguage('en');
    const mermaid = writeMermaid(withEmphasis(), SAMPLE_VIEW);
    expect(mermaid.text).toContain('accDescr: The whole system: the api what changes');
    expect(mermaid.lost).toContain(LOST.charAt(0).toUpperCase() + LOST.slice(1) + '.');
    const structurizr = writeStructurizr(withEmphasis(), SAMPLE_VIEW);
    expect(structurizr.text).not.toContain('**');
    expect(structurizr.lost).toContain(LOST.charAt(0).toUpperCase() + LOST.slice(1) + '.');
  });

  it('say nothing of emphasis when no text they write has any', () => {
    setCurrentLanguage('en');
    const project = loadSample();
    expect(writeMermaid(project, SAMPLE_VIEW).lost.join(' ')).not.toContain('emphasis');
    expect(writeStructurizr(project, SAMPLE_VIEW).lost.join(' ')).not.toContain('emphasis');
  });
});

/** The sample, a description and the view's holding Math (ADR 0106), and no other markup. */
function withMath(): ProjectSnapshot {
  const project = loadSample();
  return {
    ...project,
    model: {
      ...project.model,
      elements: project.model.elements.map((element, at) =>
        at === 1 ? { ...element, description: 'Holds $\\frac{a}{b}$ of $`x`$ rows.' } : element,
      ),
    },
    views: project.views.map((view) =>
      view.id === SAMPLE_VIEW
        ? { ...view, description: 'The loss:\n\n$$\nL = \\sum_i e_i^2\n$$' }
        : view,
    ),
  };
}

describe('Math in Mermaid and Structurizr (ADR 0106)', () => {
  it('writes the TeX as typed, and says nothing of emphasis for a text whose only markup is Math', () => {
    setCurrentLanguage('en');
    const mermaid = writeMermaid(withMath(), SAMPLE_VIEW);
    expect(mermaid.text).toContain('accDescr: The loss: $$L = \\sum_i e_i^2$$');
    expect(mermaid.lost.join(' ')).not.toContain('emphasis');
    const structurizr = writeStructurizr(withMath(), SAMPLE_VIEW);
    // The DSL holds no backslash, which it writes "∖" in every text (`dslString`).
    expect(structurizr.text).toContain('"Holds $∖frac{a}{b}$ of $`x`$ rows."');
    expect(structurizr.lost.join(' ')).not.toContain('emphasis');
  });

  it('still says so when a text holding Math has other emphasis too', () => {
    setCurrentLanguage('en');
    expect(losesEmphasis('the **loss** $x^2$')).toBe(true);
    expect(losesEmphasis('the loss $x^2$, then $$y$$')).toBe(false);
    expect(losesEmphasis('the loss:\n\n```math\nx^2\n```')).toBe(false);
    expect(losesEmphasis('- $x^2$')).toBe(true);
    // A text without Math is judged as before: an escape is written as the character it escapes.
    expect(losesEmphasis('a \\* b')).toBe(true);
    expect(losesEmphasis('plain $20 and $30')).toBe(false);
  });
});

it('reads a written heading back as a heading', () => {
  expect(parseEmphasis(markdownOfEmphasis('## Two'), { blocks: true })[0]).toMatchObject({
    kind: 'heading',
    level: 2,
  });
});
