// First, before any other code runs: the page's Trusted Types policy, then PixiJS's code paths that
// need no `eval`, so that the page's content security policy allows neither HTML from text nor eval.
import './trusted-types';
import 'pixi.js/unsafe-eval';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { tabUse } from './guidance/tabs';
import { takeSessionToken } from './live/session';
import './styles.css';

const mountPoint = document.getElementById('root');
if (!mountPoint) throw new Error('index.html has no #root element.');

// Read once, before rendering: this also takes the token out of the address bar.
const token = takeSessionToken(window);
// From the start, so that this tab counts as used when it opens, as one Claude opens does.
tabUse();

createRoot(mountPoint).render(
  <StrictMode>
    <App token={token} />
  </StrictMode>,
);
