/** The import dialog's help for Structurizr, LikeC4 and draw.io files, in English and Spanish. */
import { describe, expect, it } from 'vitest';
import { translatorFor } from '../i18n/t';
import { diagramFormatsHelp } from './diagram-formats';

describe('diagramFormatsHelp', () => {
  it('says that Structurizr DSL is not read, and how to export it to JSON', () => {
    const [structurizr] = diagramFormatsHelp(translatorFor('en'));
    expect(structurizr?.help).toMatch(/DSL is not read/);
    expect(structurizr?.help).toContain(
      'structurizr-cli export -workspace workspace.dsl -format json',
    );
  });

  it('reads in Spanish, keeping commands and file names as they are', () => {
    const english = diagramFormatsHelp(translatorFor('en'));
    const spanish = diagramFormatsHelp(translatorFor('es'));
    spanish.forEach((help, at) => {
      expect(help.name).not.toBe(english[at]?.name);
      expect(help.help).not.toBe(english[at]?.help);
      expect(help.files).toEqual(english[at]?.files);
    });
    expect(spanish[0]?.help).toContain(
      'structurizr-cli export -workspace workspace.dsl -format json',
    );
    expect(spanish[2]?.help).toContain('.drawio.png');
  });
});
