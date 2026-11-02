import { fechaCorta } from '../lib/fechas';
import { diasHasta, esUrgente, type CategoriaVista, type PlazoListado } from '../lib/plazos';

const CLASE_CATEGORIA: Record<CategoriaVista, string> = {
  Viaje: 'categoria--viaje',
  Trámites: 'categoria--tramites',
  Trabajo: 'categoria--trabajo',
  Inversión: 'categoria--inversion',
  Personal: 'categoria--personal',
  Vivienda: 'categoria--vivienda',
};

export function EtiquetaCategoria({ categoria }: { categoria: CategoriaVista }) {
  return <span className={`categoria ${CLASE_CATEGORIA[categoria]}`}>{categoria}</span>;
}

/** El gesto propio de Panel: la cuenta atrás se lee como el número de un portal. */
export function PlacaDias({ dias }: { dias: number }) {
  const clases = ['placa'];
  if (esUrgente(dias)) clases.push('placa--urgente');
  if (dias >= 1000) clases.push('placa--larga');
  return (
    <div className={clases.join(' ')}>
      {dias === 0 ? (
        <span className="placa__hoy">Hoy</span>
      ) : (
        <>
          <span className="placa__numero">{dias}</span>
          <span className="placa__unidad">{dias === 1 ? 'día' : 'días'}</span>
        </>
      )}
    </div>
  );
}

export function ResumenPlazo({ plazo, hoy }: { plazo: PlazoListado; hoy: string }) {
  return (
    <>
      <PlacaDias dias={diasHasta(plazo.fecha, hoy)} />
      <div className="plazo__cuerpo">
        <p className="plazo__titulo">{plazo.titulo}</p>
        <p className="plazo__meta">
          <time dateTime={plazo.fecha}>{fechaCorta(plazo.fecha)}</time>
          <EtiquetaCategoria categoria={plazo.categoria} />
        </p>
      </div>
    </>
  );
}
