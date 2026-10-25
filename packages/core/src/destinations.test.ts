import fc from 'fast-check';
import type { AttributeDefinition, JsonValue, PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { checkProject } from './check';
import { executeCommand } from './commands';
import {
  destinationKind,
  destinationsOf,
  isDestination,
  projectPathProblem,
  readDestination,
  resolveProjectPath,
  webAddressHost,
} from './destinations';
import type { ProjectSnapshot } from './snapshot';
import { TEST_PACKAGE, testProject } from './test/fixtures';

describe('readDestination', () => {
  it.each([
    [{ view: 'overview' }, 'view'],
    [{ view: 'overview', focus: ['api', 'db'] }, 'view'],
    [{ project: '../billing' }, 'project'],
    [{ project: '../billing', view: 'invoices' }, 'project'],
    [{ url: 'https://www.ebi.ac.uk/ols4/ontologies/uberon' }, 'web'],
  ] as const)('reads %j as a destination of a %s', (value, kind) => {
    const read = readDestination(value);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.destination).toEqual(value);
      expect(destinationKind(read.destination)).toBe(kind);
    }
  });

  it.each([
    ['text', 'https://example.com'],
    ['null', null],
    ['a list', [{ view: 'overview' }]],
    ['an empty object', {}],
    ['two kinds at once', { view: 'overview', url: 'https://example.com' }],
    ['a project and a web address', { project: '../a', url: 'https://example.com' }],
    ['a key it does not have', { view: 'overview', at: 3 }],
    ['a view that is no id', { view: 'not an id' }],
    ['an empty focus', { view: 'overview', focus: [] }],
    ['a focus naming one twice', { view: 'overview', focus: ['api', 'api'] }],
    ['a focus that is no list of ids', { view: 'overview', focus: 'api' }],
    ['a focus too long', { view: 'v', focus: Array.from({ length: 101 }, (_, at) => `e${at}`) }],
    ['a project path that leaves the parent folder', { project: '../../elsewhere' }],
    ['an absolute project path', { project: '/etc' }],
    ['a project path with a drive', { project: 'C:/projects/a' }],
    ['a project path with backslashes', { project: '..\\billing' }],
    ['a javascript: address', { url: 'javascript:alert(1)' }],
    ['a file: address', { url: 'file:///etc/passwd' }],
    ['an http: address', { url: 'http://example.com' }],
    ['a data: address', { url: 'data:text/html,<script>alert(1)</script>' }],
    ['a custom scheme', { url: 'vscode://open' }],
    ['an address in capitals', { url: 'HTTPS://example.com' }],
    ['an address with a user and password', { url: 'https://user:secret@example.com/' }],
    ['an address with a user', { url: 'https://user@example.com/' }],
    ['an address with a backslash', { url: 'https://evil.example\\@good.example/' }],
    ['an address with a space', { url: 'https://example.com/a b' }],
    ['an address with a line break', { url: 'https://example.com/\nx' }],
    ['an address without a host', { url: 'https:///path' }],
    ['an address with a bad host', { url: 'https://-bad-.com/' }],
    ['an address with a port too large', { url: 'https://example.com:70000/' }],
    ['an address too long', { url: `https://example.com/${'a'.repeat(2048)}` }],
    ['an address with a host outside ASCII', { url: 'https://exаmple.com/' }],
  ])('refuses %s', (_, value) => {
    const read = readDestination(value);
    expect(read.ok).toBe(false);
    expect(isDestination(value)).toBe(false);
    if (!read.ok) expect(read.why).not.toBe('');
  });

  it('never throws and accepts web addresses only as https: with a plain host, for any text', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120, unit: 'binary' }), (text) => {
        const url = text.startsWith('https://') ? text : `https://${text}`;
        for (const value of [text, url]) {
          const read = readDestination({ url: value });
          if (!read.ok) continue;
          expect(value.startsWith('https://')).toBe(true);
          expect(value).not.toMatch(/[\s\\\x00-\x1f\x7f]/);
          const host = webAddressHost(value);
          expect(host).toMatch(/^[a-z0-9.\-[\]:]+$/);
        }
      }),
    );
  });

  it('never throws, for any value', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const read = readDestination(value);
        expect(typeof read.ok).toBe('boolean');
      }),
    );
  });
});

