import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { EmphasisBlocks, EmphasisPreview, EmphasisRuns } from './EmphasisText';
import { useEmphasisKeys } from './useEmphasisKeys';

describe('EmphasisRuns', () => {
  it('writes runs as strong, em, s, u, code and mark, nested in that order', () => {
    const { container } = render(
      <EmphasisRuns text="**b** *i* ~~s~~ ++u++ `c` ==h== ***both***" />,
    );
    expect(container.innerHTML).toBe(
      '<strong>b</strong> <em>i</em> <s>s</s> <u>u</u> <code>c</code> <mark>h</mark> <strong><em>both</em></strong>',
    );
  });

  it('writes markup in a text as the characters it is', () => {
    const { container } = render(<EmphasisRuns text={'<img src=x onerror="alert(1)"> **<b>**'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toBe('<img src=x onerror="alert(1)"> <b>');
  });
});

describe('EmphasisBlocks', () => {
  it('writes headings from the level it is given, lists, quotes, rules and code', () => {
    const { container } = render(
      <EmphasisBlocks
        text={'# One\n## Two\n### Three\n\n- a\n  1. b\n\n> q\n\n---\n\n```\n**x**\n```'}
        headingLevel={4}
      />,
    );
    expect(container.querySelector('h4')?.textContent).toBe('One');
    expect(container.querySelector('h5')?.textContent).toBe('Two');
    expect(container.querySelector('h6')?.textContent).toBe('Three');
    expect(container.querySelector('ul > li')?.firstChild?.textContent).toBe('a');
    expect(container.querySelector('ul > li > ol > li')?.textContent).toBe('b');
    expect(container.querySelector('blockquote')?.textContent).toBe('q');
    expect(container.querySelector('hr')).not.toBeNull();
    expect(container.querySelector('pre > code')?.textContent).toBe('**x**');
  });

  it('keeps a line break in a paragraph, and starts a numbered list at its number', () => {
    const { container } = render(<EmphasisBlocks text={'one\ntwo\n\n3. three'} />);
    expect(container.querySelector('p')?.innerHTML).toBe('one<br>two');
    expect(container.querySelector('ol')?.getAttribute('start')).toBe('3');
  });

  it('draws task items as boxes that never change', () => {
    render(<EmphasisBlocks text={'- [x] done\n- [ ] to do'} />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([true, false]);
    for (const box of boxes) {
      expect(box).toBeDisabled();
      fireEvent.click(box);
    }
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([true, false]);
  });

  it('draws a table with its head, its alignments and its cells', () => {
    const { container } = render(<EmphasisBlocks text={'| a | **b** |\n|:-:|--:|\n| 1 | 2 |'} />);
    expect([...container.querySelectorAll('th')].map((cell) => cell.className)).toEqual([
      'emphasis-align-center',
      'emphasis-align-right',
    ]);
    expect(container.querySelector('th strong')?.textContent).toBe('b');
    expect([...container.querySelectorAll('td')].map((cell) => cell.textContent)).toEqual([
      '1',
      '2',
    ]);
  });

  it('opens a link in a new tab, with no opener and no referrer', () => {
    render(<EmphasisBlocks text="[docs](https://docs.example/a) and [x](javascript:alert(1))" />);
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://docs.example/a');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('writes nothing for a text with nothing in it', () => {
    const { container } = render(<EmphasisBlocks text="" className="x" />);
    expect(container.innerHTML).toBe('<div class="emphasis-text x"></div>');
  });
});

describe('EmphasisPreview', () => {
  it('shows the drawn text only when it differs from the source', () => {
    const { container, rerender } = render(<EmphasisPreview text="plain words" />);
    expect(container.innerHTML).toBe('');
    rerender(<EmphasisPreview text="the **orders** table" />);
    expect(container.querySelector('strong')?.textContent).toBe('orders');
  });

  it('shows a text that holds Math typeset, in a field of one line or several', () => {
    const { container, rerender } = render(<EmphasisPreview text="costs $20 and $30" />);
    expect(container.innerHTML).toBe('');
    rerender(<EmphasisPreview text="loss $x^2$" />);
    expect(screen.getByRole('group', { name: 'As it is drawn' })).toBeInTheDocument();
    expect(container.querySelector('.katex')).not.toBeNull();
    rerender(<EmphasisPreview text="a | $y$ |" blocks={false} />);
    expect(container.querySelector('.katex annotation')?.textContent).toBe('y');
    rerender(<EmphasisPreview text={'| a |\n|---|\n| $z$ |'} />);
    expect(container.querySelector('td .katex annotation')?.textContent).toBe('z');
  });
});

describe('Math (ADR 0106)', () => {
  it('draws Math within a line in its run, with KaTeX, among the text around it', () => {
    const { container } = render(<EmphasisRuns text="the loss $\frac{1}{n}$ and $$x$$ here" />);
    const pieces = container.querySelectorAll('.emphasis-math');
    expect(pieces).toHaveLength(2);
    expect(pieces[0]?.querySelector('annotation')?.textContent).toBe('\\frac{1}{n}');
    expect(pieces[1]).toHaveClass('emphasis-math-display');
    expect(container.firstChild?.textContent).toBe('the loss ');
    expect(container.lastChild?.textContent).toBe(' here');
  });

  it('draws a math block, from dollars or a fence, as a block of display style', () => {
    const { container } = render(
      <EmphasisBlocks
        text={'Before\n\n$$\n\\sum_i i\n$$\n\n```math\ne = mc^2\n```\n\n- $a$ in a list'}
      />,
    );
    const blocks = container.querySelectorAll('.emphasis-math-block');
    expect(blocks).toHaveLength(2);
    for (const block of blocks) expect(block.querySelector('.katex-display')).not.toBeNull();
    expect(container.querySelector('li .emphasis-math .katex')).not.toBeNull();
    expect(container.querySelector('pre')).toBeNull();
  });

  it('leaves dollars that are not Math as text', () => {
    const { container } = render(<EmphasisBlocks text={'$20,000 and $30,000\n\n\\$x$ and $ y$'} />);
    expect(container.querySelector('.emphasis-math')).toBeNull();
    expect(container.textContent).toBe('$20,000 and $30,000$x$ and $ y$');
  });

  it('draws Math that cannot be typeset as its TeX as typed, with a warning mark', () => {
    const { container } = render(<EmphasisBlocks text={'a $\\nope$ b\n\n$$\n\\nope\n$$'} />);
    const failed = container.querySelectorAll('.emphasis-math-error');
    expect([...failed].map((each) => each.lastChild?.textContent)).toEqual(['$\\nope$', '\\nope']);
    expect(failed[1]).toHaveClass('emphasis-math-display');
  });
});

function Field({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const keys = useEmphasisKeys();
  return (
    <textarea
      aria-label="Text"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => keys.onKeyDown(event, setText)}
    />
  );
}

describe('useEmphasisKeys', () => {
  it('wraps the selection in markers, and takes them away again', () => {
    render(<Field initial="the orders table" />);
    const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Text' });
    field.setSelectionRange(4, 10);
    fireEvent.keyDown(field, { key: 'b', ctrlKey: true });
    expect(field.value).toBe('the **orders** table');
    expect([field.selectionStart, field.selectionEnd]).toEqual([6, 12]);
    fireEvent.keyDown(field, { key: 'b', ctrlKey: true });
    expect(field.value).toBe('the orders table');
    fireEvent.keyDown(field, { key: 'H', ctrlKey: true, shiftKey: true });
    expect(field.value).toBe('the ==orders== table');
  });

  it('leaves other keys to the field', () => {
    render(<Field initial="text" />);
    const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Text' });
    field.setSelectionRange(0, 4);
    fireEvent.keyDown(field, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(field, { key: 'b' });
    expect(field.value).toBe('text');
  });
});
