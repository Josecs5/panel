"""Punto de entrada del pipeline. Por ahora, solo el backtest."""

import argparse
import json
import os
import sys
from pathlib import Path

import pandas as pd
import requests

from . import backtest, informe
from .config import COMPETICIONES_ELO, TEMPORADA_AJUSTE, TEMPORADA_VALIDACION, TEMPORADAS_CHAMPIONS, TEMPORADAS_CSV
from .fuentes.csv_fd import leer_todos
from .fuentes.football_data_org import ClienteFootballData, a_tabla


def _tablas_champions(token: str, cache: Path) -> tuple[pd.DataFrame, list[str]]:
    cliente = ClienteFootballData(token, cache=cache)
    partes, avisos = [], []
    for competicion in COMPETICIONES_ELO:
        for temporada in TEMPORADAS_CHAMPIONS:
            try:
                tabla = a_tabla(cliente.partidos(competicion, temporada), competicion, temporada)
            except requests.HTTPError as error:
                avisos.append(f"{competicion} {temporada}: HTTP {error.response.status_code}")
                continue
            if len(tabla):
                partes.append(tabla)
    print(f"football-data.org: {cliente.peticiones} peticiones")
    if not partes:
        raise RuntimeError("football-data.org no devolvió partidos")
    return pd.concat(partes, ignore_index=True), avisos


def ejecutar_backtest(carpeta_datos: Path, token: str | None) -> tuple[dict, str]:
    partidos, recuento = leer_todos(carpeta_datos / "csv", TEMPORADAS_CSV)
    for temporada in (TEMPORADA_AJUSTE, TEMPORADA_VALIDACION):
        if not (partidos["temporada"] == temporada).any():
            raise RuntimeError(f"Falta la temporada {temporada} en los CSV")

    # La temporada en curso queda fuera: el backtest no debe verla.
    historico = partidos[partidos["temporada"] <= TEMPORADA_VALIDACION].copy()
    resultado = {
        "temporada_ajuste": TEMPORADA_AJUSTE,
        "temporada_validacion": TEMPORADA_VALIDACION,
        "ligas": backtest.backtest_ligas(historico, TEMPORADA_AJUSTE, TEMPORADA_VALIDACION),
    }

    if token:
        try:
            tablas, avisos = _tablas_champions(token, carpeta_datos / "fdorg")
            resultado["champions"] = backtest.backtest_champions(tablas, TEMPORADAS_CHAMPIONS[1:])
            resultado["champions"]["avisos"] = avisos
        except (requests.RequestException, RuntimeError) as error:
            resultado["champions"] = {"error": type(error).__name__}
    else:
        resultado["champions"] = {"error": "falta FOOTBALL_DATA_TOKEN"}
    return resultado, informe.a_markdown(resultado, recuento)


def main(argumentos: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Pipeline de Pronósticos")
    parser.add_argument("modo", choices=["backtest"])
    parser.add_argument("--datos", type=Path, default=Path("pipeline/datos"))
    opciones = parser.parse_args(argumentos)

    resultado, texto = ejecutar_backtest(opciones.datos, os.environ.get("FOOTBALL_DATA_TOKEN"))

    salida = opciones.datos / "backtest"
    salida.mkdir(parents=True, exist_ok=True)
    (salida / "resultado.json").write_text(json.dumps(resultado, default=str, indent=1), encoding="utf-8")

    sys.stdout.reconfigure(encoding="utf-8")
    print(texto)
    resumen = os.environ.get("GITHUB_STEP_SUMMARY")
    if resumen:
        with open(resumen, "a", encoding="utf-8") as archivo:
            archivo.write(texto + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