describe('webAddressHost', () => {
  it('names the host of an https: address, in lowercase', () => {
    expect(webAddressHost('https://Example.COM:8443/a/b?c=d#e')).toBe('example.com');
    expect(webAddressHost('https://www.ebi.ac.uk')).toBe('www.ebi.ac.uk');
    expect(webAddressHost('https://[2001:db8::1]:443/')).toBe('[2001:db8::1]');
    expect(webAddressHost('http://example.com')).toBeUndefined();
  });
});

describe('project paths', () => {
  it('takes paths that stay in the folder holding this project', () => {
    for (const good of [
      '../billing',
      'billing',
      'sub/project',
      '..',
      '../billing/',
      './a',
      'a/../b',
    ]) {
      expect(projectPathProblem(good)).toBeUndefined();
    }
  });

  it('refuses paths that leave it, or that name a place absolutely', () => {
    for (const bad of [
      '../../billing',
      'a/../../..',
      '/etc',
      '//server/share',
      'C:/x',
      'c:x',
      'a:b',
      '..\\x',
      '',
      'a\u0000b',
    ]) {
      expect(projectPathProblem(bad)).not.toBeUndefined();
    }
  });

  it('resolves a path against the project folder, never out of its parent, for any path', () => {
    const segment = fc.constantFrom('..', '.', 'a', 'b', 'billing', '');
    fc.assert(
      fc.property(fc.array(segment, { minLength: 1, maxLength: 8 }), (segments) => {
        const path = segments.join('/');
        const resolved = resolveProjectPath('/home/me/projects/heart', path);
        if (projectPathProblem(path) !== undefined) {
          expect(resolved).toBeUndefined();
          return;
        }
        expect(resolved).toBeDefined();
        expect(`${resolved}/`.startsWith('/home/me/projects/')).toBe(true);
      }),
    );
    expect(resolveProjectPath('/home/me/projects/heart', '../billing')).toBe(
      '/home/me/projects/billing',
    );
    expect(resolveProjectPath('C:/Users/me/heart', '../lungs/')).toBe('C:/Users/me/lungs');
    expect(resolveProjectPath('/home/me/projects/heart', '..')).toBe('/home/me/projects');
  });
});

/** The test package with a component whose elements lead somewhere. */
const LINKED: PackageFile = {
  ...TEST_PACKAGE,
  components: [
    ...TEST_PACKAGE.components,
    {
      id: 'test.linked',
      name: 'Linked',
      derivesFrom: 'test.box',
      attributes: [
        { name: 'see', type: 'destination', default: { view: 'overview' } },
        { name: 'docs', type: 'destination' },
        { name: 'note', type: 'string' },
      ],
    },
  ],
};

function linkedProject(): ProjectSnapshot {
  const state = testProject();
  return {
    ...state,
    packages: [LINKED],
    model: {
      ...state.model,
      elements: [
        ...state.model.elements,
        {
          id: 'portal',
          component: 'test.linked',
          name: 'Portal',
          attributes: { docs: { url: 'https://example.com/docs' } },
        },
      ],
    },
  };
}

describe('destinationsOf', () => {
  const definitions: AttributeDefinition[] = LINKED.components[3]?.attributes ?? [];

  it('lists the destinations of attributes of that type, its own values or else the defaults', () => {
    expect(
      destinationsOf({ attributes: { docs: { url: 'https://example.com' } } }, definitions),
    ).toEqual([
      { attribute: 'see', destination: { view: 'overview' }, own: false },
      { attribute: 'docs', destination: { url: 'https://example.com' }, own: true },
    ]);
  });

  it('leaves out values that are not destinations, and attributes of other types', () => {
    expect(
      destinationsOf(
        { attributes: { see: { url: 'javascript:alert(1)' }, note: 'x' } },
        definitions,
      ),
    ).toEqual([]);
  });

  it('takes the element’s own attributes whose values are destinations, after the defined ones', () => {
    expect(
      destinationsOf(
        {
          attributes: {
            wiki: { url: 'https://en.wikipedia.org/wiki/Heart' },
            note: { url: 'http://not.example' },
            data: { rows: 3 },
          },
        },
        definitions,
      ),
    ).toEqual([
      { attribute: 'see', destination: { view: 'overview' }, own: false },
      { attribute: 'wiki', destination: { url: 'https://en.wikipedia.org/wiki/Heart' }, own: true },
    ]);
    // An attribute the definitions give another type is never one, whatever it holds.
    expect(
      destinationsOf({ attributes: { note: { url: 'https://x.example' } } }, definitions).map(
        (each) => each.attribute,
      ),
    ).toEqual(['see']);
  });
});

