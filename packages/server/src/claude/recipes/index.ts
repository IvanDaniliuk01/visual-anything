/**
 * Every recipe for building from material that exists (R29), in the order the prompts list them, and
 * the brief of them that Claude's instructions and the tools they use repeat.
 */
import { MAX_ADDITIONS } from '../batches';
import { DOCKER_COMPOSE } from './docker-compose';
import { DRAWIO } from './drawio';
import { KUBERNETES } from './kubernetes';
import { LOGS_AND_TRACES } from './logs-and-traces';
import { MERMAID } from './mermaid';
import { OPENAPI } from './openapi';
import { PLANTUML } from './plantuml';
import type { Recipe } from './recipe';
import { REPOSITORY } from './repository';
import { SQL_DDL } from './sql-ddl';
import { STRUCTURIZR } from './structurizr';
import { TERRAFORM } from './terraform';

export const RECIPES: readonly Recipe[] = [
  MERMAID,
  PLANTUML,
  DRAWIO,
  STRUCTURIZR,
  SQL_DDL,
  OPENAPI,
  TERRAFORM,
  KUBERNETES,
  DOCKER_COMPOSE,
  REPOSITORY,
  LOGS_AND_TRACES,
];

/** "a and b", or "a, b, and c", so that an item that holds "and" still reads as one. */
function listed(items: readonly string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1) ?? ''}`;
}

/** The recipes in brief, for Claude's instructions and the descriptions of the tools they use. */
export const RECIPES_IN_BRIEF = `To build from material that exists (${listed(RECIPES.map((each) => each.material))}): read it yourself, since the local program fetches nothing; reuse what find_elements finds; map each thing to a component and relation type from list_definitions, and never invent one; add it all in one call, one undoable action, or, past ${MAX_ADDITIONS} elements and relations, in batches of at most ${MAX_ADDITIONS} that name one another by ids you choose; then report everything that matched nothing, and ask. Call preview_delete before any delete. This server's prompts (${listed(
  [...RECIPES.slice(0, 2).map((each) => each.name), 'the others'],
)}) hold the recipe for each, which the person can pick.`;
