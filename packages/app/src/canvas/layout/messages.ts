/** The messages between the app and its layout worker. */
import type { LayoutInput, LayoutResult } from './types';

/** Asks the worker for one layout. */
export interface LayoutRequest {
  id: number;
  input: LayoutInput;
}

/** The worker's answer to one request. */
export type LayoutReply =
  { id: number; ok: true; result: LayoutResult } | { id: number; ok: false; message: string };
