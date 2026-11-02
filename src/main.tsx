import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { ProveedorDeSesion } from './lib/sesion';
import './estilos.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ProveedorDeSesion>
        <App />
      </ProveedorDeSesion>
    </HashRouter>
  </StrictMode>,
);
