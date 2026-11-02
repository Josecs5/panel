import { diasEntre, esFechaValida } from './fechas.ts';

export type TipoPosicion = 'accion' | 'fondo';
export type Divisa = 'EUR' | 'USD';

export type DatosPosicion = {
  nombre: string;
  tipo: TipoPosicion;
  /** Ticker en acciones, ISIN en fondos. */
  identificador: string;
  divisa: Divisa;
  /** En fondos: participaciones anteriores a las aportaciones registradas. */
  cantidad: number | null;
  precioMedio: number | null;
  fechaCompra: string | null;
};
export type Posicion = DatosPosicion & { id: string };

export type DatosAportacion = {
  posicionId: string;
  fecha: string;
  importe: number;
  valorLiquidativo: number;
};
export type Aportacion = DatosAportacion & { id: string };

export type DatosLiquidativo = { posicionId: string; fecha: string; valor: number };
export type Liquidativo = DatosLiquidativo & { id: string };

export type Cotizacion = {
  precio: number;
  variacion: number;
  variacionPct: number;
  guardadoEn: number;
};

const esPositivo = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;
const noNegativoONull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const textoLleno = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

export function aDatosPosicion(c: Record<string, unknown>): DatosPosicion | null {
  if (!textoLleno(c.nombre) || !textoLleno(c.identificador)) return null;
  if (c.tipo !== 'accion' && c.tipo !== 'fondo') return null;
  if (c.divisa !== 'EUR' && c.divisa !== 'USD') return null;
  return {
    nombre: c.nombre.trim(),
    tipo: c.tipo,
    identificador: c.identificador.trim().toUpperCase(),
    divisa: c.divisa,
    cantidad: noNegativoONull(c.cantidad),
    precioMedio: noNegativoONull(c.precioMedio),
    fechaCompra: esFechaValida(c.fechaCompra) ? c.fechaCompra : null,
  };
}

export function aDatosAportacion(c: Record<string, unknown>): DatosAportacion | null {
  if (!textoLleno(c.posicionId) || !esFechaValida(c.fecha)) return null;
  if (!esPositivo(c.importe) || !esPositivo(c.valorLiquidativo)) return null;
  return {
    posicionId: c.posicionId,
    fecha: c.fecha,
    importe: c.importe,
    valorLiquidativo: c.valorLiquidativo,
  };
}

export function aDatosLiquidativo(c: Record<string, unknown>): DatosLiquidativo | null {
  if (!textoLleno(c.posicionId) || !esFechaValida(c.fecha) || !esPositivo(c.valor)) return null;
  return { posicionId: c.posicionId, fecha: c.fecha, valor: c.valor };
}

const conId =
  <T>(convertir: (c: Record<string, unknown>) => T | null) =>
  (id: string, crudo: Record<string, unknown>): (T & { id: string }) | null => {
    const datos = convertir(crudo);
    return datos && { id, ...datos };
  };

export const aPosicion = conId(aDatosPosicion);
export const aAportacion = conId(aDatosAportacion);
export const aLiquidativo = conId(aDatosLiquidativo);

export const participacionesDe = (a: Pick<DatosAportacion, 'importe' | 'valorLiquidativo'>) =>
  a.importe / a.valorLiquidativo;

// Acciones

export type AccionCalculada = {
  posicion: Posicion;
  cotizacion: Cotizacion | null;
  valorUsd: number | null;
  valorEur: number | null;
  gananciaUsd: number | null;
  gananciaEur: number | null;
  gananciaPct: number | null;
  variacionDiaEur: number | null;
};

