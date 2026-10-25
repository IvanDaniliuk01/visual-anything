/** The recipe for docker-compose: services inside their system, depends_on as communicates with. */
import type { Recipe } from './recipe';

const INPUT = `name: shop
services:
  web:
    image: nginx:1.27
    ports:
      - '8080:80'
    depends_on:
      - api
  api:
    build: ./api
    environment:
      DATABASE_URL: postgres://shop:change-me@db:5432/shop
      CACHE_URL: redis://cache:6379
    depends_on:
      - db
      - cache
  worker:
    build: ./worker
    environment:
      DATABASE_URL: postgres://shop:change-me@db:5432/shop
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:16
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD', 'pg_isready', '-U', 'shop']
  cache:
    image: redis:7
volumes:
  db-data:
`;

export const DOCKER_COMPOSE: Recipe = {
  name: 'build_from_docker_compose',
  material: 'docker-compose files',
  title: 'Build from docker-compose',
  description:
    'Build the services a Compose file runs, inside their system, and which service calls which.',
  read: [
    '`compose.yaml` or `docker-compose.yml`, and the files it extends or includes (`docker-compose.override.yml`, `include:`, `extends:`).',
    'For a service built from source (`build:`), read the `FROM` of its Dockerfile, when the material has it, for its technology.',
    '`.env` files only to see which service a variable points to, never for its value.',
  ],
  mapping: [
    {
      from: 'The Compose project (its `name:`, or its folder’s name)',
      to: 'a `systems.system` holding every service through `systems.is-part-of`, unless the person names an element to put them in',
    },
    {
      from: 'A service',
      to: 'an element named as the service is: a `systems.database` for a database image (postgres, mysql, mariadb, mongo, redis, valkey, cassandra, clickhouse), with `engine` from the image’s name; a `systems.object-storage` for minio and other S3 stand-ins; a `systems.service` for the rest, message brokers (rabbitmq, kafka, nats) included. `technology` is the image as written (`postgres:16`), or the Dockerfile’s `FROM`',
    },
    {
      from: '`depends_on`, as a list or as a map with conditions',
      to: 'a `systems.communicates-with` from the service to each service it depends on',
    },
    {
      from: 'An environment variable whose address names another service as its host, such as `postgres://…@db:5432/shop` or `redis://cache:6379`',
      to: 'a `systems.communicates-with` to that service as well (one relation per pair, whatever says it), with `protocol` from the address’s scheme: PostgreSQL, MySQL, Redis, AMQP, HTTP',
    },
    {
      from: '`links` and `external_links`',
      to: 'a `systems.communicates-with`, as `depends_on` is',
    },
    {
      from: '`ports` and `deploy.replicas`',
      to: 'the service’s `ports` attribute, as written (`8080:80`, several joined with ", "), and its `replicas`',
    },
  ],
  views: [
    'One view of what Compose runs, perspective "Deployment", arranged by `systems.is-part-of`.',
  ],
  scenarios: [
    'Compose holds no sequence. Offer a scenario from `docker compose logs` of one request (the logs and traces recipe).',
  ],
  unmatched: [
    'Volumes, named or bound, and networks: offer networks as containers only if the person asks.',
    '`healthcheck`, `restart`, `command`, `entrypoint`, `profiles`, `secrets`, `configs` and `labels`.',
    'Every secret: passwords and tokens in `environment`, and the user and password inside a connection string. Say that you left them out.',
  ],
  example: {
    file: 'docker-compose.yml',
    input: INPUT,
    calls: [
      { tool: 'get_project', why: 'See what the project uses and holds.', args: {} },
      {
        tool: 'list_definitions',
        why: 'Pick the components and relation types.',
        args: { package: 'systems' },
      },
      {
        tool: 'add_to_model',
        why: 'The system, its five services and who calls whom, as one action. depends_on and the addresses in the environment give the same pairs, so each pair is one relation; the password in DATABASE_URL is left out.',
        args: {
          label: 'Import the shop services from docker-compose.yml',
          elements: [
            { ref: 'shop', component: 'systems.system', name: 'shop' },
            {
              ref: 'web',
              component: 'systems.service',
              name: 'web',
              inside: ['shop'],
              attributes: { technology: 'nginx:1.27', ports: '8080:80' },
            },
            { ref: 'api', component: 'systems.service', name: 'api', inside: ['shop'] },
            { ref: 'worker', component: 'systems.service', name: 'worker', inside: ['shop'] },
            {
              ref: 'db',
              component: 'systems.database',
              name: 'db',
              inside: ['shop'],
              attributes: { engine: 'postgres', technology: 'postgres:16' },
            },
            {
              ref: 'cache',
              component: 'systems.database',
              name: 'cache',
              inside: ['shop'],
              attributes: { engine: 'redis', technology: 'redis:7' },
            },
          ],
          relations: [
            { relationType: 'systems.communicates-with', from: 'web', to: 'api' },
            {
              relationType: 'systems.communicates-with',
              from: 'api',
              to: 'db',
              attributes: { protocol: 'PostgreSQL' },
            },
            {
              relationType: 'systems.communicates-with',
              from: 'api',
              to: 'cache',
              attributes: { protocol: 'Redis' },
            },
            {
              relationType: 'systems.communicates-with',
              from: 'worker',
              to: 'db',
              attributes: { protocol: 'PostgreSQL' },
            },
          ],
        },
      },
      {
        tool: 'create_view',
        why: 'A view of what Compose runs.',
        args: {
          name: 'Shop services',
          perspective: {
            name: 'Deployment',
            description: 'What docker-compose runs, and which service calls which.',
          },
          nestingRelationTypes: ['systems.is-part-of'],
        },
      },
    ],
    leftOut: [
      {
        quote: 'db-data:/var/lib/postgresql/data',
        why: 'a volume; ask whether it should become something in the model',
      },
      { quote: 'healthcheck:', why: 'how Compose checks the database, not part of the model' },
      {
        quote: 'shop:change-me',
        why: 'the user and password in DATABASE_URL: secrets are never copied into the project',
      },
    ],
  },
};
