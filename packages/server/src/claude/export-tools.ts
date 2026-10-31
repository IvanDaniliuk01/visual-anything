/**
 * Claude's export tool (M6b): a view as SVG, Markdown, Mermaid or Structurizr DSL text, which Claude
 * reads, explains, or hands to the person to paste into a README, a wiki or a pull request. It writes
 * no file and changes nothing; the PDF and the read-only page are made in the app or by
 * `visual-anything export`, since they are files rather than text.
 */
import type { ExportFormat } from '@visual-anything/app/src/export/exports';
import { z } from 'zod';
import { READ, fail, id, ok, tool } from './kit';
import type { Tool } from './tools';

/** The formats Claude asks for, by the names it reads in the tool, and what each exports as. */
const FORMATS = {
  svg: 'svg',
  markdown: 'md',
  mermaid: 'mermaid',
  structurizr: 'structurizr',
} as const satisfies Record<string, ExportFormat>;

/**
 * The most characters an answer holds: past it, a whole view's SVG would crowd out the conversation,
 * and the person exports it from the app or the command line instead.
 */
export const MOST_EXPORTED = 256 * 1024;

const exportViewTool = tool({
  name: 'export_view',
  title: 'Export a view as text',
  description: `Answers one view as text, and writes no file and changes nothing:
- svg: the view drawn as the canvas draws it, with each shape's element and each line's relation as data-element and data-relation attributes, and the view's name and description as its title and description;
- markdown: the view's outline, what sits in World and in each container with the relations drawn from each shape, its notes, and the steps of its scenarios. It is the view's long description, and the best way to read a large view;
- mermaid: a Mermaid flowchart, which GitHub renders in Markdown, with containers as subgraphs;
- structurizr: a Structurizr DSL workspace of the view's Systems components (people, software systems, containers and components).
Each answer says what the format could not hold, in lost. Mermaid and Structurizr lay views out themselves, so positions are lost. There is no GPU here, so the svg draws each solid as its placeholder, its shape's outline, its name and a mark, and says so; the markdown gives each solid's description, and the PNG, SVG and PDF the app's Export dialog makes draw their pictures. Use it when the person wants a view in a README, a wiki or a pull request, or to read a whole view at once. A PDF or the read-only page is made in the app's Export dialog, or with \`visual-anything export <folder> --view <id> --format pdf\`. Answers longer than ${MOST_EXPORTED / 1024} KiB are refused: export markdown instead, or have the person export the file.

Example: { "view": "system-overview", "format": "mermaid" }
Example: { "view": "system-overview", "format": "svg", "theme": "dark" }`,
  input: {
    view: id().describe('The view to export, by its id.'),
    format: z
      .enum(['svg', 'markdown', 'mermaid', 'structurizr'])
      .describe('svg, markdown (the outline), mermaid or structurizr (Structurizr DSL).'),
    theme: z
      .enum(['light', 'dark'])
      .optional()
      .describe('The colors svg, mermaid and structurizr take; light when left out.'),
  },
  hints: READ,
  run: async (args, program) => {
    const project = await program.project();
    if (!project.views.some((view) => view.id === args.view)) {
      return fail(
        `There is no view "${args.view}". The views are: ${project.views.map((view) => view.id).join(', ') || 'none'}.`,
      );
    }
    // The writers, which draw scenes, are loaded the first time Claude exports.
    const { exportView } = await import('@visual-anything/app/src/export/exports');
    const exported = await exportView(project, args.view, FORMATS[args.format], {
      ...(args.theme === undefined ? {} : { theme: args.theme }),
    });
    const text = exported.text ?? '';
    if (text.length > MOST_EXPORTED) {
      return fail(
        `The ${args.format} of "${args.view}" is ${Math.ceil(text.length / 1024)} KiB, more than an answer holds (${MOST_EXPORTED / 1024} KiB). Export markdown instead, or ask the person to export the file from the app or with visual-anything export.`,
      );
    }
    return ok({
      view: args.view,
      format: args.format,
      fileName: exported.fileName,
      mediaType: exported.mediaType,
      lost: exported.lost,
      text,
      note: 'Nothing was written: give the text to the person, or save it where they ask.',
    });
  },
});

export const EXPORT_TOOLS: readonly Tool[] = [exportViewTool];
