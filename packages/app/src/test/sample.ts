import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { builtinPackage, type ProjectSnapshot } from '@visual-anything/core';
import type {
  CommentFile,
  ModelFile,
  PackageFile,
  ProjectFile,
  ScenarioFile,
  TourFile,
  ViewFile,
} from '@visual-anything/schema';

/**
 * The sample project the local program opens by default. Resolved from a path rather than with
 * `new URL(…, import.meta.url)`, which Vite rewrites into a URL of its own server.
 */
const EXAMPLES = resolve(import.meta.dirname, '../../../../examples');

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Reads every file in a folder of a sample with the given extension, in file name order; none without it. */
function readAll<T>(sample: string, folder: string, extension: string): T[] {
  const directory = join(sample, folder);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(extension))
    .sort()
    .map((name) => readJson<T>(join(directory, name)));
}

/**
 * A sample project in `examples/`, `my-systems` unless another is named, read from its files as the
 * local program sends it: the packages it lists, from its packages/ folder or built in.
 */
export function loadSample(name = 'my-systems'): ProjectSnapshot {
  return loadProjectFolder(join(EXAMPLES, name));
}

/** A project read from its folder, as `loadSample` reads a sample's. */
export function loadProjectFolder(folder: string): ProjectSnapshot {
  const project = readJson<ProjectFile>(join(folder, 'project.vaproject'));
  const own = readAll<PackageFile>(folder, 'packages', '.vapackage');
  return {
    project,
    model: readJson<ModelFile>(join(folder, 'model.vamodel')),
    packages: project.packages.map((id) => {
      const found = own.find((file) => file.id === id) ?? builtinPackage(id);
      if (!found) throw new Error(`The sample lists the package "${id}", which it does not hold.`);
      return found;
    }),
    views: readAll<ViewFile>(folder, 'views', '.vaview'),
    scenarios: readAll<ScenarioFile>(folder, 'scenarios', '.vascenario'),
    tours: readAll<TourFile>(folder, 'tours', '.vatour'),
    comments: readAll<CommentFile>(folder, 'comments', '.vacomment'),
  };
}

/**
 * A project whose scenarios hold no decisions (ADR 0078): each keeps, in order, the steps that play
 * by default, and the tours' steps that play what is left out are left out too. The sample's scenario
 * is then the one it held before it decided, for the tests of scenarios without decisions.
 */
export function withoutDecisions(project: ProjectSnapshot = loadSample()): ProjectSnapshot {
  const gone = new Set<string>();
  const scenarios = project.scenarios.map((scenario): ScenarioFile => {
    if (scenario.blocks === undefined) return scenario;
    for (const block of scenario.blocks) {
      const kept =
        block.alternatives.find((each) => each.id === block.default) ?? block.alternatives[0];
      for (const alternative of block.alternatives) {
        if (alternative !== kept) for (const step of alternative.steps) gone.add(step);
      }
    }
    const linear: ScenarioFile = {
      ...scenario,
      steps: scenario.steps.filter((step) => !gone.has(step.id)),
    };
    delete linear.blocks;
    return linear;
  });
  const names = (step: TourFile['steps'][number]) =>
    [step.viewState.step, step.play?.from, step.play?.to].some(
      (id) => id !== undefined && gone.has(id),
    ) || step.play?.choices !== undefined;
  return {
    ...project,
    scenarios,
    tours: project.tours.map((tour) => ({
      ...tour,
      steps: tour.steps.filter((step) => !names(step)),
    })),
  };
}
