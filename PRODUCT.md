# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + TypeScript con HashRouter, publicado en GitHub Pages desde un repo público mediante GitHub Actions. Firebase en plan Spark, solo Authentication (email/contraseña) y Cloud Firestore. Decisión cerrada por el propietario: no se cambia sin preguntar.

## Users

Una sola persona, propietaria del panel. Lo abre a diario en el ordenador, sobre todo en escritorio, y lo consulta a veces en el móvil. Su trabajo es saber de un vistazo qué vence pronto, cómo va su dinero y en qué punto están sus trámites, y mantener esos datos al día.

## Product Purpose

Panel personal y privado que reúne en un solo sitio plazos, cartera de inversión, convocatorias de vivienda, candidaturas de empleo y una biblioteca de prompts. Tiene éxito si abrirlo cada día basta para saber qué toca hacer, sin mirar otras webs ni hojas de cálculo.

## Positioning

Está hecho para una sola persona y sus datos: ninguna cuenta ajena, ninguna función genérica. Cruza plazos, mercado, vivienda y empleo en una misma portada, y no cuesta nada mantenerlo.

## Operating Context

- Interfaz en español; fechas y moneda en formato es-ES; zona horaria Europe/Madrid.
- La hora del mercado de EE. UU. se calcula en America/New_York y se muestra en hora de Madrid.
- Los precios de bolsa llegan de Finnhub y el cambio de divisa de Frankfurter. Los fondos se registran a mano.

## Capabilities and Constraints

- Coste cero obligatorio: nada que pida tarjeta ni pueda generar cargos. Prohibido cualquier servicio que exija el plan Blaze.
- El repositorio es público: ningún dato personal, clave ni UID en archivos versionados.
- Acceso con usuario y contraseña, sin registro ni recuperación de contraseña. Sin sesión solo se ve el login.
- Secciones: Inicio, Plazos, Cartera, Vivienda, Candidaturas, Prompts y Ajustes. No se añaden funciones fuera de estas.
- Solo se admiten las dependencias autorizadas por el propietario; para cualquier otra se pregunta antes.
- Si una API falla o falta la clave, se muestra el último dato guardado con su hora y un aviso. La página nunca se rompe.

## Evidence on Hand

Los datos reales los aporta el propietario y viven fuera del repo: un archivo local de carga inicial y Firestore. No hay logotipo ni marca previos.

## Product Principles

1. Lo urgente se ve primero: el tiempo que falta manda sobre todo lo demás.
2. Cada cifra dice de cuándo es: un dato antiguo se muestra como antiguo, nunca como actual.
3. Un fallo externo degrada una tarjeta, nunca la página.
4. Lo privado se queda fuera del código: los datos solo existen tras el login.
5. Menos es mejor: si no está en el alcance acordado, no se construye.

## Accessibility & Inclusion

Requisitos confirmados: buena lectura a 1440 px y a 375 px sin scroll horizontal, y modo claro y oscuro según el sistema.
