import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './core/App';
import { AppProvider } from './core/store';
import ErrorBoundary from './components/chat/ErrorBoundary';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>,
);