describe('commands that set destinations', () => {
  it('stores a destination in an attribute of that type', () => {
    const outcome = executeCommand(linkedProject(), {
      type: 'update-element',
      id: 'portal',
      changes: { attributes: { docs: { project: '../billing', view: 'invoices' } } },
    });
    expect(outcome.ok).toBe(true);
  });

  it.each<JsonValue>([
    { url: 'javascript:alert(1)' },
    { url: 'file:///etc/passwd' },
    { url: 'vscode://open' },
    'https://example.com',
    { project: '../../x' },
  ])('refuses %j in an attribute of that type, and changes nothing', (value) => {
    const outcome = executeCommand(linkedProject(), {
      type: 'update-element',
      id: 'portal',
      changes: { attributes: { docs: value } },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok)
      expect(outcome.problems.map((each) => each.code)).toEqual(['invalid-destination']);
  });

  it('refuses it when an element is created, too', () => {
    const outcome = executeCommand(linkedProject(), {
      type: 'create-element',
      element: { component: 'test.linked', name: 'Bad', attributes: { docs: { url: 'data:,x' } } },
    });
    expect(outcome.ok).toBe(false);
  });

  it('defines a destination attribute only with a default that is a destination', () => {
    const state = {
      ...linkedProject(),
      project: { schemaVersion: 1 as const, name: 'T', packages: ['test'] },
    };
    const good = executeCommand(state, {
      type: 'update-component',
      id: 'test.box',
      changes: {
        attributes: { set: [{ name: 'home', type: 'destination', default: { view: 'overview' } }] },
      },
    });
    expect(good.ok).toBe(true);
    const bad = executeCommand(state, {
      type: 'update-component',
      id: 'test.box',
      changes: {
        attributes: { set: [{ name: 'home', type: 'destination', default: { url: 'ftp://x' } }] },
      },
    });
    expect(bad.ok).toBe(false);
  });
});

describe('the checks on opening', () => {
  it('flags destinations whose view or focus is missing, and values that are not destinations', () => {
    const state = linkedProject();
    const broken: ProjectSnapshot = {
      ...state,
      model: {
        ...state.model,
        elements: [
          ...state.model.elements,
          {
            id: 'gone',
            component: 'test.linked',
            name: 'To nowhere',
            attributes: { see: { view: 'deleted-view' } },
          },
          {
            id: 'lost',
            component: 'test.linked',
            name: 'Lost focus',
            attributes: { see: { view: 'overview', focus: ['nobody'] } },
          },
          {
            id: 'evil',
            component: 'test.linked',
            name: 'Evil',
            attributes: { docs: { url: 'javascript:alert(1)' } },
          },
        ],
      },
    };
    const { errors, warnings } = checkProject(broken);
    expect(errors).toEqual([]);
    const flagged = warnings.filter((each) => each.code === 'broken-destination');
    expect(flagged.map((each) => each.subjects)).toEqual([['gone'], ['lost'], ['evil']]);
    expect(flagged[0]?.message).toBe(
      'The destination "see" of "To nowhere" opens the view "deleted-view", which the project does not have; it is kept, and opens nothing until that view is back.',
    );
  });

  it('flags nothing in a project whose destinations hold', () => {
    const warnings = checkProject(linkedProject()).warnings.filter(
      (each) => each.code === 'broken-destination',
    );
    expect(warnings).toEqual([]);
  });
});
