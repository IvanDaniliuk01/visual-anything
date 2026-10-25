/**
 * Generates the JSON Schema of each kind of project file from the types in `src/files.ts`.
 *
 * Run it with `pnpm generate` (or `pnpm build`) after changing those types, and commit `schemas/`: its
 * files are the published schema, and a test fails while they differ from what this generates.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Definition, Schema } from 'ts-json-schema-generator';
import { createGenerator } from 'ts-json-schema-generator';
import type { FileKind } from '../src/kinds';
import { FILE_KINDS } from '../src/kinds';

/** The type in `src/files.ts` that a project file of each kind holds. */
const ROOT_TYPES: Record<FileKind, string> = {
  project: 'ProjectFile',
  model: 'ModelFile',
  package: 'PackageFile',
  view: 'ViewFile',
  scenario: 'ScenarioFile',
};

/** Generates the JSON Schema of every kind of project file, as the text of its file in `schemas/`. */
export function generateSchemas(): Record<FileKind, string> {
  const generator = createGenerator({
    // The generator bundles its own TypeScript, older than the project's, so it reads `src/files.ts`
    // with minimal settings of its own instead of the project's tsconfig.
    tsconfig: fileURLToPath(new URL('tsconfig.generate.json', import.meta.url)),
    // Put the file's own type at the root, so its title and description describe the whole file.
    topRef: false,
    // Unknown keys are errors, which also keeps arbitrary payloads out of project files: package code
    // lives only in a package's `code`, and runs only once the person approves it (ADR 0054).
    additionalProperties: false,
  });
  const schemas = {} as Record<FileKind, string>;
  for (const kind of FILE_KINDS) {
    schemas[kind] = schemaText(kind, generator.createSchema(ROOT_TYPES[kind]));
  }
  return schemas;
}

/** The `$id` of the schema of each kind of project file: it names the kind, never the machine. */
function schemaId(kind: FileKind): string {
  return `urn:visual-anything:schema:${kind}`;
}

/** The text of a schema's file: 2-space JSON naming the schema first, with a final newline. */
function schemaText(kind: FileKind, generated: Schema): string {
  const { $schema, title, description, definitions, ...root } = generated;
  if (!title || !description) {
    throw new Error(`${ROOT_TYPES[kind]} needs a doc comment with a description and a @title tag.`);
  }
  for (const definition of [root, ...Object.values(definitions ?? {})]) {
    if (typeof definition === 'object') requireDiscriminator(definition);
  }
  const schema = { $schema, $id: schemaId(kind), title, description, ...root, definitions };
  return `${JSON.stringify(schema, null, 2)}\n`;
}

/**
 * For a union tagged with `@discriminator`, the generator applies each member through an `if` on the
 * discriminator's value. Such an `if` also holds when the discriminator is missing, which would apply
 * every member and bury the one real error under theirs; requiring the discriminator in each `if`
 * leaves a single error for it.
 */
function requireDiscriminator(definition: Definition): void {
  for (const member of definition.allOf ?? []) {
    if (typeof member !== 'object' || typeof member.if !== 'object') continue;
    const [discriminator, ...others] = Object.keys(member.if.properties ?? {});
    if (discriminator === undefined || others.length > 0) continue;
    if (definition.required?.includes(discriminator)) member.if.required ??= [discriminator];
  }
}

/** Writes every schema that changed to `schemas/`. */
function writeSchemas(): void {
  const schemas = generateSchemas();
  const folder = new URL('../schemas/', import.meta.url);
  mkdirSync(folder, { recursive: true });
  let changed = 0;
  for (const kind of FILE_KINDS) {
    const file = new URL(`${kind}.schema.json`, folder);
    if (existsSync(file) && readFileSync(file, 'utf8') === schemas[kind]) continue;
    writeFileSync(file, schemas[kind]);
    console.log(`Wrote schemas/${kind}.schema.json`);
    changed += 1;
  }
  if (changed === 0) console.log('The schemas in schemas/ are up to date.');
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) writeSchemas();
