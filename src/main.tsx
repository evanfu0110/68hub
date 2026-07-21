import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n/i18n';
import App from './App';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './components/ThemeProvider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
);
