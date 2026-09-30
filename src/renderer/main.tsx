import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

try {
  const storedSkin = window.localStorage.getItem('dl-screen-master-ui-skin');
  if (storedSkin) document.documentElement.setAttribute('data-dl-skin', storedSkin);
} catch {
  // localStorage unavailable — fall back to the default skin.
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
