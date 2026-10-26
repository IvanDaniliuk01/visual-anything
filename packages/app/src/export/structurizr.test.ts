import fc from 'fast-check';
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Element as ModelElement } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { FRAME, ORGANS_ID, beyondBoxes } from '../test/beyond';
import { SAMPLE_VIEW, collapsedSample } from '../test/exports';
import { loadSample } from '../test/sample';
import { usersAndOrders, VIEW as TABLES_VIEW } from '../test/tables';
import { dslString, structurizrApplies, writeStructurizr } from './structurizr';

/** The tokens of a DSL line, its strings read back as the DSL reads them, and its comment left out. */
function tokensOf(line: string): string[] {
  const tokens: string[] = [];
  let at = 0;
  while (at < line.length) {
    const character = line[at] as string;
    if (character === ' ') {
      at += 1;
    } else if (character === '/' && line[at + 1] === '/') {
      break;
    } else if (character === '"') {
      let value = '';
      at += 1;
      for (;;) {
        if (at >= line.length) throw new Error(`A string that never ends: ${line}`);
        if (line[at] === '\\' && line[at + 1] === '"') {
          value += '"';
          at += 2;
        } else if (line[at] === '"') {
          at += 1;
          break;
        } else {
          value += line[at];
          at += 1;
        }
      }
      tokens.push(value);
    } else {
      const end = line.indexOf(' ', at);
      tokens.push(line.slice(at, end === -1 ? undefined : end));
      at = end === -1 ? line.length : end;
    }
  }
  return tokens;
}

/** The elements a workspace defines, by identifier, with what holds them, and its relationships. */
function readWorkspace(text: string) {
  const elements = new Map<string, { kind: string; name: string; parent?: string }>();
  const relationships: { from: string; to: string; description: string }[] = [];
  const open: (string | undefined)[] = [];
  for (const line of text.split('\n')) {
    const tokens = tokensOf(line);
    if (tokens.length === 0) continue;
    if (tokens[1] === '=') {
      const [identifier = '', , kind = '', name = ''] = tokens;
      const parent = [...open].reverse().find((each) => each !== undefined);
      elements.set(identifier, { kind, name, ...(parent ? { parent } : {}) });
      if (tokens.at(-1) === '{') open.push(identifier);
      continue;
    }
    if (tokens[1] === '->') {
      relationships.push({
        from: tokens[0] ?? '',
        to: tokens[2] ?? '',
        description: tokens[3] ?? '',
      });
      continue;
    }
    if (tokens.at(-1) === '{') open.push(undefined);
    if (tokens[0] === '}') open.pop();
  }
  expect(open).toEqual([]);
  return { elements, relationships };
}

