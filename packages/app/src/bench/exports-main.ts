/**
 * The exports' benchmark page: writes the 10,000-element synthetic view the canvas benchmark draws as
 * SVG, PDF, Markdown, Mermaid and Structurizr DSL, and reports how long each takes and how large it is.
 * `pnpm bench` builds it with the canvas benchmark and serves it at `/exports-bench.html`; the
 * numbers come from that build. `?elements=N` changes the size, `?images` gives the elements
 * pictures, `?runs=N` how often each text format is written, and `?formats=svg,md` which are.
 * Nothing here has a mark yet: M6b reports how long the SVG takes to write.
 */
import { addRow } from './report';
import { EXPORT_FORMATS, isExportFormat } from '../export/exports';
import { measureExports } from './exports';
import { syntheticProject } from './synthetic';
import '../theme/tokens.css';

const params = new URLSearchParams(location.search);
const elements = Number(params.get('elements') ?? 10_000);
const runs = Number(params.get('runs') ?? 5);
const formats = (params.get('formats') ?? EXPORT_FORMATS.join(','))
  .split(',')
  .filter(isExportFormat);
const status = document.getElementById('status') as HTMLElement;
const table = document.getElementById('table') as HTMLTableElement;

async function run(): Promise<void> {
  const project = syntheticProject({ elements, images: params.has('images') });
  status.textContent = `Writing ${elements.toLocaleString()} elements in ${formats.join(', ')}…`;
  // Let the page show its status before the work starts.
  await new Promise((resolve) => setTimeout(resolve, 50));
  const { sceneMs, measures } = await measureExports(project, 'everything', { runs, formats });
  const body = table.tBodies[0] as HTMLTableSectionElement;
  for (const measure of measures) {
    addRow(body, '', [
      measure.format,
      measure.p50.toFixed(0),
      measure.p95.toFixed(0),
      `${(measure.size / 2 ** 20).toFixed(2)} MiB`,
    ]);
  }
  table.hidden = false;
  status.textContent = `${elements.toLocaleString()} elements; the scene was built in ${sceneMs.toFixed(0)} ms, before the exports.`;
  console.info(
    'Visual Anything exports benchmark',
    JSON.stringify({ elements, runs, sceneMs, measures }),
  );
}

run().catch((error: unknown) => {
  status.textContent = `The benchmark failed: ${error instanceof Error ? error.message : String(error)}`;
});