export function calcularAccion(
  posicion: Posicion,
  cotizacion: Cotizacion | null,
  usdEur: number | null,
): AccionCalculada {
  const { cantidad, precioMedio } = posicion;
  const precio = cotizacion?.precio ?? null;
  const aEur = (usd: number | null) => (usd !== null && usdEur !== null ? usd * usdEur : null);

  const valorUsd = cantidad !== null && precio !== null ? cantidad * precio : null;
  const gananciaUsd =
    cantidad !== null && precioMedio !== null && precio !== null
      ? cantidad * (precio - precioMedio)
      : null;
  const gananciaPct =
    precioMedio !== null && precioMedio > 0 && precio !== null
      ? ((precio - precioMedio) / precioMedio) * 100
      : null;
  const variacionDiaUsd = cantidad !== null && cotizacion ? cantidad * cotizacion.variacion : null;

  return {
    posicion,
    cotizacion,
    valorUsd,
    valorEur: aEur(valorUsd),
    gananciaUsd,
    gananciaEur: aEur(gananciaUsd),
    gananciaPct,
    variacionDiaEur: aEur(variacionDiaUsd),
  };
}

// Fondos

export type FondoCalculado = {
  posicion: Posicion;
  participaciones: number;
  aportado: number | null;
  ultimoLiquidativo: { valor: number; fecha: string } | null;
  valor: number | null;
  valorEur: number | null;
  ganancia: number | null;
  gananciaPct: number | null;
};

/** El valor liquidativo más reciente hasta una fecha, de registros sueltos o de aportaciones. */
function liquidativoHasta(
  posicionId: string,
  aportaciones: DatosAportacion[],
  liquidativos: DatosLiquidativo[],
  hasta?: string,
): { valor: number; fecha: string } | null {
  const candidatos = [
    ...aportaciones
      .filter((a) => a.posicionId === posicionId)
      .map((a) => ({ valor: a.valorLiquidativo, fecha: a.fecha })),
    ...liquidativos
      .filter((l) => l.posicionId === posicionId)
      .map((l) => ({ valor: l.valor, fecha: l.fecha })),
  ].filter((c) => hasta === undefined || c.fecha <= hasta);
  // A igualdad de fecha gana el registro suelto, que va después en la lista.
  return candidatos.reduce<{ valor: number; fecha: string } | null>(
    (mejor, c) => (!mejor || c.fecha >= mejor.fecha ? c : mejor),
    null,
  );
}

/** Lo aportado o null si falta el precio de las participaciones iniciales. */
function aportadoDe(posicion: Posicion, aportaciones: DatosAportacion[]): number | null {
  const base = posicion.cantidad ?? 0;
  if (base > 0 && posicion.precioMedio === null) return null;
  const inicial = base * (posicion.precioMedio ?? 0);
  return aportaciones.reduce((total, a) => total + a.importe, inicial);
}

export function calcularFondo(
  posicion: Posicion,
  aportaciones: DatosAportacion[],
  liquidativos: DatosLiquidativo[],
  usdEur: number | null,
): FondoCalculado {
  const propias = aportaciones.filter((a) => a.posicionId === posicion.id);
  const participaciones = propias.reduce(
    (total, a) => total + participacionesDe(a),
    posicion.cantidad ?? 0,
  );
  const ultimoLiquidativo = liquidativoHasta(posicion.id, aportaciones, liquidativos);
  const valor = ultimoLiquidativo && participaciones > 0 ? participaciones * ultimoLiquidativo.valor : null;
  const registrado = participaciones > 0;
  const aportado = registrado ? aportadoDe(posicion, propias) : null;
  const ganancia = valor !== null && aportado !== null ? valor - aportado : null;

  return {
    posicion,
    participaciones,
    aportado,
    ultimoLiquidativo,
    valor,
    valorEur: valor === null ? null : aEuros(valor, posicion.divisa, usdEur),
    ganancia,
    gananciaPct: ganancia !== null && aportado ? (ganancia / aportado) * 100 : null,
  };
}

const aEuros = (importe: number, divisa: Divisa, usdEur: number | null) =>
  divisa === 'EUR' ? importe : usdEur === null ? null : importe * usdEur;

// Resumen

export type ResumenCartera = {
  valorEur: number | null;
  variacionDiaEur: number | null;
  variacionDiaPct: number | null;
  /** Posiciones que no suman al total porque les falta algún dato. */
  sinValor: string[];
};

