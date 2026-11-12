import type {
  CommentFile,
  ModelFile,
  PackageFile,
  ProjectFile,
  ScenarioFile,
  TourFile,
  ViewFile,
} from '@visual-anything/schema';
import type { ExplorableText } from './explorables/types';

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
  /**
   * The texts of its explorables' files, which the local program reads from `explorables/` (ADR
   * 0107), so that the history keeps the text an action replaces; left out when it holds none.
   */
  explorableTexts?: ExplorableText[];
}
