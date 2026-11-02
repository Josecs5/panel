import {
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type Plugin,
} from 'chart.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { serieValorAportado, type Aportacion, type Liquidativo, type Posicion } from '../lib/cartera';
import { fechaCorta, fechaLarga } from '../lib/fechas';
import { moneda } from '../lib/formato';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip);
Chart.defaults.font.family = "'Hanken Grotesk', system-ui, sans-serif";

const TODOS = 'todos';
const aTiempo = (fecha: string) => Date.parse(`${fecha}T12:00:00Z`);
const EJE_FECHA = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', month: 'short', year: '2-digit' });
const EJE_DIA = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const EJE_EUROS = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const lineaVertical: Plugin<'line'> = {
  id: 'lineaVertical',
  afterDraw(chart) {
    const activo = chart.tooltip?.getActiveElements()[0];
    if (!activo) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(activo.element.x, chartArea.top);
    ctx.lineTo(activo.element.x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = getComputedStyle(chart.canvas).getPropertyValue('--linea-fuerte');
    ctx.stroke();
    ctx.restore();
  },
};

function useModoOscuro() {
  const [oscuro, setOscuro] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const consulta = matchMedia('(prefers-color-scheme: dark)');
    const cambiar = () => setOscuro(consulta.matches);
    consulta.addEventListener('change', cambiar);
    return () => consulta.removeEventListener('change', cambiar);
  }, []);
  return oscuro;
}

export default function GraficoValor({
  fondos,
  aportaciones,
  liquidativos,
  usdEur,
}: {
  fondos: Posicion[];
  aportaciones: Aportacion[];
  liquidativos: Liquidativo[];
  usdEur: number | null;
}) {
  const [seleccion, setSeleccion] = useState(TODOS);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const oscuro = useModoOscuro();

  const elegidos = useMemo(
    () => (seleccion === TODOS ? fondos : fondos.filter((f) => f.id === seleccion)),
    [seleccion, fondos],
  );
  const serie = useMemo(
    () => serieValorAportado(elegidos, aportaciones, liquidativos, usdEur),
    [elegidos, aportaciones, liquidativos, usdEur],
  );
  const ultimo = serie[serie.length - 1];

  useEffect(() => {
    if (!lienzo.current || serie.length < 2) return;
    const estilo = getComputedStyle(lienzo.current);
    const color = (nombre: string) => estilo.getPropertyValue(nombre).trim();
    const superficie = color('--fondo');
    const inicio = aTiempo(serie[0].fecha);
    const fin = aTiempo(serie[serie.length - 1].fecha);
    const menosDeUnAno = fin - inicio < 330 * 86_400_000;

    const grafico = new Chart(lienzo.current, {
      type: 'line',
      plugins: [lineaVertical],
      data: {
        datasets: [
          {
            label: 'Valor',
            clip: false,
            data: serie.map((p) => ({ x: aTiempo(p.fecha), y: p.valor })),
            borderColor: color('--serie-valor'),
            backgroundColor: color('--serie-valor'),
            pointBorderColor: superficie,
            borderWidth: 2,
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 5,
          },
          {
            label: 'Aportado',
            clip: false,
            data: serie.map((p) => ({ x: aTiempo(p.fecha), y: p.aportado })),
            borderColor: color('--serie-aportado'),
            backgroundColor: color('--serie-aportado'),
            pointBorderColor: superficie,
            borderWidth: 2,
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 5,
            // Lo aportado no crece poco a poco: sube de golpe el día de la aportación.
            stepped: 'before',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        // Aire para que los puntos de los extremos no queden cortados.
        layout: { padding: { top: 8, right: 8 } },
        scales: {
          // Escala lineal de tiempo: la distancia entre puntos es proporcional a los días.
          x: {
            type: 'linear',
            min: inicio,
            max: fin,
            grid: { display: false },
            border: { color: color('--linea') },
            ticks: {
              color: color('--tinta-suave'),
              maxTicksLimit: 6,
              maxRotation: 0,
              callback: (v) => (menosDeUnAno ? EJE_DIA : EJE_FECHA).format(new Date(Number(v))),
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: color('--linea') },
            border: { display: false },
            ticks: {
              color: color('--tinta-suave'),
              maxTicksLimit: 6,
              callback: (v) => EJE_EUROS.format(Number(v)),
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: color('--superficie'),
            titleColor: color('--tinta'),
            bodyColor: color('--tinta'),
            borderColor: color('--linea-fuerte'),
            borderWidth: 1,
            usePointStyle: true,
            callbacks: {
              title: ([punto]) => fechaLarga(new Date(punto.parsed.x ?? 0).toISOString().slice(0, 10)),
              label: (punto) => `${punto.dataset.label}: ${moneda(punto.parsed.y ?? 0)}`,
            },
          },
        },
      },
    });
    return () => grafico.destroy();
  }, [serie, oscuro]);

  return (
    <section aria-labelledby="cartera-grafico" className="grafico">
      <div className="grafico__cabecera">
        <h2 id="cartera-grafico">Valor frente a lo aportado</h2>
        {fondos.length > 1 && (
          <label className="campo campo--enLinea">
            <span>Fondo</span>
            <select value={seleccion} onChange={(e) => setSeleccion(e.target.value)}>
              <option value={TODOS}>Todos los fondos</option>
              {fondos.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {serie.length < 2 ? (
        <p className="vacio">
          El gráfico aparece con al menos dos fechas: registra aportaciones o valores liquidativos.
        </p>
      ) : (
        <>
          <ul className="leyenda">
            <li>
              <span className="leyenda__marca leyenda__marca--valor" aria-hidden="true" />
              Valor <strong>{moneda(ultimo.valor)}</strong>
            </li>
            <li>
              <span className="leyenda__marca leyenda__marca--aportado" aria-hidden="true" />
              Aportado <strong>{moneda(ultimo.aportado)}</strong>
            </li>
          </ul>
          <div className="grafico__lienzo">
            <canvas
              ref={lienzo}
              role="img"
              aria-label={`Evolución del valor frente a lo aportado. A ${fechaCorta(ultimo.fecha)}: valor ${moneda(ultimo.valor)}, aportado ${moneda(ultimo.aportado)}. La tabla de datos está justo debajo.`}
            />
          </div>
          <details className="grafico__datos">
            <summary>Ver los datos en una tabla</summary>
            <div className="tabla-marco">
              <table className="tabla tabla--simple">
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col" className="tabla__num">Valor</th>
                    <th scope="col" className="tabla__num">Aportado</th>
                  </tr>
                </thead>
                <tbody>
                  {serie.map((p) => (
                    <tr key={p.fecha}>
                      <td>{fechaCorta(p.fecha)}</td>
                      <td className="tabla__num">{moneda(p.valor)}</td>
                      <td className="tabla__num">{moneda(p.aportado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
