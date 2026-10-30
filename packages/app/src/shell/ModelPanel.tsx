import type { Definitions, ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useCallback, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useShownComparison } from '../canvas/comparison/mode';
import { ChangesTab } from '../versions/changes/ChangesTab';
import { useListedChanges } from '../versions/changes/useListedChanges';
import { useOpenedChanges } from '../versions/changes/store';
import { CommentsTab } from '../comments/CommentsTab';
import { CommentsContext, useWhenCommentsShown, type CommentsStore } from '../comments/store';
import { HistoryPanel } from '../history/HistoryPanel';
import { ToursPanel } from '../tours/ToursPanel';
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
  /** The tab's comments (ADR 0059), which the shell keeps; absent, the Comments tab keeps its own. */
  comments?: CommentsStore | undefined;
  /** The panel's id, which its edge and strip name as what they control. */
  id?: string;
  /** Whether the panel is collapsed to its strip: then it is not shown, and keeps its tabs as they are. */
  hidden?: boolean;
}

type Tab = 'outline' | 'model' | 'components' | 'history' | 'comments' | 'tours' | 'changes';

const TABS: readonly { tab: Tab; name: string }[] = [
  { tab: 'outline', name: 'Outline' },
  { tab: 'model', name: 'Model' },
  { tab: 'components', name: 'Components' },
  { tab: 'history', name: 'History' },
  // Threads of comments (ADR 0059).
  { tab: 'comments', name: 'Comments' },
  // Tours (ADR 0058).
  { tab: 'tours', name: 'Tours' },
  // The changes of a comparison, a proposal or the conflicts, while one is open (ADR 0070).
  { tab: 'changes', name: 'Changes' },
];

/**
 * The panel left of the canvas, in five tabs: the outline of the open view, which mirrors what the
 * canvas draws; the model's contents with the project's views and scenarios; the components,
 * relation types and packages, which open in the component editor; the history, the actions that
 * undo and redo go through; the threads of comments (ADR 0059); the tours (ADR 0058); and, while a
 * comparison, a proposal or the conflicts are open, their changes (ADR 0070). Each tab keeps its rows
 * open or closed while another one shows.
 */
export function ModelPanel({
  project,
  definitions,
  openViewId,
  comments,
  id,
  hidden,
}: ModelPanelProps) {
  const t = useT();
  const [chosenTab, setTab] = useState<Tab>('outline');
  // The Changes tab is there while something is open in it, and comes forward when it opens.
  const listed = useListedChanges();
  const tabs = listed ? TABS : TABS.filter((each) => each.tab !== 'changes');
  const tab = chosenTab === 'changes' && !listed ? 'outline' : chosenTab;
  const { forward } = useOpenedChanges();
  const comparison = useShownComparison()?.serial;
  const [cameForward, setCameForward] = useState({ forward, comparison });
  if (cameForward.forward !== forward || cameForward.comparison !== comparison) {
    setCameForward({ forward, comparison });
    if (forward > cameForward.forward || comparison !== undefined) setTab('changes');
  }
  const heading = useId();
  const ids = {
    outline: useId(),
    model: useId(),
    components: useId(),
    history: useId(),
    comments: useId(),
    tours: useId(),
    changes: useId(),
  };
  const buttons = useRef(new Map<Tab, HTMLButtonElement>());
  // A pin chosen on the canvas brings the comments tab forward.
  useWhenCommentsShown(
    comments,
    useCallback(() => setTab('comments'), []),
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = tabs.findIndex((each) => each.tab === tab);
    const next =
      event.key === 'ArrowRight'
        ? tabs[(at + 1) % tabs.length]
        : event.key === 'ArrowLeft'
          ? tabs[(at - 1 + tabs.length) % tabs.length]
          : event.key === 'Home'
            ? tabs[0]
            : event.key === 'End'
              ? tabs.at(-1)
              : undefined;
    if (!next) return;
    event.preventDefault();
    setTab(next.tab);
    buttons.current.get(next.tab)?.focus();
  };

  return (
    <aside
      id={id}
      hidden={hidden}
      className="panel model-panel side-panel"
      aria-labelledby={heading}
    >
      <h2 id={heading} className="visually-hidden">
        {t('Outline and model')}
      </h2>
      <div role="tablist" aria-labelledby={heading} className="panel-tabs" onKeyDown={onKeyDown}>
        {tabs.map((each) => (
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
        <CommentsContext value={comments}>
          <CommentsTab active={tab === 'comments'} />
        </CommentsContext>
      </div>
      <div
        role="tabpanel"
        id={`${ids.tours}-panel`}
        aria-labelledby={`${ids.tours}-tab`}
        hidden={tab !== 'tours'}
        className="panel-tab-content"
      >
        <ToursPanel active={tab === 'tours'} />
      </div>
      {listed && (
        <div
          role="tabpanel"
          id={`${ids.changes}-panel`}
          aria-labelledby={`${ids.changes}-tab`}
          hidden={tab !== 'changes'}
          className="panel-tab-content"
        >
          <ChangesTab />
        </div>
      )}
    </aside>
  );
}
