/** The recipe for the Structurizr DSL: the C4 model, its views, and dynamic views as scenarios. */
import type { Recipe } from './recipe';

const INPUT = `workspace {
  model {
    customer = person "Customer"
    shop = softwareSystem "Shop" {
      api = container "Orders API" "Takes orders." "Node.js"
      db = container "Orders DB" "Stores orders." "PostgreSQL" {
        tags "Database"
      }
    }
    customer -> api "Places orders" "HTTPS"
    api -> db "Writes orders" "SQL"
  }
  views {
    container shop "Containers" {
      include *
      autoLayout
    }
    dynamic shop "PlaceOrder" "A customer places an order." {
      customer -> api "Places an order"
      api -> db "Writes the order"
    }
  }
}
`;

export const STRUCTURIZR: Recipe = {
  name: 'build_from_structurizr',
  material: 'the Structurizr DSL',
  title: 'Build from Structurizr',
  description:
    'Build a model, views and scenarios from the Structurizr DSL: people, software systems, containers and components, and dynamic views as scenarios.',
  read: [
    'The DSL is in `workspace.dsl` and the files it `!include`s; Structurizr’s JSON export (`workspace.json`) holds the same model. Read the included files when the material has them, and ask for them otherwise.',
    'Identifiers (`api = container "Orders API"`) name elements across the file; with `!identifiers hierarchical` they are written `shop.api`. The strings after a keyword are, in order, its name, description and technology.',
    '`!script` and `!plugin` are code, and `!docs` and `!adrs` point at documentation: keep none of them.',
  ],
  mapping: [
    { from: '`person`', to: 'a `systems.person`' },
    {
      from: '`softwareSystem`',
      to: 'a `systems.system`, the Visual Anything container of its containers (`systems.is-part-of`)',
    },
    {
      from: '`container`',
      to: 'a `systems.service`, or a `systems.database` when its tags or technology say it stores data ("Database", "PostgreSQL"), inside its software system; its technology becomes `technology`, or `engine` for a database, and its description the element’s',
    },
    {
      from: '`component`',
      to: 'a `systems.service`, or a `systems.box` when it does not run on its own, inside its container',
    },
    {
      from: '`a -> b "Description" "Technology"`, and `-> b` inside an element’s block, which starts from it',
      to: 'a `systems.communicates-with` named by the description, with the technology as `protocol`; a `systems.writes-to` or `systems.reads-from` instead when b is a database and the description says so',
    },
    {
      from: '`properties { … }` and `tags`',
      to: 'attributes of the element: each property by its name, and the tags as `tags`, joined with ", "',
    },
    {
      from: '`group "Name" { … }`',
      to: 'a container only when the person wants one; otherwise its members sit where they would',
    },
    {
      from: '`deploymentEnvironment`, `deploymentNode`, `infrastructureNode` and `containerInstance`',
      to: 'the deployment: each node a `systems.box` (named by it, its technology as `technology`), nesting through a relation type of the project’s own, such as "runs on" (define_relation_type with `nests: true`, after the person agrees), so that deployment leaves the containment other views show as it is; each instance places its container inside its node through it',
    },
  ],
  views: [
    'Views in Visual Anything show the whole model, so one per Structurizr view would repeat the same shapes. Make one view arranged by `systems.is-part-of` for the `systemLandscape`, `systemContext`, `container` and `component` views, with the perspective they share, and one for `deployment` views, arranged by the deployment’s nesting relation type. Say which Structurizr views you merged, and that collapsing a software system (set_collapsed) shows it at the context level.',
    '`include` and `exclude` rules cannot be kept yet: say which elements they left out.',
  ],
  scenarios: [
    'Each `dynamic` view becomes a scenario over the view that shows its elements: one step per relation, in order (or in the order of their numbers), activating the model’s relation between the same ends, described by the dynamic view’s description of it. Relations written in `{ }` at the same number happen at once and share a step.',
  ],
  unmatched: [
    '`!script`, `!plugin`, `!docs` and `!adrs`.',
    '`url`, `perspectives`, `healthCheck`, and the `styles`, `theme` and `themes` of the views (offer the styles’ colors as appearances).',
    '`autoLayout` and `animation`: layout places the shapes anyway.',
  ],
  example: {
    file: 'workspace.dsl',
    input: INPUT,
    calls: [
      { tool: 'get_project', why: 'See what the project uses and holds.', args: {} },
      {
        tool: 'add_to_model',
        why: 'The C4 model as one action: the Orders DB is a database, as its tag says, and its technology is its engine.',
        args: {
          label: 'Import the shop from workspace.dsl',
          elements: [
            { ref: 'customer', component: 'systems.person', name: 'Customer' },
            { ref: 'shop', component: 'systems.system', name: 'Shop' },
            {
              ref: 'api',
              component: 'systems.service',
              name: 'Orders API',
              description: 'Takes orders.',
              inside: ['shop'],
              attributes: { technology: 'Node.js' },
            },
            {
              ref: 'db',
              component: 'systems.database',
              name: 'Orders DB',
              description: 'Stores orders.',
              inside: ['shop'],
              attributes: { engine: 'PostgreSQL', tags: 'Database' },
            },
          ],
          relations: [
            {
              ref: 'customer-places-orders',
              relationType: 'systems.communicates-with',
              from: 'customer',
              to: 'api',
              name: 'Places orders',
              attributes: { protocol: 'HTTPS' },
            },
            {
              ref: 'api-writes-orders',
              relationType: 'systems.writes-to',
              from: 'api',
              to: 'db',
              name: 'Writes orders',
              attributes: { protocol: 'SQL' },
            },
          ],
        },
      },
      {
        tool: 'create_view',
        why: 'The container view.',
        args: {
          name: 'Shop containers',
          perspective: {
            name: 'Containers',
            description: 'The programs and data stores the shop is made of.',
          },
          nestingRelationTypes: ['systems.is-part-of'],
        },
        as: 'containers',
      },
      {
        tool: 'create_scenario_from_steps',
        why: 'The dynamic view, as a scenario over the relations between the same ends.',
        args: {
          name: 'A customer places an order',
          description: 'From the dynamic view PlaceOrder in workspace.dsl.',
          view: '<id of containers>',
          steps: [
            {
              description: 'The customer places an order with the Orders API.',
              relations: ['<id of customer-places-orders>'],
            },
            {
              description: 'The Orders API writes the order to the Orders DB.',
              relations: ['<id of api-writes-orders>'],
            },
          ],
        },
      },
    ],
    leftOut: [
      { quote: 'autoLayout', why: 'layout places the shapes anyway' },
      { quote: 'include *', why: 'the view shows the whole model, as every view does for now' },
    ],
  },
};
