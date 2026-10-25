/**
 * The built-in "C4 architecture" starter package (R38): the people and software systems of the C4
 * model, the containers and components a system is made of, and the deployment nodes it runs in.
 * Structure nests by "is part of" and deployment by "runs in", so that each view chooses which it
 * shows (ADR 0007). Its icons are drawn for Visual Anything (ADR 0047).
 *
 * Once projects use these ids, they change only by additions: built-in packages have no versions yet
 * (ADR 0018).
 */
import type { PackageFile } from '@visual-anything/schema';
import { OWN_CREDITS } from './credits';
import {
  COMPONENT_ICON,
  CONTAINER_ICON,
  DEPLOYMENT_NODE_ICON,
  SOFTWARE_SYSTEM_ICON,
} from './icons';

const EXTERNAL = {
  name: 'external',
  type: 'boolean',
  description: 'Whether it lies outside the organization whose systems are modeled.',
} as const;

const TECHNOLOGY = {
  name: 'technology',
  type: 'string',
  description: 'What it is built with, such as "Java and Spring Boot" or "PostgreSQL".',
} as const;

const EXTERNAL_BADGE = { when: 'attribute', text: 'EXT', attribute: 'external' } as const;

export const C4: PackageFile = {
  id: 'c4',
  name: 'C4 architecture',
  description:
    'People, software systems, containers, components and deployment nodes, as the C4 model draws software architecture.',
  ...OWN_CREDITS,
  components: [
    {
      id: 'c4.person',
      name: 'Person',
      derivesFrom: 'essence',
      description: 'Someone who uses the software systems, such as a customer or an operator.',
      attributes: [EXTERNAL],
      appearance: {
        shape: 'person',
        fill: '#DCE8F7',
        stroke: '#0B3D7A',
        width: 160,
        height: 96,
        detail: { badges: [EXTERNAL_BADGE] },
      },
    },
    {
      id: 'c4.software-system',
      name: 'Software system',
      derivesFrom: 'essence',
      description:
        'Something that delivers value to its users as a whole, made of containers; the highest level of the C4 model.',
      attributes: [EXTERNAL],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#D3E4F8',
        stroke: '#114A8B',
        width: 208,
        height: 88,
        detail: { badges: [EXTERNAL_BADGE] },
        image: { image: SOFTWARE_SYSTEM_ICON.id },
      },
    },
    {
      id: 'c4.container',
      name: 'Container',
      derivesFrom: 'essence',
      description:
        'Something that runs on its own and holds code or data, such as a web application, a mobile app or a database.',
      attributes: [TECHNOLOGY],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#E3EEFB',
        stroke: '#1C5DA6',
        width: 192,
        height: 80,
        detail: { attributes: ['technology'] },
        image: { image: CONTAINER_ICON.id },
      },
    },
    {
      id: 'c4.component',
      name: 'Component',
      derivesFrom: 'essence',
      description: 'A group of related functionality behind an interface, inside a container.',
      attributes: [TECHNOLOGY],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#EFF5FD',
        stroke: '#2F6DB5',
        width: 176,
        height: 72,
        detail: { attributes: ['technology'] },
        image: { image: COMPONENT_ICON.id },
      },
    },
    {
      id: 'c4.deployment-node',
      name: 'Deployment node',
      derivesFrom: 'essence',
      description:
        'Where software runs, such as a server, a device, a cluster or a whole data center.',
      attributes: [TECHNOLOGY],
      appearance: {
        shape: 'rectangle',
        fill: '#F3F5F7',
        stroke: '#4A5A6A',
        width: 240,
        height: 160,
        detail: { attributes: ['technology'] },
        image: { image: DEPLOYMENT_NODE_ICON.id },
      },
    },
  ],
  relationTypes: [
    {
      id: 'c4.uses',
      name: 'uses',
      derivesFrom: 'relates-to',
      description:
        'Depends on another element to do its work, such as calling its API or reading its data.',
      direction: 'directed',
      attributes: [
        {
          name: 'technology',
          type: 'string',
          description: 'How, such as "JSON over HTTPS" or "SQL".',
        },
      ],
      appearance: { stroke: '#3D4651', width: 2, dash: 'dashed' },
    },
    {
      id: 'c4.runs-in',
      name: 'runs in',
      derivesFrom: 'relates-to',
      description:
        'Places a software system, a container or a deployment node in the deployment node it runs in.',
      direction: 'directed',
      nests: true,
      limits: {
        from: ['c4.software-system', 'c4.container', 'c4.deployment-node'],
        to: ['c4.deployment-node'],
      },
    },
    {
      id: 'c4.delivers-to',
      name: 'delivers to',
      derivesFrom: 'relates-to',
      description: 'Sends something to a person, such as an e-mail or a page to read.',
      direction: 'directed',
      attributes: [
        { name: 'technology', type: 'string', description: 'How, such as "SMTP" or "HTTPS".' },
      ],
      appearance: { stroke: '#3D4651', width: 2, dash: 'dotted' },
      limits: { to: ['c4.person'] },
    },
    {
      id: 'c4.is-part-of',
      name: 'is part of',
      derivesFrom: 'relates-to',
      description: 'Places a container in its software system, or a component in its container.',
      direction: 'directed',
      nests: true,
      limits: {
        from: ['c4.container', 'c4.component'],
        to: ['c4.software-system', 'c4.container'],
      },
    },
  ],
  images: [SOFTWARE_SYSTEM_ICON, CONTAINER_ICON, COMPONENT_ICON, DEPLOYMENT_NODE_ICON],
};
