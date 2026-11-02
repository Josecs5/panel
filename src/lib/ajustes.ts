export type Ajustes = {
  finnhubKey: string;
  salarioMinimo: number | null;
  aportacionPorFondo: number;
  diaCobro: number | null;
};

export const AJUSTES_INICIALES: Ajustes = {
  finnhubKey: '',
  salarioMinimo: null,
  aportacionPorFondo: 250,
  diaCobro: null,
};

const esImporte = (valor: unknown): valor is number =>
  typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;

export const esDiaDeCobro = (valor: unknown): valor is number =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= 31;

/** Conserva solo los campos conocidos que tengan un valor válido. */
export function aAjustesParciales(crudo: Record<string, unknown>): Partial<Ajustes> {
  const ajustes: Partial<Ajustes> = {};
  if (typeof crudo.finnhubKey === 'string') ajustes.finnhubKey = crudo.finnhubKey.trim();
  if (esImporte(crudo.salarioMinimo) || crudo.salarioMinimo === null) {
    ajustes.salarioMinimo = crudo.salarioMinimo;
  }
  if (esImporte(crudo.aportacionPorFondo)) ajustes.aportacionPorFondo = crudo.aportacionPorFondo;
  if (esDiaDeCobro(crudo.diaCobro) || crudo.diaCobro === null) ajustes.diaCobro = crudo.diaCobro;
  return ajustes;
}

export const aAjustes = (crudo: Record<string, unknown>): Ajustes => ({
  ...AJUSTES_INICIALES,
  ...aAjustesParciales(crudo),
});
