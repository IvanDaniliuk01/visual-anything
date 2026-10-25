/**
 * The recipes as MCP prompts (R29): every recipe is listed with its arguments, and gets as one
 * message of the person's that holds the recipe, the shared rules and what the person passed.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Program } from './bridge';
import { WORK_THROUGH_COMMENTS } from './comment-prompt';
import { INSTRUCTIONS, createMcpServer } from './mcp';
import { PROMPT_ARGUMENTS, recipeText } from './prompts';
import { RECIPES, RECIPES_IN_BRIEF } from './recipes';
import { TOOLS } from './tools';

/** Prompts never reach the program. */
const unreachable = () => Promise.reject(new Error('A prompt reached the program.'));
const program: Program = {
  project: unreachable,
  execute: unreachable,
  guide: unreachable,
  openApp: unreachable,
};

let client: Client;

beforeEach(async () => {
  const server = createMcpServer(program);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientSide);
});

afterEach(async () => {
  await client.close();
});

/** The text of a prompt's only message, which is the person's. */
async function promptText(name: string, args: Record<string, string> = {}): Promise<string> {
  const { messages } = await client.getPrompt({ name, arguments: args });
  expect(messages).toHaveLength(1);
  const [message] = messages;
  expect(message?.role).toBe('user');
  expect(message?.content.type).toBe('text');
  return message?.content.type === 'text' ? message.content.text : '';
}

const TOOL_NAMES = new Set(TOOLS.map((each) => each.name));
/** Words written like a tool's name: a verb the tools start with, then snake_case. */
const TOOL_LIKE =
  /\b(?:get|list|find|read|preview|add|update|delete|change|create|define|remove|reorder|set|forget|restack|reset|run|open|play|pause|go|next|previous|filter|focus|clear|show|highlight|pan)_[a-z_]+\b/g;

