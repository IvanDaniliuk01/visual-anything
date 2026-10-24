/**
 * The live connection between the local program and the app: a WebSocket that carries the open project
 * and every change to it. Only a page holding the session token can open it.
 */
import type { ProjectSnapshot } from './snapshot';

/** The version of the live protocol; the app and the local program must agree on it. */
export const PROTOCOL_VERSION = 1;

/** The path of the live connection. */
export const LIVE_PATH = '/live';

/**
 * The name the session token travels under: in the fragment of the URL the local program opens, and in
 * the query of the live connection.
 */
export const TOKEN_PARAM = 'token';

/** A message the local program sends to the app. */
export type ServerMessage = ProjectOpenedMessage;

/** Sent when the live connection opens: the project as read from its files. */
export interface ProjectOpenedMessage {
  type: 'project/opened';
  protocolVersion: typeof PROTOCOL_VERSION;
  project: ProjectSnapshot;
}

/** Thrown for a message the live protocol does not define. */
export class ProtocolError extends Error {
  override name = 'ProtocolError';
}

/** Writes a message for the live connection. */
export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

/**
 * Reads a message the local program sent. Only the envelope is checked: the local program validated
 * the project files when it opened them.
 */
export function decodeServerMessage(text: string): ServerMessage {
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    throw new ProtocolError('The message is not JSON.');
  }
  if (!isRecord(message)) throw new ProtocolError('The message is not a JSON object.');
  if (message.type !== 'project/opened') {
    throw new ProtocolError(`Unknown message type: ${JSON.stringify(message.type)}.`);
  }
  if (message.protocolVersion !== PROTOCOL_VERSION) {
    throw new ProtocolError(
      `Protocol version ${JSON.stringify(message.protocolVersion)} is not ${PROTOCOL_VERSION}.`,
    );
  }
  if (!isRecord(message.project)) throw new ProtocolError('The message has no project.');
  return message as unknown as ProjectOpenedMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
