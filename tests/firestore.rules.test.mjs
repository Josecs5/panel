// Comprueba las reglas contra el emulador, sin dependencias: npm run test:rules
import { readFileSync } from 'node:fs';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const PROJECT = 'demo-panel';
const OWNER = 'uid-propietario';
const OTHER = 'uid-ajeno';
const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

function tokenDe(uid) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: uid,
    user_id: uid,
    aud: PROJECT,
    iss: `https://securetoken.google.com/${PROJECT}`,
    iat: now,
    auth_time: now,
    exp: now + 3600,
    firebase: { sign_in_provider: 'password', identities: {} },
  };
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims)}.`;
}

async function cargarReglas(uidPropietario) {
  const content = uidPropietario ? RULES.replaceAll('__OWNER_UID__', uidPropietario) : RULES;
  const res = await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT',
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }),
  });
  assert.equal(res.status, 200, await res.text());
}

async function escribir(ruta, uid) {
  const headers = { 'Content-Type': 'application/json' };
  if (uid) headers.Authorization = `Bearer ${tokenDe(uid)}`;
  const res = await fetch(`${BASE}/${ruta}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { x: { integerValue: '1' } } }),
  });
  return res.status;
}

async function leer(ruta, uid) {
  const headers = uid ? { Authorization: `Bearer ${tokenDe(uid)}` } : {};
  return (await fetch(`${BASE}/${ruta}`, { headers })).status;
}

const MIO = `users/${OWNER}/ajustes/general`;

before(() => cargarReglas(OWNER));

test('el propietario lee y escribe en su espacio', async () => {
  assert.equal(await escribir(MIO, OWNER), 200);
  assert.equal(await leer(MIO, OWNER), 200);
  assert.equal(await escribir(`users/${OWNER}/plazos/a/b/c`, OWNER), 200);
});

test('sin sesión no se lee ni se escribe', async () => {
  assert.equal(await leer(MIO), 403);
  assert.equal(await escribir(MIO), 403);
});

test('otro usuario no accede a los datos del propietario', async () => {
  assert.equal(await leer(MIO, OTHER), 403);
  assert.equal(await escribir(MIO, OTHER), 403);
});

test('otro usuario tampoco puede usar su propio espacio', async () => {
  assert.equal(await escribir(`users/${OTHER}/ajustes/general`, OTHER), 403);
  assert.equal(await leer(`users/${OTHER}/ajustes/general`, OTHER), 403);
});

test('el propietario no accede a rutas ajenas ni fuera de users', async () => {
  assert.equal(await escribir(`users/${OTHER}/ajustes/general`, OWNER), 403);
  assert.equal(await escribir('publico/x', OWNER), 403);
  assert.equal(await leer('publico/x', OWNER), 403);
});

test('con el marcador sin sustituir, el propietario no tiene acceso', async () => {
  await cargarReglas(null);
  assert.equal(await leer(MIO, OWNER), 403);
  assert.equal(await escribir(MIO, OWNER), 403);
  await cargarReglas(OWNER);
});