export function resumirCartera(acciones: AccionCalculada[], fondos: FondoCalculado[]): ResumenCartera {
  const sumar = (valores: (number | null)[]) => {
    const presentes = valores.filter((v): v is number => v !== null);
    return presentes.length ? presentes.reduce((a, b) => a + b, 0) : null;
  };
  const valorEur = sumar([...acciones.map((a) => a.valorEur), ...fondos.map((f) => f.valorEur)]);
  const variacionDiaEur = sumar(acciones.map((a) => a.variacionDiaEur));
  const previo = valorEur !== null && variacionDiaEur !== null ? valorEur - variacionDiaEur : null;

  return {
    valorEur,
    variacionDiaEur,
    variacionDiaPct: previo ? ((variacionDiaEur as number) / previo) * 100 : null,
    sinValor: [
      ...acciones.filter((a) => a.valorEur === null).map((a) => a.posicion.nombre),
      ...fondos.filter((f) => f.valorEur === null).map((f) => f.posicion.nombre),
    ],
  };
}

// Gráfico

export type PuntoSerie = { fecha: string; valor: number; aportado: number };

/** Valor y aportado de uno o varios fondos en cada fecha con algún registro, en euros. */
export function serieValorAportado(
  fondos: Posicion[],
  aportaciones: Aportacion[],
  liquidativos: Liquidativo[],
  usdEur: number | null,
): PuntoSerie[] {
  const ids = new Set(fondos.map((f) => f.id));
  const fechas = [
    ...new Set(
      [...aportaciones, ...liquidativos].filter((r) => ids.has(r.posicionId)).map((r) => r.fecha),
    ),
  ].sort();

  return fechas.map((fecha) => {
    let valor = 0;
    let aportado = 0;
    for (const fondo of fondos) {
      const propias = aportaciones.filter((a) => a.posicionId === fondo.id && a.fecha <= fecha);
      const participaciones = propias.reduce((t, a) => t + participacionesDe(a), fondo.cantidad ?? 0);
      const vl = liquidativoHasta(fondo.id, aportaciones, liquidativos, fecha);
      valor += aEuros(vl ? participaciones * vl.valor : 0, fondo.divisa, usdEur) ?? 0;
      aportado += aEuros(aportadoDe(fondo, propias) ?? 0, fondo.divisa, usdEur) ?? 0;
    }
    return { fecha, valor, aportado };
  });
}

// Aviso de aportación

/** El último día de cobro hasta hoy; en meses cortos, el último día del mes. */
export function ultimoCobro(hoy: string, diaCobro: number): string {
  const [ano, mes] = hoy.split('-').map(Number);
  const fechaEnMes = (a: number, m: number) => {
    const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return `${a}-${String(m).padStart(2, '0')}-${String(Math.min(diaCobro, ultimoDia)).padStart(2, '0')}`;
  };
  const esteMes = fechaEnMes(ano, mes);
  if (diasEntre(esteMes, hoy) >= 0) return esteMes;
  return mes === 1 ? fechaEnMes(ano - 1, 12) : fechaEnMes(ano, mes - 1);
}

export type AvisoAportacion = { fondos: string[]; importe: number; cobro: string };

/** Toca aportar a los fondos sin ninguna aportación desde el último cobro. */
export function avisoDeAportacion(
  fondos: Posicion[],
  aportaciones: DatosAportacion[],
  diaCobro: number | null,
  importe: number,
  hoy: string,
): AvisoAportacion | null {
  if (diaCobro === null || fondos.length === 0) return null;
  const cobro = ultimoCobro(hoy, diaCobro);
  const pendientes = fondos.filter(
    (f) => !aportaciones.some((a) => a.posicionId === f.id && a.fecha >= cobro),
  );
  return pendientes.length ? { fondos: pendientes.map((f) => f.nombre), importe, cobro } : null;
}
