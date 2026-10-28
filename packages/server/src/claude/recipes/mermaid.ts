/**
 * The recipe for Mermaid: flowcharts, C4 and ER diagrams become the model, sequence diagrams
 * scenarios, and their branches (`alt`, `opt`, `break`, a flowchart's rhombuses) decisions.
 */
import type { Recipe } from './recipe';

const INPUT = `# Shop architecture

\`\`\`mermaid
flowchart LR
  customer((Customer))
  subgraph shop [Shop]
    web[Web app]
    api[Orders API]
    db[(Orders DB)]
  end
  payments[Payments provider]
  customer -->|HTTPS| web
  web -->|HTTPS| api
  api -->|writes| db
  api -->|charges cards| payments
  click payments "https://payments.example.com/docs"
  classDef external fill:#eee,stroke:#666
  class payments external
\`\`\`

\`\`\`mermaid
sequenceDiagram
  actor customer as Customer
  participant web as Web app
  participant api as Orders API
  participant payments as Payments provider
  participant db as Orders DB
  customer->>web: Place order
  web->>api: POST /orders
  api->>payments: Charge card
  payments-->>api: Approved
  api->>db: INSERT order
  alt Order stored
    api-->>web: 201 Created
  else Database unavailable
    api-->>web: 503 Try again later
  end
  Note right of customer: Sees the confirmation
\`\`\`
`;

