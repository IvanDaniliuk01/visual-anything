/**
 * The exports' benchmark phase (M6b): how long each export of a view takes to write and how large it
 * is, at the size the canvas benchmark draws. Each format is written `runs` times, but the PDF, which
 * takes longest, once; the scene the canvas would draw is built first and not counted, as the app
 * exports the scene it already has. Pure, so that it runs in the browser's page and in a test.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { buildScene } from '../canvas/scene';
import { EXPORT_FORMATS, exportView, type ExportFormat } from '../export/exports';
import { percentile } from './report';

/** One format's measures. */
export interface ExportMeasure {
  format: ExportFormat;
  /** How long each run took, in milliseconds. */
  times: number[];
  p50: number;
  p95: number;
  /** The size of what it wrote, in bytes. */
  size: number;
}

/** How the phase runs. */
export interface ExportPhaseOptions {
  /** How many times each format but the PDF is written; 5 by default. */
  runs?: number;
  /** The formats measured; every one by default. */
  formats?: readonly ExportFormat[];
  /** The clock; `performance.now` by default. */
  now?: () => number;
}

/** Measures every export of a view. */
export async function measureExports(
  project: ProjectSnapshot,
  viewId: Id,
  options: ExportPhaseOptions = {},
): Promise<{ sceneMs: number; measures: ExportMeasure[] }> {
  const now = options.now ?? (() => performance.now());
  const runs = Math.max(1, options.runs ?? 5);
  const started = now();
  buildScene(project, viewId);
  const sceneMs = now() - started;
  const measures: ExportMeasure[] = [];
  for (const format of options.formats ?? EXPORT_FORMATS) {
    const times: number[] = [];
    let size = 0;
    for (let run = 0; run < (format === 'pdf' ? 1 : runs); run++) {
      const before = now();
      const exported = await exportView(project, viewId, format);
      times.push(now() - before);
      size = exported.size;
    }
    measures.push({
      format,
      times,
      p50: percentile(times, 0.5),
      p95: percentile(times, 0.95),
      size,
    });
  }
  return { sceneMs, measures };
}
