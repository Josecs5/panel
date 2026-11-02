import { useEffect, useMemo, useRef, useState } from 'react';
import {
  aAportacion,
  aLiquidativo,
  aPosicion,
  avisoDeAportacion,
  calcularAccion,
  calcularFondo,
  resumirCartera,
} from './cartera.ts';
import {
  caducado,
  FalloApi,
  pedirCambio,
  pedirCotizacion,
  pedirResultados,
  TTL_CAMBIO,
  TTL_COTIZACION,
  TTL_RESULTADOS,
  type CacheMercado,
  type MotivoFallo,
} from './cotizaciones.ts';
import { guardarCacheMercado, leerCacheMercado, useAjustes, useColeccion } from './datos.ts';
import { hoyEnMadrid } from './fechas.ts';
import { cuandoEnMadrid } from './mercado.ts';
import { useHoy } from './useHoy.ts';

type Fallos = { cotizaciones: Record<string, MotivoFallo>; cambio: boolean };

const motivoDe = (error: unknown): MotivoFallo => (error instanceof FalloApi ? error.motivo : 'red');
const COMPROBAR_CADA = 60_000;

/**
 * Precios y cambio con caché en Firestore: sirve de límite de 5 minutos y de último
 * dato guardado si una API falla. Ningún fallo se propaga: acaba en un aviso.
 */
function useDatosMercado(uid: string, tickers: string[], clave: string, necesitaCambio: boolean, activo: boolean) {
  const [cache, setCache] = useState<CacheMercado>({ cotizaciones: {} });
  const [fallos, setFallos] = useState<Fallos>({ cotizaciones: {}, cambio: false });
  const [cargado, setCargado] = useState(false);
  const cacheActual = useRef(cache);
  const enCurso = useRef(false);
  const listaTickers = tickers.join(',');

  useEffect(() => {
    let vigente = true;
    leerCacheMercado(uid)
      .catch(() => null)
      .then((guardado) => {
        if (!vigente) return;
        if (guardado) {
          cacheActual.current = guardado;
          setCache(guardado);
        }
        setCargado(true);
      });
    return () => {
      vigente = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!cargado || !activo) return;
    const lista = listaTickers ? listaTickers.split(',') : [];

    async function actualizar() {
      if (enCurso.current || document.hidden) return;
      enCurso.current = true;
      try {
        const ahora = Date.now();
        const previo = cacheActual.current;
        const siguiente: CacheMercado = { ...previo, cotizaciones: { ...previo.cotizaciones } };
        const nuevosFallos: Fallos = { cotizaciones: {}, cambio: false };
        let cambios: Partial<CacheMercado> = {};

        if (clave) {
          const caducados = lista.filter((t) =>
            caducado(previo.cotizaciones[t]?.guardadoEn, TTL_COTIZACION, ahora),
          );
          const respuestas = await Promise.allSettled(
            caducados.map((t) => pedirCotizacion(t, clave, ahora)),
          );
          const nuevas: CacheMercado['cotizaciones'] = {};
          respuestas.forEach((r, i) => {
            if (r.status === 'fulfilled') nuevas[caducados[i]] = r.value;
            else nuevosFallos.cotizaciones[caducados[i]] = motivoDe(r.reason);
          });
          if (Object.keys(nuevas).length) {
            Object.assign(siguiente.cotizaciones, nuevas);
            cambios.cotizaciones = nuevas;
          }
        }

        if (necesitaCambio && caducado(previo.cambio?.guardadoEn, TTL_CAMBIO, ahora)) {
          try {
            siguiente.cambio = await pedirCambio(ahora);
            cambios.cambio = siguiente.cambio;
          } catch {
            nuevosFallos.cambio = true;
          }
        }

        const claveRechazada = Object.values(nuevosFallos.cotizaciones).includes('clave');
        if (clave && lista.length && !claveRechazada && caducado(previo.resultados?.guardadoEn, TTL_RESULTADOS, ahora)) {
          try {
            const hoy = hoyEnMadrid();
            const listas = await Promise.all(lista.map((t) => pedirResultados(t, clave, hoy)));
            siguiente.resultados = { guardadoEn: ahora, disponible: true, lista: listas.flat() };
            cambios.resultados = siguiente.resultados;
          } catch (error) {
            // Si el plan no lo permite no se insiste; otro fallo se reintenta en un minuto.
            if (motivoDe(error) === 'plan') {
              siguiente.resultados = { guardadoEn: ahora, disponible: false, lista: [] };
              cambios.resultados = siguiente.resultados;
            }
          }
        }

        cacheActual.current = siguiente;
        setCache(siguiente);
        setFallos(nuevosFallos);
        if (Object.keys(cambios).length) guardarCacheMercado(uid, cambios).catch(() => undefined);
        cambios = {};
      } finally {
        enCurso.current = false;
      }
    }

    void actualizar();
    const intervalo = setInterval(actualizar, COMPROBAR_CADA);
    document.addEventListener('visibilitychange', actualizar);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', actualizar);
    };
  }, [uid, listaTickers, clave, necesitaCambio, cargado, activo]);

  return { cache, fallos };
}

