/**
 * The canvas's solid client (ADR 0075), made from the live connection: one for each connection, kept
 * for the session, since the pictures it keeps are the session's. Making it starts nothing: the solid
 * worker starts once the open view first draws a solid. Importing the client is what makes the app's
 * build emit the solid worker, as a script of its own.
 */
import { useContext, type ContextType } from 'react';
import { LiveContext } from '../../live/context';
import { createSolidClient, solidFilesOver, type SolidClient } from '../../solids/client';

type GetSolidFile = NonNullable<ContextType<typeof LiveContext>>['getSolidFile'];

const clients = new WeakMap<NonNullable<GetSolidFile>, SolidClient>();

/** The solid client of the connection that gets files this way, made the first time it is asked for. */
export function solidClientOver(getSolidFile: NonNullable<GetSolidFile>): SolidClient {
  let client = clients.get(getSolidFile);
  if (!client) {
    client = createSolidClient({ files: solidFilesOver({ getSolidFile }) });
    clients.set(getSolidFile, client);
  }
  return client;
}

/** The solid client of the live session; none outside one, where every solid draws its placeholder. */
export function useSolidClient(): SolidClient | undefined {
  const getSolidFile = useContext(LiveContext)?.getSolidFile;
  return getSolidFile ? solidClientOver(getSolidFile) : undefined;
}
