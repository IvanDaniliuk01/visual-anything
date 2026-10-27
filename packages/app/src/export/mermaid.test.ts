import fc from 'fast-check';
import type { ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/scene';
import { setCurrentLanguage } from '../i18n/language';
import { THEMES } from '../theme/themes';
import { beyondBoxes } from '../test/beyond';
import { SAMPLE_VIEW, collapsedSample, richSample } from '../test/exports';
import { loadSample } from '../test/sample';
import { withWovenRelations } from '../test/woven';
import { mermaidLabel, writeMermaid } from './mermaid';

/** The lines of a chart, without its comments. */
function chartLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('%%'));
}

describe('mermaidLabel', () => {
  it('writes a label in quotes that nothing in it can close, mark up or turn into an entity', () => {
    expect(mermaidLabel('Say "hi" <b>&</b> #1 `x`\nnext')).toBe(
      '"Say #quot;hi#quot; #lt;b#gt;#amp;#lt;/b#gt; #35;1 #96;x#96; next"',
    );
    fc.assert(
      fc.property(fc.string(), (text) => {
        const label = mermaidLabel(text);
        const inner = label.slice(1, -1);
        expect(inner).not.toMatch(/["<>&`\r\n]/);
        // Every # starts one of the entity codes written here.
        expect(inner.replace(/#(35|quot|amp|lt|gt|96);/g, '')).not.toContain('#');
      }),
    );
  });
});

describe('writeMermaid', () => {
  it('writes each element once, containers as subgraphs, and every relation between them', () => {
    const project = loadSample();
    const { text } = writeMermaid(project, SAMPLE_VIEW);
    const lines = chartLines(text);
    expect(lines[0]).toBe('flowchart LR');
    expect(lines).toContain('  accTitle: System overview');
    expect(lines).toContain(
      '  accDescr: How a booking request travels from the patient to the calendar.',
    );
    expect(lines).toContain('  e_patient("Patient")');
    expect(lines).toContain('  subgraph e_clinic_booking["Clinic booking"]');
    expect(lines).toContain('    subgraph e_scheduling["Scheduling"]');
    expect(lines).toContain('      e_appointments_db[("Appointments DB")]');
    expect(lines).toContain('  e_booking_agent -->|"HTTPS"| e_appointments_api');
    expect(lines).toContain('  e_patient -->|"communicates with"| e_whatsapp');
    // Subgraphs close as they open.
    expect(lines.filter((line) => line.trim().startsWith('subgraph'))).toHaveLength(
      lines.filter((line) => line.trim() === 'end').length,
    );
    const scene = buildScene(project, SAMPLE_VIEW);
    expect(lines.filter((line) => /\|".*"\|/.test(line))).toHaveLength(scene.relations.length);
  });

  it('draws dashed relations dashed, and colors nodes and edges as the theme draws them', () => {
    const project = loadSample();
    const scene = buildScene(project, SAMPLE_VIEW);
    const light = writeMermaid(project, SAMPLE_VIEW).text;
    expect(light).toMatch(/e_appointments_api -\.->\|"reads from"\| e_appointments_db/);
    const api = scene.shapes.find((shape) => shape.element === 'appointments-api');
    expect(light).toContain(`fill:${api?.fill},stroke:${api?.stroke}`);
    const dark = writeMermaid(project, SAMPLE_VIEW, { theme: 'dark' }).text;
    expect(dark).toContain(`fill:${api?.dark?.fill},stroke:${api?.dark?.stroke}`);
    const line = scene.relations[0];
    expect(line?.darkStroke).toBeDefined();
    expect(dark).toContain(`stroke:${line?.darkStroke},stroke-width:${line?.width}px`);
    expect(THEMES.dark.canvas.background).not.toBe(line?.darkStroke);
    expect(light).toMatch(
      /linkStyle \d+(,\d+)* stroke:#[0-9A-Fa-f]{6},stroke-width:\d+(\.\d+)?px;/,
    );
  });

  it('says what it lost: layout, copies, relations on relations, pictures and free shapes', () => {
    const woven = withWovenRelations(richSample(), 1);
    const { text, lost } = writeMermaid(woven, SAMPLE_VIEW);
    const said = lost.join('\n');
    expect(said).toMatch(/positions, sizes, routes and bend points/);
    expect(said).toMatch(/relations that end on relations are left out/);
    expect(said).toMatch(/pictures are left out/);
    expect(said).toMatch(/notes and free arrows are left out/);
    expect(said).toMatch(/drawn as a person is drawn as a rounded rectangle/);
    for (const each of lost) expect(text).toContain(`%% Lost: ${each}`);
  });

  it('draws a collapsed container closed, with its relations aggregated', () => {
    const { text } = writeMermaid(collapsedSample(), SAMPLE_VIEW);
    expect(text).toContain('  e_scheduling("Scheduling")');
    expect(text).toMatch(/e_booking_agent ==>\|"×1 communicates with"\| e_scheduling/);
    expect(text).not.toContain('e_appointments_api');
  });

  it('writes hostile names as text: quotes, markup, directives and line breaks', () => {
    const project = loadSample();
    const hostile = '"]; click e_x call alert(1) %%{init: {}}%%\n<script>end';
    const changed: ProjectSnapshot = {
      ...project,
      model: {
        ...project.model,
        elements: project.model.elements.map((element) =>
          element.id === 'patient' ? { ...element, name: hostile } : element,
        ),
      },
      views: project.views.map((view) => ({ ...view, name: hostile, description: hostile })),
    };
    const { text } = writeMermaid(changed, SAMPLE_VIEW);
    // Only the comments and the accessible title and description, which Mermaid reads as plain text.
    const plain = /^(%% | {2}accTitle: | {2}accDescr: )/;
    expect(text.split('\n').filter((line) => line.includes('<') && !plain.test(line))).toEqual([]);
    expect(text.split('\n').filter((line) => line.startsWith('%%{'))).toEqual([]);
    expect(text).toContain(
      'e_patient("#quot;]; click e_x call alert(1) %%{init: {}}%% #lt;script#gt;end")',
    );
    expect(text.split('\n').filter((line) => line.includes('click'))).toHaveLength(4);
  });
});

describe('A Mermaid flowchart of a view with overlays', () => {
  const NO_LEGEND =
    'The legend of the view’s overlays, whose colors it draws: the outline in Markdown, the SVG and the PDF carry it.';

  function withOverlay(off: boolean): ProjectSnapshot {
    const project = loadSample();
    return {
      ...project,
      views: project.views.map((view) =>
        view.id === SAMPLE_VIEW
          ? {
              ...view,
              overlays: [
                {
                  id: 'team',
                  of: 'elements',
                  attribute: 'owner',
                  channel: 'fill',
                  mapping: {
                    kind: 'discrete',
                    cases: [{ value: 'Scheduling team', color: '#FFFF00' }],
                  },
                  ...(off ? { off: true } : {}),
                },
              ],
            }
          : view,
      ),
    };
  }

  it('says it carries no legend while an overlay is on', () => {
    const { text, lost } = writeMermaid(withOverlay(false), SAMPLE_VIEW);
    expect(lost).toContain(NO_LEGEND);
    expect(text).toContain(NO_LEGEND);
    expect(writeMermaid(withOverlay(true), SAMPLE_VIEW).lost).not.toContain(NO_LEGEND);
    expect(writeMermaid(loadSample(), SAMPLE_VIEW).lost).not.toContain(NO_LEGEND);
  });
});

describe('A Mermaid flowchart of a view beyond boxes', () => {
  /** The view beyond boxes, drawn curved. */
  function curved(): ProjectSnapshot {
    const project = beyondBoxes('anatomy');
    return {
      ...project,
      views: project.views.map((view) => ({ ...view, routeStyle: 'curved' })),
    };
  }

  it('says that it draws free geometry and named parts as their kinds, and curves in its own style', () => {
    const { text, lost } = writeMermaid(curved(), 'anatomy');
    expect(lost).toEqual(
      expect.arrayContaining([
        'One shape drawn by its free geometry is drawn as its kind.',
        '3 shapes drawn as named parts are drawn as their kinds, without their pictures.',
        '3 relations drawn curved or straight are drawn in Mermaid’s own style.',
      ]),
    );
    for (const each of lost) expect(text).toContain(`%% Lost: ${each}`);
    // Each anchored part is still a node, in its drawing's subgraph.
    const lines = chartLines(text);
    expect(lines).toContain('  subgraph e_body["Body"]');
    expect(lines).toContain('    e_left["left"]');
    expect(writeMermaid(beyondBoxes('anatomy'), 'anatomy').lost.join(' ')).not.toMatch(
      /curved or straight/,
    );
  });

  it('says so in the language the app reads in', () => {
    setCurrentLanguage('es');
    const { lost } = writeMermaid(curved(), 'anatomy');
    expect(lost).toEqual(
      expect.arrayContaining([
        'Una forma dibujada por su geometría libre se dibuja según su tipo.',
        '3 formas dibujadas como partes con nombre se dibujan según su tipo, sin sus imágenes.',
        '3 relaciones dibujadas curvas o rectas se dibujan con el estilo propio de Mermaid.',
      ]),
    );
  });
});
