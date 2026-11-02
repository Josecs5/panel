// Calendario oficial publicado por NYSE; Nasdaq cierra los mismos días.
// Fuente: https://www.nyse.com/markets/hours-calendars
// Fechas en hora de Nueva York. Al añadir un año, añádelo también a ANOS_CUBIERTOS.

export const ANOS_CUBIERTOS = [2026, 2027];

export const FESTIVOS = new Set([
  // 2026
  '2026-01-01', // Año Nuevo
  '2026-01-19', // Martin Luther King
  '2026-02-16', // Washington
  '2026-04-03', // Viernes Santo
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independencia (se observa el viernes)
  '2026-09-07', // Labor Day
  '2026-11-26', // Acción de Gracias
  '2026-12-25', // Navidad
  // 2027
  '2027-01-01', // Año Nuevo
  '2027-01-18', // Martin Luther King
  '2027-02-15', // Washington
  '2027-03-26', // Viernes Santo
  '2027-05-31', // Memorial Day
  '2027-06-18', // Juneteenth (se observa el viernes)
  '2027-07-05', // Independencia (se observa el lunes)
  '2027-09-06', // Labor Day
  '2027-11-25', // Acción de Gracias
  '2027-12-24', // Navidad (se observa el viernes)
]);

/** Cierre a las 13:00 en Nueva York; la sesión ampliada termina a las 17:00. */
export const CIERRES_ANTICIPADOS = new Set([
  '2026-11-27', // Viernes tras Acción de Gracias
  '2026-12-24', // Nochebuena
  '2027-11-26', // Viernes tras Acción de Gracias
]);
