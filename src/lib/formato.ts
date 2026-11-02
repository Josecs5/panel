import type { Divisa } from './cartera.ts';

const dinero = (divisa: Divisa, signo = false) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: divisa,
    signDisplay: signo ? 'exceptZero' : 'auto',
  });

const FORMATOS: Record<Divisa, Intl.NumberFormat> = { EUR: dinero('EUR'), USD: dinero('USD') };
const CON_SIGNO: Record<Divisa, Intl.NumberFormat> = {
  EUR: dinero('EUR', true),
  USD: dinero('USD', true),
};
const PORCENTAJE = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

export const moneda = (importe: number, divisa: Divisa = 'EUR') => FORMATOS[divisa].format(importe);
export const monedaConSigno = (importe: number, divisa: Divisa = 'EUR') =>
  CON_SIGNO[divisa].format(importe);
export const porcentaje = (valor: number) => `${PORCENTAJE.format(valor)} %`;

export const numero = (valor: number, decimales = 4) =>
  new Intl.NumberFormat('es-ES', { maximumFractionDigits: decimales }).format(valor);

export const claseDeSigno = (valor: number | null) =>
  valor === null || valor === 0 ? '' : valor > 0 ? 'positivo' : 'negativo';
