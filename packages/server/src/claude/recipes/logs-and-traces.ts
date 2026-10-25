/**
 * The recipe for logs and OpenTelemetry traces: the services and calls they show, and each request as
 * a scenario over them.
 */
import type { Recipe } from './recipe';

const INPUT = `{
  "resourceSpans": [
    {
      "resource": { "attributes": [{ "key": "service.name", "value": { "stringValue": "checkout" } }] },
      "scopeSpans": [
        {
          "spans": [
            { "traceId": "4bf92f35", "spanId": "a1", "name": "POST /checkout", "kind": 2, "startTimeUnixNano": "1000" },
            {
              "traceId": "4bf92f35", "spanId": "a2", "parentSpanId": "a1", "name": "POST /charges", "kind": 3, "startTimeUnixNano": "2000",
              "attributes": [{ "key": "http.route", "value": { "stringValue": "/charges" } }]
            },
            {
              "traceId": "4bf92f35", "spanId": "a3", "parentSpanId": "a1", "name": "INSERT orders", "kind": 3, "startTimeUnixNano": "5000",
              "attributes": [
                { "key": "db.system", "value": { "stringValue": "postgresql" } },
                { "key": "db.name", "value": { "stringValue": "orders" } },
                { "key": "db.operation", "value": { "stringValue": "INSERT" } }
              ]
            },
            { "traceId": "77aa0c1e", "spanId": "h1", "name": "GET /healthz", "kind": 2, "startTimeUnixNano": "9000" }
          ]
        }
      ]
    },
    {
      "resource": { "attributes": [{ "key": "service.name", "value": { "stringValue": "payments" } }] },
      "scopeSpans": [
        {
          "spans": [
            {
              "traceId": "4bf92f35", "spanId": "b1", "parentSpanId": "a2", "name": "POST /charges", "kind": 2, "startTimeUnixNano": "2100",
              "attributes": [{ "key": "http.response.status_code", "value": { "intValue": "201" } }]
            }
          ]
        }
      ]
    }
  ]
}
`;

export const LOGS_AND_TRACES: Recipe = {
  name: 'build_from_logs_and_traces',
  material: 'logs and OpenTelemetry traces',
  title: 'Build from logs and traces',
  description:
    'Build scenarios from logs and OpenTelemetry traces, one request each, adding the services and calls they show that the model lacks.',
  read: [
    'Logs the person pastes or names (an application’s, `docker compose logs`, `kubectl logs`, access logs), and traces exported to a file: OTLP JSON (`resourceSpans`), Jaeger or Zipkin JSON. The local program reads no tracing or log service: the person exports, and you read the file.',
    'Group what belongs to one request: a trace by its `traceId`; log lines by a request id or a correlation id, or by time and the person’s say.',
    'Personal data in a line or a span (emails, names, card numbers, addresses, tokens) never goes into a description or data: write "a customer", and leave the value out.',
  ],
  mapping: [
    {
      from: 'A span’s `service.name` resource attribute',
      to: 'a `systems.service`: find it first, since services are usually in the model already, and add it only when it is not',
    },
    {
      from: 'A `CLIENT` span (`kind` 3) and the `SERVER` span (`kind` 2) in another service whose parent it is, or a `PRODUCER` (4) and its `CONSUMER` (5)',
      to: 'a `systems.communicates-with` from the calling service to the called one, with `protocol` from `rpc.system`, `messaging.system`, or HTTP; when the called side is not in the trace, it is named by `server.address` or `peer.service`',
    },
    {
      from: 'A span with `db.system` (`postgresql`, `redis`)',
      to: 'a `systems.database` named by `db.name` or `server.address`, with `engine`; `db.operation` says the relation: `SELECT` or `GET` a `systems.reads-from`, `INSERT`, `UPDATE`, `DELETE` or `SET` a `systems.writes-to`',
    },
    {
      from: 'Spans inside one service (`INTERNAL`, `kind` 1)',
      to: 'no relation: their names can go in the description of the step they are part of',
    },
    {
      from: 'A log line',
      to: 'the relation it crosses, found with find_relations between the services it names; a line that crosses none, or that you cannot place, is asked about',
    },
  ],
  views: [
    'Services the traces add show in every view. Make a view, perspective "Data flow", only when none is there to play the scenario over.',
  ],
  scenarios: [
    'One request, a trace or a request id’s lines, becomes one scenario over the view that shows its services, named for what the request did.',
    'One step per call between services, in the order they start (`startTimeUnixNano`), activating the relation it crosses; calls that overlap in time under the same parent share a step; a call that repeats (retries, a loop) is one step whose description says how many times.',
    'Each step’s description says what happened in a short sentence; dataIn and dataOut take what the span or line shows (`http.route`, `http.response.status_code`, a message’s key), never a personal value. An error (`STATUS_CODE_ERROR`, a 5xx, an `ERROR` line) is said in the description and the dataOut.',
    'With several requests of the same kind, make one scenario of a typical one, and offer the others.',
  ],
  unmatched: [
    'Health checks and readiness probes.',
    'Lines and spans with no call between services in them, and metrics.',
    'A root `SERVER` span’s caller, which the trace does not show: ask who calls it.',
    'Missing spans (sampling) and spans out of order (clocks that differ between services): say the scenario may be incomplete.',
  ],
  example: {
    file: 'traces/checkout.json',
    input: INPUT,
    calls: [
      { tool: 'get_project', why: 'See what the project holds.', args: {} },
      {
        tool: 'find_elements',
        why: 'Look for the checkout service before adding it; here nothing is there yet.',
        args: { nameContains: 'checkout' },
      },
      {
        tool: 'add_to_model',
        why: 'The two services, the database the INSERT span names, and the two calls of trace 4bf92f35, as one action.',
        args: {
          label: 'Add the services and calls of trace 4bf92f35',
          elements: [
            { ref: 'checkout', component: 'systems.service', name: 'checkout' },
            { ref: 'payments', component: 'systems.service', name: 'payments' },
            {
              ref: 'orders',
              component: 'systems.database',
              name: 'orders',
              attributes: { engine: 'postgresql' },
            },
          ],
          relations: [
            {
              ref: 'checkout-calls-payments',
              relationType: 'systems.communicates-with',
              from: 'checkout',
              to: 'payments',
              attributes: { protocol: 'HTTP' },
            },
            {
              ref: 'checkout-writes-orders',
              relationType: 'systems.writes-to',
              from: 'checkout',
              to: 'orders',
            },
          ],
        },
      },
      {
        tool: 'create_view',
        why: 'The project had no view to play the scenario over.',
        args: {
          name: 'Checkout at run time',
          perspective: { name: 'Data flow', description: 'What a checkout calls.' },
        },
        as: 'runtime',
      },
      {
        tool: 'create_scenario_from_steps',
        why: 'The trace, one step per call between services, in the order they start.',
        args: {
          name: 'A checkout',
          description: 'From trace 4bf92f35 in traces/checkout.json.',
          view: '<id of runtime>',
          steps: [
            {
              description: 'The checkout service charges the card with payments.',
              relations: ['<id of checkout-calls-payments>'],
              dataIn: { route: '/charges' },
              dataOut: { status: 201 },
            },
            {
              description: 'The checkout service writes the order to the orders database.',
              relations: ['<id of checkout-writes-orders>'],
              dataIn: { operation: 'INSERT' },
            },
          ],
        },
      },
    ],
    leftOut: [
      { quote: 'GET /healthz', why: 'a health check, not part of the request' },
      {
        quote: '"spanId": "a1"',
        why: 'the root span POST /checkout: the trace does not show who calls the checkout service, so ask',
      },
    ],
  },
};
