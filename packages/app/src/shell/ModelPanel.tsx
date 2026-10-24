import type { Definitions, ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { ModelTab } from './ModelTab';
import { Outline } from './Outline';
import './panel.css';

interface ModelPanelProps {
  project: ProjectSnapshot;
  definitions: Definitions;
  /** The view drawn on the canvas, if any. */
  openViewId: Id | undefined;
}

type Tab = 'outline' | 'model';

const TABS: readonly { tab: Tab; name: string }[] = [
  { tab: 'outline', name: 'Outline' },
  { tab: 'model', name: 'Model' },
];

/**
 * The panel left of the canvas, in two tabs: the outline of the open view, which mirrors what the
 * canvas draws, and the model's contents with the project's views and scenarios. Each tab keeps its
 * rows open or closed while the other one shows.
 */
export function ModelPanel({ project, definitions, openViewId }: ModelPanelProps) {
  const [tab, setTab] = useState<Tab>('outline');
  const heading = useId();
  const ids = { outline: useId(), model: useId() };
  const buttons = useRef(new Map<Tab, HTMLButtonElement>());

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex((each) => each.tab === tab);
    const next =
      event.key === 'ArrowRight'
        ? TABS[(at + 1) % TABS.length]
        : event.key === 'ArrowLeft'
          ? TABS[(at - 1 + TABS.length) % TABS.length]
          : event.key === 'Home'
            ? TABS[0]
            : event.key === 'End'
              ? TABS.at(-1)
              : undefined;
    if (!next) return;
    event.preventDefault();
    setTab(next.tab);
    buttons.current.get(next.tab)?.focus();
  };

  return (
    <aside className="panel model-panel side-panel" aria-labelledby={heading}>
      <h2 id={heading} className="visually-hidden">
        Outline and model
      </h2>
      <div role="tablist" aria-labelledby={heading} className="panel-tabs" onKeyDown={onKeyDown}>
        {TABS.map((each) => (
          <button
            key={each.tab}
            ref={(element) => {
              if (element) buttons.current.set(each.tab, element);
            }}
            type="button"
            role="tab"
            id={`${ids[each.tab]}-tab`}
            aria-selected={tab === each.tab}
            aria-controls={`${ids[each.tab]}-panel`}
            tabIndex={tab === each.tab ? 0 : -1}
            className="panel-tab"
            onClick={() => setTab(each.tab)}
          >
            {each.name}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${ids.outline}-panel`}
        aria-labelledby={`${ids.outline}-tab`}
        hidden={tab !== 'outline'}
        className="panel-tab-content"
      >
        <Outline active={tab === 'outline'} />
      </div>
      <div
        role="tabpanel"
        id={`${ids.model}-panel`}
        aria-labelledby={`${ids.model}-tab`}
        hidden={tab !== 'model'}
        className="panel-tab-content"
      >
        <ModelTab
          active={tab === 'model'}
          project={project}
          definitions={definitions}
          openViewId={openViewId}
        />
      </div>
    </aside>
  );
}
