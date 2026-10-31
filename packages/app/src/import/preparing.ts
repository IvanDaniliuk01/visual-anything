/**
 * Preparing a glTF file as a solid (ADR 0075), which Import… and Replace share: the file is sent to
 * the local program, which cleans it in the unit and with the up axis chosen, simplified when asked,
 * and holds what it made; another choice prepares it again. Nothing in the project changes.
 */
import type { SolidImportOptions, SolidPreparedMessage } from '@visual-anything/core';
import { useEffect, useState } from 'react';
import type { LiveResult } from '../live/connection';
import { MOST_SOLID_INPUT, type SolidUnit } from '../shell/definitions/solidCommands';

/** Asks the local program to clean a file as a solid, as the live connection does. */
export type PrepareSolid = (
  fileName: string,
  bytes: Uint8Array,
  options?: SolidImportOptions,
) => Promise<LiveResult<SolidPreparedMessage>>;

/** How a file is read: its unit, its up axis, and whether it is simplified to fit. */
export interface PreparingChoices {
  units: SolidUnit;
  up: 'y' | 'z';
  simplify: boolean;
}

export const FIRST_CHOICES: PreparingChoices = { units: 'm', up: 'y', simplify: false };

/** What preparing a file came to so far. */
export type Preparing =
  | { state: 'preparing' }
  | { state: 'prepared'; prepared: SolidPreparedMessage }
  | { state: 'refused'; problems: string[]; simplifiable: boolean };

/** Whether the program's refusal is one simplifying could take away: past the cap on triangles. */
export function simplifiable(problems: readonly { code: string; message: string }[]): boolean {
  return problems.some(
    (each) => each.code === 'solid-too-large' && each.message.includes('simplify it to fit'),
  );
}

/** What the program answers for a file read with these choices; another choice prepares it again. */
export function usePreparing(
  file: File,
  prepareSolid: PrepareSolid,
  choices: PreparingChoices,
): Preparing {
  const { units, up, simplify } = choices;
  const asked = `${units} ${up} ${simplify}`;
  const [answered, setAnswered] = useState<{ asked: string; preparing: Preparing }>();
  const tooLarge = file.size > MOST_SOLID_INPUT;

  useEffect(() => {
    if (tooLarge) return;
    let gone = false;
    const options: SolidImportOptions = {
      ...(units === 'm' ? {} : { units }),
      ...(up === 'y' ? {} : { up }),
      ...(simplify ? { simplify } : {}),
    };
    const key = `${units} ${up} ${simplify}`;
    const answer = (preparing: Preparing) => {
      if (!gone) setAnswered({ asked: key, preparing });
    };
    void file
      .arrayBuffer()
      .then((buffer) => prepareSolid(file.name, new Uint8Array(buffer), options))
      .then(
        (result) =>
          answer(
            result.ok
              ? { state: 'prepared', prepared: result.answer }
              : {
                  state: 'refused',
                  problems: result.problems.map((each) => each.message),
                  simplifiable: simplifiable(result.problems),
                },
          ),
        (error: unknown) =>
          answer({
            state: 'refused',
            problems: [error instanceof Error ? error.message : String(error)],
            simplifiable: false,
          }),
      );
    return () => {
      gone = true;
    };
  }, [file, prepareSolid, units, up, simplify, tooLarge]);

  if (tooLarge) {
    return {
      state: 'refused',
      problems: ['The file is over 256 MiB, the most cleaning reads.'],
      simplifiable: false,
    };
  }
  return answered === undefined || answered.asked !== asked
    ? { state: 'preparing' }
    : answered.preparing;
}