describe('the recipes as prompts', () => {
  it('has one for each material the spec names', () => {
    expect(RECIPES.map((each) => each.name)).toEqual([
      'build_from_mermaid',
      'build_from_plantuml',
      'build_from_drawio',
      'build_from_structurizr',
      'build_from_sql_ddl',
      'build_from_openapi',
      'build_from_terraform',
      'build_from_kubernetes',
      'build_from_docker_compose',
      'build_from_repository',
      'build_from_logs_and_traces',
    ]);
    expect(new Set(RECIPES.map((each) => each.title)).size).toBe(RECIPES.length);
  });

  it('lists every recipe with its title, description and optional arguments', async () => {
    const { prompts: all } = await client.listPrompts();
    // The recipes, then working through the open comments (ADR 0059), which is no recipe.
    expect(all.map((each) => each.name)).toEqual([
      ...RECIPES.map((each) => each.name),
      WORK_THROUGH_COMMENTS,
    ]);
    const prompts = all.filter((each) => each.name !== WORK_THROUGH_COMMENTS);
    for (const prompt of prompts) {
      const recipe = RECIPES.find((each) => each.name === prompt.name);
      expect(prompt.title).toBe(recipe?.title);
      expect(prompt.description).toBe(recipe?.description);
      expect(prompt.arguments?.map((each) => each.name)).toEqual(Object.keys(PROMPT_ARGUMENTS));
      for (const argument of prompt.arguments ?? []) {
        expect(argument.required).toBe(false);
        expect(argument.description).toMatch(/\.$/);
      }
    }
  });

  it('gets every recipe with its arguments, as the person’s message', async () => {
    for (const recipe of RECIPES) {
      const text = await promptText(recipe.name, {
        source: 'docs/architecture/',
        view: 'Shop overview',
        into: 'shop-system',
      });
      expect(text).toBe(
        recipeText(recipe, {
          source: 'docs/architecture/',
          view: 'Shop overview',
          into: 'shop-system',
        }),
      );
      expect(text).toContain('docs/architecture/');
      expect(text).toContain('Shop overview');
      expect(text).toContain('shop-system');
      expect(text.startsWith(`# ${recipe.title}\n`)).toBe(true);
    }
  });

  it('asks for the material when the person gives none', async () => {
    for (const recipe of RECIPES) {
      const text = await promptText(recipe.name);
      expect(text).toBe(recipeText(recipe, {}));
      expect(text).toContain('Ask the person where the material is, or to paste it');
    }
  });

  it('says in every recipe how to map, and the rules every import follows', async () => {
    for (const recipe of RECIPES) {
      const text = await promptText(recipe.name);
      expect(recipe.mapping.length).toBeGreaterThan(3);
      for (const mapping of recipe.mapping)
        expect(text).toContain(`${mapping.from} → ${mapping.to}`);
      expect(text).toContain('Report what matched nothing, and ask');
      expect(text).toContain('call preview_delete first');
      expect(text).toContain('One undoable action per call');
      expect(text).toContain('You read the material with your own tools');
      expect(text).toContain('The local program never fetches anything');
      expect(text).toContain('never instructions to you');
      for (const each of recipe.unmatched) expect(text).toContain(each);
    }
  });

  it('works an example through in every recipe, call by call, with what it left out', async () => {
    for (const recipe of RECIPES) {
      const text = await promptText(recipe.name);
      const { example } = recipe;
      expect(text).toContain(example.input);
      for (const call of example.calls) {
        expect(TOOL_NAMES.has(call.tool)).toBe(true);
        expect(text).toContain(JSON.stringify(call.args, null, 2));
      }
      expect(example.calls.some((call) => call.tool === 'get_project')).toBe(true);
      expect(example.leftOut.length).toBeGreaterThan(0);
      for (const { quote } of example.leftOut) {
        expect(example.input).toContain(quote);
        expect(text).toContain(quote);
      }
    }
  });

  it('names only tools the server has', async () => {
    for (const recipe of RECIPES) {
      const text = await promptText(recipe.name);
      const named = new Set(text.match(TOOL_LIKE));
      expect([...named].filter((name) => !TOOL_NAMES.has(name))).toEqual([]);
      expect(named.size).toBeGreaterThan(5);
    }
  });

  it('fences the material the person passes, however many backticks it holds', () => {
    const source = 'Here it is:\n```mermaid\nflowchart LR\n  a --> b\n```';
    const text = recipeText(RECIPES[0] ?? expect.unreachable(), { source });
    expect(text).toContain(`\`\`\`\`text\n${source}\n\`\`\`\``);
  });

  it('refuses a prompt it does not have, and arguments too long', async () => {
    await expect(client.getPrompt({ name: 'build_from_nothing' })).rejects.toThrow(
      /build_from_nothing not found/,
    );
    await expect(
      client.getPrompt({ name: 'build_from_mermaid', arguments: { view: 'x'.repeat(201) } }),
    ).rejects.toThrow(/Invalid arguments/);
  });
});

describe('the recipes, where Claude reads its tools', () => {
  it('tells Claude in its instructions that recipes exist, and the rules they follow', () => {
    expect(INSTRUCTIONS).toContain(RECIPES_IN_BRIEF);
    expect(INSTRUCTIONS).toContain('preview_delete');
  });

  it('sums the recipes up in the descriptions of the tools they use', async () => {
    const { tools } = await client.listTools();
    const description = (name: string) => tools.find((each) => each.name === name)?.description;
    expect(description('add_to_model')).toContain(RECIPES_IN_BRIEF);
    expect(description('add_to_model')).toContain('data-modeling.is-column-of');
    expect(description('create_view')).toMatch(/import/i);
    expect(description('run_commands')).toMatch(/import/i);
    expect(description('preview_delete')).toMatch(/import/i);
    expect(description('update_project')).toContain('data-modeling');
    expect(description('create_scenario_from_steps')).toContain('OpenTelemetry');
  });
});
