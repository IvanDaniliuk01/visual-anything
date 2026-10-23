import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { takeSessionToken } from './live/session';
import './styles.css';

const mountPoint = document.getElementById('root');
if (!mountPoint) throw new Error('index.html has no #root element.');

// Read once, before rendering: this also takes the token out of the address bar.
const token = takeSessionToken(window);

createRoot(mountPoint).render(
  <StrictMode>
    <App token={token} />
  </StrictMode>,
);
