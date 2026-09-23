import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import './styles.css';
/**
 * The worker installs and claims the page (skipWaiting + clientsClaim), but the JS already
 * running is the old bundle — so without this you are always one reload behind a deploy.
 *
 * The guard matters: controllerchange also fires the first time a worker ever takes control of
 * this page, when there is nothing stale to replace. Reloading on that makes every first visit
 * load twice. Only reload when a controller was already in charge, i.e. this is a real update.
 */
const hadController = !!navigator.serviceWorker?.controller;
let reloading = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (!hadController || reloading) return;
  reloading = true;
  window.location.reload();
});


createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