const TEXTO_MOTIVO: Record<MotivoFallo, string> = {
  clave: 'Finnhub rechaza tu clave: revísala en Ajustes.',
  limite: 'Finnhub ha limitado las peticiones por ahora.',
  plan: 'Tu plan de Finnhub no permite este dato.',
  simbolo: 'Finnhub no reconoce este ticker: revísalo en la posición.',
  red: 'No se ha podido conectar con Finnhub.',
};

export function useCartera(uid: string) {
  const hoy = useHoy();
  const posiciones = useColeccion(uid, 'posiciones', aPosicion);
  const aportaciones = useColeccion(uid, 'aportaciones', aAportacion);
  const liquidativos = useColeccion(uid, 'liquidativos', aLiquidativo);
  const ajustes = useAjustes(uid);

  const listo = [posiciones, aportaciones, liquidativos, ajustes].every((l) => l.estado === 'listo');
  const hayError = [posiciones, aportaciones, liquidativos, ajustes].some((l) => l.estado === 'error');

  const posicionesAccion = useMemo(() => posiciones.datos.filter((p) => p.tipo === 'accion'), [posiciones.datos]);
  const posicionesFondo = useMemo(() => posiciones.datos.filter((p) => p.tipo === 'fondo'), [posiciones.datos]);

  // Finnhub da el precio de EE. UU. en dólares; una acción en otra divisa no tiene precio en vivo.
  const tickers = useMemo(
    () => [...new Set(posicionesAccion.filter((p) => p.divisa === 'USD').map((p) => p.identificador))].sort(),
    [posicionesAccion],
  );
  const necesitaCambio = posiciones.datos.some((p) => p.divisa === 'USD');
  const clave = ajustes.datos.finnhubKey;
  const { cache, fallos } = useDatosMercado(uid, tickers, clave, necesitaCambio, listo);

  const usdEur = cache.cambio?.usdEur ?? null;
  const acciones = posicionesAccion.map((p) =>
    calcularAccion(p, p.divisa === 'USD' ? (cache.cotizaciones[p.identificador] ?? null) : null, usdEur),
  );
  const fondos = posicionesFondo.map((p) => calcularFondo(p, aportaciones.datos, liquidativos.datos, usdEur));
  const resumen = resumirCartera(acciones, fondos);

  const avisoAportacion = avisoDeAportacion(
    posicionesFondo,
    aportaciones.datos,
    ajustes.datos.diaCobro,
    ajustes.datos.aportacionPorFondo,
    hoy,
  );

  const avisos: string[] = [];
  if (listo && tickers.length && !clave) {
    avisos.push('Añade tu clave de Finnhub en Ajustes para ver precios en vivo.');
  }
  const porMotivo = new Map<MotivoFallo, string[]>();
  for (const [ticker, motivo] of Object.entries(fallos.cotizaciones)) {
    porMotivo.set(motivo, [...(porMotivo.get(motivo) ?? []), ticker]);
  }
  for (const [motivo, afectados] of porMotivo) {
    const ultimos = afectados.map((t) => {
      const guardada = cache.cotizaciones[t];
      return guardada ? `${t}: ${cuandoEnMadrid(new Date(guardada.guardadoEn))}` : `${t}: sin datos`;
    });
    avisos.push(`${TEXTO_MOTIVO[motivo]} Último precio guardado de ${ultimos.join('; ')}.`);
  }
  if (fallos.cambio) {
    avisos.push(
      cache.cambio
        ? `No se ha podido actualizar el cambio USD→EUR. Se usa el guardado: ${cuandoEnMadrid(new Date(cache.cambio.guardadoEn))}.`
        : 'No se ha podido obtener el cambio USD→EUR: los importes en dólares no se muestran en euros.',
    );
  }

  const horasCotizacion = acciones.flatMap((a) => (a.cotizacion ? [a.cotizacion.guardadoEn] : []));

  return {
    listo,
    hayError,
    hoy,
    ajustes: ajustes.datos,
    posiciones: posiciones.datos,
    aportaciones: aportaciones.datos,
    liquidativos: liquidativos.datos,
    fondosPosicion: posicionesFondo,
    acciones,
    fondos,
    resumen,
    cambio: cache.cambio ?? null,
    usdEur,
    resultados: cache.resultados?.disponible
      ? cache.resultados.lista.filter((r) => r.fecha >= hoy && tickers.includes(r.ticker))
      : [],
    avisoAportacion,
    avisos,
    actualizadoEn: horasCotizacion.length ? Math.min(...horasCotizacion) : null,
  };
}
