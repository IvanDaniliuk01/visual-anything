/** The recipe for Terraform: resources by what they run or store, placed in their network. */
import type { Recipe } from './recipe';

const INPUT = `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  tags       = { Name = "shop" }
}

resource "aws_subnet" "private" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}

resource "aws_lambda_function" "checkout" {
  function_name = "checkout"
  runtime       = "nodejs22.x"
  vpc_config {
    subnet_ids = [aws_subnet.private.id]
  }
  environment {
    variables = {
      ORDERS_TABLE = aws_dynamodb_table.orders.name
    }
  }
}

resource "aws_dynamodb_table" "orders" {
  name     = "orders"
  hash_key = "id"
}

resource "aws_cloudwatch_metric_alarm" "checkout_errors" {
  alarm_name = "checkout-errors"
}
`;

export const TERRAFORM: Recipe = {
  name: 'build_from_terraform',
  material: 'Terraform configurations',
  title: 'Build from Terraform',
  description:
    'Build what a Terraform configuration runs and stores, placed in its network, and which resource calls which.',
  read: [
    'Read the `.tf` files of the configuration and of its local modules (`source = "./modules/…"`). For a module from a registry or a repository, read what the person gives you about it, or keep it as one element.',
    'Leave `terraform.tfstate`, `.tfvars` files and `.terraform/` alone unless the person asks: they hold secrets and real ids. Nothing runs here: you read the files, and the local program calls no cloud.',
  ],
  mapping: [
    {
      from: 'A resource that runs code: `aws_lambda_function`, `aws_ecs_service`, `aws_instance`, `google_cloud_run_v2_service`, `azurerm_linux_web_app`',
      to: 'a `systems.service` named by its name argument (`function_name`, a `Name` tag), or else the resource’s own name, with `technology` from its runtime or image',
    },
    {
      from: 'A database: `aws_db_instance`, `aws_rds_cluster`, `aws_dynamodb_table`, `aws_elasticache_cluster`, `google_sql_database_instance`, `azurerm_postgresql_flexible_server`',
      to: 'a `systems.database`, with `engine` ("postgres", "DynamoDB")',
    },
    {
      from: 'Storage: `aws_s3_bucket`, `google_storage_bucket`, `azurerm_storage_container`',
      to: 'a `systems.object-storage`',
    },
    {
      from: 'Queues and topics: `aws_sqs_queue`, `aws_sns_topic`, `google_pubsub_topic`',
      to: 'a `systems.service`, with `technology` ("SQS")',
    },
    {
      from: 'The network: `aws_vpc`, `aws_subnet`, `google_compute_network`, `azurerm_virtual_network`',
      to: 'a `systems.box` holding what runs in it, through a nesting relation type of the project’s own, "runs in" (define_relation_type with `nests: true`, after the person agrees), so that the network’s arrangement is a view of its own and `systems.is-part-of` stays for what the system is made of',
    },
    {
      from: 'A `module "name"`',
      to: 'a `systems.system` holding the resources it makes, through `systems.is-part-of`, or one element when its inside is not in the material',
    },
    {
      from: 'A reference that wires one resource to another: an environment naming a database’s address or table (`aws_dynamodb_table.orders.name`), an event source mapping, a subscription, a policy that lets a function write to a bucket',
      to: 'a relation: `systems.writes-to` or `systems.reads-from` for a data store when the access says which, otherwise `systems.communicates-with`',
    },
    {
      from: '`depends_on`',
      to: 'nothing: it orders creation and says nothing about calls, unless the person wants it as a relation',
    },
    {
      from: '`count` and `for_each`',
      to: 'one element with a `count` attribute (or the keys), unless the person wants each',
    },
    {
      from: 'Resources that configure others: IAM roles and policies, security group rules, DNS records, alarms, a bucket’s versioning',
      to: 'no element: an attribute of what they configure when it matters, and otherwise reported',
    },
  ],
  views: [
    'One view of where things run, perspective "Infrastructure", arranged by the "runs in" nesting relation type; with modules, another arranged by `systems.is-part-of`.',
  ],
  scenarios: [
    'A configuration holds no sequence. Offer a scenario from logs or traces of one request (the logs and traces recipe).',
  ],
  unmatched: [
    'Variables, outputs, locals, providers and backends.',
    'Data sources (`data "…"`), which name things outside the configuration: ask whether to add them.',
    'Provisioners and `local-exec`: they are code, which the project never holds.',
    'IAM, security groups and alarms that configure nothing the model holds.',
  ],
  example: {
    file: 'infra/main.tf',
    input: INPUT,
    calls: [
      { tool: 'get_project', why: 'See what the project uses and holds.', args: {} },
      {
        tool: 'create_package',
        why: 'A package for the nesting relation type the network needs, once the person agreed.',
        args: {
          id: 'infrastructure',
          name: 'Infrastructure',
          description: 'Where things run.',
        },
      },
      {
        tool: 'define_relation_type',
        why: '"runs in" places a resource in its network without changing what it is part of.',
        args: {
          package: 'infrastructure',
          createOnly: true,
          relationType: {
            id: 'infrastructure.runs-in',
            name: 'runs in',
            derivesFrom: 'relates-to',
            description: 'Places a resource in the network it runs in.',
            direction: 'directed',
            nests: true,
          },
        },
      },
      {
        tool: 'add_to_model',
        why: 'The function runs in the private subnet of the shop’s network; the table sits outside it. Its environment names the table, which says it uses it but not whether it reads or writes, so the relation is communicates with.',
        args: {
          label: 'Import the shop infrastructure from infra/main.tf',
          elements: [
            {
              ref: 'vpc',
              component: 'systems.box',
              name: 'shop',
              attributes: { technology: 'AWS VPC', cidr: '10.0.0.0/16' },
            },
            {
              ref: 'subnet',
              component: 'systems.box',
              name: 'private',
              inside: ['vpc'],
              nestingRelationType: 'infrastructure.runs-in',
              attributes: { technology: 'AWS subnet', cidr: '10.0.1.0/24' },
            },
            {
              ref: 'checkout',
              component: 'systems.service',
              name: 'checkout',
              inside: ['subnet'],
              nestingRelationType: 'infrastructure.runs-in',
              attributes: { technology: 'AWS Lambda, nodejs22.x' },
            },
            {
              ref: 'orders',
              component: 'systems.database',
              name: 'orders',
              attributes: { engine: 'DynamoDB' },
            },
          ],
          relations: [
            { relationType: 'systems.communicates-with', from: 'checkout', to: 'orders' },
          ],
        },
      },
      {
        tool: 'create_view',
        why: 'A view of where things run.',
        args: {
          name: 'Shop infrastructure',
          perspective: { name: 'Infrastructure', description: 'Where the shop runs on AWS.' },
          nestingRelationTypes: ['infrastructure.runs-in'],
        },
      },
    ],
    leftOut: [
      {
        quote: 'resource "aws_cloudwatch_metric_alarm" "checkout_errors"',
        why: 'an alarm configures what it watches: offer it as an attribute of the checkout function',
      },
    ],
  },
};
