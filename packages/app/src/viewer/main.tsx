// The read-only page's script (ADR 0041). First, before any other code runs: the page's Trusted Types
// policy, then PixiJS's code paths that need no `eval`, which the page's policy forbids.
import './install-trusted-types';
import 'pixi.js/unsafe-eval';
import * as validators from 'virtual:visual-anything/validators';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NOT_A_PROJECT, PAGE_DATA_ID, readPageData, type PageRead } from './data';
import { PagePreferences } from './preferences';
import { standaloneValidate } from './validate';
import { ViewerApp } from './Viewer';
import { pageSolidClient, pageWorkerStart } from './solid-clients';

const mountPoint = document.getElementById('root');
if (!mountPoint) throw new Error('The page has no #root element.');

const held = document.getElementById(PAGE_DATA_ID);
const read: PageRead =
  held === null
    ? { ok: false, problems: [NOT_A_PROJECT] }
    : readPageData(held.textContent ?? '', standaloneValidate(validators));

// The page opens at the view state it was made at, unless its address names another.
if (read.ok && read.start !== undefined && window.location.hash.replace(/^#/, '') === '') {
  window.history.replaceState(window.history.state, '', `#${read.start}`);
}

const preferences = new PagePreferences(window);

// The solids the page holds, drawn by the worker it holds or from the pictures it holds (ADR 0075).
const solids = read.ok ? pageSolidClient(read.solids, pageWorkerStart(window)) : undefined;

createRoot(mountPoint).render(
  <StrictMode>
    <ViewerApp read={read} preferences={preferences} solids={solids} />
  </StrictMode>,
);
