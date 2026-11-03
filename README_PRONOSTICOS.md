# Pronósticos

Módulo personal de modelado de fútbol para LaLiga, Premier League, Bundesliga, Serie A y Champions League. Estima probabilidades, las audita y solo propone apuestas si la cuota supera lo que el mercado considera justo, con un máximo de 5 € por jornada.

**Qué esperar:** el backtest no encontró ventaja frente al mercado. Lo normal es un boleto de 0 € casi todas las semanas. El módulo es, ante todo, un proyecto de modelado y auditoría.

## Cómo funciona

1. Un workflow de GitHub Actions (`.github/workflows/pronosticos.yml`) se ejecuta cada día a las 5:00 UTC: las 6:00 en invierno y las 7:00 en verano en Madrid. GitHub puede retrasarlo un rato.
2. Baja los CSV a la caché del workflow, consulta football-data.org y OddsPapi, liquida lo jugado, recalcula los pronósticos y escribe en Firestore.
3. La web lee esos datos y guarda solo lo que introduces tú.

Cada ejecución sube `pipeline/estado.json`, con la fecha, la versión del modelo y el número de partidos. Así GitHub no desactiva el workflow por inactividad.

## Secrets que hay que crear

En GitHub, en Settings > Secrets and variables > Actions, o con `gh secret set NOMBRE -R Josecs5/panel`:

| Secret | De dónde sale |
|---|---|
| `FOOTBALL_DATA_TOKEN` | Cuenta gratuita de football-data.org |
| `ODDSPAPI_KEY` | Cuenta gratuita de OddsPapi |
| `PANEL_UID` | Firebase > Authentication > Users, columna «UID de usuario» |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase > Configuración del proyecto > Cuentas de servicio > Generar nueva clave privada; el contenido del JSON |

El JSON de la cuenta de servicio da acceso total a Firestore. Súbelo como secret y borra el archivo. Si `PANEL_UID` no corresponde a un usuario con datos del panel, la ejecución para sin escribir nada.

Para lanzarlo a mano: Actions > Pronósticos > Run workflow, en modo `diario` o `backtest`.

## Cambiar casas y umbrales

Todo está en Pronósticos > Ajustes y se aplica desde la próxima jornada:

- **Casas de apuestas:** nombres de OddsPapi separados por comas, en orden de preferencia, como `bet365.es, codere.es, bwin.es`. Se propone la primera que ofrezca el mercado. Cada casa gasta una petición al día, y hay una más para Pinnacle, que solo sirve de referencia.
- **Destacados:** máximo por liga y de Champions.
- **Derbis:** uno por línea, con los nombres de football-data.org: `Sevilla FC - Real Betis Balompié`.
- **Umbrales:** VE, probabilidad y cuotas.
- **Inicio de la jornada:** el lunes, por defecto.

El tope de 5 € por jornada es una constante en `pipeline/pronosticos/config.py` y `src/lib/pronosticos.ts`. No se puede cambiar desde la web, y las pérdidas de una jornada no aumentan el presupuesto de la siguiente.

## Reglas de apuesta

- **Probabilidad final:** peso × modelo + (1 − peso) × mercado sin margen, tomando Pinnacle como referencia cuando lo ofrece.
- **Peso inicial:** 0 en 1X2 y más/menos 2,5, porque el modelo no ganó al mercado en el backtest; 0,4 en el resto.
- **Mercados que se pueden apostar:** 1X2 y más/menos 2,5 desde el principio. Los demás, incluidos los de jugador, cuando tengan 50 liquidados y no sean peores que el mercado.
- **Solo informativos:** faltas y tiros a puerta por equipo, y faltas recibidas por jugador, porque no tienen cuotas.
- **Simples:** VE de al menos 4 %, probabilidad de al menos 25 % y cuota entre 1,40 y 5,00.
- **Combinadas:** hasta 3 selecciones de partidos distintos, cada una con VE positivo; el conjunto, con VE de al menos 4 % y probabilidad de al menos 15 %.
- **Stake:** 1/4 de Kelly sobre 50 € teóricos, redondeado a 0,10 €, con un mínimo de 0,50 €.
- **Boleto:** hay uno por jornada, generado en la primera ejecución con cuotas. Cada partido entra una sola vez.
- **Pronósticos:** se congelan la mañana del partido y nunca se reescriben.

