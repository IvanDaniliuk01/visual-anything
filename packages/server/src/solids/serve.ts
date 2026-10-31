/**
 * Serving a solid's file to an app (ADR 0075): `solid/get` names a file by its hash, and the program
 * answers with its bytes in pieces of at most 1 MiB in base64 (`solid/piece`), or with why it cannot
 * (`solid/refused`). Solids add no HTTP route: bytes travel over the live connection only.
 *
 * The file is `solids/<hash>.glb` in the project folder, read as a regular file within the cap on a
 * cleaned file (`files.ts`). It is served only when its bytes are its name's and, the first time it
 * is read, when the core's strict reader takes it as the canonical form, in the cleaner's worker; a
 * file that fails either is never served and warns `solid-not-clean`. A canonical file whose
 * definition says another description is served as it is, and warns too. The session's
 * `SolidStore.serve` does all of it (`store.ts`), so that the checks are worked out once a file.
 */
export { SOLIDS_FOLDER, solidFileName, solidFilePath } from './files';
