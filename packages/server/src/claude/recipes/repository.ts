/** The recipe for a repository's tree: the parts that run, the code they share, and what they call. */
import type { Recipe } from './recipe';

const INPUT = `shop/
  package.json              {"name": "shop", "workspaces": ["apps/*", "packages/*"]}
  apps/web/package.json     {"name": "@shop/web", "dependencies": {"@shop/ui": "workspace:*"}}
  apps/web/Dockerfile       FROM node:22
  apps/api/package.json     {"name": "@shop/api", "dependencies": {"pg": "^8.13.0"}}
  apps/api/src/db.ts        new Pool({ connectionString: process.env.DATABASE_URL })
  packages/ui/package.json  {"name": "@shop/ui"}
  .github/workflows/ci.yml
`;

export const REPOSITORY: Recipe = {
  name: 'build_from_repository',
  material: 'a repository’s tree',
  title: 'Build from a repository',
  description:
    'Build the parts of a repository that run, the code they share, and what they call, from its tree and manifests.',
  read: [
    'List the tree yourself (`git ls-files`, or your file tools), leaving out what `.gitignore` leaves out, dependencies (`node_modules/`, `vendor/`, `.venv/`) and build output (`dist/`, `build/`, `target/`).',
    'Read the manifests that say what each part is and uses: `package.json` and `pnpm-workspace.yaml`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `pom.xml` or `build.gradle`, `*.csproj`, Dockerfiles and Compose files, and each part’s README. Read code only to see what a part calls: HTTP clients, database drivers, queues. Never read the values in `.env` files.',
    'For a large repository, model its top level first, show it, and ask the person which parts to go into.',
  ],
  mapping: [
    {
      from: 'The repository',
      to: 'a `systems.system` named by it, holding its parts through `systems.is-part-of`',
    },
    {
      from: 'A part that runs on its own: an app, a server, a worker, a command line with its own entry point, a Dockerfile',
      to: 'a `systems.service`, with `technology` from its manifest or its Dockerfile’s `FROM` ("Node.js 22", "Go")',
    },
    {
      from: 'A library, package or module that other parts use and that does not run on its own',
      to: 'a `systems.box`, with `technology`; with many of them, offer a "Module" component of the project’s own',
    },
    {
      from: 'A dependency between parts of the repository: a `workspace:` dependency in `package.json`, a `replace` in `go.mod`, a `path` dependency in `Cargo.toml`',
      to: 'a relation of a type of the project’s own, "depends on" (define_relation_type deriving from `relates-to`, directed, after the person agrees), since using a library is not communicating',
    },
    {
      from: 'A call one running part makes to another: an HTTP client pointed at its address, a queue both use',
      to: 'a `systems.communicates-with`, with `protocol`',
    },
    {
      from: 'A database the code connects to (a driver and its connection setting), or a `migrations/` folder',
      to: 'a `systems.database`, which the part `systems.writes-to` or `systems.reads-from` when the code shows which, and `systems.communicates-with` when it does not; read the migrations with the SQL DDL recipe',
    },
    {
      from: 'Folders inside a part (`src/billing/`, `internal/orders/`)',
      to: 'only when the person wants that depth: elements inside their part',
    },
    {
      from: 'Dependencies from a registry (`pg`, `react`)',
      to: 'no element, unless a part runs one as a service of its own',
    },
  ],
  views: [
    'One view of the code’s structure, perspective "Structure", arranged by `systems.is-part-of`; when the running parts call each other, a second, perspective "Data flow", over the same model.',
  ],
  scenarios: [
    'Offer to walk one request the person names through the parts, from its handler, one step per call between parts, asking where the code is unclear; or a scenario from logs (the logs and traces recipe).',
  ],
  unmatched: [
    'CI workflows, tests, documentation, scripts, generated code, and the settings of tools such as linters and formatters.',
    'Anything whose purpose you could not tell: list it, and ask.',
  ],
  example: {
    file: 'shop/',
    input: INPUT,
    calls: [
      { tool: 'get_project', why: 'See what the project uses and holds.', args: {} },
      {
        tool: 'create_package',
        why: 'A package for "depends on", once the person agreed.',
        args: {
          id: 'code',
          name: 'Code',
          description: 'How the parts of a code base use each other.',
        },
      },
      {
        tool: 'define_relation_type',
        why: 'Using a library is not communicating, so the workspace dependency needs a type of its own.',
        args: {
          package: 'code',
          createOnly: true,
          relationType: {
            id: 'code.depends-on',
            name: 'depends on',
            derivesFrom: 'relates-to',
            description: 'Uses the code of another part of the repository.',
            direction: 'directed',
          },
        },
      },
      {
        tool: 'add_to_model',
        why: 'The two apps run, the UI package is shared code, and the API connects to a PostgreSQL database; the code does not show whether it reads or writes, so the relation is communicates with.',
        args: {
          label: 'Import the shop repository’s parts',
          elements: [
            { ref: 'shop', component: 'systems.system', name: 'shop' },
            {
              ref: 'web',
              component: 'systems.service',
              name: '@shop/web',
              inside: ['shop'],
              attributes: { technology: 'Node.js 22' },
            },
            {
              ref: 'api',
              component: 'systems.service',
              name: '@shop/api',
              inside: ['shop'],
              attributes: { technology: 'Node.js' },
            },
            { ref: 'ui', component: 'systems.box', name: '@shop/ui', inside: ['shop'] },
            {
              ref: 'db',
              component: 'systems.database',
              name: 'Shop database',
              attributes: { engine: 'postgres' },
            },
          ],
          relations: [
            { relationType: 'code.depends-on', from: 'web', to: 'ui' },
            {
              relationType: 'systems.communicates-with',
              from: 'api',
              to: 'db',
              attributes: { protocol: 'PostgreSQL' },
            },
          ],
        },
      },
      {
        tool: 'create_view',
        why: 'A view of the code’s structure.',
        args: {
          name: 'Shop code',
          perspective: { name: 'Structure', description: 'The parts of the shop repository.' },
          nestingRelationTypes: ['systems.is-part-of'],
        },
      },
    ],
    leftOut: [{ quote: '.github/workflows/ci.yml', why: 'a CI workflow, not part of the system' }],
  },
};