export const MERMAID: Recipe = {
  name: 'build_from_mermaid',
  material: 'Mermaid diagrams',
  title: 'Build from Mermaid',
  description:
    'Build a model, views and scenarios from Mermaid diagrams: flowcharts, C4 and ER diagrams, and sequence diagrams as scenarios, their branches as decisions.',
  read: [
    'Mermaid diagrams are in `.mmd` files, or in ```` ```mermaid ```` blocks of Markdown files (READMEs, `docs/`), wikis and issues the person pastes.',
    'Each diagram starts with its kind: `flowchart` or `graph`, `sequenceDiagram`, `C4Context`, `C4Container` or `C4Component`, `erDiagram`, `classDiagram`, `stateDiagram` and others. Read every diagram of the material before you build: a sequence diagram’s participants are usually a flowchart’s boxes.',
    'A box has an id and a label (`api[Orders API]`): the label is the element’s name, and the same id, or the same label, in two diagrams of the material is the same element.',
  ],
  mapping: [
    {
      from: 'A flowchart box, `id[Label]`, `id(Label)` or `id([Label])`',
      to: 'an element named by its label: `systems.service` when it runs and others call it, `systems.box` when the material says no more',
    },
    { from: 'A cylinder, `id[(Label)]`', to: 'a `systems.database`' },
    {
      from: 'A box that stands for people: a sequence diagram’s `actor`, or one named for a role, such as Customer',
      to: 'a `systems.person`',
    },
    {
      from: '`subgraph id [Label] … end`',
      to: 'a container: a `systems.system` named by the label, with what the subgraph lists inside it (`inside`, through `systems.is-part-of`); a subgraph in a subgraph sits inside it',
    },
    {
      from: 'An arrow, `A --> B` or `A -->|label| B`',
      to: 'a relation from A to B: `systems.writes-to` or `systems.reads-from` when B is a database and the label says writes or reads, otherwise `systems.communicates-with`. A label that names a protocol (HTTPS, gRPC, AMQP) becomes its `protocol` attribute, any other its name. `A --- B` is a relation from A to B too, `A <--> B` is two, and `A --> B & C` is one to each',
    },
    {
      from: 'A rhombus, `id{Question?}`, and the labelled arrows out of it (`id -->|Yes| B`)',
      to: 'a point where the flow decides, which is no part of the system: no element, and each arrow out of it runs from the box before it. In a flowchart of a process, when the project uses the process package, it is a `process.exclusive-gateway` named by its question, the boxes are `process.task`s, start and end circles `process.start-event` and `process.end-event`, and the arrows `process.sequence-flow`s, each label after the gateway the flow’s `condition`. Either way, a scenario that follows the flowchart decides there (below)',
    },
    {
      from: '`classDef name fill:#…,stroke:#…` with `class ids name`, or `style id fill:#…`',
      to: 'the appearance of those elements, `fill` and `stroke` written #RRGGBB (`#eee` is `#EEEEEE`)',
    },
    {
      from: 'C4: `Person`, `System` and `System_Ext`, `Container`, `ContainerDb`, `Component`',
      to: '`systems.person`, `systems.system`, `systems.service`, `systems.database` and `systems.service` (or `systems.box` when it does not run on its own); a C4 container is a running program or a data store, so it is a Service or a Database, and the System it belongs to is the Visual Anything container that holds it. The technology argument becomes `technology`, or `engine` for a database',
    },
    {
      from: 'C4: `System_Boundary`, `Container_Boundary` and `Enterprise_Boundary`',
      to: 'a container holding what the boundary lists: the element the boundary names when there is one, or a `systems.system`',
    },
    {
      from: 'C4: `Rel(from, to, "label", "technology")`',
      to: 'a `systems.communicates-with` named by the label, with the technology as `protocol`',
    },
    {
      from: '`erDiagram`: an entity with its attributes, and `CUSTOMER ||--o{ ORDER : places`',
      to: 'as in the SQL DDL recipe: a `data-modeling.table` with each attribute a `data-modeling.column` inside it (`nestingRelationType: "data-modeling.is-column-of"`, `PK` sets `primaryKey`), and a `data-modeling.references` from the many side (ORDER) to the one side (CUSTOMER), named by its label',
    },
    {
      from: '`sequenceDiagram`',
      to: 'a scenario (below); its participants are elements, found or created as above',
    },
  ],
  views: [
    'One view per flowchart or C4 diagram, named by its title (a `title:` in its front matter) or the heading above it, with a perspective that says what it shows ("System context" for `C4Context`, "Data flow" for a flowchart of calls), arranged by `systems.is-part-of`.',
    'An `erDiagram` is a view of its own, arranged by `data-modeling.is-column-of`.',
    'A flowchart’s direction (`LR`, `TD`) and the order of its lines are left to layout.',
  ],
  scenarios: [
    'A `sequenceDiagram` becomes a scenario over the view that shows its participants: one step per message (`A->>B: text`), in order, activating the relation from A to B (add it with the model when there is none), described in a short sentence from the message, with what the message carries in dataIn.',
    'A reply (a dashed arrow back, `B-->>A: text`) adds no relation: right after its request, it is that step’s dataOut; with other messages between, it is a step of its own over the request’s relation, whose description says it answers.',
    'Messages in a `par … and … end` block share one step. A `loop` is played once, its description saying it repeats.',
    '`alt text … else text … end` becomes a decision among the steps (create_scenario_from_steps takes it in place of a step): its question from the `alt`’s text, asked as a question (`alt Order stored` asks “Is the order stored?”), and one alternative for each branch, labelled by its text (“Otherwise” for an `else` with none), holding the steps of that branch’s messages. The first branch plays by default. `opt text … end` is a decision whose first alternative, labelled by its text, holds its messages, and whose second, “Otherwise”, has no steps. `break text … end` is a decision whose first alternative, “Otherwise”, has no steps and plays by default, and whose second, labelled by its text, holds its messages and ends the scenario (`ends: true`). Blocks inside blocks are decisions inside alternatives, up to three deep; deeper ones follow their first branch, and you say so.',
    'A flowchart that shows how something flows, with rhombuses, can become a scenario too, when the person asks for one or the flowchart is a process: one step per arrow, in the order the flow takes them, activating the relation the arrow became; at each rhombus, a decision whose question is the rhombus’s text and whose alternatives are its arrows out, each labelled by the arrow’s label and holding the steps along that branch until the branches meet again. The steps after they meet follow the decision; a branch that reaches an end, or goes nowhere further, ends the scenario. Each branch is played once, even one that loops back.',
  ],
  unmatched: [
    '`click` lines: web addresses and callbacks are never kept.',
    '`linkStyle`, `%%{init: …}%%` settings, icons and Font Awesome classes.',
    'Notes (`Note right of A: …`): offer to add them to the view as notes (add_free_shape), or to a step’s description.',
    '`classDiagram`, `stateDiagram`, `gantt`, `pie`, `mindmap`, `journey`, `timeline`, `gitGraph` and other kinds no component fits: offer to define components for them in a package of the project’s own.',
  ],
  example: {
    file: 'docs/architecture.md',
    input: INPUT,
    calls: [
      { tool: 'get_project', why: 'See what the project uses and holds.', args: {} },
      {
        tool: 'list_definitions',
        why: 'Pick the components and relation types.',
        args: { package: 'systems' },
      },
      {
        tool: 'find_elements',
        why: 'Look for the shop before adding it; here nothing is there yet.',
        args: { nameContains: 'Orders' },
      },
      {
        tool: 'add_to_model',
        why: 'Both diagrams’ boxes and the flowchart’s arrows, as one action. Customer is a person, since the sequence diagram calls it an actor; the classDef gives the payments provider its colors.',
        args: {
          label: 'Import the shop architecture from docs/architecture.md',
          elements: [
            { ref: 'customer', component: 'systems.person', name: 'Customer' },
            { ref: 'shop', component: 'systems.system', name: 'Shop' },
            { ref: 'web', component: 'systems.service', name: 'Web app', inside: ['shop'] },
            { ref: 'api', component: 'systems.service', name: 'Orders API', inside: ['shop'] },
            { ref: 'db', component: 'systems.database', name: 'Orders DB', inside: ['shop'] },
            {
              ref: 'payments',
              component: 'systems.system',
              name: 'Payments provider',
              appearance: { fill: '#EEEEEE', stroke: '#666666' },
            },
          ],
          relations: [
            {
              ref: 'customer-uses-web',
              relationType: 'systems.communicates-with',
              from: 'customer',
              to: 'web',
              attributes: { protocol: 'HTTPS' },
            },
            {
              ref: 'web-calls-api',
              relationType: 'systems.communicates-with',
              from: 'web',
              to: 'api',
              attributes: { protocol: 'HTTPS' },
            },
            { ref: 'api-writes-db', relationType: 'systems.writes-to', from: 'api', to: 'db' },
            {
              ref: 'api-charges-payments',
              relationType: 'systems.communicates-with',
              from: 'api',
              to: 'payments',
              name: 'charges cards',
            },
          ],
        },
      },
      {
        tool: 'create_view',
        why: 'The flowchart, as a view; the project had none.',
        args: {
          name: 'Shop architecture',
          perspective: { name: 'Data flow', description: 'How an order crosses the shop.' },
          nestingRelationTypes: ['systems.is-part-of'],
        },
        as: 'architecture',
      },
      {
        tool: 'create_scenario_from_steps',
        why: 'The sequence diagram, as a scenario. "Approved" comes right after its request, so it is that step’s dataOut; each answer to the web app comes after other messages, so it is a step of its own. The alt block is a decision between its two branches, the first playing by default.',
        args: {
          name: 'A customer places an order',
          description: 'From the sequence diagram in docs/architecture.md.',
          view: '<id of architecture>',
          steps: [
            {
              description: 'The customer places an order in the web app.',
              relations: ['<id of customer-uses-web>'],
            },
            {
              description: 'The web app sends the order to the Orders API.',
              relations: ['<id of web-calls-api>'],
              dataIn: { request: 'POST /orders' },
            },
            {
              description: 'The Orders API charges the card with the payments provider.',
              relations: ['<id of api-charges-payments>'],
              dataOut: { result: 'Approved' },
            },
            {
              description: 'The Orders API writes the order to the Orders DB.',
              relations: ['<id of api-writes-db>'],
              dataIn: { statement: 'INSERT order' },
            },
            {
              decision: 'Is the order stored?',
              alternatives: [
                {
                  label: 'Order stored',
                  steps: [
                    {
                      description: 'The Orders API answers the web app.',
                      relations: ['<id of web-calls-api>'],
                      dataOut: { status: '201 Created' },
                    },
                  ],
                },
                {
                  label: 'Database unavailable',
                  steps: [
                    {
                      description: 'The Orders API tells the web app to try again later.',
                      relations: ['<id of web-calls-api>'],
                      dataOut: { status: '503 Try again later' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
    leftOut: [
      {
        quote: 'click payments "https://payments.example.com/docs"',
        why: 'a web address, which Visual Anything never keeps',
      },
      {
        quote: 'Note right of customer: Sees the confirmation',
        why: 'a note: offer to add it to the view with add_free_shape',
      },
    ],
  },
};
