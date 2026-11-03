"""Punto de entrada del pipeline: ejecución diaria o backtest."""

import argparse
import json
import os
import sys
from pathlib import Path

import pandas as pd
import requests

from . import backtest, diario, informe
from .almacen.firestore import AlmacenFirestore
from .config import COMPETICIONES_ELO, TEMPORADA_AJUSTE, TEMPORADA_VALIDACION, TEMPORADAS_CHAMPIONS, TEMPORADAS_CSV
from .fuentes.csv_fd import leer_todos
from .fuentes.football_data_org import ClienteFootballData, a_tabla
from .fuentes.oddspapi import ClienteOddsPapi


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


def comprobar_uid(almacen) -> None:
    """Con la cuenta de servicio se podría escribir en cualquier usuario, sin pasar por las reglas.

    Si PANEL_UID estuviera mal, los datos irían a un usuario que la web nunca lee. Antes de
    escribir nada, se exige que ese usuario tenga ya datos del panel.
    """
    if almacen.leer("ajustes", "general") or any(almacen.listar(c) for c in ("plazos", "posiciones", "prompts")):
        return
    raise RuntimeError("PANEL_UID no corresponde a un usuario con datos del panel: no se ha escrito nada")


def resumen_publico(almacen) -> str:
    """Para el registro público de Actions: solo recuentos, nunca apuestas ni identificadores."""
    ejecucion = almacen.leer("pronEstado", "ultima") or {}
    partidos = almacen.listar("pronPartidos")
    con_cuotas = sum(1 for p in partidos.values() if any(i.get("cuota") for i in p.get("items", {}).values()))
    return "\n".join(
        [
            f"Partidos con pronóstico: {len(partidos)}; con cuotas: {con_cuotas}",
            f"Congelados: {len(almacen.listar('pronCongelados'))}",
            f"Jornadas: {len(almacen.listar('pronJornadas'))}",
            f"Peticiones: {ejecucion.get('peticiones')}",
            f"OddsPapi este mes: {ejecucion.get('oddsPapi')}",
            f"ClubElo responde: {ejecucion.get('clubEloResponde')}",
            f"Equipos emparejados con los CSV: {ejecucion.get('emparejados')}",
            f"Errores: {ejecucion.get('errores')}",
            f"Avisos: {ejecucion.get('avisos')}",
        ]
    )


def ejecutar_modo_diario(carpeta_datos: Path, estado_json: Path) -> dict:
    """Las claves llegan por variables de entorno desde GitHub Secrets."""
    for nombre in ("FOOTBALL_DATA_TOKEN", "FIREBASE_SERVICE_ACCOUNT", "PANEL_UID"):
        if not os.environ.get(nombre):
            raise RuntimeError(f"Falta el secret {nombre}")
    almacen = AlmacenFirestore(os.environ["FIREBASE_SERVICE_ACCOUNT"], os.environ["PANEL_UID"])
    comprobar_uid(almacen)
    fd = ClienteFootballData(os.environ["FOOTBALL_DATA_TOKEN"], cache=carpeta_datos / "fdorg")

    odds = catalogo = None
    clave = os.environ.get("ODDSPAPI_KEY")
    if clave:
        odds = ClienteOddsPapi(clave, diario.contador_en_almacen(almacen))
        catalogo = diario.cargar_catalogo(odds, carpeta_datos / "oddspapi_mercados.json")

    ahora = pd.Timestamp.now(tz="UTC")
    actual = diario.temporada_actual(ahora)
    temporadas = tuple(diario.codigo_csv(t) for t in range(actual - 4, actual + 1))
    try:
        csv, _ = leer_todos(carpeta_datos / "csv", temporadas)
    except FileNotFoundError:
        csv = None

    estado = diario.ejecutar_diario(almacen, fd, odds, csv, ahora, catalogo=catalogo)
    # Solo fecha, versión y número de partidos: este archivo es público.
    estado_json.write_text(json.dumps(estado, indent=2) + "\n", encoding="utf-8")
    print(resumen_publico(almacen))
    return estado


def main(argumentos: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Pipeline de Pronósticos")
    parser.add_argument("modo", choices=["backtest", "diario"])
    parser.add_argument("--datos", type=Path, default=Path("pipeline/datos"))
    parser.add_argument("--estado", type=Path, default=Path("pipeline/estado.json"))
    opciones = parser.parse_args(argumentos)
    sys.stdout.reconfigure(encoding="utf-8")

    if opciones.modo == "diario":
        estado = ejecutar_modo_diario(opciones.datos, opciones.estado)
        print(f"Ejecución terminada: versión {estado['version']}, {estado['partidos']} partidos")
        return 0

    resultado, texto = ejecutar_backtest(opciones.datos, os.environ.get("FOOTBALL_DATA_TOKEN"))

    salida = opciones.datos / "backtest"
    salida.mkdir(parents=True, exist_ok=True)
    (salida / "resultado.json").write_text(json.dumps(resultado, default=str, indent=1), encoding="utf-8")
    cuenta, uid = os.environ.get("FIREBASE_SERVICE_ACCOUNT"), os.environ.get("PANEL_UID")
    if cuenta and uid:
        ahora = pd.Timestamp.now(tz="UTC")
        almacen = AlmacenFirestore(cuenta, uid)
        comprobar_uid(almacen)
        almacen.guardar(
            "pronBacktests",
            ahora.strftime("%Y-%m-%d"),
            {"generado": ahora.isoformat(), **json.loads(json.dumps(resultado, default=str))},
            unir=False,
        )

    print(texto)
    resumen = os.environ.get("GITHUB_STEP_SUMMARY")
    if resumen:
        with open(resumen, "a", encoding="utf-8") as archivo:
            archivo.write(texto + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
