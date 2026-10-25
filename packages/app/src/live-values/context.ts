/**
 * The attribute lookup as components read it (ADR 0057): the shell makes one for each moment of the
 * live values and of what package code computed, and every reader of attributes takes it from here.
 */
import { createContext, useContext } from 'react';
import { STORED_ONLY, type AttributeLookup } from './lookup';

/** The lookup of the open project; outside the shell, every attribute reads as stored. */
export const AttributeLookupContext = createContext<AttributeLookup>(STORED_ONLY);

/** The attribute lookup, for components inside the shell. */
export function useAttributeLookup(): AttributeLookup {
  return useContext(AttributeLookupContext);
}
