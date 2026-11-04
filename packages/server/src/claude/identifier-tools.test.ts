/**
 * Claude's tools with external identifiers and destinations (ADR 0056): find_elements takes
 * id:<scheme>, the reads give identifiers and destinations, and the write tools set them, each call
 * one action, refused by the core when an identifier or a destination is not one.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { testProject } from '../test-support';
import type { Program } from './bridge';
import { describeItem, findElements, listDefinitions } from './queries';
import { TOOLS, runTool } from './tools';

/** The shop, with a component whose elements lead somewhere and elements with identifiers. */
function linkedShop(): ProjectSnapshot {
  const state = testProject();
  const shop = state.packages.find((file) => file.id === 'shop') as PackageFile;
  const linked: PackageFile = {
    ...shop,
    components: [
      ...shop.components.map((each) =>
        each.id === 'shop.cart'
          ? {
              ...each,
              ids: { wikidata: 'Q1096558' },
              attributes: [
                ...(each.attributes ?? []),
                { name: 'docs', type: 'destination' as const },
              ],
            }
          : each,
      ),
    ],
  };
  return {
    ...state,
    packages: state.packages.map((file) => (file.id === 'shop' ? linked : file)),
    model: {
      ...state.model,
      elements: state.model.elements.map((element) =>
        element.id === 'cart'
          ? {
              ...element,
              ids: { wikidata: 'Q1096558', schema: 'ShoppingCart' },
              attributes: { docs: { url: 'https://shop.example/docs/cart' } },
            }
          : element.id === 'db'
            ? { ...element, ids: { wikidata: 'Q8513' } }
            : element,
      ),
    },
  };
}

/** A program over a project held here, running each command through the core as Claude's. */
function programOver(start: ProjectSnapshot): Program & { state(): ProjectSnapshot } {
  let state = start;
  return {
    state: () => state,
    project: () => Promise.resolve(state),
    execute: (command: Command) => {
      const outcome = executeCommand(state, command);
      if (!outcome.ok) return Promise.resolve({ ok: false, problems: outcome.problems });
      state = outcome.state;
      return Promise.resolve({
        ok: true,
        label: outcome.label,
        changed: outcome.operations.length > 0,
        created: outcome.created,
        warnings: outcome.warnings,
      });
    },
    guide: () => Promise.resolve(0),
    openApp: () => Promise.resolve({ how: 'browser' as const }),
  };
}

function toolNamed(name: string) {
  const found = TOOLS.find((each) => each.name === name);
  if (found === undefined) throw new Error(`No tool ${name}`);
  return found;
}

describe('find_elements by external identifier', () => {
  const state = linkedShop();

  it('finds the elements with an identifier in a scheme, as id:<scheme>', () => {
    expect(
      findElements(state, { attribute: { name: 'id:wikidata' } }).elements.map((each) => each.id),
    ).toEqual(['db', 'cart']);
    expect(
      findElements(state, { attribute: { name: 'id:wikidata', equals: 'Q8513' } }).elements.map(
        (each) => each.id,
      ),
    ).toEqual(['db']);
    expect(findElements(state, { attribute: { name: 'id:fma' } }).total).toBe(0);
  });

  it('gives each element’s identifiers with it', () => {
    const [cart] = findElements(state, { attribute: { name: 'id:schema' } }).elements;
    expect(cart).toMatchObject({
      id: 'cart',
      ids: { schema: 'ShoppingCart', wikidata: 'Q1096558' },
    });
  });

  it('still reads an ordinary attribute named like a scheme', () => {
    expect(
      findElements(state, { attribute: { name: 'owner' } }).elements.map((each) => each.id),
    ).toEqual(['api']);
  });
});

describe('reading identifiers and destinations', () => {
  const state = linkedShop();

  it('describes an element with its identifiers and what its destinations open', () => {
    expect(describeItem(state, 'cart')).toMatchObject({
      ids: { schema: 'ShoppingCart', wikidata: 'Q1096558' },
      destinations: [
        { attribute: 'docs', opens: 'web', destination: { url: 'https://shop.example/docs/cart' } },
      ],
    });
    expect(describeItem(state, 'api')).not.toHaveProperty('destinations');
  });

  it('lists a definition with its identifiers', () => {
    expect(listDefinitions(state).components.find((each) => each.id === 'shop.cart')).toMatchObject(
      {
        ids: { wikidata: 'Q1096558' },
      },
    );
  });
});

describe('writing identifiers and destinations', () => {
  it('creates an element with identifiers', async () => {
    const program = programOver(linkedShop());
    const outcome = await runTool(
      toolNamed('add_to_model'),
      {
        elements: [
          { ref: 'w', component: 'systems.service', name: 'Wishlist', ids: { wikidata: 'Q1' } },
        ],
      },
      program,
    );
    expect(outcome.ok).toBe(true);
    expect(program.state().model.elements.find((each) => each.name === 'Wishlist')?.ids).toEqual({
      wikidata: 'Q1',
    });
  });

  it('changes and takes out identifiers, as one action', async () => {
    const program = programOver(linkedShop());
    const outcome = await runTool(
      toolNamed('update_element'),
      { id: 'cart', ids: { schema: null, gs1: '0123' } },
      program,
    );
    expect(outcome).toMatchObject({
      ok: true,
      value: { done: 'Change the external identifiers of "Cart"' },
    });
    expect(program.state().model.elements.find((each) => each.id === 'cart')?.ids).toEqual({
      gs1: '0123',
      wikidata: 'Q1096558',
    });
  });

  it('sets a destination, and is refused one that is not', async () => {
    const program = programOver(linkedShop());
    const good = await runTool(
      toolNamed('update_element'),
      { id: 'cart', attributes: { docs: { view: 'overview', focus: ['api'] } } },
      program,
    );
    expect(good.ok).toBe(true);
    for (const docs of [
      { url: 'javascript:alert(1)' },
      { url: 'http://shop.example' },
      { project: '/etc' },
    ]) {
      const bad = await runTool(
        toolNamed('update_element'),
        { id: 'cart', attributes: { docs } },
        program,
      );
      expect(bad.ok).toBe(false);
    }
  });

  it('changes a component’s identifiers trait by trait', async () => {
    const program = programOver(linkedShop());
    const outcome = await runTool(
      toolNamed('update_component'),
      { id: 'shop.cart', ids: { schema: 'ShoppingCart' } },
      program,
    );
    expect(outcome.ok).toBe(true);
    expect(
      program
        .state()
        .packages.find((file) => file.id === 'shop')
        ?.components.find((each) => each.id === 'shop.cart')?.ids,
    ).toEqual({ schema: 'ShoppingCart', wikidata: 'Q1096558' });
  });

  it('is refused identifiers that are not', async () => {
    const program = programOver(linkedShop());
    const outcome = await runTool(
      toolNamed('update_element'),
      { id: 'cart', ids: { Bad: 'x' } },
      program,
    );
    expect(outcome.ok).toBe(false);
  });
});
