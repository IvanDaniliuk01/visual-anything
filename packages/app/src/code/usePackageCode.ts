/**
 * Package code for the open project (ADR 0054): which packages hold code and whether the person
 * approved each, by its hash, in their preferences; the code worker that runs the approved ones, and
 * what it answers. Code that is not approved never reaches the worker, and the app says so once when
 * the project opens.
 *
 * A package whose code the person turned off on this computer (ADR 0089's M14.2 clarification)
 * stays in the project and is never handed to the worker, whatever its approval.
 *
 * For code granted an origin (ADR 0063), the addresses it reads are fetched through the local program,
 * never from the page, and the live values it made of them are sent to the program as the package's.
 */
import {
  codeStatusOf,
  packagesWithCode,
  withApproval,
  withoutApproval,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Capability, Id } from '@visual-anything/schema';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Scene } from '../canvas/scene';
import { useT } from '../i18n';
import { LiveContext } from '../live/context';
import { usePreferences } from '../theme/usePreferences';
import type { CanvasCamera } from '../view-state/canvas';
import { CodeHost, NO_ANSWERS, type CodeAnswers } from './client';
import type { CodeStore, PackageCodeView } from './context';
import { PackageLiveValues, PackageNetwork } from './network';
import { drawScaleOf } from './scale';

export interface PackageCodeInput {
  project: ProjectSnapshot;
  viewId: Id | undefined;
  scene: Scene | undefined;
  /** The canvas's camera, for the scale `draw` is asked at. */
  canvas: CanvasCamera | undefined;
  /** The store the editor carries, which this keeps filled. */
  store: CodeStore;
  /** Makes the host of the code worker; none where the browser has no workers, as in tests. */
  makeHost?: () => CodeHost | undefined;
}

function defaultHost(): CodeHost | undefined {
  return typeof Worker === 'undefined' ? undefined : new CodeHost();
}

const NONE = (): (() => void) => () => {};
/** The code this tab said waits for approval, by hash, so that it says so once, however the shell mounts. */
const TOLD = new Set<string>();
const noAnswers = (): CodeAnswers => NO_ANSWERS;
const oneScale = (): number => 1;

/**
 * Keeps the store of package code that the shell hands to the editor's context filled.
 */
