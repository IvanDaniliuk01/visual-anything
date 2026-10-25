import type {
  CommentFile,
  ModelFile,
  PackageFile,
  ProjectFile,
  ScenarioFile,
  TourFile,
  ViewFile,
} from './files';

/** The seven kinds of project file. */
export type FileKind = 'project' | 'model' | 'package' | 'view' | 'scenario' | 'tour' | 'comment';

/** What a project file of each kind holds. */
export interface FileContentByKind {
  project: ProjectFile;
  model: ModelFile;
  package: PackageFile;
  view: ViewFile;
  scenario: ScenarioFile;
  /** A tour (ADR 0058). */
  tour: TourFile;
  /** One thread of comments (ADR 0059). */
  comment: CommentFile;
}

/** The extension of each kind of project file. */
export const FILE_EXTENSIONS = {
  project: '.vaproject',
  model: '.vamodel',
  package: '.vapackage',
  view: '.vaview',
  scenario: '.vascenario',
  tour: '.vatour',
  comment: '.vacomment',
} as const satisfies Record<FileKind, string>;

/** Every kind of project file. */
export const FILE_KINDS: readonly FileKind[] = [
  'project',
  'model',
  'package',
  'view',
  'scenario',
  'tour',
  'comment',
];

/** The kind of project file a path names, read from its extension; `undefined` for any other file. */
export function fileKindOf(path: string): FileKind | undefined {
  return FILE_KINDS.find((kind) => path.endsWith(FILE_EXTENSIONS[kind]));
}
