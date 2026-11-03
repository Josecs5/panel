"""Jugadores: tasa por 90 minutos encogida, minutos esperados y factor del rival.

Los datos salen de las tablas que importa el usuario en la web. Si una tabla no lleva
posición, la tasa se encoge hacia la media de todos los jugadores importados. El factor
del árbitro no se aplica porque el backtest no encontró que mejorara las predicciones.
"""

from dataclasses import dataclass
from math import exp

from ..fuentes.emparejar import parecido

CATEGORIAS = {
    "faltas": "faltas_cometidas",
    "recibe_falta": "faltas_recibidas",
    "tarjeta": "amarillas",
    "tiros_puerta": "tiros_puerta",
}
MINUTOS_DE_ENCOGIMIENTO = 450.0
PARECIDO_MINIMO_EQUIPO = 0.6
TOP = 3


@dataclass(frozen=True)
class ProbabilidadJugador:
    jugador: str
    probabilidad: float
    origen: str  # "modelo", "mercado" o "sin_datos"


def _numero(valor) -> float:
    return float(valor) if isinstance(valor, (int, float)) and valor >= 0 else 0.0


def tasas(filas: list[dict]) -> list[dict]:
    """Añade a cada fila su tasa encogida por 90 minutos y sus minutos esperados."""
    validas = [f for f in filas if _numero(f.get("minutos")) > 0 and f.get("jugador")]
    if not validas:
        return []

    medias: dict[tuple[str, str], float] = {}
    for campo in CATEGORIAS.values():
        posiciones = {f.get("posicion") or "" for f in validas}
        for posicion in posiciones:
            grupo = [f for f in validas if (f.get("posicion") or "") == posicion]
            minutos = sum(_numero(f["minutos"]) for f in grupo)
            medias[(campo, posicion)] = sum(_numero(f.get(campo)) for f in grupo) / minutos if minutos else 0.0

    max_minutos: dict[str, float] = {}
    for fila in validas:
        equipo = fila.get("equipo", "")
        max_minutos[equipo] = max(max_minutos.get(equipo, 0.0), _numero(fila["minutos"]))

    salida = []
    for fila in validas:
        minutos = _numero(fila["minutos"])
        posicion = fila.get("posicion") or ""
        nueva = {
            "jugador": fila["jugador"],
            "equipo": fila.get("equipo", ""),
            "minutos_esperados": min(90.0, 90.0 * minutos / max_minutos[fila.get("equipo", "")]),
        }
        for categoria, campo in CATEGORIAS.items():
            por_minuto = (_numero(fila.get(campo)) + MINUTOS_DE_ENCOGIMIENTO * medias[(campo, posicion)]) / (
                minutos + MINUTOS_DE_ENCOGIMIENTO
            )
            nueva[categoria] = por_minuto * 90.0
        salida.append(nueva)
    return salida


def probabilidad_evento(tasa_90: float, minutos_esperados: float, factor_rival: float = 1.0) -> float:
    return 1.0 - exp(-tasa_90 * minutos_esperados / 90.0 * factor_rival)


def del_equipo(tabla: list[dict], equipo: str) -> list[dict]:
    if not tabla:
        return []
    puntos = {f["equipo"]: parecido(f["equipo"], equipo) for f in tabla}
    mejor = max(puntos, key=puntos.get)
    if puntos[mejor] < PARECIDO_MINIMO_EQUIPO:
        return []
    return [f for f in tabla if f["equipo"] == mejor]


def _mismo_jugador(a: str, b: str) -> bool:
    """El mercado escribe «Apellido, Nombre» y las tablas suelen traer «Nombre Apellido»."""
    if "," in a:
        apellido, _, nombre = a.partition(",")
        a = f"{nombre.strip()} {apellido.strip()}"
    return parecido(a, b) >= 0.85


def top_por_categoria(
    tabla_local: list[dict],
    tabla_visitante: list[dict],
    factores: dict[str, tuple[float, float]],
    mercado: dict[str, dict[str, float]],
) -> dict[str, list[ProbabilidadJugador]]:
    """Los 3 jugadores más probables de cada categoría.

    `factores` da, por categoría, el factor del rival de (local, visitante).
    `mercado` da, por categoría, las probabilidades sin margen por jugador. Si un
    jugador tiene dato de mercado, se usa ese porque el mercado ha sido el más fiable.
    """
    resultado: dict[str, list[ProbabilidadJugador]] = {}
    for categoria in CATEGORIAS:
        candidatos: list[ProbabilidadJugador] = []
        de_mercado = mercado.get(categoria, {})
        usados: set[str] = set()
        factor_l, factor_v = factores.get(categoria, (1.0, 1.0))
        for tabla, factor in ((tabla_local, factor_l), (tabla_visitante, factor_v)):
            for fila in tabla:
                coincide = next((n for n in de_mercado if _mismo_jugador(n, fila["jugador"])), None)
                if coincide:
                    usados.add(coincide)
                    candidatos.append(ProbabilidadJugador(coincide, de_mercado[coincide], "mercado"))
                else:
                    p = probabilidad_evento(fila[categoria], fila["minutos_esperados"], factor)
                    candidatos.append(ProbabilidadJugador(fila["jugador"], p, "modelo"))
        for nombre, p in de_mercado.items():
            if nombre not in usados:
                candidatos.append(ProbabilidadJugador(nombre, p, "mercado"))
        candidatos.sort(key=lambda c: c.probabilidad, reverse=True)
        resultado[categoria] = candidatos[:TOP]
    return resultado
