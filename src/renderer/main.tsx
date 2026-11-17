import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { DICT, LanguageProvider } from './i18n';
import { installWebBridge } from './platform';

try {
  const storedSkin = window.localStorage.getItem('dl-screen-master-ui-skin');
  if (storedSkin) document.documentElement.setAttribute('data-dl-skin', storedSkin);
} catch {
  // localStorage unavailable — fall back to the default skin.
}

// В web-сборке (CRM) preload-моста нет — подставляем браузерную реализацию.
installWebBridge();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider dict={DICT}>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);
