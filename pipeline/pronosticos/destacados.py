"""Elige los partidos destacados: media de Elo, más igualdad y derbi."""

import pandas as pd

from .config import MAX_DESTACADOS_LIGA

PLUS_IGUALDAD = 100.0
PLUS_DERBI = 50.0


def puntuar(partidos: pd.DataFrame, derbis: frozenset[frozenset[str]] = frozenset()) -> pd.Series:
    media = (partidos["elo_l"] + partidos["elo_v"]) / 2.0
    derbi = [frozenset((l, v)) in derbis for l, v in zip(partidos["local"], partidos["visitante"])]
    return media + PLUS_IGUALDAD * partidos["igualdad"] + PLUS_DERBI * pd.Series(derbi, index=partidos.index, dtype=float)


def seleccionar(
    partidos: pd.DataFrame,
    limite: int = MAX_DESTACADOS_LIGA,
    derbis: frozenset[frozenset[str]] = frozenset(),
) -> pd.DataFrame:
    """Los mejores partidos de una misma competición en una jornada."""
    if partidos.empty:
        return partidos
    con_puntos = partidos.assign(puntuacion=puntuar(partidos, derbis))
    return con_puntos.sort_values("puntuacion", ascending=False, kind="stable").head(limite)
