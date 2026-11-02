import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { AppearanceClipboard } from './AppearanceClipboard';

/** A tab of the format panel (ADR 0088). */
export type FormatTab = 'style' | 'text' | 'arrange';

const TABS: readonly FormatTab[] = ['style', 'text', 'arrange'];
const TAB_NAMES: Readonly<Record<FormatTab, string>> = {
  style: 'Style',
  text: 'Text',
  arrange: 'Arrange',
};

/** Where the tab last chosen is kept for the tab's session, so that the next selection opens on it. */
const REMEMBERED = 'visual-anything.format-tab';

function rememberedTab(): FormatTab | undefined {
  try {
    const kept = globalThis.sessionStorage?.getItem(REMEMBERED);
    return TABS.find((tab) => tab === kept);
  } catch {
    return undefined;
  }
}

function remember(tab: FormatTab): void {
  try {
    globalThis.sessionStorage?.setItem(REMEMBERED, tab);
  } catch {
    // A page that keeps nothing opens each selection on Style.
  }
}

interface FormatPanelProps {
  /** The section's heading, which names it as a region: "Appearance", "Appearance of 3 shapes". */
  heading: string;
  /** What goes above the tabs, such as where their changes go. */
  lead?: ReactNode;
  /** What each tab holds; a tab given nothing is not shown. Style is always shown. */
  style: ReactNode;
  text?: ReactNode;
  arrange?: ReactNode;
}

/**
 * The format panel (ADR 0088): how the selection looks, in three tabs, Style, Text and Arrange, as
 * draw.io's. The tabs are a tablist: one Tab stop, the arrow keys, Home and End move between them and
 * show the tab reached, and the tab shown holds the focus's next stop. The tab last chosen opens again
 * for the next selection, while it has one.
 */
export function FormatPanel({ heading, lead, style, text, arrange }: FormatPanelProps) {
  const t = useT();
  const headingId = useId();
  const base = useId();
  const contents: Readonly<Record<FormatTab, ReactNode>> = { style, text, arrange };
  const shown = TABS.filter((tab) => tab === 'style' || contents[tab] !== undefined);
  const [chosen, setChosen] = useState<FormatTab | undefined>(rememberedTab);
  const active = chosen !== undefined && shown.includes(chosen) ? chosen : 'style';
  const buttons = useRef(new Map<FormatTab, HTMLButtonElement | null>());
  const tabId = (tab: FormatTab) => `${base}-${tab}-tab`;
  const panelId = (tab: FormatTab) => `${base}-${tab}-panel`;

  const choose = (tab: FormatTab) => {
    setChosen(tab);
    remember(tab);
  };

  const onKeyDown = (event: KeyboardEvent, at: number) => {
    const last = shown.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (at + 1) % shown.length
        : event.key === 'ArrowLeft'
          ? (at - 1 + shown.length) % shown.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const tab = shown[next] as FormatTab;
    choose(tab);
    buttons.current.get(tab)?.focus();
  };

  return (
    <section className="inspector-section format-panel" aria-labelledby={headingId}>
      <h4 id={headingId}>{heading}</h4>
      {lead}
      <AppearanceClipboard />
      <div role="tablist" className="format-tabs" aria-label={t('Format')}>
        {shown.map((tab, at) => (
          <button
            key={tab}
            ref={(button) => {
              buttons.current.set(tab, button);
            }}
            type="button"
            role="tab"
            id={tabId(tab)}
            className="format-tab"
            aria-selected={tab === active}
            aria-controls={panelId(tab)}
            tabIndex={tab === active ? 0 : -1}
            onClick={() => choose(tab)}
            onKeyDown={(event) => onKeyDown(event, at)}
          >
            {t(TAB_NAMES[tab])}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={panelId(active)}
        aria-labelledby={tabId(active)}
        className="format-tab-panel"
      >
        {contents[active]}
      </div>
    </section>
  );
}
