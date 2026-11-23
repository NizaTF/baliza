import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import {applyPreferencesToDocument, loadPreferences} from './lib/preferences.ts';
import './index.css';

applyPreferencesToDocument(loadPreferences());

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