## Importar datos a mano

Pronósticos > Ajustes > Importar datos de jugadores:

1. Copia una tabla de una web y pégala, o sube un CSV.
2. Pulsa **Ver vista previa** y comprueba qué dato hay en cada columna. Pueden venir en cualquier orden. Solo son obligatorios el jugador y una columna de datos.
3. Si un nombre se parece a un jugador conocido, decide si es el mismo.
4. Escribe la fuente y guarda.

Puedes repartir los datos en varias tablas, como una de faltas y otra de tiros: se combinan por jugador y equipo. Si dos tablas traen el mismo dato, manda la más reciente; lo que una tabla no trae no borra nada. Un jugador se usa cuando alguna de tus tablas trae sus minutos, y cada dato que falte se queda sin estimar, sin contar como 0. Al borrar una importación, desaparece solo lo que aportaba. La columna «90s» no son minutos: si la tabla solo trae esa, multiplícala por 90 antes de importar.

Los datos se guardan solo en Firestore, nunca en el repo. Inicio avisa si tienen más de 14 días.

Tras cada partido, Pronósticos > Pendientes te pide lo que falte:

- **Champions:** córners, faltas, tarjetas y tiros a puerta de cada equipo. Los CSV no cubren esta competición.
- **Jugadores:** una lista de sí o no, solo para los jugadores de tus apuestas y el primero de cada mercado.

Lo que guardes se liquida en la siguiente ejecución diaria. Lo que no se pueda liquidar en 7 días queda como «sin liquidar» y no cuenta en las métricas.

## Leer la auditoría

- **Log loss y Brier:** miden el error de las probabilidades; cuanto más bajo, mejor.
- **Modelo frente al mercado:** si el log loss del mercado es más bajo, el modelo no le gana y el peso del mercado sube.
- **Esperado frente a real:** deberían parecerse. Si se esperaba un 41 % y sale un 30 %, el modelo se pasa de optimista.
- **Calibración:** cada punto compara lo prometido con lo ocurrido en un tramo de probabilidad. Lo ideal es que quede sobre la diagonal.
- **ROI y beneficio:** con pocos casos dependen mucho de la suerte. Cualquier métrica con menos de 30 casos lleva el aviso «Muestra pequeña».
- **CLV:** compara tu cuota con la de cierre. Si es positivo de forma sostenida, es mejor señal de ventaja que el beneficio.
- **En pausa:** un mercado que rinde claramente peor que el mercado en sus últimos 100 casos deja de apostarse, aunque se siga pronosticando.
- **Versiones:** cada jornada nueva crea una versión con un changelog que explica cualquier cambio de peso.

## Cuotas gratuitas

| Fuente | Límite | Uso |
|---|---|---|
| OddsPapi | 250 peticiones/mes; tope interno de 200 | 4 al día, unas 124 al mes. Al llegar al tope, el pipeline sigue sin cuotas y lo avisa |
| football-data.org | 10 llamadas/min | 8 al día; más la primera vez, para las temporadas pasadas |
| Firestore (Spark) | 50.000 lecturas y 20.000 escrituras/día; 1 GiB | Unos 34 KB por partido, 16 partidos por semana |

El consumo se ve en Pronósticos > Ajustes > Última ejecución.

## Desarrollo

```
pip install -r pipeline/requirements.txt
cd pipeline && python -m pytest tests -q
npm test
npm run build
```

Las pruebas de Firestore del pipeline solo se ejecutan con el emulador activo. Los CSV de football-data.co.uk los baja el workflow: su `robots.txt` veta a los agentes de IA.
