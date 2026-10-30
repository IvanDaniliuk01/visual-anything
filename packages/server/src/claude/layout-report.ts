/**
 * What `lay_out_view` answers once the app is done (M3d, "Fixes from use"; ADR 0029's clarification
 * of 2026-10-30): each layout it asked for, what it moved and how it ended, and, when no tab ran it,
 * why and what to do. The program waits for it, and runs Claude's layouts one after another.
 */
import {
  modelIndexOf,
  type LayoutReport,
  type LayoutResult,
  type ProjectSnapshot,
} from '@visual-anything/core';

/** No app is open: nothing was laid out. */
export const NO_APP_NOTE =
  'No app has the project open, so nothing was laid out: layout runs in the app. Call open_app to open it, or ask the person to, then call lay_out_view again.';

/** What one layout came to, with the name of the container it arranged. */
interface LaidOut extends LayoutResult {
  name?: string;
}

/** The answer of a layout the program waited for. */
export function layoutAnswer(
  state: ProjectSnapshot,
  report: LayoutReport,
): Record<string, unknown> {
  const { apps } = report;
  if (apps === 0) return { apps: 0, note: NO_APP_NOTE };
  if (report.layouts === undefined) {
    return { apps, laidOut: false, note: unansweredNote(report) };
  }
  const index = modelIndexOf(state);
  const laidOut: LaidOut[] = report.layouts.map((each) => {
    const name = each.container === undefined ? undefined : index.element(each.container)?.name;
    return name === undefined ? each : { ...each, name };
  });
  const moved = laidOut.reduce((sum, each) => sum + each.moved, 0);
  return { apps, laidOut, moved, note: notes(laidOut, moved).join(' ') };
}

function notes(laidOut: readonly LaidOut[], moved: number): string[] {
  const what = (each: LaidOut) =>
    each.container === undefined ? 'the view' : `the contents of "${each.name ?? each.container}"`;
  const said: string[] = [];
  const done = laidOut.filter((each) => each.ended === 'done');
  if (done.length > 0) {
    said.push(
      moved === 0
        ? 'Done: layout left every shape where it was, since nothing had to move or what could was pinned.'
        : `Done: ${moved} shape${moved === 1 ? '' : 's'} moved, recorded as the person's action "Lay out …"; read_view shows where they went.`,
    );
  }
  for (const each of laidOut) {
    switch (each.ended) {
      case 'stopped':
        said.push(`The person stopped the layout of ${what(each)}, so nothing of it moved.`);
        break;
      case 'replaced':
        said.push(
          `The tab showed another view before the layout of ${what(each)} was done, so nothing of it moved: call lay_out_view again for it.`,
        );
        break;
      case 'failed':
        said.push(
          `The layout of ${what(each)} failed${each.why === undefined ? '' : `: ${each.why}`}`,
        );
        break;
      case 'empty':
        said.push(
          `The canvas draws "${each.name ?? each.container ?? 'it'}" holding no shapes to lay out: it is collapsed, draws its contents as rows, or is not in this view.`,
        );
        break;
      case 'done':
        break;
    }
  }
  return said;
}

function unansweredNote(report: LayoutReport): string {
  switch (report.unanswered) {
    case 'passed':
      return (report.passed ?? []).every((each) => each === 'cannot-lay-out')
        ? 'Nothing was laid out: the open app cannot lay out, since its browser runs no web workers. Ask the person to open the project in another browser.'
        : 'Nothing was laid out: the layout names another view than the open tabs show, and only the tab the person used last opens another view, which none of them is now. Ask the person to bring the app’s tab to the front, or call open_app, then call lay_out_view again.';
    case 'timed-out':
      return `The app did not say within ${Math.round((report.waited ?? 0) / 1000)} s that the layout was done. It may still be running, or the tab may be in the background; read_view shows the positions now, and lay_out_view can be called again.`;
    default:
      return 'The app closed before it said the layout was done, so it may have moved nothing. Call open_app to open it again, then call lay_out_view again.';
  }
}
