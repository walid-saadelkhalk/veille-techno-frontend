// The entry point, and THE ONLY FILE IN THE PROJECT THAT READS THE
// ENVIRONMENT. Everything else receives what it needs.
//
// The composition is wrapped, so a missing VITE_API_URL produces a readable
// sentence on screen instead of a blank page with a message in a console
// nobody has open. Failing loudly is not the same as failing obscurely.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { createServices } from './services.ts';
import './index.css';

const root = createRoot(document.getElementById('root')!);

try {
  const services = createServices(import.meta.env.VITE_API_URL);

  root.render(
    <StrictMode>
      <App services={services} />
    </StrictMode>,
  );
} catch (caught) {
  // No StrictMode and no App here: the application cannot run, so it is not
  // started. Only the reason is displayed.
  root.render(
    <main>
      <h1>Configuration incomplete</h1>
      <p>{caught instanceof Error ? caught.message : 'Erreur inconnue.'}</p>
    </main>,
  );
}
