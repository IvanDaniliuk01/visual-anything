import { cleanSvg } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { heavySvgIcons, svgIcon } from '../bench/pictures';
import { bitmapSymbol, plainColor, svgSymbol, tintFilter } from './image-symbols';

/** What cleaning keeps of a picture. */
function cleaned(svg: string): string {
  const result = cleanSvg(svg);
  if (!result.ok) throw new Error(`Cleaning refused the picture: ${JSON.stringify(result)}`);
  return result.value.svg;
}

/** A symbol read by a browser's XML parser, inside an SVG document. */
function parsed(symbol: string): Element {
  const document = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg"><defs>${symbol}</defs></svg>`,
    'image/svg+xml',
  );
  expect(document.getElementsByTagName('parsererror')).toHaveLength(0);
  return document.getElementsByTagName('symbol')[0] as Element;
}

const PICTURE = cleaned(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#112233">
  <defs>
    <linearGradient id="shade"><stop offset="0" stop-color="#ff0000"/><stop offset="1"/></linearGradient>
    <mask id="cut"><rect width="24" height="24" fill="#ffffff"/><circle cx="12" cy="12" r="4" fill="#000000"/></mask>
  </defs>
  <rect id="box" width="24" height="24" fill="url(#shade)" mask="url(#cut)"/>
  <path d="M2 2 L22 22" stroke="#445566" fill="none"/>
  <use href="#box" x="1"/>
</svg>`);

describe('svgSymbol', () => {
  it('writes the picture as a symbol of its view box, its ids and references given a prefix', () => {
    const symbol = svgSymbol('va-img-1', PICTURE, 'va-i1-');
    expect(symbol).toBeDefined();
    const read = parsed(symbol as string);
    expect(read.getAttribute('id')).toBe('va-img-1');
    expect(read.getAttribute('viewBox')).toBe('0 0 24 24');
    const ids = [...read.querySelectorAll('[id]')].map((each) => each.getAttribute('id'));
    expect(ids.sort()).toEqual(['va-i1-box', 'va-i1-cut', 'va-i1-shade']);
    expect(read.querySelector('rect[mask]')?.getAttribute('mask')).toBe('url(#va-i1-cut)');
    expect(read.querySelector('rect[mask]')?.getAttribute('fill')).toBe('url(#va-i1-shade)');
    expect(read.querySelector('use')?.getAttribute('href')).toBe('#va-i1-box');
    // The outermost element's paint goes on a group, which its contents inherit.
    expect(read.firstElementChild?.tagName).toBe('g');
    expect(read.firstElementChild?.getAttribute('fill')).toBe('#112233');
    expect(symbol).not.toContain('xmlns');
  });

  it('paints a silhouette in its tint, but for what paints nothing, as a mask', () => {
    const read = parsed(svgSymbol('va-img-2', PICTURE, 'va-i2-', '#AA0000') as string);
    expect(read.firstElementChild?.getAttribute('fill')).toBe('#AA0000');
    expect(read.querySelector('path')?.getAttribute('stroke')).toBe('#AA0000');
    expect(read.querySelector('path')?.getAttribute('fill')).toBe('none');
    const stops = [...read.querySelectorAll('stop')].map((stop) => stop.getAttribute('stop-color'));
    expect(stops).toEqual(['#AA0000', '#AA0000']);
    const mask = [...read.querySelectorAll('mask *')].map((each) => each.getAttribute('fill'));
    expect(mask).toEqual(['#ffffff', '#000000']);
    expect(read.querySelector('rect[mask]')?.getAttribute('fill')).toBe('url(#va-i2-shade)');
  });

  it('gives a silhouette its tint where nothing set a fill', () => {
    const plain = cleaned(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="1" height="1"/></svg>',
    );
    const read = parsed(svgSymbol('a', plain, 'p-', '#00AA00') as string);
    expect(read.firstElementChild?.getAttribute('fill')).toBe('#00AA00');
  });

  it('reads every picture the benchmark draws, those at the cleaner’s caps among them', () => {
    for (let seed = 0; seed < 20; seed++) {
      const symbol = svgSymbol(`s${seed}`, cleaned(svgIcon(seed)), `p${seed}-`);
      expect(symbol).toBeDefined();
      parsed(symbol as string);
    }
    for (const [at, picture] of heavySvgIcons().entries()) {
      const text = cleaned(picture);
      const started = performance.now();
      expect(svgSymbol(`h${at}`, text, `q${at}-`)).toBeDefined();
      expect(performance.now() - started).toBeLessThan(250);
    }
  }, 60_000);

  it('refuses text that is not in the form cleaning writes', () => {
    const refused = [
      '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>',
      '<svg viewBox="0 0 1 1"><!-- note --></svg>',
      '<svg viewBox="0 0 1 1"><rect onload=\'alert(1)\'/></svg>',
      '<svg viewBox="0 0 1 1"><g></svg>',
      '<svg viewBox="0 0 1 1"></svg><svg viewBox="0 0 1 1"></svg>',
      '<svg viewBox="0 0 1 1"><rect/></g></svg>',
      '<svg><rect/></svg>',
      '<g viewBox="0 0 1 1"></g>',
      '<?xml version="1.0"?><svg viewBox="0 0 1 1"/>',
      '<svg viewBox="0 0 1 1"/>trailing',
    ];
    for (const text of refused) expect(svgSymbol('a', text, 'p-'), text).toBeUndefined();
  });

  it('drops a reference that leaves the picture, which cleaning never keeps', () => {
    const symbol = svgSymbol(
      'a',
      '<svg viewBox="0 0 1 1"><use href="https://example.com/a.svg#x"/></svg>',
      'p-',
    );
    expect(symbol).toBe('<symbol id="a" viewBox="0 0 1 1"><g><use/></g></symbol>');
  });
});

describe('plainColor', () => {
  it('writes colors made with functions in whole numbers, as every reader reads them', () => {
    expect(plainColor('hsl(0, 100%, 50%)')).toBe('#ff0000');
    expect(plainColor('hsl(120deg 100% 25%)')).toBe('#008000');
    expect(plainColor('hsl(141, 60%, 45%)')).toBe('#2eb85e');
    expect(plainColor('hsla(240, 100%, 50%, 0.5)')).toBe('rgba(0,0,255,0.5)');
    expect(plainColor('rgb(10.4, 20.6, 30)')).toBe('#0a151e');
    expect(plainColor('rgb(100% 0% 0% / 25%)')).toBe('rgba(255,0,0,0.25)');
    expect(plainColor('rgba(1,2,3,1)')).toBe('#010203');
  });

  it('leaves every other value as it is', () => {
    for (const value of [
      '#123456',
      'red',
      'none',
      'url(#a)',
      'currentColor',
      'hsl(1turn, 2%, 3%)',
    ]) {
      expect(plainColor(value)).toBe(value);
    }
  });

  it('writes the picture’s colors so', () => {
    const symbol = svgSymbol('a', cleaned(svgIcon(1)), 'p-') ?? '';
    expect(symbol).not.toMatch(/hsl/);
    expect(symbol).toMatch(/fill="#[0-9a-f]{6}"/);
  });
});

describe('bitmapSymbol', () => {
  it('writes the bitmap as a data address filling the symbol', () => {
    const read = parsed(
      bitmapSymbol('b', { format: 'png', data: 'iVBORw0KGgo=', width: 4, height: 2 }),
    );
    expect(read.getAttribute('viewBox')).toBe('0 0 4 2');
    const image = read.querySelector('image');
    expect(image?.getAttribute('href')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(image?.getAttribute('width')).toBe('4');
    expect(image?.getAttribute('preserveAspectRatio')).toBe('none');
  });

  it('has a filter that draws a bitmap in one colour', () => {
    expect(tintFilter('#AB12CD')).toContain('flood-color="#AB12CD"');
    expect(tintFilter('#AB12CD')).toContain('id="va-tint-ab12cd"');
  });
});
