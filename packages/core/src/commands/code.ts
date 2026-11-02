/**
 * Writing a package's code and the capabilities it declares (ADR 0054). Storing code runs nothing:
 * the code runs only once the person approves it by its hash, which any change here changes.
 */
import type { Capability, PackageExtensions, PackageFile } from '@visual-anything/schema';
import { capabilityProblem, sortedCapabilities } from '../code/capabilities';
import { checkedExtensions } from '../code/extensions';
import { CODE_LIMITS } from '../code/limits';
import type { PackageProperties } from '../operations';
import { reject, type Draft } from './draft';
import type { SetPackageCodeCommand } from './types';

export function setPackageCode(draft: Draft, command: SetPackageCodeCommand): string {
  const file = draft.ownPackage(command.package);
  if (
    command.code === undefined &&
    command.capabilities === undefined &&
    command.extensions === undefined
  ) {
    reject(
      'invalid-command',
      'set-package-code needs the code, the capabilities, what the code adds, or some of them.',
    );
  }
  const code =
    command.code === undefined
      ? file.code
      : command.code === null
        ? undefined
        : linesOf(command.code, file);
  let capabilities: Capability[] | undefined =
    command.capabilities === undefined
      ? file.capabilities
      : command.capabilities === null
        ? undefined
        : checkedCapabilities(command.capabilities);
  if (code === undefined) {
    if (
      command.capabilities !== undefined &&
      capabilities !== undefined &&
      capabilities.length > 0
    ) {
      reject('invalid-code', `The package "${file.name}" has no code to give capabilities to.`, [
        file.id,
      ]);
    }
    // Capabilities go with the code they were declared for.
    capabilities = undefined;
  }
  if (capabilities !== undefined && capabilities.length === 0) capabilities = undefined;
  // What the code adds to the app goes with the code, as its capabilities do (ADR 0089).
  let extensions: PackageExtensions | undefined =
    command.extensions === undefined
      ? file.extensions
      : command.extensions === null
        ? undefined
        : checkedPackageExtensions(command.extensions, file);
  if (code === undefined) {
    if (command.extensions !== undefined && extensions !== undefined) {
      reject('invalid-code', `The package "${file.name}" has no code to add anything to the app.`, [
        file.id,
      ]);
    }
    extensions = undefined;
  }

  // The package's own properties, with the code and the capabilities as they are to be.
  const properties: Partial<PackageFile> = { ...file };
  delete properties.components;
  delete properties.relationTypes;
  delete properties.images;
  delete properties.code;
  delete properties.capabilities;
  delete properties.extensions;
  const next: PackageProperties = {
    ...(properties as PackageProperties),
    ...(code === undefined ? {} : { code }),
    ...(capabilities === undefined ? {} : { capabilities }),
    ...(extensions === undefined ? {} : { extensions }),
  };
  const sameCode = sameLines(file.code, code);
  const sameCapabilities = sameLines(file.capabilities, capabilities);
  const sameExtensions = JSON.stringify(file.extensions) === JSON.stringify(extensions);
  if (!sameCode || !sameCapabilities || !sameExtensions) {
    draft.apply({ op: 'set-package', package: file.id, properties: next });
  }
  const name = JSON.stringify(file.name);
  if (code === undefined) return `Remove the code of the package ${name}`;
  if (file.code === undefined) return `Add code to the package ${name}`;
  if (sameCode && !sameCapabilities) return `Change what the code of the package ${name} may reach`;
  if (sameCode && !sameExtensions) return `Change what the code of the package ${name} adds`;
  return `Change the code of the package ${name}`;
}

/** The code's lines, checked: one text split at its line endings, or a list of lines. */
function linesOf(code: unknown, file: PackageFile): string[] {
  let lines: string[];
  if (typeof code === 'string') {
    lines = code.split(/\r\n|\r|\n/);
    // A text that ends its last line keeps no empty line after it.
    if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  } else if (Array.isArray(code) && code.every((line) => typeof line === 'string')) {
    lines = [...code];
    const broken = lines.findIndex((line) => /[\r\n]/.test(line));
    if (broken !== -1) {
      reject(
        'invalid-code',
        `Line ${broken + 1} of the code holds a line break; give each line as its own text.`,
        [file.id],
      );
    }
  } else {
    reject(
      'invalid-code',
      "A package's code is JavaScript text, or its lines as a list of texts.",
      [file.id],
    );
  }
  if (lines.every((line) => line.trim() === '')) {
    reject('invalid-code', 'The code has nothing in it; to remove it, set it to null.', [file.id]);
  }
  const length = lines.reduce((sum, line) => sum + line.length, 0) + lines.length - 1;
  if (length > CODE_LIMITS.codeText) {
    reject(
      'invalid-code',
      `The code of the package "${file.name}" would be over 256 KiB; keep it under that.`,
      [file.id],
    );
  }
  if (lines.length > CODE_LIMITS.lines) {
    reject('invalid-code', `The code holds more than ${CODE_LIMITS.lines} lines.`, [file.id]);
  }
  const long = lines.findIndex((line) => line.length > CODE_LIMITS.lineLength);
  if (long !== -1) {
    reject(
      'invalid-code',
      `Line ${long + 1} of the code is over ${CODE_LIMITS.lineLength} characters.`,
      [file.id],
    );
  }
  return lines;
}

function checkedCapabilities(capabilities: unknown): Capability[] {
  if (!Array.isArray(capabilities)) {
    reject('invalid-command', 'The capabilities are a list, such as ["model:read", "time"].');
  }
  for (const each of capabilities as unknown[]) {
    const problem = capabilityProblem(each);
    if (problem !== undefined) reject('invalid-command', problem);
  }
  const sorted = sortedCapabilities(capabilities as Capability[]);
  if (sorted.length > CODE_LIMITS.capabilities) {
    reject(
      'invalid-command',
      `Package code declares at most ${CODE_LIMITS.capabilities} capabilities.`,
    );
  }
  return sorted;
}

function checkedPackageExtensions(
  value: unknown,
  file: PackageFile,
): PackageExtensions | undefined {
  const checked = checkedExtensions(value);
  if (!checked.ok) reject('invalid-code', checked.reason, [file.id]);
  return checked.extensions;
}

function sameLines(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((line, at) => line === b[at]);
}
