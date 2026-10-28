/**
 * The recipe for PlantUML: component, deployment and C4 diagrams, sequence diagrams as scenarios, and
 * activity diagrams as processes whose scenarios decide at each `if`.
 */
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

@startuml
title Sending an invoice
start
:Draft the invoice;
if (Is the customer's address known?) then (yes)
  :Send the invoice;
else (no)
  :Ask for the address;
  stop
endif
:Record that it was sent;
stop
@enduml
`;

export const PLANTUML: Recipe = {
  name: 'build_from_plantuml',
  material: 'PlantUML diagrams',
  title: 'Build from PlantUML',
  description:
    'Build a model, views and scenarios from PlantUML: component, deployment and C4 diagrams, sequence diagrams as scenarios, and activity diagrams as processes, their branches as decisions.',
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
    {
      from: 'An activity diagram: `start`, `:activity;`, `stop` and `end`',
      to: 'a process, with the built-in process package (add it with update_project when get_project does not list `process`): `start` a `process.start-event` named Start, each activity a `process.task` named by its text, `stop` and `end` each a `process.end-event` named End, and a `process.sequence-flow` from each to the next',
    },
    {
      from: '`if (question) then (label) … elseif (question) then (label) … else (label) … endif`',
      to: 'a `process.exclusive-gateway` named by its question, with a `process.sequence-flow` to the first activity of each branch, the branch’s label as the flow’s `condition`; the last activity of each branch that goes on flows to what follows `endif`. An `elseif` is one more branch of the same gateway',
    },
    {
      from: 'Swimlanes, `|Lane|`',
      to: 'a `process.lane` holding the activities under it, inside a `process.pool` named by the diagram’s title (`process.is-part-of`)',
    },
  ],
  views: [
    'One view per diagram, named by its `title`, with the perspective it shows: "Deployment" for a deployment diagram, "Data flow" for components that call each other, arranged by `systems.is-part-of`; "Process" for an activity diagram, arranged by `process.is-part-of`.',
  ],
  scenarios: [
    'A sequence diagram (`participant`, `actor`, `A -> B : text`) becomes a scenario as in the Mermaid recipe: one step per message, a reply (`B --> A : text`) as the dataOut of its request when it follows it, `par` messages sharing a step, and `alt … else … end`, `opt … end` and `break … end` decisions among the steps, as that recipe makes them.',
    'An activity diagram becomes a scenario that walks it: one step per sequence flow, in the order the work goes, saying what happens where the flow arrives. Each `if` is a decision among the steps (create_scenario_from_steps takes it in place of a step), whose question is the `if`’s and whose alternatives are its branches, each labelled by its label (`then (yes)` is “yes”) and holding the steps of that branch; the first branch plays by default. A branch that reaches `stop` or `end` ends the scenario (`ends: true`); a branch with no activities is an alternative with no steps; the steps after `endif` follow the decision. Nested `if`s are decisions inside alternatives, up to three deep.',
  ],
  unmatched: [
    'Notes: offer to add them to the view as notes (add_free_shape).',
    '`skinparam`, `!theme`, sprites, icons, legends, `hide` and `show`.',
    'Web addresses on elements (`[[https://…]]`): Visual Anything never keeps them.',
    'In an activity diagram, `fork`, `split`, `repeat` and `while`: parallel paths and loops, which a scenario plays once along their first path, saying so; offer a `process.parallel-gateway` for a fork.',
    'Class, state, timing and other kinds of diagram no component fits: offer to define components for them in a package of the project’s own.',
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
      {
        tool: 'update_project',
        why: 'The activity diagram is a process, and get_project did not list the process package: every package the project uses, then `process`.',
        args: { packages: ['systems', 'process'] },
      },
      {
        tool: 'add_to_model',
        why: 'The activity diagram’s start, activities, gateway and stops, and a sequence flow for each arrow between them; the flows out of the gateway carry their branch’s label as their condition, and each branch that goes on flows to the activity after endif.',
        args: {
          label: 'Import the invoice process from docs/billing.puml',
          elements: [
            { ref: 'start', component: 'process.start-event', name: 'Start' },
            { ref: 'draft', component: 'process.task', name: 'Draft the invoice' },
            {
              ref: 'address-known',
              component: 'process.exclusive-gateway',
              name: "Is the customer's address known?",
            },
            { ref: 'send', component: 'process.task', name: 'Send the invoice' },
            { ref: 'ask', component: 'process.task', name: 'Ask for the address' },
            { ref: 'asked-end', component: 'process.end-event', name: 'End' },
            { ref: 'record', component: 'process.task', name: 'Record that it was sent' },
            { ref: 'sent-end', component: 'process.end-event', name: 'End' },
          ],
          relations: [
            {
              ref: 'start-to-draft',
              relationType: 'process.sequence-flow',
              from: 'start',
              to: 'draft',
            },
            {
              ref: 'draft-to-known',
              relationType: 'process.sequence-flow',
              from: 'draft',
              to: 'address-known',
            },
            {
              ref: 'known-to-send',
              relationType: 'process.sequence-flow',
              from: 'address-known',
              to: 'send',
              attributes: { condition: 'yes' },
            },
            {
              ref: 'known-to-ask',
              relationType: 'process.sequence-flow',
              from: 'address-known',
              to: 'ask',
              attributes: { condition: 'no' },
            },
            {
              ref: 'ask-to-end',
              relationType: 'process.sequence-flow',
              from: 'ask',
              to: 'asked-end',
            },
            {
              ref: 'send-to-record',
              relationType: 'process.sequence-flow',
              from: 'send',
              to: 'record',
            },
            {
              ref: 'record-to-end',
              relationType: 'process.sequence-flow',
              from: 'record',
              to: 'sent-end',
            },
          ],
        },
      },
      {
        tool: 'create_view',
        why: 'The activity diagram, as a view of its own.',
        args: {
          name: 'Sending an invoice',
          perspective: { name: 'Process', description: 'How an invoice goes out.' },
          nestingRelationTypes: ['process.is-part-of'],
        },
        as: 'invoicing',
      },
      {
        tool: 'create_scenario_from_steps',
        why: 'The activity diagram walked: a step per sequence flow, and the if as a decision between its branches. The no branch reaches stop, so it ends the scenario; the activity after endif follows the decision.',
        args: {
          name: 'An invoice is sent',
          description: 'From the activity diagram in docs/billing.puml.',
          view: '<id of invoicing>',
          steps: [
            { description: 'The invoice is drafted.', relations: ['<id of start-to-draft>'] },
            {
              description: 'The customer’s address is looked up.',
              relations: ['<id of draft-to-known>'],
            },
            {
              decision: "Is the customer's address known?",
              alternatives: [
                {
                  label: 'yes',
                  steps: [
                    { description: 'The invoice is sent.', relations: ['<id of known-to-send>'] },
                  ],
                },
                {
                  label: 'no',
                  ends: true,
                  steps: [
                    {
                      description: 'The customer is asked for the address.',
                      relations: ['<id of known-to-ask>'],
                    },
                    { description: 'It stops there.', relations: ['<id of ask-to-end>'] },
                  ],
                },
              ],
            },
            {
              description: 'That the invoice was sent is recorded.',
              relations: ['<id of send-to-record>'],
            },
            { description: 'It is done.', relations: ['<id of record-to-end>'] },
          ],
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
