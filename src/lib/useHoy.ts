import { useEffect, useState } from 'react';
import { hoyEnMadrid } from './fechas.ts';

/** La fecha de hoy en Madrid; se actualiza sola si el panel sigue abierto a medianoche. */
export function useHoy(): string {
  const [hoy, setHoy] = useState(() => hoyEnMadrid());

  useEffect(() => {
    const actualizar = () => setHoy(hoyEnMadrid());
    const intervalo = setInterval(actualizar, 60_000);
    document.addEventListener('visibilitychange', actualizar);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', actualizar);
    };
  }, []);

  return hoy;
}
