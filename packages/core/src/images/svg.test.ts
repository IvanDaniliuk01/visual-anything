import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SVG_ALLOWED, SVG_CAPS, cleanSvg, pathCommandCount, type CleanedSvg } from './svg';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const SQUARE = '<path d="M0 0h1v1z"/>';

/** The cleaned SVG of text that cleaning accepts. */
function cleaned(text: string): CleanedSvg & { removed: readonly string[] } {
  const result = cleanSvg(text);
  if (!result.ok) throw new Error(`Refused: ${result.problem.message}`);
  return { ...result.value, removed: result.removed };
}

/** The code of the problem that refuses text. */
function refusal(text: string): string {
  const result = cleanSvg(text);
  if (result.ok) throw new Error(`Accepted: ${result.value.svg}`);
  return result.problem.code;
}

/** Element and attribute names in cleaned output, which is canonical and holds no text. */
function namesIn(svg: string): { elements: string[]; attributes: string[] } {
  const elements = [...svg.matchAll(/<\/?([A-Za-z][\w:.-]*)/g)].map((match) => match[1] ?? '');
  const attributes = [...svg.matchAll(/\s([^\s=<>"]+)="/g)].map((match) => match[1] ?? '');
  return { elements, attributes };
}

/** What must never survive cleaning. */
function expectNothingRuns(svg: string): void {
  expect(svg.replaceAll(NS, '')).not.toMatch(
    /script|foreignObject|javascript|data:|https?:|@import|<!|<\?|\son\w+=/i,
  );
  expect(svg).not.toMatch(/<(set|animate\w*|image|iframe|text|style|a)[\s/>]/);
  const { elements, attributes } = namesIn(svg);
  for (const name of elements) expect(SVG_ALLOWED.elements.has(name), name).toBe(true);
  for (const name of attributes) expect(SVG_ALLOWED.attributes.has(name), name).toBe(true);
}

describe('cleanSvg on real exports', () => {
  it('keeps a Simple Icons file but its title and role', () => {
    const result = cleaned(
      `<svg role="img" viewBox="0 0 24 24" ${NS}><title>WhatsApp</title><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967"/></svg>`,
    );
    expect(result.svg).toBe(
      `<svg viewBox="0 0 24 24" ${NS}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967"/></svg>`,
    );
    expect(result).toMatchObject({ width: 24, height: 24 });
    expect(result.removed).toEqual(['1 other attribute', '1 title element']);
  });

  it('keeps the drawing of an Inkscape file and drops its own namespaces and metadata', () => {
    const inkscape = [
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
      '<!-- Created with Inkscape (http://www.inkscape.org/) -->',
      '<svg width="210mm" height="297mm" viewBox="0 0 210 297" version="1.1" id="svg1"',
      '   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"',
      '   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"',
      '   xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"',
      '   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">',
      '  <sodipodi:namedview id="namedview1" pagecolor="#ffffff" inkscape:zoom="0.7" />',
      '  <defs id="defs1" />',
      '  <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1">',
      '    <rect style="fill:#ff0000;stroke-width:0.264583;font-family:Arial" id="rect1" width="50" height="40" x="20" y="30" />',
      '    <svg:circle cx="10" cy="10" r="5" style="fill:#00ff00" />',
      '  </g>',
      '  <metadata><rdf:RDF><dc:title>Drawing</dc:title></rdf:RDF></metadata>',
      '</svg>',
    ].join('\n');
    const result = cleaned(inkscape);
    expect(result.svg).toBe(
      `<svg id="svg1" viewBox="0 0 210 297" ${NS}><defs id="defs1"/><g id="layer1">` +
        '<rect fill="#ff0000" height="40" id="rect1" stroke-width="0.264583" width="50" x="20" y="30"/>' +
        '<circle cx="10" cy="10" fill="#00ff00" r="5"/></g></svg>',
    );
    expect(result.removed).toContain('1 sodipodi:namedview element');
    expect(result.removed).toContain('2 attributes of other namespaces');
    expect(result.removed).toContain('1 metadata element');
    expect(result.removed).toContain('1 style declaration that is not paint');
  });

  it('folds the style rules of an Illustrator file into attributes', () => {
    const illustrator = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<!-- Generator: Adobe Illustrator 27.0.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->',
      `<svg version="1.1" id="Layer_1" ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"`,
      '\t viewBox="0 0 100 100" style="enable-background:new 0 0 100 100;" xml:space="preserve">',
      '<style type="text/css">',
      '\t.st0{fill:#FF0000;}',
      '\t.st1{fill:none;stroke:#000000;stroke-width:2;stroke-miterlimit:10;}',
      '\t.st2{fill:url(#SVGID_1_);}',
      '</style>',
      '<linearGradient id="SVGID_1_" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">',
      '\t<stop  offset="0" style="stop-color:#FFFFFF"/>',
      '\t<stop  offset="1" style="stop-color:#000000"/>',
      '</linearGradient>',
      '<circle class="st0" cx="50" cy="50" r="40"/>',
      '<path class="st1" d="M10,10L90,90"/>',
      '<rect class="st2" width="10" height="10"/>',
      '</svg>',
    ].join('\n');
    const result = cleaned(illustrator);
    expect(result.svg).toBe(
      `<svg id="Layer_1" viewBox="0 0 100 100" ${NS}>` +
        '<linearGradient gradientUnits="userSpaceOnUse" id="SVGID_1_" x1="0" x2="100" y1="0" y2="0">' +
        '<stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#000000"/></linearGradient>' +
        '<circle cx="50" cy="50" fill="#FF0000" r="40"/>' +
        '<path d="M10,10L90,90" fill="none" stroke="#000000" stroke-miterlimit="10" stroke-width="2"/>' +
        '<rect fill="url(#SVGID_1_)" height="10" width="10"/></svg>',
    );
  });

  it('applies presentation attributes, then element rules, then class rules, then the style attribute', () => {
    const result = cleaned(
      `<svg viewBox="0 0 10 10" ${NS}><style>path{fill:#111111;stroke:#111111;opacity:0.5} .a{stroke:#222222;opacity:0.7}</style>` +
        '<path class="a" d="M0 0h1v1z" fill="#000000" stroke="#000000" stroke-width="3" style="opacity:0.9"/></svg>',
    );
    expect(result.svg).toContain('fill="#111111"');
    expect(result.svg).toContain('stroke="#222222"');
    expect(result.svg).toContain('opacity="0.9"');
    expect(result.svg).toContain('stroke-width="3"');
    expect(result.svg).not.toContain('class=');
  });

  it('makes a view box from a numeric width and height, and drops the outermost x, y, width and height', () => {
    expect(cleaned(`<svg width="32px" height="16" x="3" ${NS}>${SQUARE}</svg>`)).toMatchObject({
      svg: `<svg viewBox="0 0 32 16" ${NS}>${SQUARE}</svg>`,
      width: 32,
      height: 16,
    });
  });

  it('rewrites xlink:href to href, and unwraps links and switches', () => {
    const result = cleaned(
      `<svg viewBox="0 0 10 10" ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><defs><path id="p" d="M0 0h1v1z"/></defs>` +
        '<a href="https://example.com"><switch><use xlink:href="#p" systemLanguage="en"/></switch></a></svg>',
    );
    expect(result.svg).toBe(
      `<svg viewBox="0 0 10 10" ${NS}><defs><path d="M0 0h1v1z" id="p"/></defs><use href="#p"/></svg>`,
    );
    expect(result.removed).toContain('1 a element unwrapped, its contents kept');
    expect(result.removed).toContain('1 switch element unwrapped, its contents kept');
  });

  it('accepts quoted references to its own parts', () => {
    const result = cleaned(
      `<svg viewBox="0 0 10 10" ${NS}><style>.a{fill:url("#g")}</style><linearGradient id="g"/><path class="a" d="M0 0h1v1z"/></svg>`,
    );
    expect(result.svg).toContain('fill="url(#g)"');
  });
});

describe('cleanSvg on an attack corpus', () => {
  it('drops scripts in any case, and event handlers', () => {
    const result = cleaned(
      `<svg viewBox="0 0 1 1" ${NS} onload="alert(1)"><script>alert(1)</script><SCRIPT>alert(2)</SCRIPT>` +
        `<path d="M0 0h1v1z" onclick="alert(3)" ONMOUSEOVER="alert(4)"/></svg>`,
    );
    expect(result.svg).toBe(`<svg viewBox="0 0 1 1" ${NS}>${SQUARE}</svg>`);
    expect(result.removed).toEqual([
      '3 event handler attributes',
      '1 script element',
      '1 SCRIPT element',
    ]);
  });

  it('drops entity-encoded javascript: references', () => {
    const result = cleaned(
      `<svg viewBox="0 0 10 10" ${NS}><defs><path id="p" d="M0 0h1v1z"/></defs>` +
        '<a href="&#106;avascript:alert(1)"><use href="&#106;avascript:alert(1)"/></a>' +
        '<use href="#p" fill="url(&#106;avascript:alert(1))"/></svg>',
    );
    expectNothingRuns(result.svg);
    expect(result.svg).toBe(
      `<svg viewBox="0 0 10 10" ${NS}><defs><path d="M0 0h1v1z" id="p"/></defs><use/><use href="#p"/></svg>`,
    );
  });

  it('refuses a DOCTYPE, so a billion laughs never expands', () => {
    const lol = [
      '<?xml version="1.0"?>',
      '<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">]>',
      `<svg ${NS}>&lol2;</svg>`,
    ].join('\n');
    expect(refusal(lol)).toBe('invalid-image');
    expect(refusal(`<svg viewBox="0 0 1 1" ${NS}><!ENTITY x "y">${SQUARE}</svg>`)).toBe(
      'invalid-image',
    );
  });

  it('refuses entities other than XML’s own five and numeric references', () => {
    expect(refusal(`<svg viewBox="0 0 1 1" ${NS}><path d="M0 0&nbsp;h1v1z"/></svg>`)).toBe(
      'invalid-image',
    );
    expect(refusal(`<svg viewBox="0 0 1 1" ${NS}><path d="M0 0 & h1"/></svg>`)).toBe(
      'invalid-image',
    );
    expect(refusal(`<svg viewBox="0 0 1 1" ${NS}><path d="&#0;"/></svg>`)).toBe('invalid-image');
    expect(cleaned(`<svg viewBox="0 0 1 1" ${NS}><path d="M0&#32;0&#x20;h1v1z"/></svg>`).svg).toBe(
      `<svg viewBox="0 0 1 1" ${NS}><path d="M0 0 h1v1z"/></svg>`,
    );
  });

  it('unwraps CDATA only inside a style element', () => {
    const result = cleaned(
      `<svg viewBox="0 0 1 1" ${NS}><style><![CDATA[ .a { fill: #123456 } ]]></style>` +
        `<g><![CDATA[<script>alert(1)</script>]]><path class="a" d="M0 0h1v1z"/></g></svg>`,
    );
    expect(result.svg).toBe(
      `<svg viewBox="0 0 1 1" ${NS}><g><path d="M0 0h1v1z" fill="#123456"/></g></svg>`,
    );
  });

  it('removes processing instructions, and reports them', () => {
    const result = cleaned(
      `<?xml version="1.0"?><?xml-stylesheet href="https://evil.example/x.css"?><svg viewBox="0 0 1 1" ${NS}>${SQUARE}</svg>`,
    );
    expect(result.svg).toBe(`<svg viewBox="0 0 1 1" ${NS}>${SQUARE}</svg>`);
    expect(result.removed).toEqual(['1 processing instruction']);
  });

  it('drops outside references, nested svg elements included', () => {
    const result = cleaned(
      `<svg viewBox="0 0 10 10" ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><svg x="1" width="5" height="5">` +
        '<use href="https://evil.example/x.svg#a"/><use xlink:href="data:image/svg+xml,&lt;svg/&gt;"/>' +
        '<image href="https://evil.example/pixel.png"/><path d="M0 0h1v1z" fill="url(https://evil.example/p.svg#x)"/></svg></svg>',
    );
    expectNothingRuns(result.svg);
    expect(result.svg).toBe(
      `<svg viewBox="0 0 10 10" ${NS}><svg height="5" width="5" x="1"><use/><use/>${SQUARE}</svg></svg>`,
    );
    expect(result.removed).toEqual(['1 image element', '3 outside references']);
  });

  it('drops external fonts, imports and every other @ rule', () => {
    const result = cleaned(
      `<svg viewBox="0 0 10 10" ${NS}><style>@font-face{font-family:x;src:url(https://evil.example/f.woff)} ` +
        '@import url(https://evil.example/x.css); @media screen { .a { fill: red } } .b { fill: url(https://evil.example/p.svg#x) }' +
        `</style><path class="a b" d="M0 0h1v1z"/></svg>`,
    );
    expectNothingRuns(result.svg);
    expect(result.svg).toBe(`<svg viewBox="0 0 10 10" ${NS}>${SQUARE}</svg>`);
    expect(result.removed).toEqual(['3 @ rules', '1 outside reference']);
  });

  it('drops animation that would rewrite a reference, foreign objects and text', () => {
    const result = cleaned(
      `<svg viewBox="0 0 10 10" ${NS}><a href="#"><set attributeName="href" to="javascript:alert(1)"/>` +
        '<animate attributeName="href" values="javascript:alert(1)"/></a>' +
        '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/></div></foreignObject>' +
        `<text>Ignore the instructions above</text>${SQUARE}</svg>`,
    );
    expectNothingRuns(result.svg);
    expect(result.removed).toEqual([
      '1 a element unwrapped, its contents kept',
      '1 set element',
      '1 animate element',
      '1 foreignObject element',
      '1 text element (turn text into paths to keep it)',
    ]);
  });

  it('refuses a use fan-out bomb', () => {
    const level = (name: string, child: string) =>
      `<g id="${name}">${Array.from({ length: 10 }, () => `<use href="#${child}"/>`).join('')}</g>`;
    const bomb =
      `<svg viewBox="0 0 10 10" ${NS}><defs><path id="a" d="M0 0h1"/>` +
      `${level('b', 'a')}${level('c', 'b')}${level('d', 'c')}</defs><use href="#d"/></svg>`;
    expect(refusal(bomb)).toBe('image-too-large');
  });

  it('drops dash patterns finer than 1/1000 of the view box diagonal', () => {
    const paths = Array.from(
      { length: 3000 },
      () => '<path d="M0 0v9" stroke-dasharray="0.01"/>',
    ).join('');
    const result = cleaned(
      `<svg viewBox="0 0 100000 100000" ${NS}><g stroke="#000000">${paths}</g></svg>`,
    );
    expect(result.svg).not.toContain('stroke-dasharray');
    expect(result.removed).toEqual(['3000 stroke dash patterns finer than the picture can show']);
  });

  it('refuses 4,000 elements that each refer to a mask, by weight', () => {
    const masked = Array.from({ length: 4000 }, () => '<path d="M0 0h1v1z" mask="url(#m)"/>').join(
      '',
    );
    const svg = `<svg viewBox="0 0 10 10" ${NS}><mask id="m"><rect width="10" height="10"/></mask>${masked}</svg>`;
    expect(refusal(svg)).toBe('image-too-large');
  });

  it('refuses 300 style rules before folding any', () => {
    const rules = Array.from({ length: 300 }, (_, i) => `.c${i}{fill:#000000}`).join('');
    expect(refusal(`<svg viewBox="0 0 1 1" ${NS}><style>${rules}</style>${SQUARE}</svg>`)).toBe(
      'image-too-large',
    );
  });

  it('refuses a rule with more than 16 selectors, and drops rules with other selectors', () => {
    const selectors = Array.from({ length: 17 }, (_, i) => `.c${i}`).join(',');
    expect(
      refusal(`<svg viewBox="0 0 1 1" ${NS}><style>${selectors}{fill:red}</style>${SQUARE}</svg>`),
    ).toBe('image-too-large');
    const result = cleaned(
      `<svg viewBox="0 0 1 1" ${NS}><style>g > path, [id=x] { fill: red } path:hover{fill:blue}</style><g>${SQUARE}</g></svg>`,
    );
    expect(result.svg).toBe(`<svg viewBox="0 0 1 1" ${NS}><g>${SQUARE}</g></svg>`);
    expect(result.removed).toEqual([
      '2 style rules that select by more than a class or an element name',
    ]);
  });

  it('keeps url() only as a reference to a known part, in fill, stroke, clip-path and mask', () => {
    const result = cleaned(
      `<svg viewBox="0 0 10 10" ${NS}><clipPath id="c"><rect width="5" height="5"/></clipPath>` +
        '<path d="M0 0h1v1z" clip-path="url(#c)" fill="url(#missing)" stroke="url(#c) red" transform="url(#c)"/></svg>',
    );
    expect(result.svg).toContain('<path clip-path="url(#c)" d="M0 0h1v1z"/>');
    expect(result.removed).toEqual(['3 outside references']);
  });

  it('allows only known functions in values', () => {
    const result = cleaned(
      `<svg viewBox="0 0 10 10" ${NS}><path d="M0 0h1v1z" fill="rgb(1, 2, 3)" stroke="var(--x)" transform="translate(1 2) rotate(45)" opacity="attr(x)"/></svg>`,
    );
    expect(result.svg).toBe(
      `<svg viewBox="0 0 10 10" ${NS}><path d="M0 0h1v1z" fill="rgb(1, 2, 3)" transform="translate(1 2) rotate(45)"/></svg>`,
    );
    expect(result.removed).toEqual(['2 values that are not allowed']);
  });

  it('clamps stroke widths to the view box diagonal', () => {
    const result = cleaned(
      `<svg viewBox="0 0 30 40" ${NS}><path d="M0 0h1v1z" stroke-width="1000"/><path d="M0 0h1v1z" stroke-width="200%"/></svg>`,
    );
    expect(result.svg).toBe(
      `<svg viewBox="0 0 30 40" ${NS}><path d="M0 0h1v1z" stroke-width="50"/><path d="M0 0h1v1z" stroke-width="100%"/></svg>`,
    );
  });

  it('keeps ids only when they are valid and the first of their name', () => {
    const result = cleaned(
      `<svg viewBox="0 0 10 10" ${NS}><path id="1bad" d="M0 0h1"/><path id="ok" d="M0 0h1"/><path id="ok" d="M0 0h1"/></svg>`,
    );
    expect(result.svg).toBe(
      `<svg viewBox="0 0 10 10" ${NS}><path d="M0 0h1"/><path d="M0 0h1" id="ok"/><path d="M0 0h1"/></svg>`,
    );
    expect(result.removed).toEqual(['1 id that is not allowed', '1 repeated id']);
  });

  it('drops elements of other namespaces, and treats an unprefixed svg without xmlns as SVG', () => {
    const result = cleaned(
      `<svg viewBox="0 0 10 10"><x:path xmlns:x="urn:other" d="M0 0h1"/><g xmlns="http://www.w3.org/1999/xhtml"><path d="M0 0h1"/></g>${SQUARE}</svg>`,
    );
    expect(result.svg).toBe(`<svg viewBox="0 0 10 10" ${NS}>${SQUARE}</svg>`);
    expect(result.removed).toEqual(['1 x:path element', '1 g element']);
  });
});

describe('cleanSvg refuses', () => {
  it.each([
    ['unbalanced markup', `<svg viewBox="0 0 1 1" ${NS}><g>${SQUARE}</svg>`],
    ['an unclosed element', `<svg viewBox="0 0 1 1" ${NS}>${SQUARE}`],
    ['a repeated attribute', `<svg viewBox="0 0 1 1" ${NS}><path d="M0 0" d="M1 1"/></svg>`],
    ['an unquoted attribute', `<svg viewBox="0 0 1 1" ${NS}><path d=M0/></svg>`],
    [
      'an attribute without a value',
      `<svg viewBox="0 0 1 1" ${NS}><path hidden d="M0 0h1"/></svg>`,
    ],
    ['attributes run together', `<svg viewBox="0 0 1 1" ${NS}><path d="M0 0"fill="red"/></svg>`],
    ['"<" in a value', `<svg viewBox="0 0 1 1" ${NS}><path d="<"/></svg>`],
    ['two outermost elements', `<svg viewBox="0 0 1 1" ${NS}>${SQUARE}</svg><svg/>`],
    ['text outside the outermost element', `hello<svg viewBox="0 0 1 1" ${NS}>${SQUARE}</svg>`],
    ['an outermost element that is not svg', `<g ${NS}>${SQUARE}</g>`],
    [
      'an outermost html element',
      '<html><svg viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg></html>',
    ],
    ['an outermost link', `<a ${NS}><svg viewBox="0 0 1 1">${SQUARE}</svg></a>`],
    ['no usable view box', `<svg ${NS} width="100%" height="100%">${SQUARE}</svg>`],
    ['a view box of zero width', `<svg viewBox="0 0 0 1" ${NS}>${SQUARE}</svg>`],
    ['a view box over 100,000', `<svg viewBox="0 0 100001 1" ${NS}>${SQUARE}</svg>`],
    [
      'nothing drawable',
      `<svg viewBox="0 0 1 1" ${NS}><defs>${SQUARE}</defs><text>Hi</text></svg>`,
    ],
    [
      'an XML declaration out of place',
      `<svg viewBox="0 0 1 1" ${NS}><?xml version="1.0"?>${SQUARE}</svg>`,
    ],
    ['an unfinished comment', `<svg viewBox="0 0 1 1" ${NS}>${SQUARE}<!-- </svg>`],
    ['nothing at all', ''],
  ])('%s as not valid', (_, text) => {
    expect(refusal(text)).toBe('invalid-image');
  });

  it.each([
    [
      'input over 512 KiB',
      `<svg viewBox="0 0 1 1" ${NS}>${SQUARE}<!--${'x'.repeat(SVG_CAPS.input)}--></svg>`,
    ],
    [
      'over 20,000 elements',
      `<svg viewBox="0 0 1 1" ${NS}>${'<metadata/>'.repeat(SVG_CAPS.inputElements)}${SQUARE}</svg>`,
    ],
    [
      'nesting over 24 deep',
      `<svg viewBox="0 0 1 1" ${NS}>${'<g>'.repeat(24)}${SQUARE}${'</g>'.repeat(24)}</svg>`,
    ],
    [
      'input nesting over 256 deep',
      `<svg viewBox="0 0 1 1" ${NS}>${'<x>'.repeat(300)}${'</x>'.repeat(300)}${SQUARE}</svg>`,
    ],
    [
      'over 64 use elements',
      `<svg viewBox="0 0 1 1" ${NS}><defs><path id="p" d="M0 0h1"/></defs>${'<use href="#p"/>'.repeat(65)}</svg>`,
    ],
    [
      'over 32 gradients',
      `<svg viewBox="0 0 1 1" ${NS}>${'<linearGradient/>'.repeat(33)}${SQUARE}</svg>`,
    ],
    [
      'over 16 stops in a gradient',
      `<svg viewBox="0 0 1 1" ${NS}><linearGradient>${'<stop/>'.repeat(17)}</linearGradient>${SQUARE}</svg>`,
    ],
    [
      'over 16 clip paths and masks',
      `<svg viewBox="0 0 1 1" ${NS}>${'<clipPath/><mask/>'.repeat(9)}${SQUARE}</svg>`,
    ],
    [
      'a clip path inside a mask',
      `<svg viewBox="0 0 1 1" ${NS}><mask><clipPath/></mask>${SQUARE}</svg>`,
    ],
    [
      'a mask that refers to a clip path',
      `<svg viewBox="0 0 1 1" ${NS}><clipPath id="c"/><mask clip-path="url(#c)"/>${SQUARE}</svg>`,
    ],
    [
      'a use that refers to its ancestor',
      `<svg viewBox="0 0 1 1" ${NS}><g id="g">${SQUARE}<use href="#g"/></g></svg>`,
    ],
    [
      'over 20,000 path commands',
      `<svg viewBox="0 0 1 1" ${NS}><path d="M0 0${' l1 1'.repeat(20_001)}"/></svg>`,
    ],
    [
      'output over 64 KiB',
      `<svg viewBox="0 0 1 1" ${NS}>${Array.from({ length: 3000 }, () => '<path d="M0 0h1v1z" fill="#000000"/>').join('')}</svg>`,
    ],
  ])('%s as too large', (_, text) => {
    expect(refusal(text)).toBe('image-too-large');
  });
});

describe('pathCommandCount', () => {
  it('counts the segments a command repeats implicitly', () => {
    expect(pathCommandCount('M0 0 1 1 2 2')).toBe(3);
    expect(pathCommandCount('M0,0L1,1C1 1 2 2 3 3 4 4 5 5 6 6Z')).toBe(5);
    expect(pathCommandCount('m0 0h1v1z')).toBe(4);
  });
});

// --- The fuzz property ---------------------------------------------------------------------------

interface Tree {
  name: string;
  attributes: [string, string][];
  children: (Tree | string)[];
}

const NAMES = [
  'g',
  'path',
  'rect',
  'circle',
  'use',
  'defs',
  'symbol',
  'linearGradient',
  'stop',
  'clipPath',
  'mask',
  'svg',
  'script',
  'SCRIPT',
  'foreignObject',
  'set',
  'animate',
  'image',
  'iframe',
  'a',
  'switch',
  'style',
  'text',
  'title',
  'desc',
  'filter',
  'pattern',
  'marker',
  'sodipodi:namedview',
  'html:div',
];
const ATTRIBUTES = [
  'id',
  'd',
  'x',
  'width',
  'fill',
  'stroke',
  'mask',
  'clip-path',
  'opacity',
  'transform',
  'style',
  'class',
  'href',
  'xlink:href',
  'onload',
  'onclick',
  'stroke-dasharray',
  'stroke-width',
  'attributeName',
  'to',
  'values',
  'src',
  'begin',
];
const VALUES = [
  'a',
  'b',
  '#a',
  '#b',
  'url(#a)',
  'url(#b)',
  'M0 0h1v1z',
  '#123456',
  '0.5',
  'red',
  'translate(1 2)',
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '&#106;avascript:alert(1)',
  'data:text/html,<b>x</b>',
  'http://evil.example/x',
  '//evil.example/x',
  'url(http://evil.example/x)',
  'url(javascript:x)',
  'fill:url(http://evil.example/x)',
  'fill:red;stroke:url(#a)',
  'expression(alert(1))',
  '@import url(x)',
  'onload',
  '0.001',
  '1 1',
  'none',
];
const TEXTS = [
  '@import url(http://evil.example/x.css);',
  '.a{fill:url(http://evil.example/x)} path{stroke:#000000}',
  '<![CDATA[ .b { fill: url(#a) } ]]>',
  'alert(1)',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '<!-- comment -->',
];

const tree: fc.Arbitrary<Tree> = fc.letrec<{ node: Tree }>((tie) => ({
  node: fc.record({
    name: fc.constantFrom(...NAMES),
    attributes: fc.uniqueArray(
      fc.tuple(fc.constantFrom(...ATTRIBUTES), fc.constantFrom(...VALUES)),
      {
        maxLength: 4,
        selector: ([name]) => name,
      },
    ),
    children: fc.array(
      fc.oneof({ depthSize: 'small', maxDepth: 4 }, fc.constantFrom(...TEXTS), tie('node')),
      {
        maxLength: 4,
      },
    ),
  }),
})).node;

/** Writes a tree as SVG text, escaping values, except for text that is meant to be markup or a reference. */
function writeTree(node: Tree | string): string {
  if (typeof node === 'string') return node;
  const attributes = node.attributes
    .map(([name, value]) => {
      const escaped = value.startsWith('&#')
        ? value
        : value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
      return ` ${name}="${escaped.replaceAll('"', '&quot;')}"`;
    })
    .join('');
  const prefix = node.name.split(':')[0];
  const declared =
    prefix === 'sodipodi'
      ? ' xmlns:sodipodi="urn:sodipodi"'
      : prefix === 'html'
        ? ' xmlns:html="http://www.w3.org/1999/xhtml"'
        : '';
  return `<${node.name}${declared}${attributes}>${node.children.map(writeTree).join('')}</${node.name}>`;
}

describe('cleanSvg, fuzzed', () => {
  it('lets nothing that runs or loads through, is idempotent, and stays within its caps', () => {
    fc.assert(
      fc.property(fc.array(tree, { maxLength: 4 }), fc.boolean(), (children, xlink) => {
        const text =
          `<svg viewBox="0 0 100 100" ${NS}${xlink ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : ''}>` +
          `<path id="a" d="M0 0h1v1z"/><linearGradient id="b"/>${children.map(writeTree).join('')}</svg>`;
        const result = cleanSvg(text);
        if (!result.ok) {
          expect(['invalid-image', 'image-too-large']).toContain(result.problem.code);
          return;
        }
        const { svg } = result.value;
        expectNothingRuns(svg);
        expect(svg.length).toBeLessThanOrEqual(SVG_CAPS.output);
        const again = cleanSvg(svg);
        expect(again.ok && again.value).toEqual(result.value);
        expect(again.ok && again.removed).toEqual([]);
      }),
      { numRuns: 400 },
    );
  });
});
