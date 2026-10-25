import type {
  CommentFile,
  ModelFile,
  PackageFile,
  ProjectFile,
  ScenarioFile,
  TourFile,
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
  /** Its tours, one per file in `tours/` (ADR 0058). */
  tours: TourFile[];
  /** Its threads of comments, one per file in `comments/` (ADR 0059). */
  comments: CommentFile[];
}
