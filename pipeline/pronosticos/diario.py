"""Ejecución diaria: liquida lo jugado, audita y prepara la jornada.

Nada de lo que se escribe aquí pasa por el registro público de Actions.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from . import backtest as bt
from . import pronostico as pr
from .apuestas.boleto import construir_boleto
from .apuestas.combinadas import Seleccion
from .apuestas.politica import estado_mercado
from .apuestas.valor import cuota_minima_aceptable
from .auditoria import auditar as au
from .auditoria.liquidar import (
    GANADA,
    PERDIDA,
    SIN_LIQUIDAR,
    beneficio_centimos,
    liquidar_apuesta,
    liquidar_estadistica,
    liquidar_seleccion,
)
from .config import COMPETICIONES_ELO, MAX_DESTACADOS_CHAMPIONS, MAX_DESTACADOS_LIGA, Umbrales
from .destacados import puntuar
from .fuentes import clubelo
from .fuentes.emparejar import emparejar_cuotas, mapa_fd_a_csv, normalizar, parecido
from .fuentes.football_data_org import a_tabla
from .fuentes.oddspapi import ClienteOddsPapi, ContadorPeticiones, CuotaAgotada, antes_del_inicio, lineas_de_partido
from .jornada import clave_jornada
from .modelo.elo import Elo, elo_previo, igualdad
from .modelo import jugadores as jug

ZONA = "Europe/Madrid"
COMPETICIONES_MODULO = ("PD", "PL", "BL1", "SA", "CL")
TORNEOS_ODDS = {"CL": 7, "PD": 8, "PL": 17, "SA": 23, "BL1": 35}
CASA_REFERENCIA = "pinnacle"
CASAS_POR_DEFECTO = ["bet365.es", "codere.es", "bwin.es"]
DIAS_PARA_LIQUIDAR = 7
ESTADOS_PROXIMOS = {"SCHEDULED", "TIMED"}
_COLUMNAS_ESTADISTICA = {
    "corners": ("cl", "cv"),
    "tarjetas": ("tarj_l", "tarj_v"),
    "faltas": ("fl", "fv"),
    "tiros_puerta": ("tpl", "tpv"),
}


@dataclass
class Ajustes:
    casas: list[str] = field(default_factory=lambda: list(CASAS_POR_DEFECTO))
    max_liga: int = MAX_DESTACADOS_LIGA
    max_champions: int = MAX_DESTACADOS_CHAMPIONS
    derbis: frozenset = frozenset()
    umbrales: Umbrales = field(default_factory=Umbrales)
    inicio_jornada: int = 0


def leer_ajustes(almacen) -> Ajustes:
    """Solo acepta valores válidos. El tope de 5 € no se lee de aquí en ningún caso."""
    crudo = almacen.leer("ajustes", "pronosticos") or {}
    ajustes = Ajustes()
    casas = [c for c in crudo.get("casas", []) if isinstance(c, str) and c and c != CASA_REFERENCIA]
    if casas:
        ajustes.casas = casas
    for origen, destino in (("maxDestacadosLiga", "max_liga"), ("maxDestacadosChampions", "max_champions")):
        valor = crudo.get(origen)
        if isinstance(valor, int) and 0 <= valor <= 10:
            setattr(ajustes, destino, valor)
    ajustes.derbis = frozenset(
        frozenset((normalizar(d["local"]), normalizar(d["visitante"])))
        for d in crudo.get("derbis", [])
        if isinstance(d, dict) and isinstance(d.get("local"), str) and isinstance(d.get("visitante"), str)
    )
    numeros = {}
    for origen, destino in (
        ("veMinimo", "ve_minimo"),
        ("probMinima", "prob_minima"),
        ("cuotaMinima", "cuota_minima"),
        ("cuotaMaxima", "cuota_maxima"),
        ("veMinimoCombinada", "ve_minimo_combinada"),
        ("probMinimaCombinada", "prob_minima_combinada"),
    ):
        valor = crudo.get(origen)
        if isinstance(valor, (int, float)) and valor > 0:
            numeros[destino] = float(valor)
    ajustes.umbrales = Umbrales(**numeros)
    inicio = crudo.get("inicioJornada")
    if isinstance(inicio, int) and 0 <= inicio <= 6:
        ajustes.inicio_jornada = inicio
    return ajustes


def temporada_actual(ahora: pd.Timestamp) -> int:
    return ahora.year if ahora.month >= 7 else ahora.year - 1


def codigo_csv(temporada: int) -> int:
    return (temporada % 100) * 100 + (temporada + 1) % 100


def describir_error(error: Exception) -> str:
    """Nunca el texto del error: en las peticiones a OddsPapi lleva la clave en la URL."""
    respuesta = getattr(error, "response", None)
    codigo = getattr(respuesta, "status_code", None)
    return f"{type(error).__name__} {codigo}" if codigo else type(error).__name__


def inicio_de_jornada(ahora: pd.Timestamp, dia: int) -> pd.Timestamp:
    local = ahora.tz_convert(ZONA).normalize()
    return local - pd.Timedelta(days=(local.weekday() - dia) % 7)


def clave_de_semana(inicio: pd.Timestamp) -> str:
    return clave_jornada(inicio.tz_localize(None))


def _partido_de_crudo(crudo: dict, competicion: str) -> dict:
    return {
        "id": crudo["id"],
        "competicion": competicion,
        "torneo_odds": TORNEOS_ODDS[competicion],
        "inicio": crudo["utcDate"],
        "id_local": crudo["homeTeam"]["id"],
        "id_visitante": crudo["awayTeam"]["id"],
        "local": crudo["homeTeam"]["name"],
        "visitante": crudo["awayTeam"]["name"],
        "neutral": crudo.get("stage") == "FINAL",
        "estado": crudo.get("status"),
    }


@dataclass
class Datos:
    tabla: pd.DataFrame
    crudos: dict[int, dict]
    avisos: list[str]


def cargar_football_data(cliente, ahora: pd.Timestamp) -> Datos:
    actual = temporada_actual(ahora)
    partes, crudos, avisos = [], {}, []
    for competicion in COMPETICIONES_ELO:
        for temporada in range(actual - 3, actual + 1):
            en_curso = temporada == actual
            try:
                partidos = cliente.partidos(competicion, temporada, usar_cache=not en_curso)
            except requests.HTTPError as error:
                avisos.append(f"football-data.org {competicion} {temporada}: {describir_error(error)}")
                continue
            tabla = a_tabla(partidos, competicion, temporada)
            if len(tabla):
                partes.append(tabla)
            if en_curso and competicion in COMPETICIONES_MODULO:
                for crudo in partidos:
                    crudos[crudo["id"]] = {**_partido_de_crudo(crudo, competicion), "crudo": crudo}
    if not partes:
        raise RuntimeError("football-data.org no devolvió partidos")
    return Datos(pd.concat(partes, ignore_index=True), crudos, avisos)


def preparar_csv(csv: pd.DataFrame | None, tabla: pd.DataFrame, ahora: pd.Timestamp) -> tuple[pd.DataFrame | None, dict, dict]:
    """Une nombres entre fuentes y añade los resultados que los CSV aún no tienen."""
    if csv is None or csv.empty:
        return None, {}, {}
    mapa: dict[int, str] = {}
    ligas: dict[int, str] = {}
    partes = []
    for liga in pr.LIGAS:
        de_csv = csv[csv["liga"] == liga]
        de_fd = tabla[tabla["competicion"] == liga]
        if de_csv.empty:
            continue
        mapa_liga = mapa_fd_a_csv(de_fd, de_csv) if len(de_fd) else {}
        mapa.update(mapa_liga)
        ligas.update({equipo: liga for equipo in mapa_liga})

        ya = {(l, v, f.normalize()) for l, v, f in zip(de_csv["local"], de_csv["visitante"], de_csv["fecha"])}
        nuevas = []
        for fila in de_fd.itertuples(index=False):
            local, visitante = mapa_liga.get(fila.id_local), mapa_liga.get(fila.id_visitante)
            if not local or not visitante:
                continue
            dia = fila.fecha.normalize()
            if any((local, visitante, dia + pd.Timedelta(days=d)) in ya for d in (-1, 0, 1)):
                continue
            nuevas.append(
                {
                    "liga": liga,
                    "temporada": codigo_csv(int(fila.temporada)),
                    "fecha": dia,
                    "local": local,
                    "visitante": visitante,
                    "gl": fila.gl,
                    "gv": fila.gv,
                }
            )
        partes.append(de_csv)
        if nuevas:
            partes.append(pd.DataFrame(nuevas))
    if not partes:
        return None, {}, {}
    unido = pd.concat(partes, ignore_index=True).sort_values("fecha", kind="stable")
    for columna in ("al", "av", "rl", "rv"):
        unido[columna] = pd.to_numeric(unido[columna], errors="coerce")
    return bt.preparar(unido).reset_index(drop=True), mapa, ligas


def revisar_emparejamiento(crudos: dict[int, dict], mapa: dict[int, str], avisos: list[str]) -> dict:
    """Un equipo sin nombre en los CSV usaría fuerzas por defecto sin que nada fallara."""
    resumen: dict[str, dict] = {}
    parejas: list[tuple[float, str, str]] = []
    for liga in pr.LIGAS:
        equipos: dict[int, str] = {}
        for partido in crudos.values():
            if partido["competicion"] == liga:
                equipos[partido["id_local"]] = partido["local"]
                equipos[partido["id_visitante"]] = partido["visitante"]
        faltan = sorted(nombre for equipo, nombre in equipos.items() if equipo not in mapa)
        resumen[liga] = {"equipos": len(equipos), "conCsv": len(equipos) - len(faltan)}
        if faltan:
            avisos.append(f"{liga}: equipos sin nombre en los CSV: {', '.join(faltan)}")
        parejas += [(parecido(n, mapa[e]), n, mapa[e]) for e, n in equipos.items() if e in mapa]
    parejas.sort(key=lambda fila: fila[0])
    resumen["menosParecidos"] = [f"{a} = {b}" for _, a, b in parejas[:15]]
    return resumen


def elo_y_champions(tabla: pd.DataFrame) -> tuple[Elo, pd.DataFrame]:
    motor = Elo()
    con_elo = elo_previo(tabla, local="id_local", visitante="id_visitante", elo=motor)
    return motor, con_elo[con_elo["competicion"] == "CL"].reset_index(drop=True)


def elegir_destacados(proximos: list[dict], elo: Elo, ajustes: Ajustes) -> list[dict]:
    elegidos = []
    for competicion in COMPETICIONES_MODULO:
        grupo = [p for p in proximos if p["competicion"] == competicion]
        if not grupo:
            continue
        tabla = pd.DataFrame(
            {
                "local": [normalizar(p["local"]) for p in grupo],
                "visitante": [normalizar(p["visitante"]) for p in grupo],
                "elo_l": [elo.de(p["id_local"]) for p in grupo],
                "elo_v": [elo.de(p["id_visitante"]) for p in grupo],
                "igualdad": [igualdad(elo.de(p["id_local"]), elo.de(p["id_visitante"])) for p in grupo],
            }
        )
        puntos = puntuar(tabla, ajustes.derbis).to_numpy()
        limite = ajustes.max_champions if competicion == "CL" else ajustes.max_liga
        orden = np.argsort(-puntos, kind="stable")[:limite]
        elegidos.extend(grupo[i] for i in orden)
    return elegidos


def jugadores_importados(importaciones: dict[str, dict]) -> tuple[list[dict], str | None]:
    fichas, ultima = jug.combinar_importaciones(list(importaciones.values()))
    return jug.tasas(fichas), ultima


def pedir_cuotas(cliente, catalogo: dict, casas: list[str], avisos: list[str]) -> tuple[dict[str, list[dict]], int]:
    """Una petición por casa, con Pinnacle como referencia. Sin cuotas, el pipeline sigue."""
    fixtures: dict[str, list[dict]] = {}
    pedidas = 0
    for casa in [*casas, CASA_REFERENCIA]:
        try:
            pedidas += 1
            fixtures[casa] = cliente.cuotas_por_torneos(casa, list(TORNEOS_ODDS.values()))
        except CuotaAgotada:
            avisos.append("OddsPapi: tope mensual alcanzado; esta ejecución sigue sin cuotas")
            pedidas -= 1
            break
        except (requests.RequestException, RuntimeError, ValueError) as error:
            avisos.append(f"OddsPapi {casa}: {describir_error(error)}")
    return fixtures, pedidas


def lineas_del_partido(partido: dict, fixtures: dict[str, list[dict]], catalogo: dict) -> tuple[dict[str, list[dict]], str | None]:
    lineas, ident = {}, None
    for casa, lista in fixtures.items():
        fixture = emparejar_cuotas(partido, lista)
        if fixture:
            lineas[casa] = lineas_de_partido(fixture, casa, catalogo)
            ident = ident or fixture.get("fixtureId")
    return lineas, ident


def _a_entero(valor) -> int | None:
    if valor is None or (isinstance(valor, float) and np.isnan(valor)):
        return None
    return int(valor)


def estadisticas_csv(csv: pd.DataFrame | None, mapa: dict, partido: dict) -> dict | None:
    if csv is None:
        return None
    local, visitante = mapa.get(partido["id_local"]), mapa.get(partido["id_visitante"])
    if not local or not visitante:
        return None
    dia = pd.Timestamp(partido["inicio"]).tz_localize(None).normalize()
    filas = csv[
        (csv["local"] == local)
        & (csv["visitante"] == visitante)
        & (abs((csv["fecha"] - dia).dt.days) <= 1)
    ]
    if filas.empty:
        return None
    fila = filas.iloc[0]
    salida = {}
    for nombre, (col_l, col_v) in _COLUMNAS_ESTADISTICA.items():
        salida[f"{nombre}_l"] = _a_entero(fila.get(col_l))
        salida[f"{nombre}_v"] = _a_entero(fila.get(col_v))
    return salida


def _liquidar_item(clave: str, partido_crudo: dict | None, estadisticas: dict | None, comprobacion: dict | None) -> str:
    if clave.startswith("jug:"):
        _, categoria, nombre = clave.split(":", 2)
        respuesta = ((comprobacion or {}).get("respuestas") or {}).get(f"{categoria}:{nombre}")
        if respuesta is None:
            return SIN_LIQUIDAR
        return GANADA if respuesta else PERDIDA
    if clave.split("_")[0] in _COLUMNAS_ESTADISTICA or clave.startswith("tiros_puerta_"):
        return liquidar_estadistica(clave, estadisticas)
    if not partido_crudo or partido_crudo.get("estado") != "FINISHED":
        return SIN_LIQUIDAR
    marcador = (partido_crudo["crudo"].get("score") or {})
    parcial = marcador.get("regularTime") or marcador.get("fullTime") or {}
    return liquidar_seleccion(clave, parcial.get("home"), parcial.get("away"))


def liquidar_partidos(almacen, datos: Datos, csv, mapa, ahora: pd.Timestamp) -> int:
    congelados = almacen.listar("pronCongelados")
    liquidaciones = almacen.listar("pronLiquidaciones")
    manuales = almacen.listar("pronEstadisticasCL")
    comprobaciones = almacen.listar("pronComprobaciones")
    cambios = 0
    for ident, congelado in congelados.items():
        previa = liquidaciones.get(ident) or {}
        if previa.get("fin"):
            continue
        partido = datos.crudos.get(int(ident))
        info = partido or congelado
        if congelado["competicion"] == "CL":
            estadisticas = manuales.get(ident)
        else:
            estadisticas = estadisticas_csv(csv, mapa, {**congelado, "inicio": congelado["inicio"]})
        caducado = (ahora - pd.Timestamp(congelado["inicio"])).days >= DIAS_PARA_LIQUIDAR

        items = {}
        pendientes = 0
        for clave, item in congelado["items"].items():
            estado = (previa.get("items") or {}).get(clave, {}).get("estado")
            if estado not in (GANADA, PERDIDA):
                estado = _liquidar_item(clave, partido, estadisticas, comprobaciones.get(ident))
            if estado == SIN_LIQUIDAR and not caducado:
                estado = "pendiente"
                pendientes += 1
            items[clave] = {
                "estado": estado,
                "grupo": item["grupo"],
                "final": item["final"],
                "modelo": item.get("modelo"),
                "mercado": item.get("mercado"),
                "cuota": item.get("cuota"),
            }
        marcador = ((partido or {}).get("crudo") or {}).get("score") or {}
        parcial = marcador.get("regularTime") or marcador.get("fullTime") or {}
        resueltos = any(v["estado"] in (GANADA, PERDIDA) for v in items.values())
        if not resueltos and not caducado:
            continue
        almacen.guardar(
            "pronLiquidaciones",
            ident,
            {
                "competicion": info["competicion"],
                "inicio": congelado["inicio"],
                "version": congelado["version"],
                "local": congelado.get("local"),
                "visitante": congelado.get("visitante"),
                "jornada": congelado.get("jornada"),
                "resultado": {"local": parcial.get("home"), "visitante": parcial.get("away")},
                "items": items,
                "fin": pendientes == 0,
                "actualizado": ahora.isoformat(),
                **({"cierre": previa["cierre"]} if "cierre" in previa else {}),
            },
            unir=False,
        )
        cambios += 1
    return cambios


def anadir_cierres(almacen, odds, casas: list[str], avisos: list[str]) -> None:
    """Cuota de cierre para el CLV. El histórico de OddsPapi no gasta cuota."""
    if odds is None:
        return
    congelados = almacen.listar("pronCongelados")
    for ident, liquidacion in almacen.listar("pronLiquidaciones").items():
        if "cierre" in liquidacion:
            continue
        congelado = congelados.get(ident) or {}
        fixture = congelado.get("idOdds")
        if not fixture:
            continue
        try:
            historico = odds.historico(fixture, [*casas[:2], CASA_REFERENCIA])
        except (requests.RequestException, RuntimeError, ValueError) as error:
            avisos.append(f"OddsPapi histórico: {describir_error(error)}")
            return
        libros = historico.get("bookmakers") or {}
        cierre = {}
        for clave, item in congelado["items"].items():
            valores = {}
            for casa, ids in (item.get("ids") or {}).items():
                serie = (
                    ((libros.get(casa) or {}).get("markets") or {})
                    .get(str(ids["mercado"]), {})
                    .get("outcomes", {})
                    .get(str(ids["resultado"]), {})
                    .get("players", {})
                    .get(str(ids["jugador"]), [])
                )
                ultima = antes_del_inicio(serie, congelado["inicio"])
                if ultima:
                    valores[casa] = ultima["price"]
            if valores:
                cierre[clave] = valores
        almacen.guardar("pronLiquidaciones", ident, {**liquidacion, "cierre": cierre}, unir=False)


def _prob_cierre(claves_cierre: dict, clave: str, casa_referencia: str) -> float | None:
    from . import mercados as mc

    familia = mc.familia_de(clave)
    cuotas = {
        c: v.get(casa_referencia)
        for c, v in claves_cierre.items()
        if mc.familia_de(c) == familia and v.get(casa_referencia)
    }
    return mc.probabilidades_mercado(cuotas).get(clave) if cuotas else None


def liquidar_apuestas(almacen) -> int:
    liquidaciones = almacen.listar("pronLiquidaciones")
    cambios = 0
    for ident, apuesta in almacen.listar("pronApuestas").items():
        if apuesta.get("estado") != "hecha" or apuesta.get("liquidacion"):
            continue
        estados, prob_cierre = [], 1.0
        for seleccion in apuesta.get("selecciones", []):
            documento = liquidaciones.get(str(seleccion.get("partido"))) or {}
            item = (documento.get("items") or {}).get(seleccion.get("clave"), {})
            estado = item.get("estado", "pendiente")
            estados.append(SIN_LIQUIDAR if estado == "pendiente" else estado)
            cierre = _prob_cierre(documento.get("cierre") or {}, seleccion.get("clave", ""), CASA_REFERENCIA)
            prob_cierre = None if prob_cierre is None or cierre is None else prob_cierre * cierre
        if not estados:
            continue
        pendiente = any(
            (liquidaciones.get(str(s.get("partido"))) or {}).get("items", {}).get(s.get("clave"), {}).get("estado", "pendiente") == "pendiente"
            for s in apuesta["selecciones"]
        )
        estado = liquidar_apuesta(estados)
        if estado == SIN_LIQUIDAR and pendiente:
            continue
        stake = int(apuesta.get("stakeRealCentimos", 0))
        cuota = float(apuesta.get("cuotaReal", 0))
        almacen.guardar(
            "pronApuestas",
            ident,
            {
                "liquidacion": {
                    "estado": estado,
                    "beneficioCentimos": beneficio_centimos(estado, stake, cuota),
                    "clv": cuota * prob_cierre - 1.0 if prob_cierre is not None and cuota else None,
                }
            },
        )
        cambios += 1
    return cambios


def version_actual(almacen, ahora: pd.Timestamp) -> dict:
    versiones = almacen.listar("pronVersiones")
    if versiones:
        return max(versiones.values(), key=lambda v: v["numero"])
    inicial = {
        "numero": 1,
        "creada": ahora.isoformat(),
        "anterior": None,
        "pesos": {},
        "xiGoles": pr.XI_GOLES,
        "xiEstadisticas": pr.XI_ESTADISTICAS,
        "changelog": [
            {
                "texto": "Versión inicial tras el backtest: peso 0 del modelo en 1X2 y más/menos 2,5. "
                "El resto de mercados no se apuesta hasta demostrar en vivo que no son peores que el mercado."
            }
        ],
    }
    almacen.crear("pronVersiones", "v1", inicial)
    return inicial


def _apostable(grupo: str, metricas_grupos: dict) -> bool:
    return estado_mercado(grupo, metricas_grupos.get(grupo)).apostable


def construir_boleto_jornada(
    pronosticos: dict[str, dict], partidos: dict[str, dict], metricas_grupos: dict, ajustes: Ajustes, version: dict, ahora, semana: str
) -> dict:
    selecciones: list[Seleccion] = []
    for ident, pronostico in pronosticos.items():
        for clave, item in pronostico["items"].items():
            if item.get("cuota") and item.get("mercado") is not None and _apostable(item["grupo"], metricas_grupos):
                selecciones.append(Seleccion(ident, clave, item["final"], float(item["cuota"]), item["casa"]))

    boleto = construir_boleto(selecciones, ajustes.umbrales)
    apuestas = []
    for numero, elemento in enumerate(boleto, start=1):
        apuesta = elemento.apuesta
        minima = ajustes.umbrales.ve_minimo_combinada if apuesta.es_combinada else ajustes.umbrales.ve_minimo
        apuestas.append(
            {
                "id": f"{semana}-{numero}",
                "combinada": apuesta.es_combinada,
                "prob": apuesta.prob,
                "cuota": apuesta.cuota,
                "ve": apuesta.ve,
                "cuotaMinima": cuota_minima_aceptable(apuesta.prob, minima),
                "stakeCentimos": elemento.stake_centimos,
                "selecciones": [
                    {
                        "partido": s.partido,
                        "local": partidos[s.partido]["local"],
                        "visitante": partidos[s.partido]["visitante"],
                        "clave": s.mercado,
                        "casa": s.casa,
                        "cuota": s.cuota,
                        "prob": s.prob,
                        "ve": s.ve,
                        "cuotaMinima": cuota_minima_aceptable(s.prob, ajustes.umbrales.ve_minimo),
                    }
                    for s in apuesta.selecciones
                ],
            }
        )
    total = sum(a["stakeCentimos"] for a in apuestas)
    return {
        "generado": ahora.isoformat(),
        "version": version["numero"],
        "vacio": not apuestas,
        "totalCentimos": total,
        "ve": sum(a["ve"] * a["stakeCentimos"] for a in apuestas) / total if total else None,
        "apuestas": apuestas,
    }


def seguimiento_boleto(boleto: dict, pronosticos: dict[str, dict]) -> dict:
    """Cuota de hoy de cada selección y si sigue pagando la mínima aceptable."""
    seguimiento = {}
    for apuesta in boleto.get("apuestas", []):
        for indice, seleccion in enumerate(apuesta["selecciones"]):
            item = (pronosticos.get(str(seleccion["partido"])) or {}).get("items", {}).get(seleccion["clave"])
            if not item or not item.get("cuota") or item.get("casa") != seleccion["casa"]:
                continue
            seguimiento[f"{apuesta['id']}#{indice}"] = {
                "cuotaHoy": item["cuota"],
                "cumple": item["cuota"] >= seleccion["cuotaMinima"],
            }
    return seguimiento


def ejecutar_diario(almacen, fd, odds, csv: pd.DataFrame | None, ahora: pd.Timestamp, pedir_clubelo=clubelo.pedir_elo, catalogo=None) -> dict:
    """Devuelve el estado público: fecha, versión y número de partidos."""
    ahora = ahora.tz_convert("UTC")
    errores: list[str] = []
    avisos: list[str] = []
    ajustes = leer_ajustes(almacen)

    datos = cargar_football_data(fd, ahora)
    avisos.extend(datos.avisos)
    referencia = ahora.tz_localize(None)
    csv_preparado, mapa, ligas = preparar_csv(csv, datos.tabla, ahora)
    emparejados = revisar_emparejamiento(datos.crudos, mapa, avisos)
    motor_elo, tabla_cl = elo_y_champions(datos.tabla[datos.tabla["fecha"] < referencia])

    # 1. Liquidar y auditar lo ya jugado
    liquidar_partidos(almacen, datos, csv_preparado, mapa, ahora)
    anadir_cierres(almacen, odds, ajustes.casas, avisos)
    liquidar_apuestas(almacen)

    # 2. La primera ejecución de la jornada crea la versión nueva y fija destacados y boleto
    inicio = inicio_de_jornada(ahora, ajustes.inicio_jornada)
    fin = inicio + pd.Timedelta(days=7)
    semana = clave_de_semana(inicio)
    jornada = almacen.leer("pronJornadas", semana)
    version = version_actual(almacen, ahora)
    liquidaciones = almacen.listar("pronLiquidaciones")
    if jornada is None and version.get("creada", "") and pd.Timestamp(version["creada"]) < inicio.tz_convert("UTC"):
        nueva = au.recalibrar(version, liquidaciones, ahora)
        if almacen.crear("pronVersiones", f"v{nueva['numero']}", nueva):
            version = nueva
    metricas = au.resumen(liquidaciones, almacen.listar("pronApuestas"))
    metricas["generado"] = ahora.isoformat()
    almacen.guardar("pronMetricas", "resumen", metricas, unir=False)

    # 3. Partidos de la jornada
    proximos = [
        p
        for p in datos.crudos.values()
        if p["estado"] in ESTADOS_PROXIMOS and inicio <= pd.Timestamp(p["inicio"]).tz_convert(ZONA) < fin
    ]
    if jornada is None:
        destacados = elegir_destacados(proximos, motor_elo, ajustes)
        jornada = {
            "semana": semana,
            "inicio": inicio.isoformat(),
            "fin": fin.isoformat(),
            "creada": ahora.isoformat(),
            "destacados": [str(p["id"]) for p in destacados],
        }
        almacen.crear("pronJornadas", semana, jornada)
    pendientes = [
        datos.crudos[int(i)]
        for i in jornada["destacados"]
        if int(i) in datos.crudos
        and datos.crudos[int(i)]["estado"] in ESTADOS_PROXIMOS
        and pd.Timestamp(datos.crudos[int(i)]["inicio"]) > ahora
    ]

    # 4. Cuotas: solo si queda algo por jugar
    fixtures: dict[str, list[dict]] = {}
    pedidas = 0
    if pendientes and odds is not None and catalogo:
        fixtures, pedidas = pedir_cuotas(odds, catalogo, ajustes.casas, avisos)
    elif pendientes and odds is None:
        avisos.append("Falta la clave de OddsPapi: esta ejecución no tiene cuotas")

    # 5. Pronósticos
    jugadores, ultima_importacion = jugadores_importados(almacen.listar("pronImportaciones"))
    modelos = pr.entrenar(csv_preparado, tabla_cl, referencia)
    modelos.equipo_csv, modelos.liga_de_equipo = mapa, ligas

    pronosticos: dict[str, dict] = {}
    hoy = ahora.tz_convert(ZONA).date()
    for partido in pendientes:
        ident = str(partido["id"])
        lineas, id_odds = lineas_del_partido(partido, fixtures, catalogo or {})
        elo_l, elo_v = motor_elo.de(partido["id_local"]), motor_elo.de(partido["id_visitante"])
        entrada = {**partido, "elo_l": elo_l, "elo_v": elo_v, "igualdad": igualdad(elo_l, elo_v)}
        entrada.pop("crudo", None)
        try:
            pronostico = pr.componer(modelos, entrada, lineas, ajustes.casas, CASA_REFERENCIA, version["pesos"], jugadores)
        except (ValueError, KeyError) as error:
            errores.append(f"Pronóstico: {describir_error(error)}")
            continue
        if pronostico is None:
            avisos.append(f"{partido['competicion']}: partido sin modelo")
            continue
        pronosticos[ident] = pronostico
        documento = {
            "competicion": partido["competicion"],
            "inicio": partido["inicio"],
            "local": partido["local"],
            "visitante": partido["visitante"],
            "id_local": partido["id_local"],
            "id_visitante": partido["id_visitante"],
            "jornada": semana,
            "idOdds": id_odds,
            "version": version["numero"],
            "actualizado": ahora.isoformat(),
            **pronostico,
        }
        almacen.guardar("pronPartidos", ident, documento, unir=False)
        # 6. Congelar la mañana del partido. `crear` impide reescribir un pronóstico pasado.
        if pd.Timestamp(partido["inicio"]).tz_convert(ZONA).date() == hoy:
            almacen.crear("pronCongelados", ident, {**documento, "congelado": ahora.isoformat()})

    # 7. Boleto único de la jornada y su seguimiento diario
    if "boleto" not in jornada and pendientes and fixtures:
        partidos = {str(p["id"]): p for p in pendientes}
        boleto = construir_boleto_jornada(pronosticos, partidos, metricas["grupos"], ajustes, version, ahora, semana)
        almacen.guardar("pronJornadas", semana, {"boleto": boleto})
        jornada["boleto"] = boleto
    if jornada.get("boleto"):
        almacen.guardar("pronJornadas", semana, {"seguimiento": seguimiento_boleto(jornada["boleto"], pronosticos)})

    # 8. Estado de la ejecución
    responde = pedir_clubelo(ahora.date()) is not None
    if responde:
        avisos.append("ClubElo vuelve a responder: se puede revisar si usarlo en lugar del Elo propio")
    peticiones = {"footballData": getattr(fd, "peticiones", 0), "oddsPapi": pedidas}
    oddspapi = {}
    if odds is not None:
        contador = odds.contador
        try:
            contador.igualar(odds.gastadas_segun_la_cuenta())
        except (requests.RequestException, RuntimeError, ValueError, KeyError) as error:
            avisos.append(f"OddsPapi cuenta: {describir_error(error)}")
        oddspapi = {"mes": contador.mes, "gastadas": contador.gastadas(), "restantes": contador.restantes()}
    almacen.guardar(
        "pronEstado",
        "ultima",
        {
            "fecha": ahora.isoformat(),
            "version": version["numero"],
            "partidos": len(pronosticos),
            "errores": errores,
            "avisos": avisos,
            "peticiones": peticiones,
            "oddsPapi": oddspapi,
            "clubEloResponde": responde,
            "emparejados": emparejados,
            "ultimaImportacion": ultima_importacion,
        },
        unir=False,
    )
    return {"fecha": ahora.date().isoformat(), "version": version["numero"], "partidos": len(pronosticos)}


def contador_en_almacen(almacen) -> ContadorPeticiones:
    def leer(mes: str):
        return (almacen.leer("pronEstado", "oddspapi") or {}).get(mes)

    def guardar(mes: str, valor: int):
        almacen.guardar("pronEstado", "oddspapi", {mes: valor})

    return ContadorPeticiones(leer, guardar)


def cargar_catalogo(cliente: ClienteOddsPapi, archivo: Path) -> dict[int, dict]:
    """El catálogo cambia poco: se guarda en la caché del workflow para no gastar cuota."""
    if archivo.exists():
        lista = json.loads(archivo.read_text(encoding="utf-8"))
    else:
        lista = cliente.mercados()
        archivo.parent.mkdir(parents=True, exist_ok=True)
        archivo.write_text(json.dumps(lista), encoding="utf-8")
    return {m["marketId"]: m for m in lista}
