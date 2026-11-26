// @vitest-environment node
/**
 * Travelers in the SVG and the PDF made from it (ADR 0110): each stands still where reduced motion
 * would stand it, its picture written once as a symbol and used at each place, turned to its line and
 * mirrored while it heads left; none in a view that hides them.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/scene';
import { lengthOf } from '../canvas/route';
import { carriesAt, headsLeft, stillPlaces } from '../canvas/travelers';
import { loadSample } from '../test/sample';
import { TRAVELERS_VIEW, withTravelers } from '../test/travelers';
import { writePdf } from './pdf';
import { writeSvg } from './svg';

function inView(
  project: ProjectSnapshot,
  travelers: 'still' | 'hidden' | undefined,
): ProjectSnapshot {
  return {
    ...project,
    views: project.views.map((view) => {
      if (view.id !== TRAVELERS_VIEW) return view;
      const rest = { ...view };
      delete rest.travelers;
      return travelers === undefined ? rest : { ...rest, travelers };
    }),
  };
}

/** The `transform` of each traveler's place, in the order the drawing writes them. */
function placesIn(text: string): string[] {
  const layer = /<g data-part="travelers">([\s\S]*?)<\/g><g data-part="relation-names"/.exec(text);
  return [...(layer?.[1] ?? '').matchAll(/<g transform="([^"]+)">/g)].map(
    (match) => match[1] ?? '',
  );
}

describe('travelers in the SVG', () => {
  const project = withTravelers();
  const text = writeSvg(project, TRAVELERS_VIEW).text;

  it('stand where reduced motion stands them, on every line that carries one at scale 1', () => {
    const scene = buildScene(project, TRAVELERS_VIEW);
    const expected = scene.relations.flatMap((line) =>
      line.traveler && carriesAt(lengthOf(line.route), line.traveler.size, 1)
        ? stillPlaces(line.route, line.traveler)
        : [],
    );
    const places = placesIn(text);
    expect(places.length).toBe(expected.length);
    expect(places.length).toBeGreaterThan(0);
    for (const [at, place] of expected.entries()) {
      const written = places[at] ?? '';
      const [, x, y] = /translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(written) ?? [];
      expect(Number(x)).toBeCloseTo(place.x, 1);
      expect(Number(y)).toBeCloseTo(place.y, 1);
      expect(written.includes('scale(1 -1)')).toBe(headsLeft(place.angle));
    }
  });

  it('write the picture once, as a symbol, and use it at each place in its own size', () => {
    const symbols = text.match(/<symbol id="va-img-\d+"/g) ?? [];
    const uses = text.match(/<use href="#va-img-\d+" x="-10" y="-5" width="20" height="10"/g) ?? [];
    expect(symbols.length).toBe(1);
    expect(uses.length).toBe(placesIn(text).length);
    // In its own colors: no tint filter.
    expect(text).toContain('#3e63dd');
  });

  it('lie above the lines and below their names, each group naming its relation and picture', () => {
    expect(text.indexOf('data-part="relations"')).toBeLessThan(
      text.indexOf('data-part="travelers"'),
    );
    expect(text.indexOf('data-part="travelers"')).toBeLessThan(
      text.indexOf('data-part="relation-names"'),
    );
    expect(text).toMatch(/<g data-relation="[^"]+" data-traveler="clinic.truck">/);
  });

  it('take a faded line’s opacity', () => {
    const faded = withTravelers();
    const relation = faded.model.relations.find((each) => each.id === 'patient-to-whatsapp');
    if (!relation) throw new Error('The sample has no relation.');
    const project2 = {
      ...faded,
      model: {
        ...faded.model,
        relations: faded.model.relations.map((each) =>
          each === relation ? { ...each, appearance: { ...each.appearance, opacity: 0.4 } } : each,
        ),
      },
    };
    expect(writeSvg(project2, TRAVELERS_VIEW).text).toMatch(
      new RegExp(`<g data-relation="${relation.id}" data-traveler="clinic.truck" opacity="0.4">`),
    );
  });

  it('stand still in a view that keeps them still, as in one where they move', () => {
    expect(writeSvg(inView(project, 'still'), TRAVELERS_VIEW).text).toBe(text);
  });

  it('are left out of a view that hides them, and of one whose relations send none', () => {
    expect(writeSvg(inView(project, 'hidden'), TRAVELERS_VIEW).text).not.toContain(
      'data-part="travelers"',
    );
    expect(writeSvg(loadSample(), TRAVELERS_VIEW).text).not.toContain('data-part="travelers"');
  });
});

describe('travelers in the PDF', () => {
  it('are drawn from the SVG, and nothing is said lost', async () => {
    const pdf = await writePdf(withTravelers(), TRAVELERS_VIEW);
    const plain = await writePdf(loadSample(), TRAVELERS_VIEW);
    expect(pdf.lost).toEqual(plain.lost);
    expect(pdf.bytes.length).toBeGreaterThan(plain.bytes.length);
  }, 60_000);
});
