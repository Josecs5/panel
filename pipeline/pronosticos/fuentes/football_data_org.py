"""Cliente de football-data.org (plan gratuito: 10 llamadas por minuto)."""

import json
import time
from pathlib import Path

import pandas as pd
import requests

BASE = "https://api.football-data.org/v4"
INTERVALO = 6.5


class ClienteFootballData:
    def __init__(self, token: str, cache: Path | None = None, sesion=None, dormir=time.sleep):
        self._cabeceras = {"X-Auth-Token": token}
        self._cache = cache
        self._sesion = sesion or requests.Session()
        self._dormir = dormir
        self._ultima = 0.0
        self.peticiones = 0

    def _pedir(self, ruta: str) -> dict:
        espera = self._ultima + INTERVALO - time.monotonic()
        if self.peticiones and espera > 0:
            self._dormir(espera)
        for _ in range(3):
            respuesta = self._sesion.get(BASE + ruta, headers=self._cabeceras, timeout=30)
            self._ultima = time.monotonic()
            self.peticiones += 1
            if respuesta.status_code != 429:
                respuesta.raise_for_status()
                return respuesta.json()
            self._dormir(float(respuesta.headers.get("X-RequestCounter-Reset", 60)) + 1)
        raise RuntimeError("football-data.org sigue limitando las peticiones")

    def partidos(self, competicion: str, temporada: int, usar_cache: bool = True) -> list[dict]:
        """Partidos de una temporada; las ya terminadas se guardan en la caché."""
        archivo = self._cache / f"{competicion}_{temporada}.json" if self._cache else None
        if usar_cache and archivo and archivo.exists():
            return json.loads(archivo.read_text(encoding="utf-8"))
        partidos = self._pedir(f"/competitions/{competicion}/matches?season={temporada}")["matches"]
        if usar_cache and archivo:
            archivo.parent.mkdir(parents=True, exist_ok=True)
            archivo.write_text(json.dumps(partidos), encoding="utf-8")
        return partidos


def _marcador_90(partido: dict) -> tuple[float | None, float | None]:
    """Goles a los 90 minutos, aunque el partido llegara a la prórroga."""
    marcador = partido.get("score") or {}
    parcial = marcador.get("regularTime") or marcador.get("fullTime") or {}
    return parcial.get("home"), parcial.get("away")


def a_tabla(partidos: list[dict], competicion: str, temporada: int) -> pd.DataFrame:
    """Convierte los partidos terminados en una tabla, con identificadores estables."""
    filas = []
    for partido in partidos:
        if partido.get("status") != "FINISHED":
            continue
        gl, gv = _marcador_90(partido)
        if gl is None or gv is None:
            continue
        arbitros = partido.get("referees") or []
        filas.append(
            {
                "id": partido["id"],
                "competicion": competicion,
                "temporada": temporada,
                "fecha": pd.Timestamp(partido["utcDate"]).tz_localize(None),
                "id_local": partido["homeTeam"]["id"],
                "id_visitante": partido["awayTeam"]["id"],
                "local": partido["homeTeam"]["name"],
                "visitante": partido["awayTeam"]["name"],
                "gl": gl,
                "gv": gv,
                "neutral": partido.get("stage") == "FINAL",
                "arbitro": arbitros[0]["name"] if arbitros else None,
            }
        )
    return pd.DataFrame(filas)
