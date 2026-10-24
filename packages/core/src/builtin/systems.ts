/**
 * The built-in "Systems" package: the components and relation types for modelling the systems you
 * run, from the people who use them to the services and data stores they are made of.
 */
import type { PackageFile } from '@visual-anything/schema';

const OWNER = { name: 'owner', type: 'string', description: 'The team that runs it.' } as const;
const TECHNOLOGY = {
  name: 'technology',
  type: 'string',
  description: 'What it is built with, such as "Node.js" or "PostgreSQL".',
} as const;

export const SYSTEMS: PackageFile = {
  id: 'systems',
  name: 'Systems',
  description:
    'People, systems, services and data stores, and how they communicate, read, write and nest.',
  components: [
    {
      id: 'systems.box',
      name: 'Box',
      derivesFrom: 'essence',
      description: 'Any part of a system that has no more specific component.',
      attributes: [OWNER],
      appearance: { shape: 'rounded-rectangle', fill: '#FFFFFF', stroke: '#52606D' },
    },
    {
      id: 'systems.system',
      name: 'System',
      derivesFrom: 'systems.box',
      description: 'A set of services and data stores that work together.',
      appearance: { fill: '#F3F5F8', stroke: '#5B6675' },
    },
    {
      id: 'systems.service',
      name: 'Service',
      derivesFrom: 'systems.box',
      description: 'A running program that others call.',
      attributes: [TECHNOLOGY],
      appearance: { fill: '#DCEBFF', stroke: '#1D4F91', width: 180, height: 72 },
    },
    {
      id: 'systems.chat-channel',
      name: 'Chat channel',
      derivesFrom: 'systems.service',
      description: 'A service through which people talk to a system, such as WhatsApp or Slack.',
      attributes: [{ name: 'provider', type: 'string', description: 'Who provides the channel.' }],
      appearance: { fill: '#D8F3E3', stroke: '#1E6B43' },
    },
    {
      id: 'systems.ai-agent',
      name: 'AI agent',
      derivesFrom: 'systems.service',
      description: 'A service that reasons with a language model and calls other services.',
      attributes: [{ name: 'model', type: 'string', description: 'The language model it uses.' }],
      appearance: { fill: '#EDE4FF', stroke: '#5B3A9E' },
    },
    {
      id: 'systems.mcp-server',
      name: 'MCP server',
      derivesFrom: 'systems.service',
      description:
        'A service that gives AI agents tools and data through the Model Context Protocol.',
      attributes: [
        {
          name: 'transport',
          type: 'string',
          description: 'How clients reach it: "stdio" or "http".',
        },
      ],
      appearance: { fill: '#DFF3F1', stroke: '#0E6B61' },
    },
    {
      id: 'systems.semantic-layer',
      name: 'Semantic layer',
      derivesFrom: 'systems.service',
      description:
        'A service that defines business metrics once and answers queries in their terms.',
      appearance: { fill: '#FBE3EC', stroke: '#8A1F4C' },
    },
    {
      id: 'systems.database',
      name: 'Database',
      derivesFrom: 'systems.box',
      description: 'A store of structured data.',
      attributes: [
        { name: 'engine', type: 'string', description: 'Such as "postgres" or "mysql".' },
      ],
      appearance: { shape: 'cylinder', fill: '#FFF3C9', stroke: '#7A5C00', width: 180, height: 80 },
    },
    {
      id: 'systems.object-storage',
      name: 'Object storage',
      derivesFrom: 'systems.box',
      description: 'A store of files and blobs, such as S3 buckets.',
      appearance: { shape: 'cylinder', fill: '#E7EAF6', stroke: '#2E3A87', width: 180, height: 80 },
    },
    {
      id: 'systems.person',
      name: 'Person',
      derivesFrom: 'essence',
      description: 'Someone who uses or runs a system.',
      attributes: [
        { name: 'role', type: 'string', description: 'What they do, such as "patient".' },
      ],
      appearance: { shape: 'person', fill: '#FDE8CC', stroke: '#8A5A12', width: 140, height: 80 },
    },
  ],
  relationTypes: [
    {
      id: 'systems.communicates-with',
      name: 'communicates with',
      derivesFrom: 'relates-to',
      description: 'Sends requests or messages to another element.',
      direction: 'directed',
      attributes: [
        { name: 'protocol', type: 'string', description: 'Such as "HTTPS", "gRPC" or "AMQP".' },
      ],
      appearance: { stroke: '#3D4651', width: 2 },
    },
    {
      id: 'systems.reads-from',
      name: 'reads from',
      derivesFrom: 'relates-to',
      description: 'Reads data that another element stores.',
      direction: 'directed',
      appearance: { stroke: '#3D4651', width: 2, dash: 'dashed' },
      limits: { to: ['systems.database', 'systems.object-storage'] },
    },
    {
      id: 'systems.queries',
      name: 'queries',
      derivesFrom: 'systems.reads-from',
      description: 'Asks a database or a semantic layer for data with a query.',
      appearance: { dash: 'dotted' },
      limits: { to: ['systems.database', 'systems.semantic-layer'] },
    },
    {
      id: 'systems.writes-to',
      name: 'writes to',
      derivesFrom: 'relates-to',
      description: 'Changes data that another element stores.',
      direction: 'directed',
      appearance: { stroke: '#3D4651', width: 2 },
      limits: { to: ['systems.database', 'systems.object-storage'] },
    },
    {
      id: 'systems.loads-into',
      name: 'loads into',
      derivesFrom: 'systems.writes-to',
      description: 'Moves data in bulk into another store, as a pipeline or an import does.',
      appearance: { width: 3 },
    },
    {
      id: 'systems.is-part-of',
      name: 'is part of',
      derivesFrom: 'relates-to',
      description: 'Places one element inside another.',
      direction: 'directed',
      nests: true,
    },
  ],
};
