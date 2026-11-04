/**
 * The command that prints a new launch address (ADR 0099):
 *
 *   visual-anything address [folder]
 *
 * It asks the Visual Anything running on the project in the folder, or the only one running when no
 * folder is given, at home too, for a new address that opens the app once, within two minutes, and
 * prints it, as pressing a in that program's terminal does. It reaches the program through the
 * endpoint Claude attaches to (ADR 0029), with the credential of the program's record, so it works
 * where that terminal is out of reach, as in a container:
 * `docker exec visual-anything visual-anything address`. The address carries a launch code, never the
 * session token, and making it ends the one made before. It never starts a program.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { OtherBuildError, ProgramBridge, ProgramUnavailableError } from './claude/bridge';

/** The subcommand that prints a new launch address. */
export const ADDRESS_COMMAND = 'address';

export const ADDRESS_USAGE = `Usage: visual-anything address [folder]

Prints a new address that opens the Visual Anything running on the project in folder, or the only one
running when folder is left out, at home too. The address works once, within two minutes, and ends
the one printed before; it never holds the session token. In a container, run it there:

  docker exec visual-anything visual-anything address

  -h, --help  Show this help.`;

/** What the command touches outside itself. */
export interface AddressEnvironment {
  cwd: string;
  out(line: string): void;
  err(line: string): void;
  /** Where running programs leave their records; without one, no program can be found. */
  runtimeFolder: string | null;
  /** How to reach the program, for tests; a {@link ProgramBridge} that only attaches by default. */
  attach?: (folder: string | undefined) => { launchAddress(): Promise<string>; close(): void };
}

/** Prints a new launch address of a running program; resolves with the exit code. */
export async function runAddress(
  argv: readonly string[],
  environment: AddressEnvironment,
): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: { help: { type: 'boolean', short: 'h' } },
    });
  } catch (error) {
    environment.err(error instanceof Error ? error.message : String(error));
    environment.err(ADDRESS_USAGE);
    return 2;
  }
  if (parsed.values.help === true) {
    environment.out(ADDRESS_USAGE);
    return 0;
  }
  if (parsed.positionals.length > 1) {
    environment.err(`Give at most one project folder, not ${parsed.positionals.length}.`);
    environment.err(ADDRESS_USAGE);
    return 2;
  }
  const given = parsed.positionals[0];
  const folder = given === undefined ? undefined : resolve(environment.cwd, given);
  const { runtimeFolder } = environment;
  if (runtimeFolder === null) {
    environment.err(
      'Visual Anything keeps no runtime folder here, so no running one can be found.',
    );
    return 1;
  }
  const program =
    environment.attach?.(folder) ??
    new ProgramBridge({
      ...(folder === undefined ? {} : { folder }),
      runtime: runtimeFolder,
      attachOnly: true,
    });
  try {
    const address = await program.launchAddress();
    environment.out(
      `Open Visual Anything at this address, which works once, within two minutes: ${address}`,
    );
    return 0;
  } catch (error) {
    if (error instanceof OtherBuildError) {
      environment.err(error.message);
      return 1;
    }
    if (!(error instanceof ProgramUnavailableError)) throw error;
    environment.err(
      folder === undefined
        ? `No address was made: ${error.message}`
        : `No address was made for ${given}: ${error.message}`,
    );
    return 1;
  } finally {
    program.close();
  }
}
