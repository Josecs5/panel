const TRAZOS = {
  inicio: 'M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-6h4v6',
  plazos: 'M5 6h14v14H5zM5 10h14M9 3v4M15 3v4M12 13v4',
  cartera: 'M4 20V4M4 20h16M8 16l4-5 3 3 5-7',
  vivienda: 'M5 20V5h9v15M14 10h5v10M3 20h18M8 9h3M8 13h3M8 17h3',
  candidaturas: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  prompts: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  ajustes: 'M4 7h9M17 7h3M4 17h3M11 17h9M13 5h4v4h-4zM7 15h4v4H7z',
  salir: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9',
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre }: { nombre: NombreIcono }) {
  return (
    <svg className="icono" viewBox="0 0 24 24" aria-hidden="true">
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}
