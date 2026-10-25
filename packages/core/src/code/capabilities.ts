/**
 * Capabilities: what package code may reach beyond its element, as its package declares them and the
 * person approves each (ADR 0054). There are three, and nothing else exists.
 */
import type { Capability } from '@visual-anything/schema';

/** A capability as the sandbox reads it. */
export type ReadCapability =
  | { kind: 'model:read' }
  | { kind: 'time' }
  /** Fetching from this one web origin, through the local program, which checks it. */
  | { kind: 'network'; origin: string };

const ORIGIN = /^(https?):\/\/([a-z0-9.-]+)(?::([0-9]{1,5}))?$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DEFAULT_PORTS: Readonly<Record<string, string>> = { http: '80', https: '443' };

/**
 * A capability as written in a package file: `model:read`, `time`, or `network:` and one web origin
 * written as browsers write origins, in small letters, without a path and without its default port.
 */
export function readCapability(text: unknown): ReadCapability | undefined {
  if (text === 'model:read') return { kind: 'model:read' };
  if (text === 'time') return { kind: 'time' };
  if (typeof text !== 'string' || !text.startsWith('network:')) return undefined;
  const origin = text.slice('network:'.length);
  const match = ORIGIN.exec(origin);
  if (!match) return undefined;
  const [, scheme = '', host = '', port] = match;
  if (host.length > 253 || !host.split('.').every((label) => LABEL.test(label))) return undefined;
  if (port !== undefined) {
    const number = Number(port);
    if (number < 1 || number > 65535 || String(number) !== port) return undefined;
    if (DEFAULT_PORTS[scheme] === port) return undefined;
  }
  return { kind: 'network', origin };
}

/** Whether a text is a capability. */
export function isCapability(text: unknown): text is Capability {
  return readCapability(text) !== undefined;
}

/** Why a text is not a capability; undefined when it is one. */
export function capabilityProblem(text: unknown): string | undefined {
  if (isCapability(text)) return undefined;
  const written = JSON.stringify(text) ?? String(text);
  if (typeof text === 'string' && text.startsWith('network:')) {
    return `${written} is not a capability: write "network:" and one web origin, such as "network:https://status.example.com", with no path and no default port.`;
  }
  return `${written} is not a capability: package code may have "model:read", "time" and "network:" with one web origin.`;
}

/** Capabilities sorted by code units, each once, as package files and approvals keep them. */
export function sortedCapabilities(capabilities: readonly Capability[]): Capability[] {
  return [...new Set(capabilities)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
