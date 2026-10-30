/**
 * Faces in the text exports (ADR 0083, F3): Mermaid and Structurizr say that they lose the faces of
 * the shapes they write, which only the canvas, the SVG, the PDF and the read-only page draw; the
 * outline in Markdown writes what each face says, its plain text in reading order, after the shape's
 * name and component.
 */
import { describe, expect, it } from 'vitest';
import { setCurrentLanguage } from '../i18n/language';
import { SAMPLE_VIEW } from '../test/exports';
import { FACES_VIEW, facedProject } from '../test/faces';
import { loadSample } from '../test/sample';
import { writeMermaid } from './mermaid';
import { writeOutline } from './outline';
import { writeStructurizr } from './structurizr';

const FACES_LOST =
  '6 shapes’ faces are left out: faces are drawn only in the canvas, the SVG, the PDF and the read-only page.';

describe('faces in the text exports (ADR 0083)', () => {
  it('Mermaid says it leaves out the faces of the shapes it writes', () => {
    const { text, lost } = writeMermaid(facedProject(), FACES_VIEW);
    // The system, the table, its three columns and the service.
    expect(lost).toContain(FACES_LOST);
    expect(text).toContain(`%% Lost: ${FACES_LOST}`);
    expect(writeMermaid(loadSample(), SAMPLE_VIEW).lost.join(' ')).not.toMatch(/face/);
  });

  it('Structurizr says it leaves out the faces of the shapes it writes', () => {
    const { text, lost } = writeStructurizr(facedProject(), FACES_VIEW);
    // Only the system and the service are of the Systems package, which a workspace writes.
    const said = lost.find((each) => each.includes('faces are drawn only'));
    expect(said).toBe(
      '2 shapes’ faces are left out: faces are drawn only in the canvas, the SVG, the PDF and the read-only page.',
    );
    expect(text).toContain(`// Lost: ${said}`);
    expect(writeStructurizr(loadSample(), SAMPLE_VIEW).lost.join(' ')).not.toMatch(/face/);
  });

  it('the outline writes what each face says, and says that it draws none', () => {
    const { text, lost } = writeOutline(facedProject(), FACES_VIEW);
    expect(text).toContain(
      '- **Mailer** (Service): Sends the reminders and the receipts, every night, to every patient',
    );
    // A column's face says its name and its type, on one line.
    expect(text).toContain('- **email** (Column): email text');
    expect(text).toContain('- **name** (Column): name —');
    expect(lost).toContain(
      'How faces look: the outline writes what they say, and the canvas, the SVG, the PDF and the read-only page draw them.',
    );
    expect(writeOutline(loadSample(), SAMPLE_VIEW).lost.join(' ')).not.toMatch(/face/);
  });

  it('the outline escapes what a face says, as everything people wrote', () => {
    const project = facedProject();
    const marked = {
      ...project,
      model: {
        ...project.model,
        elements: project.model.elements.map((element) =>
          element.id === 'mailer'
            ? { ...element, attributes: { description: '# not a [heading](x)' } }
            : element,
        ),
      },
    };
    expect(writeOutline(marked, FACES_VIEW).text).toContain(
      '- **Mailer** (Service): \\# not a \\[heading\\]\\(x\\)',
    );
  });

  it('says so in the language the app reads in', () => {
    setCurrentLanguage('es');
    expect(writeMermaid(facedProject(), FACES_VIEW).lost).toContain(
      'Se omiten las caras de 6 formas: las caras solo se dibujan en el lienzo, el SVG, el PDF y la página de solo lectura.',
    );
    expect(writeOutline(facedProject(), FACES_VIEW).lost).toContain(
      'Cómo se ven las caras: el esquema escribe lo que dicen, y el lienzo, el SVG, el PDF y la página de solo lectura las dibujan.',
    );
  });
});
