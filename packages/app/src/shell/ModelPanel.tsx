import type { Definitions, ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useCallback, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CommentsTab } from '../comments/CommentsTab';
import { useWhenCommentsShown } from '../comments/store';
import { HistoryPanel } from '../history/HistoryPanel';
import { useT } from '../i18n';
import { ComponentsTab } from './ComponentsTab';
import { ModelTab } from './ModelTab';
import { Outline } from './Outline';
import './panel.css';

interface ModelPanelProps {
  project: ProjectSnapshot;
  definitions: Definitions;
  /** The view drawn on the canvas, if any. */
  openViewId: Id | undefined;
}

type Tab = 'outline' | 'model' | 'components' | 'history' | 'comments';

const TABS: readonly { tab: Tab; name: string }[] = [
  { tab: 'outline', name: 'Outline' },
  { tab: 'model', name: 'Model' },
  { tab: 'components', name: 'Components' },
  { tab: 'history', name: 'History' },
  // Threads of comments (ADR 0059).
  { tab: 'comments', name: 'Comments' },
];

/**
 * The panel left of the canvas, in five tabs: the outline of the open view, which mirrors what the
 * canvas draws; the model's contents with the project's views and scenarios; the components,
 * relation types and packages, which open in the component editor; the history, the actions that
 * undo and redo go through; and the threads of comments (ADR 0059). Each tab keeps its rows open or
 * closed while another one shows.
 */
export function ModelPanel({ project, definitions, openViewId }: ModelPanelProps) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('outline');
  const heading = useId();
  const ids = {
    outline: useId(),
    model: useId(),
    components: useId(),
    history: useId(),
    comments: useId(),
  };
  const buttons = useRef(new Map<Tab, HTMLButtonElement>());
  // A pin chosen on the canvas brings the comments tab forward.
  useWhenCommentsShown(useCallback(() => setTab('comments'), []));

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
        {t('Outline and model')}
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
            {t(each.name)}
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
      <div
        role="tabpanel"
        id={`${ids.components}-panel`}
        aria-labelledby={`${ids.components}-tab`}
        hidden={tab !== 'components'}
        className="panel-tab-content"
      >
        <ComponentsTab active={tab === 'components'} />
      </div>
      <div
        role="tabpanel"
        id={`${ids.history}-panel`}
        aria-labelledby={`${ids.history}-tab`}
        hidden={tab !== 'history'}
        className="panel-tab-content"
      >
        <HistoryPanel active={tab === 'history'} />
      </div>
      <div
        role="tabpanel"
        id={`${ids.comments}-panel`}
        aria-labelledby={`${ids.comments}-tab`}
        hidden={tab !== 'comments'}
        className="panel-tab-content"
      >
        <CommentsTab active={tab === 'comments'} />
      </div>
    </aside>
  );
}