export function usePackageCode({
  store,
  project,
  viewId,
  scene,
  canvas,
  makeHost = defaultHost,
}: PackageCodeInput): void {
  const t = useT();
  const live = useContext(LiveContext);
  const { preferences, change } = usePreferences();
  const approvals = preferences.codeApprovals;
  const turnedOff = preferences.codeTurnedOff;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the code follows the packages only
  const codes = useMemo(() => packagesWithCode(project), [project.packages]);
  const [host] = useState(makeHost);
  useEffect(() => () => host?.dispose(), [host]);
  // What package code adds to the app runs through the host while the shell is mounted (ADR 0089).
  useEffect(() => store.lendCalls(host), [store, host]);
  const subscribeHost = useCallback(
    (listener: () => void) => host?.subscribe(listener) ?? NONE(),
    [host],
  );
  const currentAnswers = useCallback(() => host?.current() ?? NO_ANSWERS, [host]);
  const answers = useSyncExternalStore(subscribeHost, currentAnswers, noAnswers);

  const subscribeCamera = useCallback(
    (listener: () => void) => canvas?.subscribe(listener) ?? NONE(),
    [canvas],
  );
  const currentScale = useCallback(() => drawScaleOf(canvas?.camera()?.scale ?? 1), [canvas]);
  const scale = useSyncExternalStore(subscribeCamera, currentScale, oneScale);
  const shown = useMemo(
    () => [...new Set((scene?.shapes ?? []).map((shape) => shape.element))].sort(),
    [scene],
  );

  const packages = useMemo(() => {
    const views = new Map<Id, PackageCodeView>();
    for (const code of codes) {
      const status = codeStatusOf(code, approvals);
      const run = answers.packages.get(code.package);
      const off = turnedOff.includes(code.package);
      views.set(code.package, {
        code,
        status,
        ...(status.state === 'approved' && run && !off ? { run } : {}),
        ...(off ? { turnedOff: true as const } : {}),
      });
    }
    return views;
  }, [codes, approvals, turnedOff, answers.packages]);

  const approved = useMemo(
    () =>
      codes.flatMap((code) => {
        const status = codeStatusOf(code, approvals);
        // Code turned off on this computer is never handed to the worker (ADR 0089).
        return status.state === 'approved' && !turnedOff.includes(code.package)
          ? [
              {
                package: code.package,
                name: code.name,
                hash: code.hash,
                code: code.text,
                declared: code.declared,
                ...(code.extensions === undefined ? {} : { extensions: code.extensions }),
                granted: status.granted,
              },
            ]
          : [];
      }),
    [codes, approvals, turnedOff],
  );

  useEffect(() => {
    host?.update({ project, packages: approved, view: viewId, scale, shown });
  }, [host, project, approved, viewId, scale, shown]);

  useEffect(() => {
    store.set({ packages, elements: answers.elements, drawings: answers.drawings });
  }, [store, packages, answers.elements, answers.drawings]);

  // What code granted an origin reads is fetched through the local program (ADR 0063).
  const fetchForPackage = live?.fetchForPackage;
  const sendLiveValues = live?.sendLiveValues;
  const said = useRef({ notify: live?.notify, t });
  useEffect(() => {
    said.current = { notify: live?.notify, t };
  });
  const network = useRef<PackageNetwork | undefined>(undefined);
  useEffect(() => {
    if (!host || !fetchForPackage) return;
    const made = new PackageNetwork({
      fetch: fetchForPackage,
      deliver: (request) => host.fetched(request),
      tell: (message) => said.current.notify?.('warning', said.current.t.message(message)),
    });
    network.current = made;
    const stop = host.onWanted((pkg, wanted) => made.want(pkg, wanted));
    return () => {
      stop();
      made.dispose();
      network.current = undefined;
    };
  }, [host, fetchForPackage]);
  useEffect(() => {
    network.current?.keep(new Set(approved.map((each) => each.package)));
  }, [approved]);

  // The live values it made of what was fetched go to the program, which every app hears them from.
  const sender = useRef<PackageLiveValues | undefined>(undefined);
  useEffect(() => {
    if (!sendLiveValues) return;
    const made = new PackageLiveValues({
      send: (pkg, values, freshFor) => void sendLiveValues(pkg, values, freshFor),
    });
    sender.current = made;
    return () => {
      made.dispose();
      sender.current = undefined;
    };
  }, [sendLiveValues]);
  const sentLive = useRef(new Map<Id, string>());
  useEffect(() => {
    const made = sender.current;
    if (!made) return;
    const sent = sentLive.current;
    for (const element of [...sent.keys()]) {
      if (answers.elements.get(element)?.live === undefined) sent.delete(element);
    }
    for (const [element, each] of answers.elements) {
      if (each.live === undefined) continue;
      const text = JSON.stringify(each.live);
      if (sent.get(element) === text) continue;
      sent.set(element, text);
      for (const value of each.live.values) {
        made.add(value.package, each.live.freshFor, element, value.name, value.value);
      }
    }
  }, [answers.elements]);

  // Once a tab, for each code that waits for approval, a notice that it does not run.
  const notify = live?.notify;
  const sent = live?.preferences?.codeApprovals;
  useEffect(() => {
    // Only once the program sent the person's approvals: before, every code looks unapproved.
    if (!notify || sent === undefined) return;
    const known = [...approvals, ...sent];
    for (const code of codes) {
      if (
        codeStatusOf(code, known).state !== 'unapproved' ||
        turnedOff.includes(code.package) ||
        TOLD.has(code.hash)
      ) {
        continue;
      }
      TOLD.add(code.hash);
      notify(
        'warning',
        t(
          'The package “{name}” holds code that is not approved, so it does not run. Review it from one of its elements in the inspector, or from the package in the Components tab.',
          { name: code.name },
        ),
      );
    }
  }, [codes, approvals, turnedOff, notify, sent, t]);

  // The approval is of the code the person read: refused when the package's code is another now.
  const approve = useCallback(
    (pkg: Id, reviewed: string, shown: readonly Capability[], granted: readonly Capability[]) => {
      const code = codes.find((each) => each.package === pkg);
      if (!code || code.hash !== reviewed) return false;
      const capabilities = granted.filter(
        (each) => shown.includes(each) && code.capabilities.includes(each),
      );
      change({
        codeApprovals: withApproval(approvals, { hash: reviewed, package: pkg, capabilities }),
      });
      return true;
    },
    [codes, approvals, change],
  );
  const withdraw = useCallback(
    (pkg: Id) => {
      const code = codes.find((each) => each.package === pkg);
      if (code) change({ codeApprovals: withoutApproval(approvals, code.hash) });
    },
    [codes, approvals, change],
  );
  // Turning a package's code off, or on again, on this computer: a preference, never the project's.
  const turnOff = useCallback(
    (pkg: Id, off: boolean) => {
      if (turnedOff.includes(pkg) === off) return;
      change({
        codeTurnedOff: off
          ? [...turnedOff, pkg].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
          : turnedOff.filter((each) => each !== pkg),
      });
    },
    [turnedOff, change],
  );
  useEffect(() => {
    store.setActions({ approve, withdraw, turnOff });
  }, [store, approve, withdraw, turnOff]);
}
