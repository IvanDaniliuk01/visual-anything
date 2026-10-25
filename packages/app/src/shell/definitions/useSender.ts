import type { Command } from '@visual-anything/core';
import { useState } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { perform } from '../inspector/send';
import { refusalOf } from './commands';

/** Sends the component editor's commands, and says inline why one cannot be done. */
export interface Sender {
  /**
   * Runs a command on the app's own copy of the project first: when the core refuses it, nothing is
   * sent and `problem` says why; otherwise it is sent to the local program, whose answer decides.
   * Resolves to whether it was done.
   */
  send: (command: Command) => Promise<boolean>;
  /** Why the last command could not be done; `undefined` once one is accepted. */
  problem: string | undefined;
  /** Says why something cannot be done, without sending anything; `undefined` stops saying it. */
  refuse: (message: string | undefined) => void;
}

export function useSender(): Sender {
  const { project, send } = useEditor();
  const [problem, setProblem] = useState<string>();
  return {
    problem,
    refuse: setProblem,
    send: async (command) => {
      const refusal = refusalOf(project, command);
      if (refusal) {
        setProblem(refusal.message);
        return false;
      }
      setProblem(undefined);
      return perform(send, command);
    },
  };
}
