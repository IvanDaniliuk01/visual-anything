/**
 * Every recipe's worked example, run as the recipe says through the real bridge (`tool-harness.ts`):
 * from an MCP client, through the MCP server and the tools, to the Claude endpoint of a running
 * local program. Each write call must be one action labelled Claude. For Mermaid, SQL DDL and
 * docker-compose, the input is also a fixture file, and the model it builds is checked in full.
 */
import { readFile } from 'node:fs/promises';
import { SYSTEMS, type ProjectSnapshot } from '@visual-anything/core';
import { afterEach, describe, expect, it } from 'vitest';
import { startToolHarness, type ToolHarness } from '../tool-harness';
import { TOOLS } from '../tools';
import { DOCKER_COMPOSE } from './docker-compose';
import { RECIPES } from './index';
import { MERMAID } from './mermaid';
import { ID_STAND_IN, type Recipe } from './recipe';
import { SQL_DDL } from './sql-ddl';

/** A project with nothing in World yet, using the built-in Systems package only. */
function emptyProject(): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Shop', packages: ['systems'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [],
      relations: [],
    },
    packages: [SYSTEMS],
    views: [],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

let tools: ToolHarness | undefined;

afterEach(async () => {
  await tools?.close();
  tools = undefined;
});

/** Replaces every `<id of x>` in a call's arguments with the id an earlier answer gave for x. */
function resolved(value: unknown, ids: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') {
    const name = ID_STAND_IN.exec(value)?.[1];
    if (name === undefined) return value;
    const found = ids.get(name);
    if (found === undefined) throw new Error(`No earlier call made "${name}".`);
    return found;
  }
  if (Array.isArray(value)) return value.map((each) => resolved(each, ids));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, each]) => [key, resolved(each, ids)]),
    );
  }
  return value;
}

const READ_ONLY = new Set(TOOLS.filter((each) => each.hints.readOnlyHint).map((each) => each.name));

/**
 * Runs a recipe's worked example on an empty project, as Claude would, and checks that every write
 * call was one action of Claude's, with the label the call gave.
 */
async function runExample(recipe: Recipe): Promise<ToolHarness> {
  const harness = await startToolHarness(emptyProject());
  tools = harness;
  const app = await harness.openApp();
  const ids = new Map<string, string>();
  const labels: (string | undefined)[] = [];
  for (const call of recipe.example.calls) {
    const args = resolved(call.args, ids) as Record<string, unknown>;
    const answer = await harness.value(call.tool, args);
    if (READ_ONLY.has(call.tool)) continue;
    expect(answer, `${call.tool} changed the project`).toHaveProperty('undo');
    // A worked example teaches nothing the core warns about, such as a relation type's limits.
    expect(answer.warnings, `${call.tool} warned`).toBeUndefined();
    labels.push(typeof args.label === 'string' ? args.label : undefined);
    if (call.tool === 'add_to_model') {
      for (const [ref, id] of Object.entries(answer.ids as Record<string, string>)) {
        expect(ids.has(ref), `the ref "${ref}" is used once`).toBe(false);
        ids.set(ref, id);
      }
    }
    if (call.as !== undefined) {
      const made = answer.view ?? answer.scenario;
      expect(typeof made, `${call.tool} made what "${call.as}" names`).toBe('string');
      ids.set(call.as, made as string);
    }
  }
  await expect
    .poll(() => app.messages.filter((message) => message.type === 'project/changed').length)
    .toBe(labels.length);
  const changes = app.messages.flatMap((message) =>
    message.type === 'project/changed' ? [message] : [],
  );
  changes.forEach((change, index) => {
    expect(change.author).toBe('claude');
    const label = labels[index];
    if (label !== undefined) expect(change.label).toBe(label);
  });
  return harness;
}

/** The model as lines a person reads: each element with its component, then each relation. */
function modelLines(snapshot: ProjectSnapshot): { elements: string[]; relations: string[] } {
  const nameOf = new Map(snapshot.model.elements.map((each) => [each.id, each.name]));
  const attributes = (value: object | undefined) =>
    value === undefined || Object.keys(value).length === 0 ? '' : ` ${JSON.stringify(value)}`;
  return {
    elements: snapshot.model.elements.map(
      (each) => `${each.name}: ${each.component}${attributes(each.attributes)}`,
    ),
    relations: snapshot.model.relations.map(
      (each) =>
        `${nameOf.get(each.from)} -${each.relationType}-> ${nameOf.get(each.to)}${
          each.name === undefined ? '' : ` "${each.name}"`
        }${attributes(each.attributes)}`,
    ),
  };
}

