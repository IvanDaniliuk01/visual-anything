import {
  MAX_VIEW_STATE_ADDRESS,
  builtinPackage,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { PackageFile, SvgImage } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { translateMessage, untranslatedParts } from '../i18n/translate';
import { loadSample } from '../test/sample';
import { PAGE_FORMAT, pageDataOf, readPageData, type PageData } from './data';

const sample = loadSample();

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
