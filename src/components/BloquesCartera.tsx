import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AvisoAportacion, ResumenCartera } from '../lib/cartera';
import { fechaCorta } from '../lib/fechas';
import { claseDeSigno, moneda, monedaConSigno, porcentaje } from '../lib/formato';
import { cuandoEnMadrid, estadoMercado, ETIQUETA_ESTADO } from '../lib/mercado';

/** Valor total, variación de hoy y de cuándo es el dato. */
export function BloqueValorCartera({
  resumen,
  actualizadoEn,
  hayPosiciones,
}: {
  resumen: ResumenCartera;
  actualizadoEn: number | null;
  hayPosiciones: boolean;
}) {
  if (!hayPosiciones) {
    return (
      <p className="texto-suave">
        Aún no tienes posiciones. Añádelas en <Link className="enlace" to="/cartera">Cartera</Link>.
      </p>
    );
  }
  if (resumen.valorEur === null) {
    return <p className="texto-suave">Faltan datos para calcular el valor de la cartera.</p>;
  }
  const { valorEur, variacionDiaEur, variacionDiaPct, sinValor } = resumen;
  return (
    <>
      <p className="cifra">{moneda(valorEur)}</p>
      {variacionDiaEur !== null && (
        <p className={`cifra__variacion ${claseDeSigno(variacionDiaEur)}`}>
          {monedaConSigno(variacionDiaEur)}
          {variacionDiaPct !== null && ` (${porcentaje(variacionDiaPct)})`} hoy, solo acciones
        </p>
      )}
      {actualizadoEn !== null && (
        <p className="texto-pequeno">Precios de {cuandoEnMadrid(new Date(actualizadoEn))}</p>
      )}
      {sinValor.length > 0 && (
        <p className="texto-pequeno">No suman porque les faltan datos: {sinValor.join(', ')}.</p>
      )}
    </>
  );
}

/** Estado del Nasdaq en este momento; se recalcula solo. */
export function BloqueNasdaq() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(intervalo);
  }, []);

  const { estado, sesion, proximaApertura, calendarioCubierto } = estadoMercado(ahora);
  return (
    <>
      <p className="mercado">
        <span className={`mercado__punto mercado__punto--${estado}`} aria-hidden="true" />
        Nasdaq: {ETIQUETA_ESTADO[estado]}
      </p>
      {estado === 'abierto' && sesion && (
        <p className="texto-suave">
          Cierra {cuandoEnMadrid(sesion.cierre, ahora)}
          {sesion.anticipada && ' (cierre anticipado)'}
        </p>
      )}
      {estado === 'after-hours' && sesion && (
        <p className="texto-suave">El after-hours termina {cuandoEnMadrid(sesion.finAmpliada, ahora)}</p>
      )}
      <p className="texto-suave">Próxima apertura: {cuandoEnMadrid(proximaApertura, ahora)}</p>
      {!calendarioCubierto && (
        <p className="texto-pequeno">El calendario no cubre este año: no se tienen en cuenta los festivos.</p>
      )}
    </>
  );
}

export function BloqueAportacion({ aviso }: { aviso: AvisoAportacion }) {
  return (
    <p>
      Toca aportar <strong>{moneda(aviso.importe)}</strong> a {aviso.fondos.join(' y ')}. No hay
      aportaciones desde el cobro del {fechaCorta(aviso.cobro)}.
    </p>
  );
}
