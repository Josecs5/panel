"""Empareja equipos y partidos entre fuentes sin mantener una lista a mano."""

import re
import unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher

import pandas as pd

_PALABRAS_VACIAS = {
    "fc", "cf", "afc", "ac", "as", "ss", "ssc", "sc", "rc", "cd", "ud", "sd", "vfb", "vfl", "tsg",
    "bv", "fk", "sk", "club", "de", "del", "la", "1", "1899", "1904", "1909", "calcio", "bc", "pae",
}


def normalizar(nombre: str) -> str:
    sin_acentos = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode()
    palabras = re.findall(r"[a-z0-9]+", sin_acentos.lower())
    return " ".join(p for p in palabras if p not in _PALABRAS_VACIAS)


def parecido(a: str, b: str) -> float:
    if a == b:
        return 1.0
    x, y = normalizar(a), normalizar(b)
    if not x or not y:
        return 0.0
    if x == y or x in y or y in x:
        return 1.0
    return SequenceMatcher(None, x, y).ratio()


def mapa_fd_a_csv(tabla_fd: pd.DataFrame, csv: pd.DataFrame) -> dict[int, str]:
    """Une los equipos de football-data.org con los nombres de los CSV por votos.

    Cada partido jugado el mismo día y con el mismo marcador es un voto. Los CSV y la
    API se refieren a los mismos partidos, así que los nombres aparecen solos.
    """
    votos: dict[int, Counter] = defaultdict(Counter)
    por_marcador: dict[tuple, list[tuple[pd.Timestamp, str, str]]] = defaultdict(list)
    for fila in csv.itertuples(index=False):
        por_marcador[(int(fila.gl), int(fila.gv))].append((fila.fecha.normalize(), fila.local, fila.visitante))
    for fila in tabla_fd.itertuples(index=False):
        dia = fila.fecha.normalize()
        for fecha, local, visitante in por_marcador.get((int(fila.gl), int(fila.gv)), []):
            if abs((fecha - dia).days) <= 1:
                votos[fila.id_local][local] += 1
                votos[fila.id_visitante][visitante] += 1
    return {equipo: conteo.most_common(1)[0][0] for equipo, conteo in votos.items()}


def emparejar_cuotas(partido: dict, fixtures: list[dict], tolerancia_horas: float = 3.0) -> dict | None:
    """Busca un partido de OddsPapi por competición, hora y parecido de los nombres."""
    inicio = pd.Timestamp(partido["inicio"])
    mejor, mejor_puntos = None, 0.0
    for fixture in fixtures:
        if fixture.get("tournamentId") != partido.get("torneo_odds"):
            continue
        diferencia = abs((pd.Timestamp(fixture["startTime"]) - inicio).total_seconds()) / 3600.0
        if diferencia > tolerancia_horas:
            continue
        puntos = min(
            parecido(partido["local"], fixture.get("participant1Name", "")),
            parecido(partido["visitante"], fixture.get("participant2Name", "")),
        )
        if puntos > mejor_puntos:
            mejor, mejor_puntos = fixture, puntos
    return mejor if mejor_puntos >= 0.5 else None
