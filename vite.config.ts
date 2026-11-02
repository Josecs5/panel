import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages sirve la web en /<NOMBRE_REPO>/. En Actions el nombre sale de
// GITHUB_REPOSITORY, así que no hay que escribirlo a mano; en local, la raíz.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];

// Pages no permite cabeceras propias, así que la CSP va en una etiqueta <meta>.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  [
    "connect-src 'self'",
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://firestore.googleapis.com',
    'https://finnhub.io',
    'https://api.frankfurter.dev',
  ].join(' '),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function cspEnProduccion(): Plugin {
  return {
    name: 'csp-en-produccion',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  base: repo ? `/${repo}/` : '/',
  plugins: [react(), cspEnProduccion()],
});
