/**
 * What the explorables' browser scripts share (A10.5, ADR 0107): free ports from 47800 to 47899, the
 * browsers found at their usual places or given by CHROME and FIREFOX, and a headless run of one,
 * with frame isolation on, that is always stopped and leaves no profile behind.
 *
 * Chrome runs with `--site-per-process`, which it ships with on the desktop and which puppeteer and
 * some test runners turn off (`--disable-site-isolation-trials`); Firefox with Fission, which
 * `fission.autostart` keeps on. Neither is driven by puppeteer: the page reports to the script.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createNet } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type BrowserName = 'chrome' | 'firefox';

const PLACES: Record<BrowserName, string[]> = {
  chrome: [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ],
  firefox: [
    'C:/Program Files/Mozilla Firefox/firefox.exe',
    'C:/Program Files (x86)/Mozilla Firefox/firefox.exe',
    '/usr/bin/firefox',
    '/Applications/Firefox.app/Contents/MacOS/firefox',
  ],
};

/** The browser's program: the one its environment variable names, else the first found. */
export function findBrowser(name: BrowserName): string | undefined {
  const given = process.env[name.toUpperCase()];
  return [given ?? '', ...PLACES[name]].find((each) => each !== '' && existsSync(each));
}

/** A free port from 47800 to 47899 on 127.0.0.1, other than those already taken. */
export async function freePort(taken: Set<number>): Promise<number> {
  for (let port = 47800; port <= 47899; port += 1) {
    if (taken.has(port)) continue;
    const free = await new Promise<boolean>((resolve) => {
      const probe = createNet();
      probe.once('error', () => resolve(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    if (free) {
      taken.add(port);
      return port;
    }
  }
  throw new Error('No free port from 47800 to 47899.');
}

/** Firefox's preferences for a headless run: Fission on, and nothing of its own reaching out. */
const FIREFOX_PREFERENCES = [
  'user_pref("fission.autostart", true);',
  'user_pref("browser.shell.checkDefaultBrowser", false);',
  'user_pref("browser.startup.homepage_override.mstone", "ignore");',
  'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
  'user_pref("app.update.enabled", false);',
  'user_pref("app.normandy.enabled", false);',
  'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
].join('\n');

export interface HeadlessRun<T> {
  browser: string;
  outcome: T | { failed: string };
}

/**
 * Opens `address` in the browser, headless and with frame isolation on, and waits for `results` at
 * most `timeoutMs`; then stops the browser and removes its profile. A browser not found is said.
 */
export async function runHeadless<T>(
  name: BrowserName,
  address: string,
  results: Promise<T>,
  {
    timeoutMs,
    window = { width: 1600, height: 900 },
  }: {
    timeoutMs: number;
    window?: { width: number; height: number };
  },
): Promise<HeadlessRun<T> | { skipped: string }> {
  const path = findBrowser(name);
  if (!path) {
    return {
      skipped: `${name === 'chrome' ? 'Chrome' : 'Firefox'} was not found; give its path in ${name.toUpperCase()}.`,
    };
  }
  const profile = mkdtempSync(join(tmpdir(), `va-explorables-${name}-`));
  const args =
    name === 'chrome'
      ? [
          '--headless=new',
          `--user-data-dir=${profile}`,
          '--site-per-process',
          `--window-size=${window.width},${window.height}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-component-update',
          '--disable-sync',
          address,
        ]
      : (() => {
          writeFileSync(join(profile, 'user.js'), FIREFOX_PREFERENCES);
          return [
            '-headless',
            '-no-remote',
            '-profile',
            profile,
            '-width',
            String(window.width),
            '-height',
            String(window.height),
            address,
          ];
        })();
  const child = spawn(path, args, { stdio: 'ignore' });
  let timer: NodeJS.Timeout | undefined;
  const outcome = await Promise.race<T | { failed: string }>([
    results,
    new Promise((resolve) => {
      timer = setTimeout(
        () => resolve({ failed: `No results within ${Math.round(timeoutMs / 1000)} s.` }),
        timeoutMs,
      );
    }),
    new Promise((resolve) => {
      child.once('error', (error) => resolve({ failed: `It did not start: ${error.message}` }));
    }),
  ]);
  clearTimeout(timer);
  await stop(child.pid);
  child.kill();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    // The browser may still hold its profile for a moment; the system's temporary folder keeps it.
  }
  return { browser: path, outcome };
}

/** Stops a browser with every process it started: on Windows its tree, elsewhere the process. */
async function stop(pid: number | undefined): Promise<void> {
  if (pid === undefined || process.platform !== 'win32') return;
  await new Promise<void>((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
    killer.once('exit', () => resolve());
    killer.once('error', () => resolve());
  });
}
