/**
 * What the Export dialog offers while a comparison shows (ADR 0070): each of its three drawings of the
 * open view, before, after and the comparison, as SVG and as PDF, with the legend, written from the
 * same scene as the canvas in the theme it shows; and the Markdown summary of the whole comparison,
 * which names both versions. The browser saves each file, so nothing is written by the program.
 */
import type { Id } from '@visual-anything/schema';
import type { ShownComparison } from '../canvas/comparison/mode';
import { COMPARISON_DRAWINGS, type ComparisonDrawing } from '../canvas/comparison/scene';
import { drawingName } from '../canvas/comparison/text';
import { svgOfComparison, writeComparisonPdf } from '../export/comparison';
import { writeComparisonSummary, type SummaryVersion } from '../export/comparison-summary';
import { exportFileName, type ExportFormat } from '../export/exports';
import type { FileExport } from '../export/formats';
import { t as appT } from '../i18n';

/** The two versions, as the summary names them. */
export interface ComparedVersions {
  older?: SummaryVersion;
  newer?: SummaryVersion;
}

/** What each drawing shows, as its hint says. */
const HINTS: Record<ComparisonDrawing, string> = {
  before: 'The older version’s view, with what was removed, changed and moved marked',
  after: 'The view now, with what was added, changed and moved marked',
  comparison: 'The view now, with every change marked and what was removed drawn faintly',
};

/** The file a drawing is saved in: the project's name, the view's and the drawing's. */
function drawingFileName(
  shown: ShownComparison,
  viewId: Id,
  drawing: ComparisonDrawing,
  format: ExportFormat,
): string {
  const view =
    shown.newer.views.find((each) => each.id === viewId) ??
    shown.older.views.find((each) => each.id === viewId);
  return exportFileName(
    shown.newer.project.name,
    `${view?.name ?? viewId} - ${drawingName(appT, drawing)}`,
    format,
  );
}

/** One drawing of the comparison, as SVG or as PDF. */
function drawingExport(
  shown: ShownComparison,
  viewId: Id,
  drawing: ComparisonDrawing,
  format: 'svg' | 'pdf',
): FileExport {
  const options = { drawing, faint: shown.faint, title: shown.title };
  return {
    id: `comparison-${drawing}-${format}`,
    name: (t) =>
      format === 'svg'
        ? t('{drawing}, as SVG', { drawing: drawingName(t, drawing) })
        : t('{drawing}, as PDF', { drawing: drawingName(t, drawing) }),
    hint: (t) => t(HINTS[drawing]),
    extension: format,
    slow: format === 'pdf',
    unavailable: () => undefined,
    leavesOut: () => [],
    make: async ({ theme }, signal) => {
      signal?.throwIfAborted();
      const fileName = drawingFileName(shown, viewId, drawing, format);
      if (format === 'svg') {
        const svg = svgOfComparison(shown.older, shown.newer, viewId, shown.comparison, {
          ...options,
          theme,
        });
        return {
          blob: new Blob([svg.text], { type: 'image/svg+xml' }),
          fileName,
          lost: svg.lost,
        };
      }
      const pdf = await writeComparisonPdf(shown.older, shown.newer, viewId, shown.comparison, {
        ...options,
        theme,
        ...(signal === undefined ? {} : { signal }),
      });
      return {
        blob: new Blob([new Uint8Array(pdf.bytes)], { type: 'application/pdf' }),
        fileName,
        lost: pdf.lost,
      };
    },
  };
}

/** The Markdown summary of the whole comparison, naming both versions. */
function summaryExport(
  shown: ShownComparison,
  versions: () => ComparedVersions | undefined,
): FileExport {
  return {
    id: 'comparison-summary',
    name: (t) => t('Summary of the changes, in Markdown'),
    hint: (t) =>
      t('Both versions, the counts and every change with what differs, for a pull request'),
    extension: 'md',
    slow: false,
    unavailable: () => undefined,
    leavesOut: (_context, t) => [
      t('The drawings, which are saved one by one; the summary does not link them.'),
    ],
    make: (_context, signal) => {
      signal?.throwIfAborted();
      const named = versions();
      const text = writeComparisonSummary(shown.older, shown.newer, shown.comparison, {
        ...(named ? { versions: named } : {}),
      });
      return Promise.resolve({
        blob: new Blob([text], { type: 'text/markdown;charset=utf-8' }),
        fileName: exportFileName(shown.newer.project.name, appT('Changes'), 'md'),
        lost: [],
      });
    },
  };
}

/**
 * The files of a comparison shown, of the view it draws: before, after and the comparison, each as
 * SVG and PDF, then the summary, whose versions are read when it is made.
 */
export function comparisonExports(
  shown: ShownComparison,
  viewId: Id,
  versions: () => ComparedVersions | undefined = () => undefined,
): FileExport[] {
  return [
    ...COMPARISON_DRAWINGS.flatMap((drawing) => [
      drawingExport(shown, viewId, drawing, 'svg'),
      drawingExport(shown, viewId, drawing, 'pdf'),
    ]),
    summaryExport(shown, versions),
  ];
}
