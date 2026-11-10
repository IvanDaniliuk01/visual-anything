import { MATH_KATEX_OPTIONS, typesetMath } from '@visual-anything/core';
import { render } from '@testing-library/react';
import katex from 'katex';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MONO_FAMILY, cssFontFamily } from '../canvas/robotoFonts';
import { drawnMath } from './drawnMath';
import { MathFormula } from './MathFormula';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MathFormula', () => {
  it('draws Math with KaTeX: HTML for the eye and MathML, with its TeX, for screen readers', () => {
    const { container } = render(<MathFormula tex="x^2 + \alpha" display={false} typed="$x^2$" />);
    const holder = container.firstElementChild as HTMLElement;
    expect(holder.className).toBe('emphasis-math');
    expect(holder.querySelector(':scope > .katex')).not.toBeNull();
    expect(holder.querySelector('.katex-mathml math')).not.toBeNull();
    expect(holder.querySelector('annotation[encoding="application/x-tex"]')?.textContent).toBe(
      'x^2 + \\alpha',
    );
    expect(holder.querySelector('.katex-html')?.getAttribute('aria-hidden')).toBe('true');
    expect(holder.querySelector('.katex-display')).toBeNull();
  });

  it('draws display style as a block of its own', () => {
    const { container } = render(<MathFormula tex="\sum_i i" display typed="\sum_i i" />);
    const holder = container.firstElementChild as HTMLElement;
    expect(holder.className).toBe('emphasis-math emphasis-math-display');
    expect(holder.querySelector(':scope > .katex-display > .katex')).not.toBeNull();
  });

  it.each([
    ['a TeX error', '\\frac{1', '$\\frac{1$'],
    ['an undefined command', '\\nope x', '$\\nope x$'],
    ['a refused command', '\\color{red}{x}', '$\\color{red}{x}$'],
    ['a command KaTeX takes and the layout does not', '\\raisebox{1em}{x}', '$\\raisebox{1em}{x}$'],
  ])(
    'draws %s as its TeX in Roboto Mono, with a warning mark and the message as its title',
    (_, tex, typed) => {
      const failed = typesetMath(tex, { display: false });
      if (failed.ok) throw new Error(`${tex} typesets`);
      const { container } = render(<MathFormula tex={tex} display={false} typed={typed} />);
      const holder = container.firstElementChild as HTMLElement;
      expect(holder.querySelector('.katex')).toBeNull();
      expect(holder).toHaveClass('emphasis-math-error');
      expect(holder.title).toBe(failed.error);
      expect(holder.style.fontFamily).toBe(cssFontFamily(MONO_FAMILY));
      expect(holder.querySelector('.emphasis-math-mark')).toHaveAttribute('aria-hidden', 'true');
      expect(holder.textContent).toBe(`⚠Math that cannot be typeset: ${typed}`);
    },
  );

  it('typesets with the core’s settings, and draws the same TeX only once', () => {
    const rendered = vi.spyOn(katex, 'render');
    const tex = 'y = mx + b_{kept}';
    const { container } = render(
      <>
        <MathFormula tex={tex} display={false} typed={`$${tex}$`} />
        <MathFormula tex={tex} display={false} typed={`$${tex}$`} />
      </>,
    );
    expect(rendered).toHaveBeenCalledTimes(1);
    expect(rendered.mock.calls[0]?.[2]).toEqual({
      ...MATH_KATEX_OPTIONS,
      displayMode: false,
      output: 'htmlAndMathml',
    });
    // Each panel takes a copy: the kept drawing stays whole.
    expect(container.querySelectorAll('.katex')).toHaveLength(2);
    const drawn = drawnMath(tex, false);
    expect(drawn.ok && drawn.node.querySelectorAll('.katex')).toHaveLength(1);
  });
});

/** A spy on a method, as far as this replaces what it does. */
interface MethodSpy {
  mockImplementation(implementation: (this: unknown, ...args: unknown[]) => unknown): unknown;
}

/** The ways a string becomes HTML, a script or a script's address: what Trusted Types guards. */
function spyOnSinks() {
  const calls: string[] = [];
  const setter = (target: object, property: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, property);
    if (descriptor?.set === undefined) return;
    vi.spyOn(target, property as never, 'set').mockImplementation(function (
      this: unknown,
      value: unknown,
    ) {
      calls.push(property);
      descriptor.set?.call(this, value);
    });
  };
  setter(Element.prototype, 'innerHTML');
  setter(Element.prototype, 'outerHTML');
  setter(ShadowRoot.prototype, 'innerHTML');
  setter(HTMLScriptElement.prototype, 'src');
  setter(HTMLScriptElement.prototype, 'text');
  setter(HTMLIFrameElement.prototype, 'srcdoc');
  const methods: [object, string][] = [
    [Element.prototype, 'insertAdjacentHTML'],
    [Range.prototype, 'createContextualFragment'],
    [Document.prototype, 'write'],
    [Document.prototype, 'writeln'],
    [DOMParser.prototype, 'parseFromString'],
  ];
  for (const [target, method] of methods) {
    const original = (target as Record<string, (...args: unknown[]) => unknown>)[method]!;
    (vi.spyOn(target, method as never) as unknown as MethodSpy).mockImplementation(function (
      this: unknown,
      ...args: unknown[]
    ) {
      calls.push(method);
      return original.apply(this, args);
    });
  }
  const setAttribute = Object.getOwnPropertyDescriptor(Element.prototype, 'setAttribute')
    ?.value as (this: Element, name: string, value: string) => void;
  vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (
    this: Element,
    name: string,
    value: string,
  ) {
    // An event handler's code, or a script's or frame's address, is a sink.
    if (/^on/i.test(name) || (/^(src|srcdoc|href)$/i.test(name) && this.localName !== 'a')) {
      calls.push(`setAttribute ${name}`);
    }
    setAttribute.call(this, name, value);
  });
  return calls;
}

describe('Math and the Trusted Types policies', () => {
  it('needs no sink: KaTeX builds its nodes and sets their styles itself', () => {
    const calls = spyOnSinks();
    // The spies hear a sink when one is used.
    document.createElement('div').innerHTML = '<b>x</b>';
    document.createElement('div').insertAdjacentHTML('beforeend', '<b>x</b>');
    expect(calls.splice(0)).toEqual(['innerHTML', 'insertAdjacentHTML']);
    const corpus = [
      '\\frac{1}{n}\\sum_{i=1}^{n} (y_i - \\hat y_i)^2',
      '\\sqrt[3]{x} + \\overbrace{a+b}^{c} + \\left( \\frac{a}{b} \\right)',
      '\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}',
      '\\mathbb{R} \\to \\mathcal{L} \\xrightarrow{f} \\widehat{xyz}',
      '\\text{<img src=x onerror=alert(1)>} < > \\&',
      '\\operatorname{softmax}(z)_i = \\frac{e^{z_i}}{\\sum_j e^{z_j}}',
    ];
    const { container } = render(
      <>
        {corpus.map((tex, at) => (
          <MathFormula key={at} tex={`${tex} + ${at}`} display={at % 2 === 0} typed={tex} />
        ))}
      </>,
    );
    expect(container.querySelectorAll('.katex')).toHaveLength(corpus.length);
    expect(container.querySelector('img, script, iframe, object, embed')).toBeNull();
    expect(calls).toEqual([]);
  });
});
