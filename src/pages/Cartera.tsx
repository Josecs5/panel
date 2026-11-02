import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { BloqueAportacion, BloqueNasdaq, BloqueValorCartera } from '../components/BloquesCartera';
import { BorrarConConfirmacion } from '../components/BorrarConConfirmacion';
import { Cabecera } from '../components/Cabecera';
import { FormularioPosicion, POSICION_VACIA } from '../components/FormularioPosicion';
import { RegistroFondos } from '../components/RegistroFondos';
import type { AccionCalculada, DatosPosicion, FondoCalculado, Posicion } from '../lib/cartera';
import { borrarPosicion, guardarElemento } from '../lib/datos';
import { fechaCorta } from '../lib/fechas';
import { claseDeSigno, moneda, monedaConSigno, numero, porcentaje } from '../lib/formato';
import { cuandoEnMadrid } from '../lib/mercado';
import { useSesion } from '../lib/sesion';
import { useCartera } from '../lib/useCartera';

const GraficoValor = lazy(() => import('../components/GraficoValor'));

const NUEVA = 'nueva';
const MOMENTO: Record<string, string> = {
  bmo: 'antes de la apertura',
  amc: 'tras el cierre',
  dmh: 'durante la sesión',
};

/** Una celda numérica; sin dato, un guion que se lee como "sin datos". */
function Cifra({ valor, etiqueta, signo }: { valor: string | null; etiqueta: string; signo?: string }) {
  return (
    <td className={`tabla__num ${signo ?? ''}`} data-etiqueta={etiqueta}>
      {valor ?? <span aria-label="Sin datos">—</span>}
    </td>
  );
}

function Acciones({
  posicion,
  onEditar,
  onBorrar,
  aviso,
}: {
  posicion: Posicion;
  onEditar: () => void;
  onBorrar: () => void;
  aviso?: string;
}) {
  return (
    <td className="tabla__acciones">
      <div className="plazo__acciones">
        <button
          type="button"
          className="boton boton--secundario"
          aria-label={`Editar ${posicion.nombre}`}
          onClick={onEditar}
        >
          Editar
        </button>
        <BorrarConConfirmacion onBorrar={onBorrar} aviso={aviso} />
      </div>
    </td>
  );
}

function faltanDeAccion({ posicion }: AccionCalculada): string[] {
  const faltan = [];
  if (posicion.cantidad === null) faltan.push('cantidad');
  if (posicion.precioMedio === null) faltan.push('precio medio');
  return faltan;
}