/** The relations each step of a scenario activates, as "from → to" by name. */
function stepLines(snapshot: ProjectSnapshot, scenarioName: string): string[] {
  const nameOf = new Map(snapshot.model.elements.map((each) => [each.id, each.name]));
  const relation = new Map(snapshot.model.relations.map((each) => [each.id, each]));
  const scenario = snapshot.scenarios.find((each) => each.name === scenarioName);
  return (scenario?.steps ?? []).map((step) =>
    step.relations
      .map((id) => {
        const each = relation.get(id);
        return each === undefined
          ? `missing ${id}`
          : `${nameOf.get(each.from)} → ${nameOf.get(each.to)}`;
      })
      .join(' + '),
  );
}

/** A fixture's text, with the line endings the recipe writes. */
async function fixture(name: string): Promise<string> {
  const text = await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
  return text.replaceAll('\r\n', '\n');
}

describe('every worked example, run through the real bridge', () => {
  for (const recipe of RECIPES) {
    it(`builds ${recipe.material}, one action of Claude’s per write call`, async () => {
      const harness = await runExample(recipe);
      const { snapshot } = harness.session;
      expect(snapshot.model.elements.length).toBeGreaterThan(0);
      // What the example says it left out is not in the model.
      const names = new Set(snapshot.model.elements.map((each) => each.name));
      for (const { quote } of recipe.example.leftOut) expect(names.has(quote)).toBe(false);
      // Every scenario it made plays over relations the model has.
      for (const scenario of snapshot.scenarios) {
        for (const line of stepLines(snapshot, scenario.name)) expect(line).not.toMatch(/missing/);
      }
    });
  }
});

describe('the Mermaid recipe', () => {
  it('has its worked example as a fixture', async () => {
    expect(await fixture('shop-architecture.md')).toBe(MERMAID.example.input);
  });

  it('builds the flowchart’s model and view, and the sequence diagram’s scenario', async () => {
    const { snapshot } = (await runExample(MERMAID)).session;
    expect(modelLines(snapshot)).toEqual({
      elements: [
        'Customer: systems.person',
        'Shop: systems.system',
        'Web app: systems.service',
        'Orders API: systems.service',
        'Orders DB: systems.database',
        'Payments provider: systems.system',
      ],
      relations: [
        'Web app -systems.is-part-of-> Shop',
        'Orders API -systems.is-part-of-> Shop',
        'Orders DB -systems.is-part-of-> Shop',
        'Customer -systems.communicates-with-> Web app {"protocol":"HTTPS"}',
        'Web app -systems.communicates-with-> Orders API {"protocol":"HTTPS"}',
        'Orders API -systems.writes-to-> Orders DB',
        'Orders API -systems.communicates-with-> Payments provider "charges cards"',
      ],
    });
    expect(
      snapshot.model.elements.find((each) => each.name === 'Payments provider')?.appearance,
    ).toEqual({ fill: '#EEEEEE', stroke: '#999999' });
    expect(snapshot.views.map((view) => [view.name, view.nestingRelationTypes])).toEqual([
      ['Shop architecture', ['systems.is-part-of']],
    ]);
    const [scenario] = snapshot.scenarios;
    expect(scenario?.name).toBe('A customer places an order');
    expect(scenario?.view).toBe(snapshot.views[0]?.id);
    expect(stepLines(snapshot, 'A customer places an order')).toEqual([
      'Customer → Web app',
      'Web app → Orders API',
      'Orders API → Payments provider',
      'Orders API → Orders DB',
      'Web app → Orders API',
    ]);
    expect(scenario?.steps[2]?.dataOut).toEqual({ result: 'Approved' });
    expect(scenario?.steps[4]?.dataOut).toEqual({ status: '201 Created' });
  });
});

