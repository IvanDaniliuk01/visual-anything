/**
 * Packages shared between projects (R39, ADR 0051): a package copied from another project with its
 * images, keeping its ids, refused on a clash of ids with every id that clashes, and updated from
 * there after a preview of what changed, each as one action.
 */
import fc from 'fast-check';
import type { Component, PackageFile, RelationType } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import { cleanSvg } from './images/svg';
import { applyOperations } from './operations';
import { compareVersions, packageChanges, packageNeeds } from './package-sharing';
import type { ProjectSnapshot } from './snapshot';
import { sequentialIds, testProject } from './test/fixtures';

function run(command: Command, state: ProjectSnapshot = testProject()) {
  return executeCommand(state, command, { newId: sequentialIds() });
}

/** Runs a command that must be done, and checks that undoing it gives the project back exactly. */
function ok(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = run(command, state);
  if (!outcome.ok) {
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  }
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

function refused(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems;
}

function cleaned(svg: string): string {
  const result = cleanSvg(svg);
  if (!result.ok) throw new Error(result.problem.message);
  return result.value.svg;
}

const CART_SVG = cleaned(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 4h2l2 10h11l2-7H7" fill="none" stroke="#1F2933" stroke-width="2"/><circle cx="9" cy="19" r="1.5" fill="#1F2933"/></svg>',
);

/**
 * A package as another project holds it: a component that derives from one after it, and one from
 * the built-in Systems package, which the test project does not use; a relation type whose limit
 * names one after it; and an image.
 */
const SHOP: PackageFile = {
  id: 'shop',
  name: 'Shop',
  description: 'Carts and stores.',
  version: '1.0.0',
  license: 'MIT',
  attribution: 'Jane Doe',
  components: [
    {
      id: 'shop.cart',
      name: 'Cart',
      derivesFrom: 'shop.store',
      appearance: { fill: '#FFF4E5', image: { image: 'shop.cart-icon' } },
    },
    {
      id: 'shop.store',
      name: 'Store',
      derivesFrom: 'systems.box',
      attributes: [{ name: 'city', type: 'string' }],
    },
  ],
  relationTypes: [
    {
      id: 'shop.buys',
      name: 'buys',
      derivesFrom: 'relates-to',
      direction: 'directed',
      limits: { to: ['shop.cart', 'shop.pays'] },
    },
    { id: 'shop.pays', name: 'pays', derivesFrom: 'shop.buys' },
  ],
  images: [
    {
      kind: 'svg',
      id: 'shop.cart-icon',
      name: 'Cart',
      source: 'Drawn by Jane Doe',
      license: 'MIT',
      width: 24,
      height: 24,
      svg: CART_SVG,
    },
  ],
};

const add = (file: PackageFile = SHOP): Command => ({ type: 'add-package', package: file });
const replace = (file: PackageFile): Command => ({ type: 'replace-package', package: file });

describe('add-package', () => {
  it('copies a package with its images, keeping its ids, and uses it with the built-in packages it needs', () => {
    const outcome = ok(add());
    expect(outcome.label).toBe('Add the package "Shop"');
    expect(outcome.state.project.packages).toEqual(['test', 'systems', 'shop']);
    expect(outcome.state.packages.find((file) => file.id === 'shop')).toEqual(SHOP);
    expect(outcome.created).toEqual(['shop']);
    expect(outcome.warnings).toEqual([]);
  });

  it('needs no built-in package the project already uses', () => {
    const using = ok({ type: 'update-project', changes: { packages: ['systems', 'test'] } });
    expect(ok(add(), using.state).state.project.packages).toEqual(['systems', 'test', 'shop']);
  });

  it('refuses a clash of ids, saying every id that clashes', () => {
    const state = testProject();
    state.model.elements.push({ id: 'shop.cart', component: 'test.box', name: 'Cart' });
    state.views.push({ ...state.views[0]!, id: 'shop.cart-icon', name: 'Icons' });
    const problems = refused(add(), state);
    expect(problems).toEqual([
      {
        code: 'id-taken',
        message:
          'The package "Shop" cannot be added: this project already uses these ids of it: "shop.cart", "shop.cart-icon".',
        subjects: ['shop.cart', 'shop.cart-icon'],
      },
    ]);
  });

  it('refuses a package whose id the project already has, or Visual Anything keeps', () => {
    const added = ok(add());
    expect(refused(add(), added.state).map((each) => each.code)).toEqual(['id-taken']);
    expect(refused(add({ ...SHOP, id: 'test' }))[0]?.message).toBe(
      'The package "Shop" cannot be added: this project already has a package with the id "test".',
    );
    for (const id of ['systems', 'data-science']) {
      expect(refused(add({ ...SHOP, id })).map((each) => each.code)).toEqual(['built-in-package']);
    }
  });

  it('refuses definitions and images whose ids do not start with the package’s', () => {
    const problems = refused(
      add({
        ...SHOP,
        components: [
          ...SHOP.components,
          { id: 'mall.kiosk', name: 'Kiosk', derivesFrom: 'essence' },
        ],
      }),
    );
    expect(problems).toEqual([
      {
        code: 'id-outside-package',
        message:
          'The package "Shop" cannot be added: these ids of it do not start with "shop.", the id of the package: "mall.kiosk".',
        subjects: ['mall.kiosk'],
      },
    ]);
  });

  it('refuses a package that needs definitions the project cannot get, naming them', () => {
    const needy: PackageFile = {
      ...SHOP,
      components: [
        ...SHOP.components,
        { id: 'shop.desk', name: 'Desk', derivesFrom: 'clinic.desk' },
      ],
    };
    expect(packageNeeds(testProject(), needy)).toEqual({
      builtIn: ['systems'],
      missing: ['clinic.desk'],
    });
    expect(refused(add(needy))).toEqual([
      {
        code: 'unknown-parent',
        message:
          'The package "Shop" needs what no package in use, and no built-in package, defines; add the packages that define it first: "clinic.desk".',
        subjects: ['clinic.desk'],
      },
    ]);
  });

  it('checks every definition as defining it would', () => {
    const red = add({
      ...SHOP,
      components: [
        { id: 'shop.store', name: 'Store', derivesFrom: 'essence', appearance: { fill: 'red' } },
      ],
      relationTypes: [],
      images: undefined,
    });
    expect(refused(red).map((each) => each.code)).toEqual(['invalid-appearance']);
    const cycle = add({
      ...SHOP,
      components: [
        { id: 'shop.a', name: 'A', derivesFrom: 'shop.b' },
        { id: 'shop.b', name: 'B', derivesFrom: 'shop.a' },
      ],
      relationTypes: [],
      images: undefined,
    });
    expect(refused(cycle).map((each) => each.code)).toEqual(['derivation-cycle']);
    const unnamed = add({ ...SHOP, name: ' ' });
    expect(refused(unnamed).map((each) => each.code)).toEqual(['empty-name']);
    const missingImage = add({ ...SHOP, images: undefined });
    expect(refused(missingImage)).toEqual([
      {
        code: 'unknown-parent',
        message:
          'The package "Shop" needs what no package in use, and no built-in package, defines; add the packages that define it first: "shop.cart-icon".',
        subjects: ['shop.cart-icon'],
      },
    ]);
  });

  it('cleans every image before it stores it, and refuses one cleaning refuses', () => {
    const dirty = add({
      ...SHOP,
      images: [
        {
          ...SHOP.images![0]!,
          kind: 'svg',
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0h24v24H0z" fill="#000000"/></svg>',
        },
      ],
    });
    const outcome = ok(dirty);
    const stored = outcome.state.packages.find((file) => file.id === 'shop')?.images?.[0];
    expect(stored).toMatchObject({
      id: 'shop.cart-icon',
      source: 'Drawn by Jane Doe',
      license: 'MIT',
    });
    expect(stored?.kind === 'svg' && stored.svg).not.toContain('script');
    expect(outcome.warnings.map((each) => each.code)).toEqual(['image-cleaned']);
    const doctype = add({
      ...SHOP,
      images: [{ ...SHOP.images![0]!, kind: 'svg', svg: '<!DOCTYPE svg><svg/>' }],
    });
    expect(refused(doctype).map((each) => each.code)).toEqual(['invalid-image']);
  });

  it('checks every image from another project as define-image checks one, before cleaning it', () => {
    const image = SHOP.images![0]!;
    const withImage = (bad: Record<string, unknown>) =>
      add({ ...SHOP, images: [{ ...image, ...bad }] });
    const cases: [Record<string, unknown>, string, string][] = [
      [{ name: 'x'.repeat(201) }, 'invalid-command', "An image's name has at most 200 characters."],
      [{ name: ' ' }, 'empty-name', 'An image needs a name.'],
      [{ name: 5 }, 'empty-name', 'An image needs a name.'],
      [
        { source: { url: 'https://example.com' } },
        'invalid-command',
        'Where an image comes from is text of at most 500 characters.',
      ],
      [
        { source: 's'.repeat(501) },
        'invalid-command',
        'Where an image comes from is text of at most 500 characters.',
      ],
      [
        { license: 'CC BY-SA 4.0' },
        'invalid-command',
        'An image’s license is an SPDX license identifier, such as CC0-1.0 or MIT.',
      ],
      [
        { license: ['MIT'] },
        'invalid-command',
        'An image’s license is an SPDX license identifier, such as CC0-1.0 or MIT.',
      ],
      [{ onload: 'alert(1)' }, 'invalid-command', 'An image has no "onload".'],
      [{ href: 'https://example.com/a.svg' }, 'invalid-command', 'An image has no "href".'],
      [{ data: 'iVBORw0KGgo=' }, 'invalid-command', 'An image has no "data".'],
      [{ kind: 'html' }, 'invalid-command', 'An image is of the kind "svg" or "bitmap".'],
      [{ svg: 5 }, 'invalid-command', 'An SVG image is given as text.'],
    ];
    for (const [bad, code, message] of cases) {
      expect(refused(withImage(bad)), JSON.stringify(bad).slice(0, 60)).toEqual([
        expect.objectContaining({ code, message }),
      ]);
    }
    const bitmap = add({
      ...SHOP,
      components: [SHOP.components[1]!],
      relationTypes: [],
      images: [
        {
          kind: 'bitmap',
          id: 'shop.photo',
          name: 'Photo',
          format: 'gif',
          width: 1,
          height: 1,
          data: 'R0lGODlhAQABAAAAACw=',
        } as never,
      ],
    });
    expect(refused(bitmap).map((each) => each.code)).toEqual(['invalid-command']);
    const updated = ok(add()).state;
    expect(
      refused(replace({ ...SHOP, images: [{ ...image, script: 'alert(1)' } as never] }), updated),
    ).toEqual([expect.objectContaining({ message: 'An image has no "script".' })]);
  });

  it('refuses keys a package does not have', () => {
    expect(refused(add({ ...SHOP, code: 'alert(1)' } as never))).toEqual([
      expect.objectContaining({ code: 'invalid-command', message: 'A package has no "code".' }),
    ]);
  });

  it('keeps an image’s width and height as cleaning finds them, never as it says', () => {
    const outcome = ok(add({ ...SHOP, images: [{ ...SHOP.images![0]!, width: 9999, height: 1 }] }));
    expect(outcome.state.packages.at(-1)?.images?.[0]).toMatchObject({ width: 24, height: 24 });
  });

  it('checks the version, the license and the attribution', () => {
    expect(refused(add({ ...SHOP, version: 'v1' }))[0]?.message).toBe(
      'A package’s version is a semantic version, such as 1.2.0.',
    );
    expect(refused(add({ ...SHOP, license: 'CC BY 4.0' }))[0]?.message).toBe(
      'A package’s license is an SPDX license identifier, such as CC0-1.0 or MIT.',
    );
    expect(refused(add({ ...SHOP, attribution: '' }))[0]?.message).toBe(
      'A package’s attribution is text of 1 to 2,000 characters.',
    );
  });
});

describe('replace-package', () => {
  const added = () => ok(add()).state;

  /** Shop 1.1.0: Cart renamed, a component added, Store's attribute gone, "pays" changed. */
  const NEXT: PackageFile = {
    ...SHOP,
    version: '1.1.0',
    components: [
      { ...SHOP.components[0]!, name: 'Basket' },
      { ...SHOP.components[1]!, attributes: undefined },
      { id: 'shop.till', name: 'Till', derivesFrom: 'shop.store' },
    ].map((each) => JSON.parse(JSON.stringify(each)) as Component),
    relationTypes: [
      SHOP.relationTypes[0]!,
      { ...SHOP.relationTypes[1]!, description: 'Money changes hands.' },
    ],
  };

  it('updates a package to another version of it as one action', () => {
    const before = added();
    const outcome = ok(replace(NEXT), before);
    expect(outcome.label).toBe('Update the package "Shop"');
    expect(outcome.state.packages.find((file) => file.id === 'shop')).toEqual(NEXT);
    expect(outcome.created).toEqual(['shop.till']);
  });

  it('says what changed before it applies', () => {
    expect(packageChanges(SHOP, NEXT)).toEqual({
      same: false,
      properties: [{ key: 'version', before: '1.0.0', after: '1.1.0' }],
      components: {
        added: [{ id: 'shop.till', name: 'Till' }],
        removed: [],
        changed: [
          { id: 'shop.cart', name: 'Basket' },
          { id: 'shop.store', name: 'Store' },
        ],
        reordered: false,
      },
      relationTypes: {
        added: [],
        removed: [],
        changed: [{ id: 'shop.pays', name: 'pays' }],
        reordered: false,
      },
      images: { added: [], removed: [], changed: [], reordered: false },
    });
    expect(packageChanges(SHOP, SHOP).same).toBe(true);
    const reordered = { ...SHOP, components: [...SHOP.components].reverse() };
    expect(packageChanges(SHOP, reordered)).toMatchObject({
      same: false,
      components: { added: [], removed: [], changed: [], reordered: true },
    });
  });

  it('records nothing when nothing changes', () => {
    const outcome = ok(replace(SHOP), added());
    expect(outcome.operations).toEqual([]);
  });

  it('refuses to remove what the project uses, saying what uses it', () => {
    const using = ok(
      { type: 'create-element', element: { component: 'shop.cart', name: 'My cart' } },
      added(),
    ).state;
    const without: PackageFile = {
      ...SHOP,
      components: [SHOP.components[1]!],
      relationTypes: [],
    };
    expect(refused(replace(without), using)).toEqual([
      {
        code: 'in-use',
        message:
          'The update of "Shop" removes the component "Cart", which is still used here by 1 element; change or delete what uses it first.',
        subjects: [expect.any(String) as string],
      },
    ]);
  });

  it('removes what nothing else uses, images included', () => {
    const plain: PackageFile = {
      ...SHOP,
      components: [SHOP.components[1]!],
      relationTypes: [],
      images: undefined,
    };
    const outcome = ok(replace(plain), added());
    expect(outcome.state.packages.find((file) => file.id === 'shop')).toEqual(plain);
  });

  it('refuses an image still shown by an element of the project', () => {
    const shown = ok(
      {
        type: 'update-element',
        id: 'api',
        changes: { appearanceTraits: { image: { image: 'shop.cart-icon' } } },
      },
      added(),
    ).state;
    const plain: PackageFile = {
      ...SHOP,
      components: [SHOP.components[1]!],
      relationTypes: [],
      images: undefined,
    };
    expect(refused(replace(plain), shown).map((each) => each.code)).toEqual(['in-use']);
  });

  it('refuses a clash of ids with the rest of the project', () => {
    const state = ok(
      { type: 'create-element', element: { id: 'shop.till', component: 'test.box', name: 'Till' } },
      added(),
    ).state;
    expect(refused(replace(NEXT), state)).toEqual([
      {
        code: 'id-taken',
        message:
          'The package "Shop" cannot be updated: this project already uses these ids of it: "shop.till".',
        subjects: ['shop.till'],
      },
    ]);
  });

  it('updates only a package of the project’s own', () => {
    expect(refused(replace(SHOP)).map((each) => each.code)).toEqual(['unknown-package']);
    const systems = ok({ type: 'update-project', changes: { packages: ['test', 'systems'] } });
    const built: PackageFile = { ...SHOP, id: 'systems' };
    expect(refused(replace(built), systems.state).map((each) => each.code)).toEqual([
      'built-in-package',
    ]);
  });
});

describe('versions', () => {
  it('compare as semantic versions do', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    expect(compareVersions('2.0.0-beta.1', '2.0.0')).toBe(-1);
    expect(compareVersions('2.0.0-beta.2', '2.0.0-beta.10')).toBe(-1);
    expect(compareVersions('2.0.0-alpha', '2.0.0-alpha.1')).toBe(-1);
    expect(compareVersions('1.0.0', undefined)).toBeUndefined();
    expect(compareVersions('one', '1.0.0')).toBeUndefined();
  });
});

