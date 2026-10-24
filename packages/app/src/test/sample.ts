import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { builtinPackage, type ProjectSnapshot } from '@visual-anything/core';
import type {
  ModelFile,
  PackageFile,
  ProjectFile,
  ScenarioFile,
  ViewFile,
} from '@visual-anything/schema';

/**
 * The sample project the local program opens by default. Resolved from a path rather than with
 * `new URL(…, import.meta.url)`, which Vite rewrites into a URL of its own server.
 */
const SAMPLE_FOLDER = resolve(import.meta.dirname, '../../../../examples/my-systems');

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Reads every file in a folder of the sample with the given extension, in file name order. */
function readAll<T>(folder: string, extension: string): T[] {
  const directory = join(SAMPLE_FOLDER, folder);
  return readdirSync(directory)
    .filter((name) => name.endsWith(extension))
    .sort()
    .map((name) => readJson<T>(join(directory, name)));
}

/**
 * The sample project in `examples/my-systems`, read from its files as the local program sends it: the
 * packages it lists, from its packages/ folder or built in.
 */
export function loadSample(): ProjectSnapshot {
  const project = readJson<ProjectFile>(join(SAMPLE_FOLDER, 'project.vaproject'));
  const own = readAll<PackageFile>('packages', '.vapackage');
  return {
    project,
    model: readJson<ModelFile>(join(SAMPLE_FOLDER, 'model.vamodel')),
    packages: project.packages.map((id) => {
      const found = own.find((file) => file.id === id) ?? builtinPackage(id);
      if (!found) throw new Error(`The sample lists the package "${id}", which it does not hold.`);
      return found;
    }),
    views: readAll<ViewFile>('views', '.vaview'),
    scenarios: readAll<ScenarioFile>('scenarios', '.vascenario'),
  };
}
