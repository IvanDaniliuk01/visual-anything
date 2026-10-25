import { describe, expect, it } from 'vitest';
import { capabilityProblem, readCapability, sortedCapabilities } from './capabilities';

describe('readCapability', () => {
  it('reads the model, the clock and one web origin', () => {
    expect(readCapability('model:read')).toEqual({ kind: 'model:read' });
    expect(readCapability('time')).toEqual({ kind: 'time' });
    expect(readCapability('network:https://status.example.com')).toEqual({
      kind: 'network',
      origin: 'https://status.example.com',
    });
    expect(readCapability('network:http://127.0.0.1:9090')).toEqual({
      kind: 'network',
      origin: 'http://127.0.0.1:9090',
    });
  });

  it.each([
    ['nothing', ''],
    ['an unknown capability', 'files:read'],
    ['a capability in capitals', 'TIME'],
    ['an origin with a path', 'network:https://example.com/api'],
    ['an origin with a trailing slash', 'network:https://example.com/'],
    ['an origin in capitals', 'network:https://Example.com'],
    ['an origin with its default port', 'network:https://example.com:443'],
    ['an origin with port 0', 'network:https://example.com:0'],
    ['an origin past the last port', 'network:https://example.com:65536'],
    ['an origin with a user', 'network:https://me@example.com'],
    ['an origin of another scheme', 'network:ftp://example.com'],
    ['a label that ends with a hyphen', 'network:https://bad-.example.com'],
    ['an empty label', 'network:https://example..com'],
    ['a label of 64 letters', `network:https://${'a'.repeat(64)}.com`],
    ['a text that is not one', 42],
  ])('refuses %s', (_, text) => {
    expect(readCapability(text)).toBeUndefined();
    expect(capabilityProblem(text)).toMatch(/capabilit/);
  });

  it('says how to write an origin it refuses', () => {
    expect(capabilityProblem('network:https://example.com/api')).toBe(
      '"network:https://example.com/api" is not a capability: write "network:" and one web origin, such as "network:https://status.example.com", with no path and no default port.',
    );
    expect(capabilityProblem('files:read')).toBe(
      '"files:read" is not a capability: package code may have "model:read", "time" and "network:" with one web origin.',
    );
  });
});

describe('sortedCapabilities', () => {
  it('sorts and keeps each once', () => {
    expect(sortedCapabilities(['time', 'model:read', 'time'])).toEqual(['model:read', 'time']);
  });
});
