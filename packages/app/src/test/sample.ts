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
  const folder = join(EXAMPLES, name);
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
