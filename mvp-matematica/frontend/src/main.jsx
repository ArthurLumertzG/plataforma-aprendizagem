import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Fontes servidas pelo próprio site: nenhum acesso de criança passa pelo Google
// Fonts, e o app já fica pronto para funcionar offline (ADR-06).
import '@fontsource/andika/400.css';
import '@fontsource/andika/700.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/lexend/wght.css';

import App from './App.jsx';
import './styles/base.css';
import './styles/inicio.css';
import './styles/crianca.css';
import './styles/professor.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
