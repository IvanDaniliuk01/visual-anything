/**
 * Exporters packages add (ADR 0089), as Export… offers its own formats: the package's code writes
 * the open view, or the model, as a text, which the browser saves under the project's and the view's
 * name with the extension the package declares, as every export is saved. The code never writes a
 * file; it answers a text of at most 4 Mi characters, which the core checked.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { useMemo } from 'react';
import type { PackageCalls } from '../code/client';
import { useCode, usePackageCalls } from '../code/context';
import { exportFileName } from '../export/exports';
import type { FileExport } from '../export/formats';
import { offeredExporters, offeredKey, type OfferedExporter } from './offered';

/** The name a package's export is saved under: the project's and the view's, and its extension. */
export function packageExportFileName(project: string, view: string, extension: string): string {
  const named = exportFileName(project, view, 'md');
  return `${named.slice(0, -'.md'.length)}${extension}`;
}

/** One exporter of a package, as a format of Export…. */
export function packageFileExport(calls: PackageCalls, offered: OfferedExporter): FileExport {
  const { package: pkg, declared } = offered;
  return {
    id: offeredKey(offered),
    // Its label is in the package's own words, as the package's file gives it.
    name: () => declared.label,
    hint: (t) =>
      t('Written by the package “{name}”, as a {extension} file', {
        name: pkg.name,
        extension: declared.extension,
      }),
    extension: declared.extension.slice(1),
    // Made when saved: its code runs then, for up to 2 s, and the person can stop waiting.
    slow: true,
    unavailable: () => undefined,
    leavesOut: (_context, t) => [
      t(
        'What the file holds is what the package’s code writes: Visual Anything does not check it.',
      ),
    ],
    make: async ({ project, view }, signal) => {
      const asked = calls.writeFileWithPackage(pkg.id, { exporter: declared.id, view: view.id });
      const answer = await (signal === undefined ? asked : untilStopped(asked, signal));
      // Failed, it says why, naming the package, through the dialog's own words for a failure.
      if (!answer.ok) throw new Error(answer.problem.message);
      return {
        blob: new Blob([answer.value], { type: 'text/plain;charset=utf-8' }),
        fileName: packageExportFileName(project.project.name, view.name, declared.extension),
        lost: [],
      };
    },
  };
}

/** A promise that rejects with the signal's reason once it is aborted, as the dialog's stop does. */
function untilStopped<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason as Error);
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(signal.reason as Error);
    signal.addEventListener('abort', stop, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', stop);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', stop);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

const NONE: readonly FileExport[] = [];

/**
 * The exporters packages offer for a project, as formats of Export…: none where package code cannot
 * be called, as outside the shell.
 */
export function usePackageFileExports(project: ProjectSnapshot | undefined): readonly FileExport[] {
  const calls = usePackageCalls();
  const packages = useCode()?.packages;
  return useMemo(
    () =>
      calls && packages && project
        ? offeredExporters(project, packages).map((each) => packageFileExport(calls, each))
        : NONE,
    [calls, packages, project],
  );
}
