"""Traduce los mercados de OddsPapi a claves propias y agrupa las que se auditan juntas.

Ejemplos de clave: 1, X2, o25, btts_si, corners_o95, corners_l_u45, tarjetas_v_o15,
jug:faltas:Apellido, Nombre.
"""

import re

import numpy as np

from .modelo.margen import quitar_margen

# Los mercados de jugador solo ofrecen un lado, así que no se puede calcular su margen
# real. Es una estimación: el dato siempre se marca con su origen.
MARGEN_JUGADOR = 0.10

_GOLES_LINEAS = {1.5, 2.5, 3.5}
_RESULTADO = {"1": "1", "X": "X", "2": "2"}
_DOBLE = {"1X": "1X", "2X": "X2", "X2": "X2", "12": "12"}
_AMBOS = {"Yes": "btts_si", "No": "btts_no"}
_LADO = {"Over": "o", "Under": "u"}
_ESTADISTICAS = {
    "Corners - Over Under Full Time": ("corners", ""),
    "Corners - Over Under Team 1": ("corners", "l_"),
    "Corners - Over Under Team 2": ("corners", "v_"),
    "Bookings - Over Under Full Time": ("tarjetas", ""),
    "Bookings - Over Under Team 1": ("tarjetas", "l_"),
    "Bookings - Over Under Team 2": ("tarjetas", "v_"),
}
_JUGADOR = {
    "Player Fouls Committed (incl. overtime)": ("faltas", "1+"),
    "Player Shots On Goal (incl. overtime)": ("tiros_puerta", "1+"),
    "Player To Be Carded (incl. overtime)": ("tarjeta", "Yes"),
}


def linea_a_texto(linea: float) -> str:
    return str(linea).replace(".", "")


def clave_de_linea(linea: dict) -> str | None:
    """Clave propia de una línea de cuotas, o None si no nos interesa ese mercado."""
    nombre, seleccion = linea["nombre"], linea["seleccion"]
    if nombre == "Full Time Result":
        return _RESULTADO.get(seleccion)
    if nombre == "Double Chance Full Time":
        return _DOBLE.get(seleccion)
    if nombre == "Both Teams To Score":
        return _AMBOS.get(seleccion)
    if nombre == "Over Under Full Time":
        if seleccion in _LADO and linea.get("linea") in _GOLES_LINEAS:
            return f"{_LADO[seleccion]}{linea_a_texto(linea['linea'])}"
        return None
    if nombre in _ESTADISTICAS and seleccion in _LADO and linea.get("linea"):
        estadistica, equipo = _ESTADISTICAS[nombre]
        return f"{estadistica}_{equipo}{_LADO[seleccion]}{linea_a_texto(linea['linea'])}"
    if nombre in _JUGADOR and linea.get("jugador") and seleccion == _JUGADOR[nombre][1]:
        return f"jug:{_JUGADOR[nombre][0]}:{linea['jugador']}"
    return None


def grupo_de(clave: str) -> str:
    """Grupo de auditoría: cada uno tiene su peso, su estado y sus métricas."""
    if clave in ("1", "X", "2"):
        return "1x2"
    if clave in ("1X", "12", "X2"):
        return "doble_oportunidad"
    if clave in ("btts_si", "btts_no"):
        return "ambos_marcan"
    if re.fullmatch(r"[ou](15|25|35)", clave):
        return f"ou{clave[1:]}"
    if clave.startswith("jug:"):
        return f"jugador_{clave.split(':')[1]}"
    coincidencia = re.fullmatch(r"(corners|tarjetas|faltas|tiros_puerta)_(l_|v_)?[ou]\d+", clave)
    if coincidencia:
        return coincidencia.group(1) + ("_equipo" if coincidencia.group(2) else "")
    raise ValueError(f"Clave desconocida: {clave}")


def familia_de(clave: str) -> str:
    """Claves que se reparten la misma probabilidad y sirven para quitar el margen."""
    if clave.startswith("jug:"):
        return clave
    grupo = grupo_de(clave)
    if grupo in ("1x2", "doble_oportunidad", "ambos_marcan"):
        return grupo
    return re.sub(r"[ou](\d+)$", r"\1", clave)


def probabilidades_mercado(cuotas: dict[str, float]) -> dict[str, float]:
    """Quita el margen a las cuotas de una casa, familia a familia."""
    familias: dict[str, list[str]] = {}
    for clave in cuotas:
        familias.setdefault(familia_de(clave), []).append(clave)

    salida: dict[str, float] = {}
    for familia, claves in familias.items():
        if claves[0].startswith("jug:"):
            salida[claves[0]] = min(1.0 / (cuotas[claves[0]] * (1.0 + MARGEN_JUGADOR)), 1.0)
            continue
        esperadas = 3 if familia in ("1x2", "doble_oportunidad") else 2
        if len(claves) != esperadas:
            continue
        probabilidades = quitar_margen([cuotas[c] for c in claves])
        # La doble oportunidad cuenta cada resultado dos veces: suma 2, no 1.
        escala = 2.0 if familia == "doble_oportunidad" else 1.0
        for clave, p in zip(claves, np.asarray(probabilidades) * escala):
            salida[clave] = float(p)
    return salida


def linea_de_clave(clave: str) -> float:
    return int(re.search(r"(\d+)$", clave).group(1)) / 10.0
