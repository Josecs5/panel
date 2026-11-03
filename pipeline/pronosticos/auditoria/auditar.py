"""Métricas de lo liquidado, estado de cada mercado y recalibración de los lunes."""

from collections import defaultdict

import numpy as np
import pandas as pd

from ..apuestas.politica import CASOS_PARA_DESBLOQUEAR, CASOS_PARA_PAUSAR, estado_mercado, peso_inicial
from . import metricas as m
from .liquidar import GANADA, PERDIDA

PESOS_POSIBLES = np.round(np.linspace(0.0, 1.0, 11), 1)
MEJORA_MINIMA = 0.002
PASO = 0.1

NOMBRES_GRUPO = {
    "1x2": "1X2",
    "doble_oportunidad": "doble oportunidad",
    "ambos_marcan": "ambos marcan",
    "ou15": "más/menos 1,5",
    "ou25": "más/menos 2,5",
    "ou35": "más/menos 3,5",
    "corners": "córners",
    "corners_equipo": "córners por equipo",
    "tarjetas": "tarjetas",
    "tarjetas_equipo": "tarjetas por equipo",
}


def filas_liquidadas(liquidaciones: dict[str, dict]) -> list[dict]:
    filas = []
    for documento in liquidaciones.values():
        for clave, item in (documento.get("items") or {}).items():
            if item.get("estado") not in (GANADA, PERDIDA):
                continue
            filas.append(
                {
                    "clave": clave,
                    "grupo": item.get("grupo"),
                    "liga": documento.get("competicion"),
                    "version": documento.get("version"),
                    "inicio": documento.get("inicio", ""),
                    "final": item.get("final"),
                    "modelo": item.get("modelo"),
                    "mercado": item.get("mercado"),
                    "y": 1.0 if item["estado"] == GANADA else 0.0,
                }
            )
    return filas


def _metricas(filas: list[dict]) -> dict:
    p = [f["final"] for f in filas]
    y = [f["y"] for f in filas]
    salida = {
        "n_total": len(filas),
        "esperado": float(np.mean(p)),
        "real": float(np.mean(y)),
        "brier": m.brier_binario(p, y),
        "log_loss_final": m.log_loss_binario(p, y),
        "calibracion": m.calibracion(p, y),
        "muestra_pequena": len(filas) < m.MUESTRA_PEQUENA,
    }
    con_modelo = [f for f in filas if f["modelo"] is not None]
    if con_modelo:
        salida["log_loss_modelo"] = m.log_loss_binario([f["modelo"] for f in con_modelo], [f["y"] for f in con_modelo])
    comparables = [f for f in filas if f["mercado"] is not None]
    salida["n"] = len(comparables)
    if comparables:
        y_c = [f["y"] for f in comparables]
        salida["log_loss"] = m.log_loss_binario([f["final"] for f in comparables], y_c)
        salida["log_loss_mercado"] = m.log_loss_binario([f["mercado"] for f in comparables], y_c)
        ultimos = sorted(comparables, key=lambda f: f["inicio"])[-CASOS_PARA_PAUSAR:]
        y_u = [f["y"] for f in ultimos]
        salida["n_ultimos_100"] = len(ultimos)
        salida["log_loss_ultimos_100"] = m.log_loss_binario([f["final"] for f in ultimos], y_u)
        salida["log_loss_mercado_ultimos_100"] = m.log_loss_binario([f["mercado"] for f in ultimos], y_u)
    return salida


def metricas_apuestas(apuestas: dict[str, dict]) -> dict:
    """Rentabilidad de las apuestas que el usuario marcó como hechas."""
    liquidadas = [a for a in apuestas.values() if a.get("estado") == "hecha" and a.get("liquidacion")]
    apostado = sum(a.get("stakeRealCentimos", 0) for a in liquidadas)
    beneficio = sum(a["liquidacion"].get("beneficioCentimos", 0) for a in liquidadas)
    clvs = [a["liquidacion"]["clv"] for a in liquidadas if a["liquidacion"].get("clv") is not None]
    return {
        "n": len(liquidadas),
        "apostadoCentimos": apostado,
        "beneficioCentimos": beneficio,
        "roi": beneficio / apostado if apostado else None,
        "clv": float(np.mean(clvs)) if clvs else None,
        "muestra_pequena": len(liquidadas) < m.MUESTRA_PEQUENA,
    }


