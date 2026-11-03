import { Chart, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import { useEffect, useRef } from 'react';
import { euros, pct } from '../lib/pronosticos';
import { useModoOscuro } from '../lib/useModoOscuro';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip);
Chart.defaults.font.family = "'Hanken Grotesk', system-ui, sans-serif";

const opcionesEje = (tinta: string, rejilla: string) => ({
  type: 'linear' as const,
  grid: { color: rejilla },
  border: { display: false },
  ticks: { color: tinta },
});

export function GraficoBeneficio({ serie }: { serie: { semana: string; acumulado: number }[] }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const oscuro = useModoOscuro();

  useEffect(() => {
    if (!lienzo.current || serie.length < 2) return;
    const estilo = getComputedStyle(lienzo.current);
    const color = (nombre: string) => estilo.getPropertyValue(nombre).trim();
    const tinta = color('--tinta-suave');
    const grafico = new Chart(lienzo.current, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Beneficio acumulado',
            clip: false,
            data: serie.map((p, i) => ({ x: i, y: p.acumulado / 100 })),
            borderColor: color('--serie-valor'),
            backgroundColor: color('--serie-valor'),
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 5,
            pointBorderWidth: 2,
            pointBorderColor: color('--fondo'),
          },
        ],
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        scales: {
          x: {
            ...opcionesEje(tinta, 'transparent'),
            min: 0,
            max: serie.length - 1,
            ticks: {
              color: tinta,
              precision: 0,
              maxTicksLimit: 6,
              callback: (valor) => serie[Number(valor)]?.semana.replace(/^\d{4}-W/, 'S') ?? '',
            },
          },
          y: {
            ...opcionesEje(tinta, color('--linea')),
            ticks: { color: tinta, maxTicksLimit: 6, callback: (valor) => euros(Number(valor) * 100) },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            intersect: false,
            mode: 'index',
            backgroundColor: color('--superficie'),
            titleColor: color('--tinta'),
            bodyColor: color('--tinta'),
            borderColor: color('--linea-fuerte'),
            borderWidth: 1,
            displayColors: false,
            callbacks: {
              title: (puntos) => serie[puntos[0].dataIndex]?.semana ?? '',
              label: (punto) => euros(serie[punto.dataIndex].acumulado),
            },
          },
        },
      },
    });
    return () => grafico.destroy();
  }, [serie, oscuro]);

  return (
    <div className="grafico__lienzo">
      <canvas
        ref={lienzo}
        role="img"
        aria-label={`Beneficio acumulado: ${euros(serie[serie.length - 1]?.acumulado ?? 0)} tras ${serie.length} jornadas`}
      />
    </div>
  );
}

export type TramoCalibracion = { tramo: string; n: number; esperado: number; real: number };

/** La diagonal es la calibración perfecta: un punto por debajo acierta menos de lo que prometía. */
export function GraficoCalibracion({ tramos }: { tramos: TramoCalibracion[] }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const oscuro = useModoOscuro();

  useEffect(() => {
    if (!lienzo.current || !tramos.length) return;
    const estilo = getComputedStyle(lienzo.current);
    const color = (nombre: string) => estilo.getPropertyValue(nombre).trim();
    const tinta = color('--tinta-suave');
    const eje = (titulo: string, rejilla: string) => ({
      ...opcionesEje(tinta, rejilla),
      min: 0,
      max: 1,
      title: { display: true, text: titulo, color: tinta },
      ticks: { color: tinta, stepSize: 0.2, callback: (valor: string | number) => pct(Number(valor)) },
    });
    const grafico = new Chart(lienzo.current, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Calibración perfecta',
            data: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            borderColor: color('--linea-fuerte'),
            borderWidth: 1,
            pointRadius: 0,
            pointHoverRadius: 0,
          },
          {
            label: 'Real frente a esperado',
            clip: false,
            data: tramos.map((t) => ({ x: t.esperado, y: t.real })),
            borderColor: color('--serie-valor'),
            backgroundColor: color('--serie-valor'),
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 5,
            pointBorderWidth: 2,
            pointBorderColor: color('--fondo'),
          },
        ],
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        scales: { x: eje('Probabilidad esperada', 'transparent'), y: eje('Acierto real', color('--linea')) },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: (punto) => punto.datasetIndex === 1,
            backgroundColor: color('--superficie'),
            titleColor: color('--tinta'),
            bodyColor: color('--tinta'),
            borderColor: color('--linea-fuerte'),
            borderWidth: 1,
            displayColors: false,
            callbacks: {
              title: (puntos) => `Tramo ${tramos[puntos[0].dataIndex]?.tramo ?? ''}`,
              label: (punto) => {
                const t = tramos[punto.dataIndex];
                return `Esperado ${pct(t.esperado)}, real ${pct(t.real)} (${t.n} casos)`;
              },
            },
          },
        },
      },
    });
    return () => grafico.destroy();
  }, [tramos, oscuro]);

  return (
    <div className="grafico__lienzo grafico__lienzo--cuadrado">
      <canvas ref={lienzo} role="img" aria-label="Calibración: acierto real frente a probabilidad esperada, por tramos" />
    </div>
  );
}
