/**
 * What the import dialog's help says about the Structurizr, LikeC4 and draw.io files it reads
 * (ADR 0042), in the language the app reads in: which files each format comes in, and what is not
 * read, such as Structurizr's DSL, which the person exports to JSON with the Structurizr CLI first.
 */
import type { DiagramFormat } from '@visual-anything/core';
import type { Translator } from '../i18n/t';

/** One format's help: its name, the files it comes in and what to know before importing one. */
export interface FormatHelp {
  format: DiagramFormat;
  name: string;
  /** The file name endings it is read from, which the file chooser accepts. */
  files: readonly string[];
  help: string;
}

/** The help for each format these readers read, in the order the dialog lists them. */
export function diagramFormatsHelp(t: Translator): FormatHelp[] {
  return [
    {
      format: 'structurizr',
      name: t('Structurizr workspace'),
      files: ['.json'],
      help: t(
        'A workspace in JSON. Workspace DSL is not read: export it to JSON first with the Structurizr CLI, as in structurizr-cli export -workspace workspace.dsl -format json.',
      ),
    },
    {
      format: 'likec4',
      name: t('LikeC4 model'),
      files: ['.json'],
      help: t('The model likec4 export json writes, with the positions of its views.'),
    },
    {
      format: 'drawio',
      name: t('draw.io file'),
      files: ['.drawio', '.xml', '.drawio.svg', '.drawio.png'],
      help: t(
        'Plain or compressed, or inside a .drawio.svg or .drawio.png picture. Each page becomes a view; stencils and images are left out.',
      ),
    },
  ];
}
