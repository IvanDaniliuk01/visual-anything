/** The recipe for OpenAPI: the API as a service drawing its operations as rows, and its data shapes. */
import type { Recipe } from './recipe';

const INPUT = `openapi: 3.1.0
info:
  title: Orders API
  version: 2.3.0
servers:
  - url: https://api.shop.example/v2
paths:
  /orders:
    post:
      operationId: placeOrder
      summary: Place an order
  /orders/{id}:
    get:
      operationId: getOrder
      summary: Read an order
x-rate-limit: 100
`;

export const OPENAPI: Recipe = {
  name: 'build_from_openapi',
  material: 'OpenAPI documents',
  title: 'Build from OpenAPI',
  description:
    'Build an API’s operations, and optionally its data shapes, from an OpenAPI or Swagger document.',
  read: [
    'The document is `openapi.yaml` or `openapi.json`, or `swagger.json` for Swagger 2.0, which reads alike; services often serve it at a path such as `/openapi.json`, which the person saves for you, since nothing is fetched.',
    'Follow each `$ref` to another file of the material; for a `$ref` to a web address, ask the person for the file.',
    'An OpenAPI document says what a service offers, not who calls it: ask the person, or read the callers’ code, before adding relations to it.',
  ],
  mapping: [
    {
      from: 'The API (`info.title`, `info.version`, `servers`)',
      to: 'a service named by its title, or the service already in the model that serves it (find it first): an element of a component of the project’s own, "HTTP API", deriving from `systems.service` and drawing its contents as rows (`contentsAsRows`), with `version` and `servers` attributes (the addresses as text: nothing calls them)',
    },
    {
      from: 'Each operation, a method under a path (`post` under `/orders`)',
      to: 'an element of a component of the project’s own, "Operation", deriving from `systems.box` with `method` and `path` attributes, named "POST /orders", described by its `summary`, inside the API (`systems.is-part-of`), in the document’s order, which is the order of the rows',
    },
    {
      from: '`tags`',
      to: 'each operation’s `tags` attribute; a container per tag only when the person wants one',
    },
    {
      from: '`components.schemas`',
      to: 'when the person wants the data shapes too, as in the SQL DDL recipe: each schema a `data-modeling.table` and each of its `properties` a `data-modeling.column` inside it (`type` from `type` and `format`, `notNull` for `required`), and a `$ref` between schemas a `data-modeling.references`',
    },
    {
      from: '`securitySchemes`',
      to: 'the API’s `authentication` attribute, such as "OAuth 2" or "API key in header"',
    },
    {
      from: '`callbacks` and `webhooks`',
      to: 'a `systems.communicates-with` from the API to whoever receives them, which you ask the person about',
    },
  ],
  views: [
    'One view of the API’s surface, perspective "Interfaces", arranged by `systems.is-part-of`, where the API draws its operations as rows. The data shapes, when you add them, go in a view of their own arranged by `data-modeling.is-column-of`.',
  ],
  scenarios: [
    'A document holds no sequence; operation `links` can hint at one. Offer a scenario from an access log or traces of the API’s calls (the logs and traces recipe), and `examples` as the data of its steps.',
  ],
  unmatched: [
    '`x-` extensions: offer them as attributes.',
    '`externalDocs` and other web addresses, server variables, and `examples` bodies (offer them as a step’s data).',
    'Parameters, headers and responses, unless the person wants them as rows of their own.',
  ],
  example: {
    file: 'openapi.yaml',
    input: INPUT,
    calls: [
      { tool: 'get_project', why: 'See what the project uses and holds.', args: {} },
      {
        tool: 'run_commands',
        why: 'With the person’s agreement, the components an HTTP API needs, defined together as one action.',
        args: {
          label: 'Define the HTTP API package',
          commands: [
            {
              type: 'create-package',
              package: {
                id: 'http-api',
                name: 'HTTP API',
                description: 'APIs and the operations they offer.',
              },
            },
            {
              type: 'define-component',
              package: 'http-api',
              createOnly: true,
              component: {
                id: 'http-api.api',
                name: 'HTTP API',
                derivesFrom: 'systems.service',
                description: 'A service that offers operations over HTTP.',
                attributes: [
                  { name: 'version', type: 'string' },
                  { name: 'servers', type: 'string' },
                ],
                appearance: { contentsAsRows: true, width: 260 },
              },
            },
            {
              type: 'define-component',
              package: 'http-api',
              createOnly: true,
              component: {
                id: 'http-api.operation',
                name: 'Operation',
                derivesFrom: 'systems.box',
                description: 'A method under a path of an HTTP API.',
                attributes: [
                  { name: 'method', type: 'string' },
                  { name: 'path', type: 'string' },
                ],
                appearance: { height: 32, detail: { componentName: false } },
              },
            },
          ],
        },
      },
      {
        tool: 'add_to_model',
        why: 'The API with its operations as rows, in the document’s order.',
        args: {
          label: 'Import the Orders API from openapi.yaml',
          elements: [
            {
              ref: 'orders-api',
              component: 'http-api.api',
              name: 'Orders API',
              attributes: { version: '2.3.0', servers: 'https://api.shop.example/v2' },
            },
            {
              ref: 'place-order',
              component: 'http-api.operation',
              name: 'POST /orders',
              description: 'Place an order',
              inside: ['orders-api'],
              attributes: { method: 'POST', path: '/orders' },
            },
            {
              ref: 'get-order',
              component: 'http-api.operation',
              name: 'GET /orders/{id}',
              description: 'Read an order',
              inside: ['orders-api'],
              attributes: { method: 'GET', path: '/orders/{id}' },
            },
          ],
        },
      },
      {
        tool: 'create_view',
        why: 'A view of what the API offers.',
        args: {
          name: 'Orders API surface',
          perspective: { name: 'Interfaces', description: 'What the Orders API offers.' },
          nestingRelationTypes: ['systems.is-part-of'],
        },
      },
    ],
    leftOut: [
      { quote: 'x-rate-limit: 100', why: 'an extension: offer it as an attribute of the API' },
    ],
  },
};
