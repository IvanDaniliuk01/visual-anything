import type { Command, PreferenceChanges, Preferences } from '@visual-anything/core';
import { createContext, useContext } from 'react';
import type { CommandResult, LiveState, NoticeLevel } from './connection';

/** How the local program answered a change of preferences: what it holds now, or why it refused. */
export type PreferencesAnswer =
  | { ok: true; preferences: Preferences }
  | { ok: false; problems: readonly { code?: string; message: string }[] };

/** The live session as components see it: its state, and what they can ask of the local program. */
export interface Live extends LiveState {
  /**
   * Sends a command to the local program, which owns the model. Resolves once it has answered: with
   * what the action created and the rules it broke that only warn, or with the problems that stopped
   * it. The project already shows the change when the promise resolves.
   */
  send: (command: Command) => Promise<CommandResult>;
  /** Undoes the newest action, whoever did it. A refusal is also shown as a notice. */
  undo: () => Promise<CommandResult>;
  /** Redoes the newest undone action. A refusal is also shown as a notice. */
  redo: () => Promise<CommandResult>;
  /** Shows a notice, such as the problems of a command that was refused. */
  notify: (level: NoticeLevel, message: string) => void;
  /** Stops showing a notice. */
  dismiss: (id: number) => void;
  /** Stops showing Claude's guidance in this tab; absent where there is no live session to clear. */
  clearGuidance?: () => void;
  /**
   * Asks the local program to change some of the person's preferences; absent where there is no live
   * session to carry them, as in tests that give components a session of their own.
   */
  setPreferences?: (changes: PreferenceChanges) => Promise<PreferencesAnswer>;
}

/**
 * The live session; null outside a `LiveProvider`. Tests can give components a session of their own
 * through it.
 */
export const LiveContext = createContext<Live | null>(null);

/** The live session, for components inside a `LiveProvider`. */
export function useLive(): Live {
  const live = useContext(LiveContext);
  if (live === null) throw new Error('useLive() is only available inside a LiveProvider.');
  return live;
}
