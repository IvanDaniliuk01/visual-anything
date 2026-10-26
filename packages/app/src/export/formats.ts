/**
 * The files Export makes besides the PNG and the read-only page: the SVG and PDF drawings and the
 * text exports of M6b (R31, R33), each written by `exports.ts`, which the command line and Claude's
 * tools use too. The Export dialog offers each one with its size, what it leaves out and, once it is
 * made, what it could not hold.
 */
import type { ProjectSnapshot, ThemeName } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import type { Scene } from '../canvas/scene';
import type { Translator } from '../i18n';
import { FORMAT_FILES, exportView, formatsFor, type ExportFormat } from './exports';

/** What a writer is given: the open view, as the canvas draws it, in the theme it shows. */
export interface FileExportContext {
  project: ProjectSnapshot;
  view: ViewFile;
  scene: Scene;
  theme: ThemeName;
}

/** A file made of the view: what to save, under which name, and what it could not hold. */
export interface MadeFile {
  blob: Blob;
  fileName: string;
  lost: readonly string[];
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
  /**
   * Whether making it can take long, as a PDF of a large view does: it is then made when it is saved,
   * saying so, and the person can stop waiting.
   */
  slow: boolean;
  /** Why it cannot be made of this view, in the language read in; undefined when it can. */
  unavailable: (context: FileExportContext) => string | undefined;
  /** What it leaves out of the view, in sentences in the language read in. */
  leavesOut: (context: FileExportContext, t: Translator) => readonly string[];
  /**
   * Makes the file. Once `signal` is aborted it stops, as soon as it can, and rejects with the
   * signal's reason, which the dialog takes as stopped, not as a failure.
   */
  make: (context: FileExportContext, signal?: AbortSignal) => Promise<MadeFile>;
}

/** A format of `exports.ts`, offered by the Export dialog. */
function writer(
  format: ExportFormat,
  name: (t: Translator) => string,
  hint: (t: Translator) => string,
): FileExport {
  const choiceIn = (context: FileExportContext) =>
    formatsFor(context.project, context.view.id).find((each) => each.format === format);
  return {
    id: format,
    name,
    hint,
    extension: FORMAT_FILES[format].extension,
    slow: format === 'pdf',
    unavailable: (context) => {
      const choice = choiceIn(context);
      return choice === undefined || choice.available ? undefined : choice.why;
    },
    leavesOut: (context) => {
      const choice = choiceIn(context);
      return choice ? [choice.leavesOut] : [];
    },
    make: async ({ project, view, theme }, signal) => {
      const exported = await exportView(project, view.id, format, {
        theme,
        ...(signal === undefined ? {} : { signal }),
      });
      // A copy of the bytes, in a buffer of their own, as a Blob takes them.
      const content: BlobPart =
        exported.bytes === undefined ? exported.text : new Uint8Array(exported.bytes);
      return {
        blob: new Blob([content], { type: exported.mediaType }),
        fileName: exported.fileName,
        lost: exported.lost,
      };
    },
  };
}

/** The writers' formats, in the order the dialog lists them. */
export const FILE_EXPORTS: readonly FileExport[] = [
  writer(
    'svg',
    (t) => t('SVG drawing'),
    (t) => t('The view as a drawing that scales, for pages and documents'),
  ),
  writer(
    'pdf',
    (t) => t('PDF document'),
    (t) => t('The view on one page, to print or attach; made when saved'),
  ),
  writer(
    'md',
    (t) => t('Outline in Markdown'),
    (t) => t('The view as text, which is also its long description'),
  ),
  writer(
    'mermaid',
    (t) => t('Mermaid flowchart'),
    (t) => t('For GitHub, wikis and other tools that draw Mermaid'),
  ),
  writer(
    'structurizr',
    (t) => t('Structurizr DSL'),
    (t) => t('A C4 workspace of the view’s Systems components'),
  ),
];
