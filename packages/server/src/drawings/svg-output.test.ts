import { describe, expect, it } from 'vitest';
import { cutAt, withoutUnusedDefinitions } from './svg-output';

const OPEN =
  '<svg width="400" height="5000" viewBox="0 0 400 5000" xmlns="http://www.w3.org/2000/svg">';

describe('satori’s SVG, made ready for the cleaner', () => {
  it('leaves out the masks and clip paths nothing refers to, and keeps those used', () => {
    const svg = `${OPEN}<mask id="a"><rect width="1" height="1"/></mask><clipPath id="b"><path d="M0 0h1"/></clipPath><mask id="c" x="0"><rect/></mask><defs><clipPath id="d"><rect/></clipPath></defs><path mask="url(#c)" d="M0 0h1"/></svg>`;
    expect(withoutUnusedDefinitions(svg)).toBe(
      `${OPEN}<mask id="c" x="0"><rect/></mask><path mask="url(#c)" d="M0 0h1"/></svg>`,
    );
  });

  it('leaves out a definition only an unused one referred to', () => {
    const svg = `${OPEN}<clipPath id="inner"><rect/></clipPath><mask id="outer"><rect clip-path="url(#inner)"/></mask></svg>`;
    expect(withoutUnusedDefinitions(svg)).toBe(`${OPEN}</svg>`);
  });

  it('cuts a picture taller than a drawing at its height, and leaves a shorter one', () => {
    expect(cutAt(`${OPEN}</svg>`, 4000)).toBe(
      '<svg width="400" height="4000" viewBox="0 0 400 4000" xmlns="http://www.w3.org/2000/svg"></svg>',
    );
    const short = '<svg width="400" height="40" viewBox="0 0 400 40"></svg>';
    expect(cutAt(short, 4000)).toBe(short);
  });
});
