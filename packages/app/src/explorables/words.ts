/** How the dialogs say what explorables use (ADR 0107). */
import type { Translator } from '../i18n';
import { librarySize, type ExplorableShown } from './explorable';

/** A script library as the dialogs list it: its package, version, license and size. */
export function libraryLine(t: Translator, library: ExplorableShown['libraries'][number]): string {
  const definition = library.definition;
  if (!definition) return t('“{id}”, which its package does not define', { id: library.id });
  const size = librarySize(definition.bytes);
  return t('{npm} {version} · {license} · {size} {unit}', {
    npm: definition.npm,
    version: definition.version,
    license: definition.license ?? t('license not said'),
    size: size.value,
    unit: size.unit,
  });
}