// Properties -------------------------------------------------------------------------------------

const COLORS = ['#FFF4E5', '#DCEBFF', '#E8F5E9'] as const;

/**
 * A package of `shared`: components that each derive from Essence or another of them, without a
 * cycle, and relation types that derive from "relates to" or another of them, with limits naming any
 * of its definitions; each list in any order.
 */
function arbitraryPackage(): fc.Arbitrary<PackageFile> {
  return fc
    .record({
      components: fc.array(
        fc.record({
          parent: fc.nat(),
          fill: fc.option(fc.constantFrom(...COLORS), { nil: undefined }),
          name: fc.constantFrom('Store', 'Cart', 'Till', 'Shelf'),
        }),
        { maxLength: 5 },
      ),
      relationTypes: fc.array(
        fc.record({
          parent: fc.nat(),
          limit: fc.option(fc.nat(), { nil: undefined }),
          dash: fc.option(fc.constantFrom('dashed' as const, 'dotted' as const), {
            nil: undefined,
          }),
        }),
        { maxLength: 4 },
      ),
      version: fc.option(fc.constantFrom('1.0.0', '1.1.0', '2.0.0-beta.1'), { nil: undefined }),
      order: fc.boolean(),
    })
    .map(({ components, relationTypes, version, order }) => {
      const componentIds = components.map((_, at) => `shared.c${at}`);
      const typeIds = relationTypes.map((_, at) => `shared.r${at}`);
      const madeComponents: Component[] = components.map((each, at) => {
        const parent = at === 0 ? undefined : componentIds[each.parent % (at + 1)];
        return {
          id: componentIds[at]!,
          name: `${each.name} ${at}`,
          derivesFrom: parent === undefined || parent === componentIds[at] ? 'essence' : parent,
          ...(each.fill === undefined ? {} : { appearance: { fill: each.fill } }),
        };
      });
      const named = [...componentIds, ...typeIds];
      const madeTypes: RelationType[] = relationTypes.map((each, at) => {
        const parent = at === 0 ? undefined : typeIds[each.parent % (at + 1)];
        const limit =
          each.limit === undefined || named.length === 0
            ? undefined
            : named[each.limit % named.length];
        return {
          id: typeIds[at]!,
          name: `type ${at}`,
          derivesFrom: parent === undefined || parent === typeIds[at] ? 'relates-to' : parent,
          ...(limit === undefined ? {} : { limits: { to: [limit] } }),
          ...(each.dash === undefined ? {} : { appearance: { dash: each.dash } }),
        };
      });
      return {
        id: 'shared',
        name: 'Shared',
        ...(version === undefined ? {} : { version }),
        components: order ? madeComponents.reverse() : madeComponents,
        relationTypes: order ? madeTypes.reverse() : madeTypes,
      };
    });
}

