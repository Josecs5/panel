import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aEmailDeLogin, mensajeDeError } from './login.ts';

test('añade el dominio si el usuario no lleva @', () => {
  assert.equal(aEmailDeLogin('ana', 'miweb.test'), 'ana@miweb.test');
});

test('respeta un email completo', () => {
  assert.equal(aEmailDeLogin('ana@otra.test', 'miweb.test'), 'ana@otra.test');
  assert.equal(aEmailDeLogin('ana@otra.test', undefined), 'ana@otra.test');
});

test('quita los espacios de alrededor', () => {
  assert.equal(aEmailDeLogin('  ana ', ' miweb.test '), 'ana@miweb.test');
});

test('devuelve null si no se puede formar el email', () => {
  assert.equal(aEmailDeLogin('   ', 'miweb.test'), null);
  assert.equal(aEmailDeLogin('ana', undefined), null);
  assert.equal(aEmailDeLogin('ana', '  '), null);
});

test('no revela si falló el usuario o la contraseña', () => {
  assert.equal(mensajeDeError('auth/user-not-found'), mensajeDeError('auth/wrong-password'));
});

test('un error desconocido también tiene mensaje', () => {
  assert.match(mensajeDeError(undefined), /No se ha podido/);
});
