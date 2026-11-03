"""ClubElo, si responde. Si no, el pipeline usa el Elo propio (`modelo/elo.py`)."""

import csv
import io
from datetime import date

import requests

BASE = "http://api.clubelo.com"


def leer_tabla(texto: str) -> dict[str, float]:
    tabla = {}
    for fila in csv.DictReader(io.StringIO(texto)):
        try:
            tabla[fila["Club"]] = float(fila["Elo"])
        except (KeyError, TypeError, ValueError):
            continue
    return tabla


def pedir_elo(dia: date, sesion=requests) -> dict[str, float] | None:
    """Devuelve None ante cualquier fallo: no debe parar nunca una ejecución."""
    try:
        respuesta = sesion.get(f"{BASE}/{dia.isoformat()}", timeout=20)
        if respuesta.status_code != 200:
            return None
        return leer_tabla(respuesta.text) or None
    except requests.RequestException:
        return None