describe('dslString', () => {
  it('writes a string on one line that nothing in it can end, or read as a variable', () => {
    expect(dslString('Say "hi" ${SECRET} \\ path\nnext')).toBe(
      '"Say \\"hi\\" $ {SECRET} ∖ path next"',
    );
    fc.assert(
      fc.property(fc.string(), (text) => {
        const written = dslString(text);
        expect(tokensOf(written)).toHaveLength(1);
        expect(written).not.toMatch(/[\r\n]|\$\{/);
      }),
    );
  });
});

describe('writeStructurizr', () => {
  it('writes people, software systems, containers and their relationships, as the view nests them', () => {
    const { text } = writeStructurizr(loadSample(), SAMPLE_VIEW);
    const { elements, relationships } = readWorkspace(text);
    expect(elements.get('patient')).toEqual({ kind: 'person', name: 'Patient' });
    expect(elements.get('clinic-booking')).toEqual({
      kind: 'softwareSystem',
      name: 'Clinic booking',
    });
    expect(elements.get('whatsapp')).toEqual({
      kind: 'container',
      name: 'WhatsApp channel',
      parent: 'clinic-booking',
    });
    // A System inside a System is at the top: C4 does not nest software systems.
    expect(elements.get('scheduling')).toEqual({ kind: 'softwareSystem', name: 'Scheduling' });
    expect(elements.get('appointments-db')).toEqual({
      kind: 'container',
      name: 'Appointments DB',
      parent: 'scheduling',
    });
    expect(relationships).toContainEqual({
      from: 'booking-agent',
      to: 'appointments-api',
      description: 'HTTPS',
    });
    expect(relationships).toContainEqual({
      from: 'appointments-api',
      to: 'appointments-db',
      description: 'reads from',
    });
    for (const { from, to } of relationships) {
      expect(elements.has(from)).toBe(true);
      expect(elements.has(to)).toBe(true);
    }
    expect(text).toContain('systemLandscape "system-overview"');
    expect(text).toContain('container clinic-booking "system-overview-clinic-booking"');
    expect(text).toContain('element "Calendar" {\n                shape Cylinder');
  });

  it('says what it lost, in its comments and in the export', () => {
    const { text, lost } = writeStructurizr(loadSample(), SAMPLE_VIEW);
    const said = lost.join('\n');
    expect(said).toMatch(/positions, sizes, routes and bend points/);
    expect(said).toMatch(
      /people and systems sat inside other elements|person or system sat inside/,
    );
    expect(said).toMatch(/notes and free arrows|note or free arrow/);
    expect(said).toMatch(/Scenarios are left out/);
    for (const each of lost) expect(text).toContain(`// Lost: ${each}`);
  });

  it('never relates an element to what holds it, and describes each pair of elements once', () => {
    const project = loadSample();
    const tangled: ProjectSnapshot = {
      ...project,
      model: {
        ...project.model,
        relations: [
          ...project.model.relations,
          {
            id: 'up',
            relationType: 'systems.communicates-with',
            from: 'whatsapp',
            to: 'clinic-booking',
          },
          {
            id: 'twice',
            relationType: 'systems.reads-from',
            from: 'appointments-api',
            to: 'appointments-db',
          },
        ],
      },
    };
    const { text, lost } = writeStructurizr(tangled, SAMPLE_VIEW);
    const { relationships } = readWorkspace(text);
    expect(
      relationships.find((each) => each.from === 'whatsapp' && each.to === 'clinic-booking'),
    ).toBeUndefined();
    const keys = relationships.map((each) => `${each.from} ${each.to} ${each.description}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('appointments-api appointments-db reads from (2)');
    expect(lost.join(' ')).toMatch(/relation is left out|relations are left out/);
  });

  it('writes a collapsed container’s relations as one relationship', () => {
    const { text } = writeStructurizr(collapsedSample(), SAMPLE_VIEW);
    const { elements, relationships } = readWorkspace(text);
    expect(elements.has('appointments-api')).toBe(false);
    expect(relationships).toContainEqual({
      from: 'booking-agent',
      to: 'scheduling',
      description: '×1 communicates with',
    });
  });

  it('writes the C4 starter package’s people, software systems and containers too', () => {
    const c4 = loadSample('c4-architecture');
    const view = c4.views.find((each) => each.id === 'containers')!;
    expect(structurizrApplies(c4, view.id)).toBe(true);
    const { text } = writeStructurizr(c4, view.id);
    const kinds = new Set(
      [...readWorkspace(text).elements.values()].map((element) => element.kind),
    );
    expect(kinds.has('softwareSystem')).toBe(true);
    expect(kinds.has('container')).toBe(true);
  });

  it('applies only to views that show Systems components', () => {
    expect(structurizrApplies(loadSample(), SAMPLE_VIEW)).toBe(true);
    const tables = usersAndOrders();
    expect(structurizrApplies(tables, TABLES_VIEW)).toBe(false);
    const { lost } = writeStructurizr(tables, TABLES_VIEW);
    expect(lost.join(' ')).toMatch(/shows no element of the Systems package/);
  });

  it('writes hostile names as text, and gives keywords and odd ids identifiers of their own', () => {
    const project = loadSample();
    const hostile = 'a" } views { "x ${AWS_SECRET} \\';
    const changed: ProjectSnapshot = {
      ...project,
      model: {
        ...project.model,
        elements: project.model.elements.map((element) =>
          element.id === 'patient'
            ? { ...element, id: 'model', name: hostile, description: hostile }
            : element,
        ),
        relations: project.model.relations.map((relation) =>
          relation.from === 'patient' ? { ...relation, from: 'model' } : relation,
        ),
      },
      views: project.views.map((view) => ({
        ...view,
        positions: view.positions.map((position) =>
          position.element === 'patient' ? { ...position, element: 'model' } : position,
        ),
      })),
    };
    const { text } = writeStructurizr(changed, SAMPLE_VIEW);
    const { elements, relationships } = readWorkspace(text);
    expect(elements.get('e_model')?.name).toBe('a" } views { "x $ {AWS_SECRET} ∖');
    expect(relationships.some((each) => each.from === 'e_model')).toBe(true);
    expect(text).not.toContain('${');
  });
});

describe('Structurizr DSL of a view with overlays', () => {
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
    const { text, lost } = writeStructurizr(withOverlay(false), SAMPLE_VIEW);
    expect(lost).toContain(NO_LEGEND);
    expect(text).toContain(NO_LEGEND);
    expect(writeStructurizr(withOverlay(true), SAMPLE_VIEW).lost).not.toContain(NO_LEGEND);
    expect(writeStructurizr(loadSample(), SAMPLE_VIEW).lost).not.toContain(NO_LEGEND);
  });
});

describe('A Structurizr workspace of a view beyond boxes', () => {
  /**
   * The sample with a Systems element drawn by free geometry, another as a named part on its own,
   * and its view drawn curved.
   */
  function beyondSample(): ProjectSnapshot {
    const project = loadSample();
    const anatomy = beyondBoxes().packages[0];
    if (!anatomy) throw new Error('The project beyond boxes has no package.');
    const appearances: Record<string, ModelElement['appearance']> = {
      'appointments-api': { geometry: FRAME },
      patient: { part: { part: 'ring', image: ORGANS_ID } },
    };
    return {
      ...project,
      project: { ...project.project, packages: [...project.project.packages, anatomy.id] },
      packages: [...project.packages, anatomy],
      model: {
        ...project.model,
        elements: project.model.elements.map((element) => {
          const appearance = appearances[element.id];
          return appearance ? { ...element, appearance } : element;
        }),
      },
      views: project.views.map((view) =>
        view.id === SAMPLE_VIEW ? { ...view, routeStyle: 'curved' } : view,
      ),
    };
  }

  it('says that it draws free geometry and named parts as their kinds, and curves in its own style', () => {
    const project = beyondSample();
    const { text, lost } = writeStructurizr(project, SAMPLE_VIEW);
    const { relationships } = readWorkspace(text);
    expect(relationships.length).toBeGreaterThan(1);
    expect(lost).toEqual(
      expect.arrayContaining([
        'One shape drawn by its free geometry is drawn as its kind.',
        'One shape drawn as a named part is drawn as its kind, without its picture.',
        `${relationships.length} relations drawn curved or straight are drawn in Structurizr’s own style.`,
      ]),
    );
    for (const each of lost) expect(text).toContain(`// Lost: ${each}`);
    expect(writeStructurizr(loadSample(), SAMPLE_VIEW).lost.join(' ')).not.toMatch(
      /free geometry|named part|curved or straight/,
    );
  });
});
