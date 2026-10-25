/**
 * The files Export makes besides the PNG and the read-only page: the SVG and PDF drawings and the
 * text exports of M6b (R31, R33), each a writer that turns the open view into a file. Their writers add
 * an entry here, and the Export dialog offers each one with its size and what it leaves out.
 */
import type { ProjectSnapshot, ThemeName } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import type { Scene } from '../canvas/scene';
import type { Translator } from '../i18n';

/** What a writer is given: the open view, as the canvas draws it, in the theme it shows. */
export interface FileExportContext {
  project: ProjectSnapshot;
  view: ViewFile;
  scene: Scene;
  theme: ThemeName;
}

/** A kind of file Export makes of the open view. */
export interface FileExport {
  /** Its id among the formats, such as `svg`. */
  id: string;
  /** What it is called, in the language read in, such as "SVG drawing". */
  name: (t: Translator) => string;
  /** What it is for, in a few words, in the language read in. */
  hint: (t: Translator) => string;
  /** The extension its file is saved with, without the dot. */
  extension: string;
  /** What it leaves out of the view, in sentences in the language read in. */
  leavesOut: (context: FileExportContext, t: Translator) => readonly string[];
  /** Makes the file. */
  make: (context: FileExportContext) => Promise<Blob>;
}

/**
 * The formats the writers of M6b add: SVG, PDF, the outline in Markdown, Mermaid and Structurizr
 * DSL. None is in this build yet; each is listed here once its writer is.
 */
export const FILE_EXPORTS: readonly FileExport[] = [];
