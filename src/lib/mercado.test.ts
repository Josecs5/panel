import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horaEnMadrid } from './fechas.ts';
import { cuandoEnMadrid, estadoMercado, instanteNY, sesionDelDia } from './mercado.ts';

const apertura = (fecha: string) => horaEnMadrid(sesionDelDia(fecha)!.apertura);
const cierre = (fecha: string) => horaEnMadrid(sesionDelDia(fecha)!.cierre);
// Instante escrito con su desfase de Madrid, para leer los casos en hora española.
const madrid = (fecha: string, hora: string, desfase = '+01:00') =>
  new Date(`${fecha}T${hora}:00${desfase}`);
const estado = (fecha: string, hora: string, desfase?: string) =>
  estadoMercado(madrid(fecha, hora, desfase)).estado;

// Casos exigidos, en hora de Madrid.
test('28/10/2026 abre a las 14:30: Europa ya cambió la hora y EE. UU. todavía no', () => {
  assert.equal(apertura('2026-10-28'), '14:30');
});

test('02/11/2026 abre a las 15:30: los dos países ya han cambiado', () => {
  assert.equal(apertura('2026-11-02'), '15:30');
});

test('15/03/2027 abre a las 14:30: EE. UU. ya cambió la hora y Europa todavía no', () => {
  assert.equal(apertura('2027-03-15'), '14:30');
});

test('26/11/2026 está cerrado por Acción de Gracias', () => {
  assert.equal(sesionDelDia('2026-11-26'), null);
  assert.equal(estado('2026-11-26', '17:00'), 'cerrado');
});

test('27/11/2026 cierra a las 19:00', () => {
  assert.equal(cierre('2026-11-27'), '19:00');
  assert.equal(sesionDelDia('2026-11-27')!.anticipada, true);
});

// Horario normal
test('un día normal cierra a las 22:00 de Madrid', () => {
  assert.equal(cierre('2026-11-02'), '22:00');
});

test('en verano abre a las 15:30 de Madrid, igual que en invierno', () => {
  assert.equal(apertura('2026-07-01'), '15:30');
});

test('reconoce cada tramo del día', () => {
  assert.equal(estado('2026-11-02', '09:59'), 'cerrado');
  assert.equal(estado('2026-11-02', '10:00'), 'preapertura');
  assert.equal(estado('2026-11-02', '15:29'), 'preapertura');
  assert.equal(estado('2026-11-02', '15:30'), 'abierto');
  assert.equal(estado('2026-11-02', '21:59'), 'abierto');
  assert.equal(estado('2026-11-02', '22:00'), 'after-hours');
  assert.equal(estado('2026-11-03', '01:59'), 'after-hours');
  assert.equal(estado('2026-11-03', '02:00'), 'cerrado');
});

test('en un cierre anticipado, el after-hours termina a las 23:00 de Madrid', () => {
  assert.equal(estado('2026-11-27', '18:59'), 'abierto');
  assert.equal(estado('2026-11-27', '19:00'), 'after-hours');
  assert.equal(estado('2026-11-27', '22:59'), 'after-hours');
  assert.equal(estado('2026-11-27', '23:00'), 'cerrado');
});

test('el fin de semana está cerrado', () => {
  assert.equal(estado('2026-11-07', '17:00'), 'cerrado');
  assert.equal(estado('2026-11-08', '17:00'), 'cerrado');
});

// Próxima apertura
test('antes de abrir, la próxima apertura es la de hoy', () => {
  const { proximaApertura } = estadoMercado(madrid('2026-11-02', '12:00'));
  assert.equal(proximaApertura.toISOString(), '2026-11-02T14:30:00.000Z');
});

test('ya abierto, la próxima apertura es la del siguiente día de mercado', () => {
  const { proximaApertura } = estadoMercado(madrid('2026-11-02', '18:00'));
  assert.equal(proximaApertura.toISOString(), '2026-11-03T14:30:00.000Z');
});

test('el viernes por la tarde, la próxima apertura es el lunes', () => {
  const { proximaApertura } = estadoMercado(madrid('2026-11-06', '23:00'));
  assert.equal(proximaApertura.toISOString(), '2026-11-09T14:30:00.000Z');
});

test('salta festivos y fines de semana seguidos', () => {
  // Viernes 3/7/2026 festivo, luego fin de semana: abre el lunes 6.
  const { proximaApertura } = estadoMercado(madrid('2026-07-03', '17:00', '+02:00'));
  assert.equal(proximaApertura.toISOString(), '2026-07-06T13:30:00.000Z');
  // Nochebuena 2026 cierra pronto, Navidad festivo: abre el lunes 28.
  const navidad = estadoMercado(madrid('2026-12-24', '20:00'));
  assert.equal(navidad.proximaApertura.toISOString(), '2026-12-28T14:30:00.000Z');
});

// Cambios de hora
test('convierte bien la hora de Nueva York en torno al cambio de hora', () => {
  // EE. UU. cambia el 1/11/2026 y el 14/3/2027.
  assert.equal(instanteNY('2026-10-30', 9, 30).toISOString(), '2026-10-30T13:30:00.000Z');
  assert.equal(instanteNY('2026-11-02', 9, 30).toISOString(), '2026-11-02T14:30:00.000Z');
  assert.equal(instanteNY('2027-03-12', 9, 30).toISOString(), '2027-03-12T14:30:00.000Z');
  assert.equal(instanteNY('2027-03-15', 9, 30).toISOString(), '2027-03-15T13:30:00.000Z');
});

// Fuera del calendario
test('avisa si la fecha queda fuera del calendario', () => {
  assert.equal(estadoMercado(madrid('2027-12-30', '17:00')).calendarioCubierto, true);
  assert.equal(estadoMercado(madrid('2028-01-03', '17:00')).calendarioCubierto, false);
});

// Texto
test('describe la fecha en hora de Madrid', () => {
  const ahora = madrid('2026-11-02', '12:00');
  assert.equal(cuandoEnMadrid(madrid('2026-11-02', '15:30'), ahora), 'hoy, 15:30');
  assert.equal(cuandoEnMadrid(madrid('2026-11-03', '15:30'), ahora), 'mañana, 15:30');
  assert.match(cuandoEnMadrid(madrid('2026-11-09', '15:30'), ahora), /9 nov.*15:30/);
});
