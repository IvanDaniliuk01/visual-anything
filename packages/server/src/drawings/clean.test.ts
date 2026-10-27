import { describe, expect, it } from 'vitest';
import { cleanHtml, type CleanChild, type CleanElement } from './clean';
import { DrawingRefusal, readHtml } from './read';
import { DrawingReport } from './report';

/** Cleans HTML with a font that draws every character but emoji. */
function clean(html: string): { page: CleanElement; report: string[] } {
  const report = new DrawingReport();
  const page = cleanHtml(readHtml(html, report), report, { covers: (code) => code < 0x1f000 });
  return { page, report: report.lines() };
}

/** The body's children, as the cleaned page holds them. */
function body(html: string): { children: CleanChild[]; report: string[] } {
  const { page, report } = clean(html);
  const found = page.children.find((each) => typeof each !== 'string') as CleanElement;
  return { children: found.children, report };
}

/** The tags of a cleaned tree, in document order, with its text. */
function outline(children: readonly CleanChild[]): unknown[] {
  return children.map((each) =>
    typeof each === 'string' ? each : { [each.tag]: outline(each.children) },
  );
}

describe('cleanHtml', () => {
  it('keeps the elements the ADR lists, with their text', () => {
    const { children, report } = body(
      '<section><h2>Pricing</h2><p>Basic <strong>plan</strong></p><ul><li>One</li></ul></section>',
    );
    expect(outline(children)).toEqual([
      {
        section: [
          { h2: ['Pricing'] },
          { p: ['Basic ', { strong: ['plan'] }] },
          { ul: [{ li: ['One'] }] },
        ],
      },
    ]);
    expect(report).toEqual([]);
  });

  it('draws the page and its body as boxes', () => {
    const { page } = clean('<p>x</p>');
    expect(page.tag).toBe('div');
    expect(page.style).toEqual({ display: 'block' });
  });

  it('unwraps links, keeping their text and dropping their address', () => {
    const { children, report } = body(
      '<p>See <a href="https://example.com/" onclick="steal()" title="t">the plan</a></p>',
    );
    expect(outline(children)).toEqual([{ p: ['See the plan'] }]);
    expect(report).toEqual([
      '1 a element unwrapped, its contents kept',
      '1 outside reference',
      '1 event handler attribute',
      '1 other attribute',
    ]);
  });

  it('drops every other element with its content, and reports it', () => {
    const { children, report } = body(
      '<p>a</p><script>alert(1)</script><iframe src="x"></iframe><form><input></form><img src="x.png"><svg><circle/></svg><math><mi>x</mi></math><template><p>t</p></template><video></video><p>b</p>',
    );
    expect(outline(children)).toEqual([{ p: ['a'] }, { p: ['b'] }]);
    expect(report).toEqual([
      '1 script element',
      '1 iframe element',
      '1 form element',
      '1 img element',
      '1 svg element',
      '1 math element',
      '1 template element',
      '1 video element',
    ]);
  });

  it('quotes at most 40 characters of an element’s name', () => {
    const { report } = body(`<${'x'.repeat(2000)}>y</${'x'.repeat(2000)}>`);
    expect(report).toEqual([`1 ${'x'.repeat(39)}… element`]);
  });

  it('reports what the head held, and never keeps it', () => {
    const { page, report } = clean(
      '<head><title>T</title><meta http-equiv="refresh" content="0;url=x"><base href="https://example.com/"><link rel="stylesheet" href="x.css"><script src="x.js"></script><!-- note --></head><body><p>x</p></body>',
    );
    expect(outline(page.children)).toEqual([{ div: [{ p: ['x'] }] }]);
    expect(report).toEqual([
      '1 title element',
      '1 meta element',
      '1 base element',
      '1 link element',
      '1 script element',
      '1 comment',
    ]);
  });

  it('folds styles in the cascade’s order: element, class, id, then attribute', () => {
    const { children } = body(`<style>
      #main { color: #00AA00 }
      .card { color: #0000AA; padding: 4px }
      p { color: #AA0000; margin: 0 }
      .other { padding: 8px }
    </style><p id="main" class="other card" style="margin: 2px">x</p>`);
    expect((children[0] as CleanElement).style).toEqual({
      color: '#00AA00',
      margin: '2px',
      padding: '8px',
    });
  });

  it('keeps only rules that select by an element name, a class, an id or a list of these', () => {
    const { children, report } = body(`<style>
      h1, .title, #top { font-weight: bold }
      div p { color: red }
      p:hover { color: red }
      * { color: red }
      a[href] { color: red }
      @import url(x.css);
      @font-face { font-family: X; src: url(x.woff) }
      @media print { p { color: red } }
    </style><h1>x</h1>`);
    expect((children[0] as CleanElement).style).toEqual({ fontWeight: 'bold' });
    expect(report).toEqual([
      '4 style rules that select by more than an element name, a class or an id',
      '3 @ rules',
    ]);
  });

  it('keeps only properties the layout lays out, with values that load nothing', () => {
    const { children, report } = body(`<p style="
      background: url(https://example.com/x.png);
      background-image: url('x.png');
      background-color: rgb(1, 2, 3);
      background-image: linear-gradient(90deg, #fff, #000);
      box-shadow: 0 0 4px #000;
      filter: blur(2px);
      font-family: Comic Sans;
      color: expression(alert(1));
      width: calc(100% - 4px);
      border: 1px solid #ccc;
      display: inline-block;
      display: flex;
      overflow: scroll;
      transform: rotate(4deg) translate(2px, 2px);
      content: 'x';
      behavior: url(x.htc);
      -moz-binding: url(x.xml);
      list-style-image: url(x.png);
      color: \\75 rl(x);
    ">x</p>`);
    expect((children[0] as CleanElement).style).toEqual({
      backgroundColor: 'rgb(1, 2, 3)',
      width: 'calc(100% - 4px)',
      border: '1px solid #ccc',
      display: 'flex',
      transform: 'rotate(4deg) translate(2px, 2px)',
    });
    expect(report).toEqual([
      '6 values that are not allowed',
      '1 gradient background the picture cannot keep',
      '7 style declarations the drawing does not lay out',
    ]);
  });

  it('keeps only the outermost box that hides its overflow hiding it', () => {
    const { children, report } = body(
      '<div style="overflow: hidden"><p style="overflow: hidden">x</p></div>',
    );
    const outer = children[0] as CleanElement;
    expect(outer.style).toEqual({ overflow: 'hidden' });
    expect((outer.children[0] as CleanElement).style).toEqual({});
    expect(report).toEqual(['1 box that hides its overflow inside another that does']);
  });

  it('lays tables out as rows and columns of boxes, and says so', () => {
    const { children, report } = body(
      '<table>\n<thead><tr><th>Plan</th> <th>Price</th></tr></thead>\n<tbody><tr><td>Basic</td><td>$10</td></tr></tbody></table>',
    );
    expect(outline(children)).toEqual([
      {
        div: [
          { div: [{ div: [{ div: ['Plan'] }, { div: ['Price'] }] }] },
          { div: [{ div: [{ div: ['Basic'] }, { div: ['$10'] }] }] },
        ],
      },
    ]);
    const table = children[0] as CleanElement;
    expect(table.style).toEqual({ display: 'flex', flexDirection: 'column' });
    expect(report).toEqual(['1 table laid out as rows and columns of boxes']);
  });

  it('leaves out characters the font lacks, and says how many', () => {
    const { children, report } = body('<p>Hi 😀 there 👍🏽</p>');
    expect(outline(children)).toEqual([{ p: ['Hi  there '] }]);
    expect(report).toEqual(['3 characters Roboto cannot draw, such as emoji']);
  });

  it('drops elements nested past 64 levels, and past 5000 kept', () => {
    const deep = body(`${'<div>'.repeat(70)}x`);
    expect(deep.report).toEqual(['1 element nested deeper than 64 levels, with its contents']);
    const many = body('<p></p>'.repeat(5010));
    expect(many.children).toHaveLength(4998);
    expect(many.report).toEqual(['12 elements past the 5000 a drawing keeps, with their contents']);
  });

  it('keeps 4000 characters of text and drops the rest', () => {
    const { children, report } = body(`<p>${'a'.repeat(3_990)}</p><p>${'b'.repeat(30)}</p>`);
    expect(outline(children)).toEqual([{ p: ['a'.repeat(3_990)] }, { p: ['b'.repeat(10)] }]);
    expect(report).toEqual(['20 characters of text past the 4000 a drawing holds']);
  });

  it('refuses style rules past the caps, and folding past its budget', () => {
    const refusal = (html: string) => {
      try {
        clean(html);
      } catch (error) {
        if (error instanceof DrawingRefusal) return error.problem.message;
        throw error;
      }
      return 'read';
    };
    expect(refusal(`<style>${'p{color:red}'.repeat(257)}</style>`)).toBe(
      'The HTML has over 256 style rules.',
    );
    expect(
      refusal(
        `<style>${Array.from({ length: 17 }, (_, at) => `.c${at}`).join(',')}{color:red}</style>`,
      ),
    ).toBe('A style rule has over 16 selectors.');
    const bomb = `<style>${'p{color:red;color:blue;color:green;color:red;color:blue}'.repeat(250)}</style>${'<p>x</p>'.repeat(100)}`;
    expect(refusal(bomb)).toBe(
      'The HTML’s style rules match too many of its elements to fold them in.',
    );
  });
});