function FilaAccion({
  accion,
  onEditar,
  onBorrar,
}: {
  accion: AccionCalculada;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  const { posicion, cotizacion, valorUsd, valorEur, gananciaUsd, gananciaEur, gananciaPct } = accion;
  const faltan = faltanDeAccion(accion);
  const sinPrecioEnVivo = posicion.divisa !== 'USD';
  return (
    <tr>
      <th scope="row" className="tabla__nombre">
        {posicion.nombre}
        <span className="tabla__detalle">
          {posicion.identificador}
          {posicion.fechaCompra && ` · comprada el ${fechaCorta(posicion.fechaCompra)}`}
        </span>
        {faltan.length > 0 && <span className="tabla__falta">Falta: {faltan.join(' y ')}</span>}
        {sinPrecioEnVivo && <span className="tabla__falta">Solo hay precio en vivo en USD</span>}
      </th>
      <Cifra etiqueta="Cantidad" valor={posicion.cantidad === null ? null : numero(posicion.cantidad)} />
      <Cifra
        etiqueta="Precio medio"
        valor={posicion.precioMedio === null ? null : moneda(posicion.precioMedio, posicion.divisa)}
      />
      <td className="tabla__num" data-etiqueta="Precio">
        {cotizacion ? (
          <>
            {moneda(cotizacion.precio, 'USD')}
            <span className={`tabla__detalle ${claseDeSigno(cotizacion.variacion)}`}>
              {porcentaje(cotizacion.variacionPct)} hoy
            </span>
            <span className="tabla__detalle">{cuandoEnMadrid(new Date(cotizacion.guardadoEn))}</span>
          </>
        ) : (
          <span aria-label="Sin datos">—</span>
        )}
      </td>
      <td className="tabla__num" data-etiqueta="Valor">
        {valorUsd === null ? (
          <span aria-label="Sin datos">—</span>
        ) : (
          <>
            {moneda(valorUsd, 'USD')}
            {valorEur !== null && <span className="tabla__detalle">{moneda(valorEur)}</span>}
          </>
        )}
      </td>
      <Cifra
        etiqueta="Gan./pérd. USD"
        signo={claseDeSigno(gananciaUsd)}
        valor={gananciaUsd === null ? null : monedaConSigno(gananciaUsd, 'USD')}
      />
      <Cifra
        etiqueta="Gan./pérd. EUR"
        signo={claseDeSigno(gananciaEur)}
        valor={gananciaEur === null ? null : monedaConSigno(gananciaEur)}
      />
      <Cifra
        etiqueta="%"
        signo={claseDeSigno(gananciaPct)}
        valor={gananciaPct === null ? null : porcentaje(gananciaPct)}
      />
      <Acciones posicion={posicion} onEditar={onEditar} onBorrar={onBorrar} />
    </tr>
  );
}

function FilaFondo({
  fondo,
  avisoBorrado,
  onEditar,
  onBorrar,
}: {
  fondo: FondoCalculado;
  avisoBorrado?: string;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  const { posicion, participaciones, aportado, ultimoLiquidativo, valor, valorEur, ganancia, gananciaPct } = fondo;
  const divisa = posicion.divisa;
  return (
    <tr>
      <th scope="row" className="tabla__nombre">
        {posicion.nombre}
        <span className="tabla__detalle">{posicion.identificador}</span>
        {participaciones === 0 && <span className="tabla__falta">Registra una aportación</span>}
      </th>
      <Cifra etiqueta="Participaciones" valor={participaciones ? numero(participaciones) : null} />
      <Cifra etiqueta="Aportado" valor={aportado === null ? null : moneda(aportado, divisa)} />
      <td className="tabla__num" data-etiqueta="Último valor liq.">
        {ultimoLiquidativo ? (
          <>
            {numero(ultimoLiquidativo.valor, 6)}
            <span className="tabla__detalle">{fechaCorta(ultimoLiquidativo.fecha)}</span>
          </>
        ) : (
          <span aria-label="Sin datos">—</span>
        )}
      </td>
      <td className="tabla__num" data-etiqueta="Valor">
        {valor === null ? (
          <span aria-label="Sin datos">—</span>
        ) : (
          <>
            {moneda(valor, divisa)}
            {divisa !== 'EUR' && valorEur !== null && <span className="tabla__detalle">{moneda(valorEur)}</span>}
          </>
        )}
      </td>
      <Cifra
        etiqueta="Gan./pérd."
        signo={claseDeSigno(ganancia)}
        valor={ganancia === null ? null : monedaConSigno(ganancia, divisa)}
      />
      <Cifra
        etiqueta="%"
        signo={claseDeSigno(gananciaPct)}
        valor={gananciaPct === null ? null : porcentaje(gananciaPct)}
      />
      <Acciones posicion={posicion} onEditar={onEditar} onBorrar={onBorrar} aviso={avisoBorrado} />
    </tr>
  );
}

export function Cartera() {
  const uid = useSesion().usuario!.uid;
  const c = useCartera(uid);
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function guardar(datos: DatosPosicion, id?: string) {
    setError(null);
    setEditando(null);
    guardarElemento(uid, 'posiciones', datos, id).catch(() =>
      setError('No se ha podido guardar la posición. Vuelve a intentarlo.'),
    );
  }

  function borrar(id: string) {
    setError(null);
    borrarPosicion(
      uid,
      id,
      c.aportaciones.filter((a) => a.posicionId === id).map((a) => a.id),
      c.liquidativos.filter((l) => l.posicionId === id).map((l) => l.id),
    ).catch(() => setError('No se ha podido borrar la posición. Vuelve a intentarlo.'));
  }

  const avisoBorradoFondo = (id: string) => {
    const n =
      c.aportaciones.filter((a) => a.posicionId === id).length +
      c.liquidativos.filter((l) => l.posicionId === id).length;
    if (n === 0) return undefined;
    return n === 1 ? 'También se borra su registro.' : `También se borran sus ${n} registros.`;
  };

  const editarInline = (posicion: Posicion, columnas: number) => (
    <tr key={posicion.id}>
      <td colSpan={columnas} className="tabla__formulario">
        <div className="plazo-formulario">
          <FormularioPosicion
            inicial={posicion}
            onGuardar={(d) => guardar(d, posicion.id)}
            onCancelar={() => setEditando(null)}
          />
        </div>
      </td>
    </tr>
  );

  return (
    <>
      <Cabecera
        titulo="Cartera"
        accion={
          <button type="button" className="boton boton--principal" onClick={() => setEditando(NUEVA)}>
            Añadir posición
          </button>
        }
      />

      {error && (
        <p className="aviso-error aviso-error--pagina" role="alert">
          {error}
        </p>
      )}
      {c.hayError && (
        <p className="aviso-error aviso-error--pagina" role="alert">
          No se han podido cargar tus datos de cartera. Comprueba tu conexión y recarga la página.
        </p>
      )}
      {c.avisos.length > 0 && (
        <ul className="avisos" role="status">
          {c.avisos.map((texto) => (
            <li key={texto}>{texto.includes('Ajustes') ? <AvisoConEnlace texto={texto} /> : texto}</li>
          ))}
        </ul>
      )}

      {editando === NUEVA && (
        <div className="plazo-formulario plazo-formulario--alta">
          <FormularioPosicion
            inicial={POSICION_VACIA}
            onGuardar={(d) => guardar(d)}
            onCancelar={() => setEditando(null)}
          />
        </div>
      )}

      <div className="cartera__resumen">
        <section className="bloque" aria-labelledby="cartera-valor">
          <h2 id="cartera-valor">Valor de la cartera</h2>
          {c.listo ? (
            <BloqueValorCartera
              resumen={c.resumen}
              actualizadoEn={c.actualizadoEn}
              hayPosiciones={c.posiciones.length > 0}
            />
          ) : (
            <div className="esqueleto__fila" role="status" aria-label="Cargando la cartera" />
          )}
        </section>
        <section className="bloque" aria-labelledby="cartera-mercado">
          <h2 id="cartera-mercado">Mercado de EE. UU.</h2>
          <BloqueNasdaq />
        </section>
        {c.avisoAportacion && (
          <section className="bloque bloque--aviso" aria-labelledby="cartera-aviso">
            <h2 id="cartera-aviso">Aportación pendiente</h2>
            <BloqueAportacion aviso={c.avisoAportacion} />
          </section>
        )}
      </div>

      {c.acciones.length > 0 && (
        <section className="cartera__seccion" aria-labelledby="cartera-acciones">
          <h2 id="cartera-acciones" className="cartera__titulo">
            Acciones de EE. UU.
          </h2>
          <div className="tabla-marco">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Posición</th>
                  <th scope="col" className="tabla__num">Cantidad</th>
                  <th scope="col" className="tabla__num">Precio medio</th>
                  <th scope="col" className="tabla__num">Precio</th>
                  <th scope="col" className="tabla__num">Valor</th>
                  <th scope="col" className="tabla__num">Gan./pérd. USD</th>
                  <th scope="col" className="tabla__num">Gan./pérd. EUR</th>
                  <th scope="col" className="tabla__num">%</th>
                  <th scope="col"><span className="oculto">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {c.acciones.map((a) =>
                  editando === a.posicion.id ? (
                    editarInline(a.posicion, 9)
                  ) : (
                    <FilaAccion
                      key={a.posicion.id}
                      accion={a}
                      onEditar={() => setEditando(a.posicion.id)}
                      onBorrar={() => borrar(a.posicion.id)}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>
          {c.cambio && (
            <p className="texto-pequeno cartera__nota">
              En euros, al cambio de hoy: 1 USD = {numero(c.cambio.usdEur, 4)} € ({c.cambio.fuente},{' '}
              {fechaCorta(c.cambio.fecha)}).
            </p>
          )}
        </section>
      )}

      {c.fondos.length > 0 && (
        <section className="cartera__seccion" aria-labelledby="cartera-fondos">
          <h2 id="cartera-fondos" className="cartera__titulo">
            Fondos
          </h2>
          <div className="tabla-marco">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Posición</th>
                  <th scope="col" className="tabla__num">Participaciones</th>
                  <th scope="col" className="tabla__num">Aportado</th>
                  <th scope="col" className="tabla__num">Último valor liq.</th>
                  <th scope="col" className="tabla__num">Valor</th>
                  <th scope="col" className="tabla__num">Gan./pérd.</th>
                  <th scope="col" className="tabla__num">%</th>
                  <th scope="col"><span className="oculto">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {c.fondos.map((f) =>
                  editando === f.posicion.id ? (
                    editarInline(f.posicion, 8)
                  ) : (
                    <FilaFondo
                      key={f.posicion.id}
                      fondo={f}
                      avisoBorrado={avisoBorradoFondo(f.posicion.id)}
                      onEditar={() => setEditando(f.posicion.id)}
                      onBorrar={() => borrar(f.posicion.id)}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>

          <Suspense fallback={<div className="esqueleto__fila" role="status" aria-label="Cargando el gráfico" />}>
            <GraficoValor
              fondos={c.fondosPosicion}
              aportaciones={c.aportaciones}
              liquidativos={c.liquidativos}
              usdEur={c.usdEur}
            />
          </Suspense>

          <RegistroFondos
            uid={uid}
            fondos={c.fondosPosicion}
            aportaciones={c.aportaciones}
            liquidativos={c.liquidativos}
            hoy={c.hoy}
            importeHabitual={c.ajustes.aportacionPorFondo}
            onError={setError}
          />
        </section>
      )}

      {c.listo && c.posiciones.length === 0 && (
        <p className="vacio cartera__vacio">
          Aún no tienes posiciones. Añade la primera o importa tu copia desde{' '}
          <Link className="enlace" to="/ajustes">
            Ajustes
          </Link>
          .
        </p>
      )}

      {c.resultados.length > 0 && (
        <section className="cartera__seccion" aria-labelledby="cartera-resultados">
          <h2 id="cartera-resultados" className="cartera__titulo">
            Próximos resultados
          </h2>
          <ul className="lista-registro">
            {[...c.resultados]
              .sort((a, b) => a.fecha.localeCompare(b.fecha))
              .map((r) => (
                <li key={`${r.ticker}-${r.fecha}`} className="registro__fila">
                  <div>
                    <p className="registro__principal">
                      {r.ticker}
                      <span className="registro__fecha">{fechaCorta(r.fecha)}</span>
                    </p>
                    <p className="texto-pequeno">
                      {r.trimestre && r.ano ? `T${r.trimestre} de ${r.ano}` : 'Resultados trimestrales'}
                      {MOMENTO[r.momento] && ` · ${MOMENTO[r.momento]}`}
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  );
}

function AvisoConEnlace({ texto }: { texto: string }) {
  const [antes, despues] = texto.split('Ajustes');
  return (
    <>
      {antes}
      <Link className="enlace" to="/ajustes">
        Ajustes
      </Link>
      {despues}
    </>
  );
}
