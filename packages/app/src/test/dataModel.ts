import { resolve } from 'node:path';
import type { ProjectSnapshot } from '@visual-anything/core';
import { loadProjectFolder } from './sample';

/**
 * The layout fixture shaped like the user's PostgreSQL model (ADR 0080, "Layout quality"): a
 * database, 9 schemas, 73 tables with 1,088 columns, 19 database views, 17 functions and 32
 * triggers, with 163 references, in the model's order, and three of its views with their positions,
 * collapsed containers and scopes as the user kept them. Ids and names are generated; none of the
 * user's names, descriptions, attributes or overlays is kept. Its views stand for the user's:
 * - `schema-view` for `esquema-engine`: one schema's tables, in their database;
 * - `overview` for `overview`: the database by schemas, 22 containers collapsed, one schema pinned;
 * - `processing` for `procesamiento`: tables of five schemas, collapsed, with copies of the schemas in
 *   World, drawn with curves.
 */
export function loadDataModel(): ProjectSnapshot {
  return loadProjectFolder(resolve(import.meta.dirname, '../canvas/layout/fixtures/data-model'));
}
