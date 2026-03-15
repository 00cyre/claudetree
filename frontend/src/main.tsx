import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { isDemoMode, activateDemo } from '@/demo/index';
import './index.css';

// Install demo mocks before React renders (hooks create EventSource on mount)
if (isDemoMode()) {
  activateDemo();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
