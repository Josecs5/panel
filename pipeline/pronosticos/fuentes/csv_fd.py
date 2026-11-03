"""Lectura de los CSV de football-data.co.uk, que baja el workflow."""

from pathlib import Path

import pandas as pd

from ..config import LIGAS_CSV

_BASICAS = {
    "HomeTeam": "local",
    "AwayTeam": "visitante",
    "FTHG": "gl",
    "FTAG": "gv",
}
_OPCIONALES = {
    "HST": "tpl",
    "AST": "tpv",
    "HF": "fl",
    "AF": "fv",
    "HC": "cl",
    "AC": "cv",
    "HY": "al",
    "AY": "av",
    "HR": "rl",
    "AR": "rv",
    "Referee": "arbitro",
    # Cuotas previas al cierre
    "B365H": "b365_1",
    "B365D": "b365_x",
    "B365A": "b365_2",
    "PSH": "ps_1",
    "PSD": "ps_x",
    "PSA": "ps_2",
    "AvgH": "avg_1",
    "AvgD": "avg_x",
    "AvgA": "avg_2",
    "B365>2.5": "b365_o25",
    "B365<2.5": "b365_u25",
    "P>2.5": "ps_o25",
    "P<2.5": "ps_u25",
    "Avg>2.5": "avg_o25",
    "Avg<2.5": "avg_u25",
    # Cuotas de cierre
    "PSCH": "psc_1",
    "PSCD": "psc_x",
    "PSCA": "psc_2",
    "AvgCH": "avgc_1",
    "AvgCD": "avgc_x",
    "AvgCA": "avgc_2",
    "PC>2.5": "psc_o25",
    "PC<2.5": "psc_u25",
    "AvgC>2.5": "avgc_o25",
    "AvgC<2.5": "avgc_u25",
}


def _leer_crudo(ruta: Path) -> pd.DataFrame:
    for codificacion in ("utf-8-sig", "latin-1"):
        try:
            return pd.read_csv(ruta, encoding=codificacion, on_bad_lines="skip")
        except UnicodeDecodeError:
            continue
    raise ValueError(f"No se pudo leer {ruta.name}")


def leer_csv(ruta: Path, liga: str, temporada: int) -> pd.DataFrame:
    """Devuelve los partidos jugados con nombres de columna propios."""
    crudo = _leer_crudo(ruta)
    faltan = [c for c in ("Date", *_BASICAS) if c not in crudo.columns]
    if faltan:
        raise ValueError(f"{ruta.name}: faltan las columnas {faltan}")

    datos = crudo.rename(columns={**_BASICAS, **_OPCIONALES})
    columnas = list(_BASICAS.values()) + [
        c for c in _OPCIONALES.values() if c in datos.columns
    ]
    salida = datos[columnas].copy()
    for columna in _OPCIONALES.values():
        if columna not in salida.columns:
            salida[columna] = pd.NA

    salida["fecha"] = pd.to_datetime(crudo["Date"], dayfirst=True, format="mixed", errors="coerce")
    salida["liga"] = liga
    salida["temporada"] = temporada
    salida = salida.dropna(subset=["fecha", "local", "visitante", "gl", "gv"])

    numericas = [c for c in salida.columns if c not in ("local", "visitante", "arbitro", "fecha", "liga")]
    for columna in numericas:
        salida[columna] = pd.to_numeric(salida[columna], errors="coerce")
    salida["arbitro"] = salida["arbitro"].astype("object").where(salida["arbitro"].notna(), None)
    return salida.sort_values("fecha", kind="stable").reset_index(drop=True)


def leer_todos(carpeta: Path, temporadas: tuple[int, ...]) -> tuple[pd.DataFrame, dict[str, int]]:
    """Reúne los CSV disponibles y cuenta los partidos de cada archivo."""
    partes = []
    recuento: dict[str, int] = {}
    for temporada in temporadas:
        for codigo, liga in LIGAS_CSV.items():
            ruta = carpeta / f"{temporada}_{codigo}.csv"
            nombre = f"{liga} {temporada}"
            if not ruta.exists():
                recuento[nombre] = 0
                continue
            parte = leer_csv(ruta, liga, temporada)
            recuento[nombre] = len(parte)
            partes.append(parte)
    if not partes:
        raise FileNotFoundError(f"No hay ningún CSV en {carpeta}")
    return pd.concat(partes, ignore_index=True), recuento
