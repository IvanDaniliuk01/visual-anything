import type { Command } from '@visual-anything/core';
import { useState } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
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
  /**
   * Why the last command could not be done, in the language read in; `undefined` once one is
   * accepted.
   */
  problem: string | undefined;
  /**
   * Says why something cannot be done, without sending anything, in English or already translated;
   * `undefined` stops saying it.
   */
  refuse: (message: string | undefined) => void;
}

export function useSender(): Sender {
  const t = useT();
  const { project, send } = useEditor();
  const [problem, setProblem] = useState<string>();
  return {
    // The core's reasons, and the app's own, are kept in English and read in the language shown.
    problem: problem === undefined ? undefined : t.message(problem),
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
