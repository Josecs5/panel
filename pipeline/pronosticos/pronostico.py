"""Del modelo y las cuotas al pronóstico de un partido."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import mercados as mc
from .apuestas.politica import peso_inicial
from .modelo import champions, dixon_coles as dc, estadisticas as est
from .modelo import jugadores as jug

XI_GOLES = 0.001
XI_ESTADISTICAS = 0.003
LIGAS = ("PD", "PL", "BL1", "SA")
FACTOR_MIN, FACTOR_MAX = 0.5, 2.0

# Categoría de jugador -> estadística de equipo y qué lado del rival influye
_FACTOR_JUGADOR = {
    "faltas": ("faltas", "concedido"),
    "recibe_falta": ("faltas", "propio"),
    "tarjeta": ("tarjetas", "concedido"),
    "tiros_puerta": ("tiros_puerta", "concedido"),
}


@dataclass
class Modelos:
    dc: dict[str, dc.AjusteDC] = field(default_factory=dict)
    estadisticas: dict[str, dict[str, est.AjusteEstadistica]] = field(default_factory=dict)
    champions: champions.AjusteChampions | None = None
    equipo_csv: dict[int, str] = field(default_factory=dict)
    liga_de_equipo: dict[int, str] = field(default_factory=dict)


def entrenar(
    csv_preparado: pd.DataFrame | None, tabla_champions: pd.DataFrame | None, referencia: pd.Timestamp
) -> Modelos:
    """Entrena con todo lo jugado antes de `referencia` (sin zona horaria)."""
    modelos = Modelos()
    if csv_preparado is not None and len(csv_preparado):
        for liga in LIGAS:
            datos = csv_preparado[csv_preparado["liga"] == liga]
            if datos.empty:
                continue
            modelos.dc[liga] = dc.ajustar(datos, referencia, xi=XI_GOLES)
            modelos.estadisticas[liga] = {
                nombre: est.ajustar(datos, nombre, referencia, xi=XI_ESTADISTICAS)
                for nombre, (col, _) in est.ESTADISTICAS.items()
                if datos[col].notna().any()
            }
    if tabla_champions is not None and len(tabla_champions):
        modelos.champions = champions.ajustar(tabla_champions, referencia)
    return modelos


def medias_goles(modelos: Modelos, partido: dict) -> tuple[float, float, float] | None:
    competicion = partido["competicion"]
    if competicion == "CL":
        if modelos.champions is None:
            return None
        lam, mu = modelos.champions.medias(partido["elo_l"], partido["elo_v"], partido.get("neutral", False))
        return lam, mu, modelos.champions.rho
    ajuste = modelos.dc.get(competicion)
    if ajuste is None:
        return None
    local = modelos.equipo_csv.get(partido["id_local"], partido["local"])
    visitante = modelos.equipo_csv.get(partido["id_visitante"], partido["visitante"])
    lam, mu = ajuste.medias(local, visitante)
    return lam, mu, ajuste.rho


def _ajustes_de(modelos: Modelos, equipo: int, nombre: str) -> est.AjusteEstadistica | None:
    liga = modelos.liga_de_equipo.get(equipo)
    return modelos.estadisticas.get(liga, {}).get(nombre) if liga else None


def medias_estadistica(modelos: Modelos, partido: dict, nombre: str, igualdad: float) -> tuple[float, float, float] | None:
    """Combina los ajustes de cada equipo, aunque jueguen en ligas distintas (Champions)."""
    aj_l = _ajustes_de(modelos, partido["id_local"], nombre)
    aj_v = _ajustes_de(modelos, partido["id_visitante"], nombre)
    if aj_l is None and aj_v is None:
        disponibles = [m[nombre] for m in modelos.estadisticas.values() if nombre in m]
        if not disponibles:
            return None
        aj_l = aj_v = disponibles[0]
    aj_l = aj_l or aj_v
    aj_v = aj_v or aj_l

    local_nom = modelos.equipo_csv.get(partido["id_local"], "")
    visit_nom = modelos.equipo_csv.get(partido["id_visitante"], "")
    pr_l, co_l = aj_l._fuerzas(local_nom)
    pr_v, co_v = aj_v._fuerzas(visit_nom)
    base = (aj_l.base + aj_v.base) / 2.0
    gamma = (aj_l.igualdad + aj_v.igualdad) / 2.0
    ventaja = 0.0 if partido.get("neutral") else (aj_l.local + aj_v.local) / 2.0
    media_l = float(np.exp(base + gamma * igualdad + ventaja + pr_l + co_v))
    media_v = float(np.exp(base + gamma * igualdad + pr_v + co_l))
    return media_l, media_v, (aj_l.alfa + aj_v.alfa) / 2.0


def _linea_por_defecto(media: float) -> float:
    return float(np.floor(media)) + 0.5


def probabilidades_modelo(modelos: Modelos, partido: dict, claves_con_cuota: set[str]) -> dict | None:
    """Probabilidades del modelo, rangos 25-75 y medias de un partido."""
    goles = medias_goles(modelos, partido)
    if goles is None:
        return None
    lam, mu, rho = goles
    mercados_goles = dc.mercados_de_matriz(dc.matriz_marcadores(lam, mu, rho))
    marcadores = mercados_goles.pop("marcadores")
    probabilidades = dict(mercados_goles)
    rangos: dict[str, dict] = {}

    for nombre in est.ESTADISTICAS:
        medias = medias_estadistica(modelos, partido, nombre, partido["igualdad"])
        if medias is None:
            continue
        media_l, media_v, alfa = medias
        pmf_l, pmf_v = est.pmf_conteo(media_l, alfa), est.pmf_conteo(media_v, alfa)
        pmf_t = est.pmf_total(pmf_l, pmf_v)
        rangos[nombre] = {
            "total": list(est.percentiles(pmf_t)),
            "local": list(est.percentiles(pmf_l)),
            "visitante": list(est.percentiles(pmf_v)),
            "mediaLocal": media_l,
            "mediaVisitante": media_v,
        }
        claves = {c for c in claves_con_cuota if c.startswith(f"{nombre}_")}
        for lado in "ou":
            claves.add(f"{nombre}_{lado}{mc.linea_a_texto(_linea_por_defecto(media_l + media_v))}")
            claves.add(f"{nombre}_l_{lado}{mc.linea_a_texto(_linea_por_defecto(media_l))}")
            claves.add(f"{nombre}_v_{lado}{mc.linea_a_texto(_linea_por_defecto(media_v))}")
        for clave in claves:
            pmf = pmf_l if "_l_" in clave else pmf_v if "_v_" in clave else pmf_t
            mas = est.prob_mas_de(pmf, mc.linea_de_clave(clave))
            lado = clave[len(nombre) + 1 :]
            lado = lado[2:] if lado[:2] in ("l_", "v_") else lado
            probabilidades[clave] = mas if lado[0] == "o" else 1.0 - mas

    return {
        "golesLocal": lam,
        "golesVisitante": mu,
        "marcadores": [{"local": a, "visitante": b, "prob": p} for a, b, p in marcadores],
        "probabilidades": probabilidades,
        "rangos": rangos,
    }


def indexar_cuotas(lineas_por_casa: dict[str, list[dict]]) -> dict[str, dict[str, dict]]:
    """{casa: {clave: línea}}, solo con los mercados que usa el módulo."""
    salida: dict[str, dict[str, dict]] = {}
    for casa, lineas in lineas_por_casa.items():
        propias: dict[str, dict] = {}
        for linea in lineas:
            clave = mc.clave_de_linea(linea)
            if clave:
                propias[clave] = linea
        salida[casa] = propias
    return salida


def _mercado_de_referencia(cuotas: dict[str, dict[str, dict]], orden: list[str]) -> dict[str, float]:
    """Probabilidades sin margen: la primera casa que tenga cada mercado manda."""
    salida: dict[str, float] = {}
    for casa in orden:
        propias = {c: l["cuota"] for c, l in cuotas.get(casa, {}).items()}
        for clave, p in mc.probabilidades_mercado(propias).items():
            salida.setdefault(clave, p)
    return salida


def _mercado_de_jugadores(referencia: dict[str, float]) -> dict[str, dict[str, float]]:
    salida: dict[str, dict[str, float]] = {}
    for clave, p in referencia.items():
        if clave.startswith("jug:"):
            _, categoria, nombre = clave.split(":", 2)
            salida.setdefault(categoria, {})[nombre] = p
    return salida


def factores_jugador(modelos: Modelos, partido: dict) -> dict[str, tuple[float, float]]:
    """Cuánto sube o baja cada categoría según el rival, con límites razonables."""
    salida = {}
    for categoria, (nombre, lado) in _FACTOR_JUGADOR.items():
        valores = []
        for rival in (partido["id_visitante"], partido["id_local"]):
            ajuste = _ajustes_de(modelos, rival, nombre)
            propio, concedido = ajuste._fuerzas(modelos.equipo_csv.get(rival, "")) if ajuste else (0.0, 0.0)
            valor = float(np.exp(concedido if lado == "concedido" else propio))
            valores.append(min(max(valor, FACTOR_MIN), FACTOR_MAX))
        salida[categoria] = (valores[0], valores[1])
    return salida


def componer(
    modelos: Modelos,
    partido: dict,
    lineas_por_casa: dict[str, list[dict]],
    casas: list[str],
    casa_referencia: str,
    pesos: dict[str, float],
    jugadores_importados: list[dict],
) -> dict | None:
    """Pronóstico completo: modelo, mercado, mezcla y mejor oferta de las casas del usuario."""
    cuotas = indexar_cuotas(lineas_por_casa)
    disponibles = {c for propias in cuotas.values() for c in propias}
    modelo = probabilidades_modelo(modelos, partido, disponibles)
    if modelo is None:
        return None

    referencia = _mercado_de_referencia(cuotas, [casa_referencia, *casas])
    top = jug.top_por_categoria(
        jug.del_equipo(jugadores_importados, partido["local"]),
        jug.del_equipo(jugadores_importados, partido["visitante"]),
        factores_jugador(modelos, partido),
        _mercado_de_jugadores(referencia),
    )
    jugadores_salida = {
        categoria: [{"jugador": j.jugador, "prob": j.probabilidad, "origen": j.origen} for j in lista]
        for categoria, lista in top.items()
    }

    items: dict[str, dict] = {}
    claves_top = {f"jug:{c}:{j.jugador}": j for c, lista in top.items() for j in lista}
    for clave in set(modelo["probabilidades"]) | {c for c in referencia if not c.startswith("jug:")} | set(claves_top):
        p_modelo = modelo["probabilidades"].get(clave)
        p_mercado = referencia.get(clave)
        if clave in claves_top and claves_top[clave].origen == "modelo":
            p_modelo = claves_top[clave].probabilidad
        grupo = mc.grupo_de(clave)
        if p_modelo is None and p_mercado is None:
            continue
        if p_modelo is None:
            final = p_mercado
        elif p_mercado is None:
            final = p_modelo
        else:
            peso = pesos.get(grupo, peso_inicial(grupo))
            final = peso * p_modelo + (1.0 - peso) * p_mercado

        oferta_casa = next((c for c in casas if clave in cuotas.get(c, {})), None)
        ids = {}
        for casa in {oferta_casa, casa_referencia} - {None}:
            linea = cuotas.get(casa, {}).get(clave)
            if linea:
                ids[casa] = {"mercado": linea["mercado"], "resultado": linea["id_resultado"], "jugador": linea["id_jugador"]}
        items[clave] = {
            "grupo": grupo,
            "modelo": p_modelo,
            "mercado": p_mercado,
            "final": float(final),
            "cuota": cuotas[oferta_casa][clave]["cuota"] if oferta_casa else None,
            "casa": oferta_casa,
            "ids": ids,
        }

    return {**modelo, "items": items, "jugadores": jugadores_salida}