def resumen(liquidaciones: dict[str, dict], apuestas: dict[str, dict]) -> dict:
    filas = filas_liquidadas(liquidaciones)
    por_grupo: dict[str, list[dict]] = defaultdict(list)
    detalle: dict[str, list[dict]] = defaultdict(list)
    for fila in filas:
        por_grupo[fila["grupo"]].append(fila)
        detalle[f"{fila['grupo']}|{fila['liga']}|{fila['version']}"].append(fila)

    grupos = {}
    for grupo, lista in por_grupo.items():
        metricas = _metricas(lista)
        estado = estado_mercado(grupo, metricas)
        grupos[grupo] = {**metricas, "apostable": estado.apostable, "motivo": estado.motivo}
    return {
        "grupos": grupos,
        "detalle": {clave: _metricas(lista) for clave, lista in detalle.items()},
        "apuestas": metricas_apuestas(apuestas),
    }


def mejor_peso(filas: list[dict]) -> tuple[float, float] | None:
    """Peso con mejor log loss y lo que mejora al del mercado solo."""
    comparables = [f for f in filas if f["mercado"] is not None and f["modelo"] is not None]
    if not comparables:
        return None
    y = [f["y"] for f in comparables]
    modelo = np.array([f["modelo"] for f in comparables])
    mercado = np.array([f["mercado"] for f in comparables])
    perdidas = {float(p): m.log_loss_binario(p * modelo + (1 - p) * mercado, y) for p in PESOS_POSIBLES}
    mejor = min(perdidas, key=perdidas.get)
    return mejor, perdidas[0.0] - perdidas[mejor]


def _a_porcentaje(peso: float) -> str:
    return f"{peso:.1f}".replace(".", ",")


def recalibrar(version: dict, liquidaciones: dict[str, dict], ahora: pd.Timestamp) -> dict:
    """Nueva versión del modelo con un changelog legible. Se mueve 0,1 como mucho por semana."""
    filas = filas_liquidadas(liquidaciones)
    por_grupo: dict[str, list[dict]] = defaultdict(list)
    for fila in filas:
        por_grupo[fila["grupo"]].append(fila)

    pesos = dict(version["pesos"])
    cambios = []
    for grupo, lista in sorted(por_grupo.items()):
        if grupo.startswith("jugador_") or grupo not in NOMBRES_GRUPO:
            continue
        comparables = [f for f in lista if f["mercado"] is not None and f["modelo"] is not None]
        if len(comparables) < CASOS_PARA_DESBLOQUEAR:
            continue
        resultado = mejor_peso(comparables)
        if resultado is None:
            continue
        objetivo, _ = resultado
        actual = pesos.get(grupo, peso_inicial(grupo))
        y = [f["y"] for f in comparables]
        modelo = np.array([f["modelo"] for f in comparables])
        mercado = np.array([f["mercado"] for f in comparables])
        perdida_actual = m.log_loss_binario(actual * modelo + (1 - actual) * mercado, y)
        perdida_objetivo = m.log_loss_binario(objetivo * modelo + (1 - objetivo) * mercado, y)
        if perdida_actual - perdida_objetivo < MEJORA_MINIMA or objetivo == actual:
            continue
        nuevo = round(actual + PASO if objetivo > actual else actual - PASO, 1)
        pesos[grupo] = nuevo
        nombre = NOMBRES_GRUPO[grupo]
        if nuevo < actual:
            texto = (
                f"Subo el peso del mercado en {nombre} de {_a_porcentaje(1 - actual)} a {_a_porcentaje(1 - nuevo)} "
                f"porque, en {len(comparables)} casos liquidados, confiar más en el mercado da mejor log loss."
            )
        else:
            texto = (
                f"Subo el peso del modelo en {nombre} de {_a_porcentaje(actual)} a {_a_porcentaje(nuevo)} "
                f"porque, en {len(comparables)} casos liquidados, el modelo mejora al mercado."
            )
        cambios.append({"grupo": grupo, "de": actual, "a": nuevo, "texto": texto})

    numero = version["numero"] + 1
    return {
        "numero": numero,
        "creada": ahora.isoformat(),
        "anterior": version["numero"],
        "pesos": pesos,
        "xiGoles": version.get("xiGoles"),
        "xiEstadisticas": version.get("xiEstadisticas"),
        "changelog": cambios or [{"texto": "Sin cambios: ningún mercado tiene datos que justifiquen mover su peso."}],
    }
