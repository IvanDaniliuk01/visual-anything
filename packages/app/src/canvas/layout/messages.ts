/** The messages between the app and its layout worker. */
import type { LayoutInput, LayoutProgress, LayoutResult } from './types';

/** Asks the worker for one layout. */
export interface LayoutRequest {
  id: number;
  input: LayoutInput;
}

/** What the worker says about one request: how far it has come, and then its result or failure. */
export type LayoutReply =
  | { id: number; kind: 'progress'; progress: LayoutProgress }
  | { id: number; kind: 'done'; result: LayoutResult }
  | { id: number; kind: 'failed'; message: string };
