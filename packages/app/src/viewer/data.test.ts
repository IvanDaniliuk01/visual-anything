import {
  MAX_VIEW_STATE_ADDRESS,
  builtinPackage,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { PackageFile, SvgImage, TourStep } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { outlineAt } from '../canvas/outlines';
import { pageScene } from '../canvas/routing/avoided';
import { buildScene, type Scene } from '../canvas/scene';
import { writeSvg } from '../export/svg';
import { translateMessage, untranslatedParts } from '../i18n/translate';
import { beyondBoxes } from '../test/beyond';
import { loadSample } from '../test/sample';
import { PAGE_FORMAT, pageDataOf, readPageData, type PageData } from './data';

const sample = loadSample();

/** A tour step without its speaker notes. */
function withoutNotes(step: TourStep): TourStep {
  const shared = { ...step };
  delete shared.notes;
  return shared;
}

/** The page's data as the page holds it: JSON text. */
function asText(data: unknown): string {
  return JSON.stringify(data);
}

function read(data: unknown) {
  return readPageData(asText(data), validateFile);
}

function problemsOf(data: unknown): string[] {
  const result = read(data);
  if (result.ok) throw new Error('The page was read, though it should not have been.');
  return result.problems;
}

const SCRIPTED_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><desc>made at home</desc><rect width="10" height="10" fill="#336699"/></svg>';

/** The sample with an image of its own in its own package, which cleaning would change. */
function withImage(svg: string): ProjectSnapshot {
  const image: SvgImage = {
    kind: 'svg',
    id: 'clinic.logo',
    name: 'Logo',
    width: 10,
    height: 10,
    svg,
  };
  return {
    ...sample,
    packages: sample.packages.map((pkg) =>
      pkg.id === 'clinic' ? { ...pkg, images: [image] } : pkg,
    ),
  };
}

describe('The data a read-only page holds', () => {
  it('holds the project, its model, views and scenarios, and only the packages of its own', () => {
    const data = pageDataOf(sample);
    expect(data.format).toBe(PAGE_FORMAT);
    expect(data.project).toEqual(sample.project);
    expect(data.model).toEqual(sample.model);
    expect(data.views).toEqual(sample.views);
    expect(data.scenarios).toEqual(sample.scenarios);
    // Systems is built in: the viewer brings it, as the program does.
    expect(data.packages.map((pkg) => pkg.id)).toEqual(['clinic']);
  });

  // Tours (ADR 0058) and comments (ADR 0059).
  it('holds the tours, which play in the page, and never the threads of comments', () => {
    const data = pageDataOf(sample);
    expect(sample.tours.length).toBeGreaterThan(0);
    expect(sample.comments.length).toBeGreaterThan(0);
    expect(data.tours?.map((tour) => tour.id)).toEqual(sample.tours.map((tour) => tour.id));
    expect(data).not.toHaveProperty('comments');
    expect(asText(data)).not.toContain(sample.comments[0]?.comments[0]?.text);
    const back = read(data);
    expect(back.ok && back.project.tours).toEqual(data.tours);
    expect(back.ok && back.project.comments).toEqual([]);
    expect(pageDataOf({ ...sample, tours: [] })).not.toHaveProperty('tours');
  });

  it('leaves the speaker notes out of the tours, and keeps everything else of them', () => {
    const notes = sample.tours.flatMap((tour) => tour.steps.flatMap((step) => step.notes ?? []));
    expect(notes.length).toBeGreaterThan(0);
    const data = pageDataOf(sample);
    const text = asText(data);
    for (const each of notes) expect(text).not.toContain(JSON.stringify(each).slice(1, -1));
    const plain = sample.tours.map((tour) => ({ ...tour, steps: tour.steps.map(withoutNotes) }));
    expect(data.tours).toEqual(plain);
    // A tour without notes travels as it is.
    expect(pageDataOf({ ...sample, tours: plain }).tours?.[0]).toBe(plain[0]);
  });

  it('refuses a tour that is no tour, and two tours with one id', () => {
    const data = pageDataOf(sample);
    const [tour] = data.tours ?? [];
    expect(problemsOf({ ...data, tours: [{ ...tour, steps: 'none' }] })).toEqual([
      'Tour 1, /steps: must be an array',
    ]);
    expect(problemsOf({ ...data, tours: [tour, tour] })).toEqual([
      `The tour id "${tour?.id}" is used twice.`,
    ]);
    expect(problemsOf({ ...data, tours: 'none' })).toEqual(['This page’s data is not a project.']);
  });

  it('says where the page opens and when it was made, when asked', () => {
    const data = pageDataOf(sample, {
      start: 'view=system-overview',
      made: new Date('2026-10-25T12:00:00Z'),
    });
    expect(data.start).toBe('view=system-overview');
    expect(data.made).toBe('2026-10-25T12:00:00.000Z');
  });

  it('holds no package code, nor what its code asks to reach: nothing of a package runs in a page', () => {
    const coded: ProjectSnapshot = {
      ...sample,
      packages: sample.packages.map((pkg) =>
        pkg.id === 'clinic'
          ? { ...pkg, code: ['export function check() { return []; }'], capabilities: ['time'] }
          : pkg,
      ),
    };
    const data = pageDataOf(coded);
    const [clinic] = data.packages;
    expect(clinic).not.toHaveProperty('code');
    expect(clinic).not.toHaveProperty('capabilities');
    expect(clinic?.components).toEqual(sample.packages[1]?.components);
    expect(asText(data)).not.toContain('export function check');
    // What it holds still opens.
    expect(read(data).ok).toBe(true);
  });

  it('holds images only as cleaning gives them', () => {
    const data = pageDataOf(withImage(SCRIPTED_SVG));
    const [image] = data.packages[0]?.images ?? [];
    expect(image?.kind).toBe('svg');
    const svg = image?.kind === 'svg' ? image.svg : '';
    expect(svg).not.toContain('script');
    expect(svg).not.toContain('made at home');
    expect(svg).toContain('<rect');
  });

  it('leaves out an image that cleaning refuses, and the list of images once it is empty', () => {
    const data = pageDataOf(withImage('<svg viewBox="0 0 10 10"><!DOCTYPE x><rect/></svg>'));
    expect(data.packages[0]).not.toHaveProperty('images');
  });
});

describe('Reading a read-only page’s data', () => {
  it('gives back the project as the program opens it, with the built-in packages it lists', () => {
    const result = read(pageDataOf(sample, { start: 'view=system-overview' }));
    if (!result.ok) throw new Error(result.problems.join('\n'));
    expect(result.project.packages.map((pkg) => pkg.id)).toEqual(['systems', 'clinic']);
    expect(result.project.packages[0]).toBe(builtinPackage('systems'));
    expect(result.project.model).toEqual(sample.model);
    expect(result.project.views).toEqual(sample.views);
    expect(result.project.scenarios).toEqual(sample.scenarios);
    expect(result.start).toBe('view=system-overview');
  });

  it('keeps a script in a name as the text it is', () => {
    const named = {
      ...sample,
      model: {
        ...sample.model,
        elements: sample.model.elements.map((element, at) =>
          at === 0 ? { ...element, name: '<script>alert("x")</script>' } : element,
        ),
      },
    };
    const result = read(pageDataOf(named));
    if (!result.ok) throw new Error(result.problems.join('\n'));
    expect(result.project.model.elements[0]?.name).toBe('<script>alert("x")</script>');
  });

  it('refuses what is not JSON, and what is not a page’s data', () => {
    expect(readPageData('{"format": 1,', validateFile).ok).toBe(false);
    expect(problemsOf([])).toEqual(['This page’s data is not a project.']);
    expect(problemsOf({ format: 'one' })).toEqual(['This page’s data is not a project.']);
    expect(read(null).ok).toBe(false);
  });

  it('says when a newer Visual Anything made the page', () => {
    const data: unknown = { ...pageDataOf(sample), format: PAGE_FORMAT + 1 };
    expect(problemsOf(data)).toEqual([
      `This page was made by a newer Visual Anything, format ${PAGE_FORMAT + 1}. Make it again with this version, or open it with a newer one.`,
    ]);
  });

  it('checks each file against its schema, as opening does', () => {
    const data = pageDataOf(sample);
    const broken = {
      ...data,
      model: {
        ...data.model,
        elements: data.model.elements.map((element, at) =>
          at === 0 ? { ...element, name: 42 } : element,
        ),
      },
    };
    const [problem] = problemsOf(broken);
    expect(problem).toMatch(/^The model, \/elements\/0\/name: /);
  });

  it('refuses a page whose lists are missing', () => {
    const data: Partial<PageData> = { ...pageDataOf(sample) };
    delete data.views;
    expect(problemsOf(data)).toEqual(['This page’s data is not a project.']);
  });

  it('refuses two views with one id', () => {
    const data = pageDataOf(sample);
    const twice = { ...data, views: [...data.views, ...data.views] };
    expect(problemsOf(twice)).toContain('The view id "system-overview" is used twice.');
  });

  it('refuses a package that is listed and not held, or that takes a built-in id', () => {
    const data = pageDataOf(sample);
    expect(problemsOf({ ...data, packages: [] })).toEqual([
      'The package "clinic" is listed, but neither this page nor the built-in packages hold it.',
    ]);
    const systems = builtinPackage('systems') as PackageFile;
    expect(problemsOf({ ...data, packages: [...data.packages, systems] })).toContain(
      'The page holds a package with the id "systems", which Visual Anything keeps for its built-in Systems package.',
    );
  });

  it('refuses what the core refuses on opening', () => {
    const data = pageDataOf(sample);
    const unknown = {
      ...data,
      model: {
        ...data.model,
        elements: data.model.elements.map((element, at) =>
          at === 0 ? { ...element, component: 'nowhere.thing' } : element,
        ),
      },
    };
    const problems = problemsOf(unknown);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('nowhere.thing');
  });

  it('refuses a start that is not a view address’s fragment', () => {
    const long: PageData = { ...pageDataOf(sample), start: 'x'.repeat(MAX_VIEW_STATE_ADDRESS + 1) };
    expect(problemsOf(long)).toEqual(['This page’s data is not a project.']);
    expect(problemsOf({ ...pageDataOf(sample), start: 42 })).toEqual([
      'This page’s data is not a project.',
    ]);
  });
});

describe('What keeps a page from opening, in Spanish', () => {
  it('reads in Spanish, whatever the page holds', () => {
    const data = pageDataOf(sample);
    const systems = builtinPackage('systems') as PackageFile;
    const problems = [
      ...problemsOf({ ...data, format: PAGE_FORMAT + 1 }),
      ...problemsOf([]),
      ...problemsOf({ ...data, views: [...data.views, ...data.views] }),
      ...problemsOf({ ...data, scenarios: [...data.scenarios, ...data.scenarios] }),
      ...problemsOf({ ...data, packages: [] }),
      ...problemsOf({ ...data, packages: [...data.packages, systems, ...data.packages] }),
    ];
    expect(problems.length).toBeGreaterThan(6);
    for (const problem of problems) expect(untranslatedParts('es', problem), problem).toEqual([]);
    const notJson = readPageData('{', validateFile);
    expect(notJson.ok ? '' : translateMessage('es', notJson.problems[0] ?? '')).toMatch(
      /^Los datos de esta página no son JSON válido: /,
    );
  });

  it('says in Spanish which file a schema’s reason is about', () => {
    const data = pageDataOf(sample);
    const [problem = ''] = problemsOf({ ...data, model: { ...data.model, elements: 'none' } });
    expect(translateMessage('es', problem)).toMatch(/^El modelo, \/elements: /);
  });
});

describe('A page of a view beyond boxes (M8b)', () => {
  /** What the canvas draws of a scene beyond boxes: each shape's outline, part and picture, and each line's style. */
  function drawnAs(scene: Scene) {
    return {
      shapes: scene.shapes.map((shape) => ({
        key: shape.key,
        rect: shape.rect,
        outline: outlineAt(shape)?.fitted.bounds,
        part: shape.part,
        picture: shape.picture,
        undrawn: shape.undrawn,
      })),
      drawing: scene.drawing,
      lines: scene.relations.map((line) => ({
        style: line.style,
        curve: line.curve,
        route: line.route,
      })),
    };
  }

  it('carries free geometry, named parts and automatic curves, and draws them as the app does', () => {
    const base = beyondBoxes('anatomy');
    const project: ProjectSnapshot = {
      ...base,
      views: base.views.map((view) => ({ ...view, routeStyle: 'curved' })),
    };
    const result = read(pageDataOf(project));
    if (!result.ok) throw new Error(result.problems.join('\n'));
    const app = pageScene(buildScene(project, 'anatomy'));
    const page = pageScene(buildScene(result.project, 'anatomy'));
    const drawn = drawnAs(page);
    expect(drawn).toEqual(drawnAs(app));
    // Free geometry, anchored parts, a part on its own, and curves, all of them in the page.
    expect(drawn.shapes.filter((shape) => shape.outline && !shape.part)).toHaveLength(1);
    expect(drawn.shapes.filter((shape) => shape.part?.inDrawing)).toHaveLength(2);
    expect(drawn.shapes.filter((shape) => shape.part && !shape.part.inDrawing)).toHaveLength(1);
    expect(drawn.shapes.filter((shape) => shape.picture)).toHaveLength(1);
    expect(drawn.lines.every((line) => line.style === 'curved')).toBe(true);
    // A line between parts that touch runs over them straight; the others are curves.
    expect(drawn.lines.filter((line) => line.curve).length).toBeGreaterThan(1);
    // Its drawing is the one the exports write of the app's.
    expect(writeSvg(result.project, 'anatomy').text).toBe(writeSvg(project, 'anatomy').text);
  });
});