describe('sharing packages, for any package', () => {
  it('adds it as it is, keeping every id, and undoing gives the project back exactly', () => {
    fc.assert(
      fc.property(arbitraryPackage(), (file) => {
        const outcome = ok(add(file));
        expect(outcome.state.packages.find((each) => each.id === 'shared')).toEqual(file);
      }),
      { numRuns: 60 },
    );
  });

  it('updates it to any other version, which is then stored as it is, and lists what changed', () => {
    fc.assert(
      fc.property(arbitraryPackage(), arbitraryPackage(), (first, second) => {
        const added = ok(add(first)).state;
        const outcome = ok(replace(second), added);
        expect(outcome.state.packages.find((each) => each.id === 'shared')).toEqual(second);
        const changes = packageChanges(first, second);
        expect(changes.same).toBe(JSON.stringify(first) === JSON.stringify(second));
        expect(outcome.operations.length === 0).toBe(changes.same);
        const ids = (list: { id: string }[]) => list.map((each) => each.id).sort();
        const before = new Set(first.components.map((each) => each.id));
        const after = new Set(second.components.map((each) => each.id));
        expect(ids(changes.components.added)).toEqual(
          [...after].filter((id) => !before.has(id)).sort(),
        );
        expect(ids(changes.components.removed)).toEqual(
          [...before].filter((id) => !after.has(id)).sort(),
        );
      }),
      { numRuns: 60 },
    );
  });
});
