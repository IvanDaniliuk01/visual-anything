import type {
  ModelFile,
  PackageFile,
  ProjectFile,
  ScenarioFile,
  ViewFile,
} from '@visual-anything/schema';

/** Everything an open project holds, as read from its files. */
export interface ProjectSnapshot {
  project: ProjectFile;
  model: ModelFile;
  /** The packages the project uses. */
  packages: PackageFile[];
  views: ViewFile[];
  scenarios: ScenarioFile[];
}