describe('the SQL DDL recipe', () => {
  it('has its worked example as a fixture', async () => {
    expect(await fixture('shop.sql')).toBe(SQL_DDL.example.input);
  });

  it('builds tables with their columns as rows, in order, and the foreign keys', async () => {
    const { snapshot } = (await runExample(SQL_DDL)).session;
    expect(snapshot.project.packages).toEqual(['systems', 'data-modeling']);
    expect(modelLines(snapshot)).toEqual({
      elements: [
        'customers: data-modeling.table',
        'id: data-modeling.column {"type":"uuid","primaryKey":true}',
        'email: data-modeling.column {"type":"varchar(255)","notNull":true,"unique":true}',
        'name: data-modeling.column {"type":"text","notNull":true}',
        'orders: data-modeling.table',
        'id: data-modeling.column {"type":"uuid","primaryKey":true}',
        'customer_id: data-modeling.column {"type":"uuid","notNull":true}',
        'placed_at: data-modeling.column {"type":"timestamptz","notNull":true,"default":"now()"}',
        'total_cents: data-modeling.column {"type":"integer","notNull":true,"check":"total_cents >= 0"}',
        'order_items: data-modeling.table',
        'order_id: data-modeling.column {"type":"uuid","notNull":true,"primaryKey":true}',
        'product_sku: data-modeling.column {"type":"varchar(32)","notNull":true,"primaryKey":true}',
        'quantity: data-modeling.column {"type":"integer","notNull":true,"default":"1"}',
      ],
      relations: [
        'id -data-modeling.is-column-of-> customers',
        'email -data-modeling.is-column-of-> customers',
        'name -data-modeling.is-column-of-> customers',
        'id -data-modeling.is-column-of-> orders',
        'customer_id -data-modeling.is-column-of-> orders',
        'placed_at -data-modeling.is-column-of-> orders',
        'total_cents -data-modeling.is-column-of-> orders',
        'order_id -data-modeling.is-column-of-> order_items',
        'product_sku -data-modeling.is-column-of-> order_items',
        'quantity -data-modeling.is-column-of-> order_items',
        'customer_id -data-modeling.references-> id {"onDelete":"cascade"}',
        'order_id -data-modeling.references-> id {"onDelete":"cascade"}',
      ],
    });
    // Each foreign key ends on the primary key of the table it names.
    const byId = new Map(snapshot.model.elements.map((each) => [each.id, each]));
    const tableOf = (column: string) =>
      byId.get(
        snapshot.model.relations.find(
          (each) => each.relationType === 'data-modeling.is-column-of' && each.from === column,
        )?.to ?? '',
      )?.name;
    expect(
      snapshot.model.relations
        .filter((each) => each.relationType === 'data-modeling.references')
        .map(
          (each) =>
            `${tableOf(each.from)}.${byId.get(each.from)?.name} → ${tableOf(each.to)}.${byId.get(each.to)?.name}`,
        ),
    ).toEqual(['orders.customer_id → customers.id', 'order_items.order_id → orders.id']);
    expect(snapshot.views.map((view) => [view.name, view.nestingRelationTypes])).toEqual([
      ['Shop tables', ['data-modeling.is-column-of']],
    ]);
    expect(snapshot.scenarios).toEqual([]);
  });
});

describe('the docker-compose recipe', () => {
  it('has its worked example as a fixture', async () => {
    expect(await fixture('docker-compose.yml')).toBe(DOCKER_COMPOSE.example.input);
  });

  it('builds the services inside their system, with depends_on as communicates with', async () => {
    const { snapshot } = (await runExample(DOCKER_COMPOSE)).session;
    expect(modelLines(snapshot)).toEqual({
      elements: [
        'shop: systems.system',
        'web: systems.service {"technology":"nginx:1.27","ports":"8080:80"}',
        'api: systems.service',
        'worker: systems.service',
        'db: systems.database {"engine":"postgres","technology":"postgres:16"}',
        'cache: systems.database {"engine":"redis","technology":"redis:7"}',
      ],
      relations: [
        'web -systems.is-part-of-> shop',
        'api -systems.is-part-of-> shop',
        'worker -systems.is-part-of-> shop',
        'db -systems.is-part-of-> shop',
        'cache -systems.is-part-of-> shop',
        'web -systems.communicates-with-> api',
        'api -systems.communicates-with-> db {"protocol":"PostgreSQL"}',
        'api -systems.communicates-with-> cache {"protocol":"Redis"}',
        'worker -systems.communicates-with-> db {"protocol":"PostgreSQL"}',
      ],
    });
    expect(snapshot.views.map((view) => [view.name, view.nestingRelationTypes])).toEqual([
      ['Shop services', ['systems.is-part-of']],
    ]);
  });

  it('leaves the password in the connection strings out of the project', async () => {
    const { snapshot } = (await runExample(DOCKER_COMPOSE)).session;
    expect(DOCKER_COMPOSE.example.input).toContain('change-me');
    expect(JSON.stringify(snapshot)).not.toContain('change-me');
  });
});
