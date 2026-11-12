/**
 * An explorable live, or its card (ADR 0107): the explorable panel and a pane of the split view both
 * show one this way. It runs in a frame of its own, loaded from the program's listener under a fresh
 * label, once the person approved it as it is now and while the watchdog has not stopped it; the
 * frame reads the data of the element that shows it, sent again as it changes. Otherwise its card
 * says what it is and why it is not running, with what the person can do about it.
 */
import {
  cardRuns,
  explorableCard,
  type ExplorableCard as CoreCard,
  type ExplorableCardReason,
  type ProjectSnapshot,
  type VaData,
} from '@visual-anything/core';
import type { ExplorableParameterValue, Id } from '@visual-anything/schema';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { EmphasisRuns } from '../text/EmphasisText';
import { placeInApp } from './faces';
import { newFrameAddress, type FrameListener } from './frame-address';
import { useExplorableApprovals, useExplorableData, useExplorableListener } from './hooks';
import { FrameHost } from './host';
import { reasonText } from './reasons';
import { useExplorableSession, type ExplorableSession } from './session';
import './explorables.css';

export interface ExplorableViewProps {
  project: ProjectSnapshot;
  explorable: Id;
  /** The element that shows it, whose data it reads. */
  element?: Id | undefined;
  parameters?: Record<string, ExplorableParameterValue> | undefined;
  step?: VaData['step'] | undefined;
  /** Selects an element on the canvas, as `va.select` asks. */
  onSelect?: ((id: Id) => void) | undefined;
}

export function ExplorableView(props: ExplorableViewProps) {
  const t = useT();
  const { project, explorable } = props;
  const session = useExplorableSession();
  const { approvals } = useExplorableApprovals();
  const listener = useExplorableListener();
  // The core's one card says what keeps it from running here, as the canvas's cards say it.
  const card = explorableCard(project, explorable, {
    approvals,
    place: placeInApp(session, listener),
  });
  if (card.reason === 'unknown') {
    return (
      <p className="explorable-message">
        {t('No package defines the explorable “{id}”.', { id: explorable })}
      </p>
    );
  }
  const { hash } = card;
  if (!cardRuns(card) || hash === undefined || !session || listener.kind !== 'known') {
    return (
      <ExplorableCard
        card={card}
        {...(listener.kind === 'none' ? { detail: listener.why } : {})}
        onApprove={() => session?.review(explorable)}
        onRun={() => hash !== undefined && session?.run(hash)}
      />
    );
  }
  return (
    <LiveFrame
      key={hash}
      {...props}
      name={card.name}
      hash={hash}
      listener={listener.listener}
      session={session}
    />
  );
}

/** Why an explorable shows its card in the panel: what the core's card says, but that it may run. */
export type CardReason = Exclude<ExplorableCardReason, 'unknown' | 'outside-app' | 'explore'>;

/** An explorable's card: its name, what it explains, its script libraries, and why it is not running. */
export function ExplorableCard({
  card,
  detail,
  onApprove,
  onRun,
}: {
  card: CoreCard;
  detail?: string;
  onApprove?: () => void;
  onRun?: () => void;
}) {
  const t = useT();
  const why = card.reason;
  return (
    <section className="explorable-card" aria-label={t('Explorable “{name}”', { name: card.name })}>
      <h3 className="explorable-card-name">{card.name}</h3>
      {card.description !== undefined && (
        <p className="explorable-card-description">
          <EmphasisRuns text={card.description} />
        </p>
      )}
      {card.libraries.length > 0 && (
        <p className="explorable-card-libraries">
          {t('Script libraries: {names}', { names: card.libraries.join(', ') })}
        </p>
      )}
      <p className="explorable-card-why" role="status">
        {reasonText(t, why, card.library)}
        {detail !== undefined && why === 'not-connected' && <> {t.message(detail)}</>}
      </p>
      {why === 'not-approved' && onApprove && (
        <button
          type="button"
          className="space-panel-tool explorable-card-action"
          onClick={onApprove}
        >
          {t('Approve…')}
        </button>
      )}
      {(why === 'silent' || why === 'never-answered' || why === 'hung' || why === 'left') &&
        onRun && (
          <button type="button" className="space-panel-tool explorable-card-action" onClick={onRun}>
            {t('Run again')}
          </button>
        )}
    </section>
  );
}

/** The sizes stills are taken at, which the frame's width is reported within. */
interface Size {
  width: number;
  height: number;
}

function LiveFrame({
  project,
  explorable,
  element,
  parameters,
  step,
  onSelect,
  name,
  hash,
  listener,
  session,
}: ExplorableViewProps & {
  name: string;
  hash: string;
  listener: FrameListener;
  session: ExplorableSession;
}) {
  const t = useT();
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<FrameHost | undefined>(undefined);
  // A fresh label for each frame: another frame of the same explorable is another site.
  const [address] = useState(() => newFrameAddress(listener, explorable, hash));
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const data = useExplorableData(project, { explorable, element, parameters, size, step });
  const latest = useRef({ data, onSelect });
  // Before the host is made, so that its hello carries the data of this render.
  useLayoutEffect(() => {
    latest.current = { data, onSelect };
  });

  useLayoutEffect(() => {
    const target = box.current;
    if (!target) return;
    const measure = () =>
      setSize((last) => {
        const width = Math.round(target.clientWidth);
        const height = Math.round(target.clientHeight);
        return last.width === width && last.height === height ? last : { width, height };
      });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const ended = session.marks.start(hash);
    const made = new FrameHost(element, latest.current.data, {
      select: (id) => latest.current.onSelect?.(id),
      stopped: (end) => {
        ended();
        session.stop(hash, end);
      },
    });
    host.current = made;
    return () => {
      made.dispose();
      host.current = undefined;
      ended();
    };
  }, [hash, session]);

  useEffect(() => {
    host.current?.setData(data);
  }, [data]);

  return (
    <div ref={box} className="explorable-frame-box">
      <iframe
        ref={frame}
        className="explorable-frame"
        src={address}
        title={t('Explorable “{name}”', { name })}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        loading="eager"
      />
    </div>
  );
}
