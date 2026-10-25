import { useState, type ReactNode } from 'react';
import { DefinitionContext, DefinitionStore } from './opened';

/**
 * Gives the panels inside it one store of what the inspector shows in place of the selection: the
 * Components tab and the inspector's entry points open a definition there, and the inspector shows it.
 * It goes inside the editor's context, around the model panel and the inspector.
 */
export function DefinitionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new DefinitionStore());
  return <DefinitionContext.Provider value={store}>{children}</DefinitionContext.Provider>;
}
