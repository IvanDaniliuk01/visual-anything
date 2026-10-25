/** The recipe for PlantUML: component, deployment and C4 diagrams, and sequence diagrams as scenarios. */
import type { Recipe } from './recipe';

const INPUT = `@startuml
title Billing
actor Accountant
package "Billing" {
  [Invoice service] as invoices
  database "Invoices DB" as invoicesdb
}
[Mailer] as mailer
Accountant --> invoices : HTTPS
invoices --> invoicesdb : writes
invoices ..> mailer : sends invoices
note right of mailer : Sends through SES
@enduml
`;

export const PLANTUML: Recipe = {
  name: 'build_from_plantuml',
  material: 'PlantUML diagrams',
  title: 'Build from PlantUML',
  description:
    'Build a model, views and scenarios from PlantUML: component, deployment and C4 diagrams, and sequence diagrams as scenarios.',
  read: [
    'PlantUML is in `.puml`, `.plantuml` and `.pu` files, or in ```` ```plantuml ```` blocks, each diagram between `@startuml` and `@enduml`.',
    '`!include` names another file: read it when the material has it, and ask for it otherwise. The C4-PlantUML library, included by its name or its web address, needs no reading: its macros are mapped below.',
    '`!define`, `!procedure` and `!function` are macros: read what they stand for, and keep none of them.',
    'An element has a name and often an alias (`[Invoice service] as invoices`): the name is the element’s, and arrows use the alias.',
  ],
  mapping: [
    {
      from: '`component`, `[Name]`, `node`, `artifact` and `agent`',
      to: 'a `systems.service` when it runs and others call it, otherwise a `systems.box`',
    },
    {
      from: '`database`, and `storage` or `collections` that hold files',
      to: 'a `systems.database`, or a `systems.object-storage` for files',
    },
    { from: '`actor` and `person`', to: 'a `systems.person`' },
    {
      from: '`queue`',
      to: 'a `systems.service`, with the broker it runs on as `technology` when the material says',
    },
    {
      from: '`package`, `rectangle`, `frame`, `folder`, `cloud` or `node` with `{ … }` holding others',
      to: 'a container: a `systems.system` (or the component it is when it is something itself, such as a node that runs) with what it holds inside it, through `systems.is-part-of`',
    },
    {
      from: 'An arrow, `A --> B : label`, `A -> B`, `A ..> B` or `A -- B`',
      to: 'a relation from A to B, as in the Mermaid recipe: `systems.writes-to` or `systems.reads-from` when B is a database and the label says so, otherwise `systems.communicates-with`; a label that names a protocol becomes `protocol`, any other the name',
    },
    {
      from: 'A stereotype, such as `<<database>>` or `<<queue>>`',
      to: 'the component it says',
    },
    {
      from: 'C4-PlantUML: `Person`, `System`, `System_Ext`, `Container`, `ContainerDb`, `Component`, the `*_Boundary` macros and `Rel`',
      to: 'as the Mermaid recipe maps C4: a C4 container is a `systems.service` or a `systems.database` inside the `systems.system` it belongs to, and `Rel` a `systems.communicates-with` with its technology as `protocol`',
    },
  ],
  views: [
    'One view per diagram, named by its `title`, with the perspective it shows: "Deployment" for a deployment diagram, "Data flow" for components that call each other, arranged by `systems.is-part-of`.',
  ],
  scenarios: [
    'A sequence diagram (`participant`, `actor`, `A -> B : text`) becomes a scenario as in the Mermaid recipe: one step per message, a reply (`B --> A : text`) as the dataOut of its request when it follows it, `par` messages sharing a step, and each `alt` path other than the main one offered as a scenario of its own.',
  ],
  unmatched: [
    'Notes: offer to add them to the view as notes (add_free_shape).',
    '`skinparam`, `!theme`, sprites, icons, legends, `hide` and `show`.',
    'Web addresses on elements (`[[https://…]]`): Visual Anything never keeps them.',
    'Class, activity, state, timing and other kinds of diagram no component fits: offer to define components for them in a package of the project’s own.',
  ],
  example: {
    file: 'docs/billing.puml',
    input: INPUT,
    calls: [
      { tool: 'get_project', why: 'See what the project uses and holds.', args: {} },
      {
        tool: 'add_to_model',
        why: 'The package becomes a system holding the invoice service and its database; the dotted arrow is a relation like the others.',
        args: {
          label: 'Import billing from docs/billing.puml',
          elements: [
            { ref: 'accountant', component: 'systems.person', name: 'Accountant' },
            { ref: 'billing', component: 'systems.system', name: 'Billing' },
            {
              ref: 'invoices',
              component: 'systems.service',
              name: 'Invoice service',
              inside: ['billing'],
            },
            {
              ref: 'invoicesdb',
              component: 'systems.database',
              name: 'Invoices DB',
              inside: ['billing'],
            },
            { ref: 'mailer', component: 'systems.service', name: 'Mailer' },
          ],
          relations: [
            {
              relationType: 'systems.communicates-with',
              from: 'accountant',
              to: 'invoices',
              attributes: { protocol: 'HTTPS' },
            },
            { relationType: 'systems.writes-to', from: 'invoices', to: 'invoicesdb' },
            {
              relationType: 'systems.communicates-with',
              from: 'invoices',
              to: 'mailer',
              name: 'sends invoices',
            },
          ],
        },
      },
      {
        tool: 'create_view',
        why: 'The diagram, as a view named by its title.',
        args: {
          name: 'Billing',
          perspective: { name: 'Data flow', description: 'Who calls whom to send an invoice.' },
          nestingRelationTypes: ['systems.is-part-of'],
        },
      },
    ],
    leftOut: [
      {
        quote: 'note right of mailer : Sends through SES',
        why: 'a note: offer to add it to the view, or as the mailer’s description',
      },
    ],
  },
};
