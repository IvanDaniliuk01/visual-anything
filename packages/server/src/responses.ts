/** Responses the local program sends, all carrying the same security headers. */
import { STATUS_CODES, type OutgoingHttpHeaders, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

/** Headers on every response: no content sniffing, and no Referer to other sites. */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
} as const;

/** Adds the security headers to a response that is not written yet. */
export function setSecurityHeaders(response: ServerResponse): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value);
}

/** Answers with a short plain-text message, without a body for HEAD requests. */
export function sendText(
  response: ServerResponse,
  status: number,
  message: string,
  headers: OutgoingHttpHeaders = {},
): void {
  const body = Buffer.from(`${message}\n`, 'utf8');
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    ...headers,
  });
  response.end(response.req.method === 'HEAD' ? undefined : body);
}

/**
 * Refuses a WebSocket upgrade before its handshake completes: writes a plain HTTP response on the raw
 * socket, then destroys the socket once the response is written.
 */
export function refuseUpgrade(socket: Duplex, status: number, message: string): void {
  const body = Buffer.from(`${message}\n`, 'utf8');
  const head = [
    `HTTP/1.1 ${status} ${STATUS_CODES[status] ?? ''}`,
    'Connection: close',
    'Content-Type: text/plain; charset=utf-8',
    `Content-Length: ${body.length}`,
    ...Object.entries(SECURITY_HEADERS).map(([name, value]) => `${name}: ${value}`),
  ].join('\r\n');
  socket.once('finish', () => socket.destroy());
  socket.end(Buffer.concat([Buffer.from(`${head}\r\n\r\n`, 'latin1'), body]));
}
