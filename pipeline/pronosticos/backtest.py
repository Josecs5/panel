"""Backtest walk-forward: cada semana se entrena solo con lo jugado antes del lunes.

Los parámetros se eligen con una temporada (ajuste) y se evalúan con otra que no
ha intervenido en la elección (validación).
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .apuestas.boleto import construir_boleto
from .apuestas.combinadas import Seleccion
from .auditoria import metricas as m
from .auditoria.liquidar import GANADA, beneficio_centimos, liquidar_apuesta, liquidar_seleccion
from .config import MAX_DESTACADOS_CHAMPIONS, MAX_DESTACADOS_LIGA, ORDEN_LIGAS, PESO_MODELO_INICIAL
from .destacados import seleccionar
from .jornada import lunes_de
from .modelo import champions, dixon_coles as dc, estadisticas as est
from .modelo.elo import Elo, elo_previo
from .modelo.margen import margen, quitar_margen
from .modelo.mezcla import mezclar

XI_GOLES = (0.0005, 0.001, 0.002, 0.004)
XI_ESTADISTICAS = (0.001, 0.003)
PESOS_MODELO = (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)
SIGNOS = ("1", "X", "2")


def preparar(partidos: pd.DataFrame) -> pd.DataFrame:
    """Añade tarjetas y el Elo previo de cada partido, liga a liga."""
    partes = [elo_previo(grupo) for _, grupo in partidos.groupby("liga", sort=False)]
    return est.anadir_tarjetas(pd.concat(partes, ignore_index=True))


def _semanas(prueba: pd.DataFrame):
    return prueba.groupby(prueba["fecha"].map(lunes_de), sort=True)


def predecir_goles(liga: pd.DataFrame, temporada: int, xi: float) -> pd.DataFrame:
    prueba = liga[liga["temporada"] == temporada]
    filas, previo = [], None
    for lunes, grupo in _semanas(prueba):
        if not (liga["fecha"] < lunes).any():
            continue
        ajuste = dc.ajustar(liga, lunes, xi=xi, previo=previo)
        previo = ajuste
        for indice, fila in grupo.iterrows():
            lam, mu = ajuste.medias(fila["local"], fila["visitante"])
            mercados = dc.mercados_de_matriz(dc.matriz_marcadores(lam, mu, ajuste.rho))
            marcadores = mercados.pop("marcadores")
            filas.append(
                {
                    "indice": indice,
                    "lam": lam,
                    "mu": mu,
                    "marcador_top": marcadores[0][:2],
                    **{f"p_{k}": v for k, v in mercados.items()},
                }
            )
    if not filas:
        return pd.DataFrame()
    return liga.join(pd.DataFrame(filas).set_index("indice"), how="inner")


def _indice_signo(gl, gv) -> np.ndarray:
    return np.where(gl > gv, 0, np.where(gl == gv, 1, 2))


def _referencia(fila, sufijos: tuple[str, ...], prefijos: tuple[str, ...]) -> np.ndarray | None:
    """Probabilidades sin margen de la primera fuente con todas las cuotas."""
    for prefijo in prefijos:
        cuotas = [fila.get(f"{prefijo}_{s}") for s in sufijos]
        if all(pd.notna(c) and c > 1.0 for c in cuotas):
            return quitar_margen(cuotas)
    return None


def anadir_mercado(preds: pd.DataFrame) -> pd.DataFrame:
    """Mercado de referencia antes del partido y al cierre: Pinnacle o, si falta, la media."""
    salida = preds.copy()
    for nombre, prefijos in (("ref", ("ps", "avg")), ("cierre", ("psc", "avgc"))):
        r1x2 = [_referencia(f, ("1", "x", "2"), prefijos) for _, f in preds.iterrows()]
        rou = [_referencia(f, ("o25", "u25"), prefijos) for _, f in preds.iterrows()]
        salida[f"{nombre}_1x2"] = r1x2
        salida[f"{nombre}_ou"] = rou
    return salida


def evaluar_1x2(preds: pd.DataFrame) -> dict:
    y = _indice_signo(preds["gl"].to_numpy(), preds["gv"].to_numpy())
    modelo = preds[["p_1", "p_X", "p_2"]].to_numpy()
    resultado = {
        "n": int(len(preds)),
        "modelo": {"log_loss": m.log_loss_multiclase(modelo, y), "brier": m.brier_multiclase(modelo, y)},
    }
    con_ref = preds["ref_1x2"].notna().to_numpy()
    resultado["n_con_mercado"] = int(con_ref.sum())
    if con_ref.any():
        mercado = np.vstack(preds.loc[con_ref, "ref_1x2"].to_numpy())
        resultado["mercado"] = {
            "log_loss": m.log_loss_multiclase(mercado, y[con_ref]),
            "brier": m.brier_multiclase(mercado, y[con_ref]),
        }
        resultado["modelo_mismos_partidos"] = {
            "log_loss": m.log_loss_multiclase(modelo[con_ref], y[con_ref]),
            "brier": m.brier_multiclase(modelo[con_ref], y[con_ref]),
        }
        resultado["mezcla"] = {}
        for peso in PESOS_MODELO:
            final = peso * modelo[con_ref] + (1 - peso) * mercado
            resultado["mezcla"][str(peso)] = m.log_loss_multiclase(final, y[con_ref])
    return resultado


def evaluar_binario(preds: pd.DataFrame, clave: str, resultado_real: np.ndarray, columna_ref: str | None = None) -> dict:
    p = preds[clave].to_numpy()
    salida = {
        "n": int(len(preds)),
        "log_loss": m.log_loss_binario(p, resultado_real),
        "brier": m.brier_binario(p, resultado_real),
        "error_calibracion": m.error_calibracion(p, resultado_real),
    }
    if columna_ref:
        con_ref = preds[columna_ref].notna().to_numpy()
        salida["n_con_mercado"] = int(con_ref.sum())
        if con_ref.any():
            mercado = np.vstack(preds.loc[con_ref, columna_ref].to_numpy())[:, 0]
            real = resultado_real[con_ref]
            salida["mercado_log_loss"] = m.log_loss_binario(mercado, real)
            salida["modelo_mismos_partidos_log_loss"] = m.log_loss_binario(p[con_ref], real)
            salida["mezcla"] = {
                str(peso): m.log_loss_binario(peso * p[con_ref] + (1 - peso) * mercado, real) for peso in PESOS_MODELO
            }
    return salida


def evaluar_goles(preds: pd.DataFrame) -> dict:
    total = preds["gl"].to_numpy() + preds["gv"].to_numpy()
    ambos = (preds["gl"].to_numpy() > 0) & (preds["gv"].to_numpy() > 0)
    y = _indice_signo(preds["gl"].to_numpy(), preds["gv"].to_numpy())
    calibracion = {
        signo: m.calibracion(preds[f"p_{signo}"].to_numpy(), (y == i).astype(float), tramos=5)
        for i, signo in enumerate(SIGNOS)
    }
    aciertos_marcador = np.mean(
        [tuple(t) == (int(a), int(b)) for t, a, b in zip(preds["marcador_top"], preds["gl"], preds["gv"])]
    )
    return {
        "1x2": evaluar_1x2(preds),
        "o15": evaluar_binario(preds, "p_o15", (total > 1.5).astype(float)),
        "o25": evaluar_binario(preds, "p_o25", (total > 2.5).astype(float), "ref_ou"),
        "o35": evaluar_binario(preds, "p_o35", (total > 3.5).astype(float)),
        "btts": evaluar_binario(preds, "p_btts_si", ambos.astype(float)),
        "calibracion_1x2": calibracion,
        "error_goles_esperados": float(np.mean(np.abs(preds["lam"] + preds["mu"] - total))),
        "acierto_marcador_mas_probable": float(aciertos_marcador),
    }


def evaluar_estadistica(liga: pd.DataFrame, nombre: str, temporada: int, xi: float, usar_arbitro: bool = False) -> dict:
    """Probabilidad de superar una línea y rango 25-75, frente a la frecuencia histórica."""
    col_l, col_v = est.ESTADISTICAS[nombre]
    disponibles = liga[liga[col_l].notna() & liga[col_v].notna()]
    prueba = disponibles[disponibles["temporada"] == temporada]
    if prueba.empty:
        return {"n": 0}

    p_tot, p_ref, y_tot, dentro, previo = [], [], [], [], None
    p_eq, y_eq = [], []
    alfa = None
    for lunes, grupo in _semanas(prueba):
        pasado = disponibles[disponibles["fecha"] < lunes]
        if pasado.empty:
            continue
        ajuste = est.ajustar(disponibles, nombre, lunes, xi=xi, usar_arbitro=usar_arbitro, previo=previo)
        previo, alfa = ajuste, ajuste.alfa
        total_pasado = pasado[col_l] + pasado[col_v]
        linea = np.floor(total_pasado.mean()) + 0.5
        linea_eq = np.floor(total_pasado.mean() / 2.0) + 0.5
        frecuencia = float((total_pasado > linea).mean())
        for _, fila in grupo.iterrows():
            arbitro = fila["arbitro"] if usar_arbitro else None
            ml, mv = ajuste.medias(fila["local"], fila["visitante"], fila["igualdad"], arbitro)
            pmf_l, pmf_v = ajuste.pmf(ml), ajuste.pmf(mv)
            pmf_t = est.pmf_total(pmf_l, pmf_v)
            real_l, real_v = float(fila[col_l]), float(fila[col_v])
            total = real_l + real_v
            p_tot.append(est.prob_mas_de(pmf_t, linea))
            p_ref.append(frecuencia)
            y_tot.append(float(total > linea))
            bajo, alto = est.percentiles(pmf_t)
            dentro.append(bajo <= total <= alto)
            p_eq.extend([est.prob_mas_de(pmf_l, linea_eq), est.prob_mas_de(pmf_v, linea_eq)])
            y_eq.extend([float(real_l > linea_eq), float(real_v > linea_eq)])
    if not p_tot:
        return {"n": 0}
    return {
        "n": len(p_tot),
        "log_loss": m.log_loss_binario(p_tot, y_tot),
        "log_loss_frecuencia": m.log_loss_binario(p_ref, y_tot),
        "brier": m.brier_binario(p_tot, y_tot),
        "brier_frecuencia": m.brier_binario(p_ref, y_tot),
        "error_calibracion": m.error_calibracion(p_tot, y_tot),
        "error_calibracion_equipo": m.error_calibracion(p_eq, y_eq),
        "cobertura_25_75": float(np.mean(dentro)),
        "alfa": alfa,
        "distribucion": "binomial_negativa" if (alfa or 0) > est.ALFA_MINIMO else "poisson",
    }


@dataclass
class ResultadoSimulacion:
    jornadas: int
    jornadas_sin_apuesta: int
    apuestas: int
    simples: int
    combinadas: int
    ganadas: int
    apostado_eur: float
    beneficio_eur: float
    roi: float
    roi_ic95: tuple[float, float]
    clv_medio: float | None
    tope_maximo_eur: float
    beneficio_acumulado_minimo_eur: float


def simular_boletos(preds: pd.DataFrame, peso_1x2: float, peso_ou: float) -> ResultadoSimulacion:
    """Aplica las reglas de apuesta con las cuotas de Bet365 previas al cierre."""
    jornadas = preds.groupby(preds["fecha"].map(lunes_de), sort=True)
    beneficios, stakes, clvs = [], [], []
    n_apuestas = n_simples = n_combinadas = n_ganadas = sin_apuesta = 0
    tope_maximo = 0

    for _, semana in jornadas:
        destacados = pd.concat(
            [seleccionar(grupo, MAX_DESTACADOS_LIGA) for _, grupo in semana.groupby("liga")], ignore_index=True
        )
        selecciones: list[Seleccion] = []
        fichas: dict[tuple[str, str], tuple] = {}
        for _, fila in destacados.iterrows():
            partido = f"{fila['liga']}|{fila['local']}|{fila['visitante']}|{fila['fecha'].date()}"
            grupos = [
                (("1", "X", "2"), ("b365_1", "b365_x", "b365_2"), ("p_1", "p_X", "p_2"), "1x2", peso_1x2),
                (("o25", "u25"), ("b365_o25", "b365_u25"), ("p_o25", "p_u25"), "ou", peso_ou),
            ]
            for mercados, cuotas, probs, sufijo, peso in grupos:
                referencia = fila[f"ref_{sufijo}"]
                valores = [fila[c] for c in cuotas]
                if not isinstance(referencia, np.ndarray) or not all(pd.notna(v) and v > 1 for v in valores):
                    continue
                final = mezclar([fila[p] for p in probs], referencia, peso)
                cierre = fila[f"cierre_{sufijo}"]
                for i, mercado in enumerate(mercados):
                    selecciones.append(Seleccion(partido, mercado, float(final[i]), float(valores[i]), "bet365"))
                    fichas[(partido, mercado)] = (
                        int(fila["gl"]),
                        int(fila["gv"]),
                        float(cierre[i]) if isinstance(cierre, np.ndarray) else None,
                    )
        boleto = construir_boleto(selecciones)
        if not boleto:
            sin_apuesta += 1
            beneficios.append(0)
            stakes.append(0)
            continue

        beneficio_semana = stake_semana = 0
        for elemento in boleto:
            apuesta = elemento.apuesta
            n_apuestas += 1
            n_combinadas += int(apuesta.es_combinada)
            n_simples += int(not apuesta.es_combinada)
            estados = []
            prob_cierre: float | None = 1.0
            for s in apuesta.selecciones:
                gl, gv, cierre = fichas[(s.partido, s.mercado)]
                estados.append(liquidar_seleccion(s.mercado, gl, gv))
                prob_cierre = None if prob_cierre is None or cierre is None else prob_cierre * cierre
            estado = liquidar_apuesta(estados)
            n_ganadas += int(estado == GANADA)
            beneficio_semana += beneficio_centimos(estado, elemento.stake_centimos, apuesta.cuota)
            stake_semana += elemento.stake_centimos
            if prob_cierre is not None:
                clvs.append(apuesta.cuota * prob_cierre - 1.0)
        tope_maximo = max(tope_maximo, stake_semana)
        beneficios.append(beneficio_semana)
        stakes.append(stake_semana)

    total_b, total_s = sum(beneficios), sum(stakes)
    return ResultadoSimulacion(
        jornadas=len(beneficios),
        jornadas_sin_apuesta=sin_apuesta,
        apuestas=n_apuestas,
        simples=n_simples,
        combinadas=n_combinadas,
        ganadas=n_ganadas,
        apostado_eur=total_s / 100,
        beneficio_eur=total_b / 100,
        roi=total_b / total_s if total_s else 0.0,
        roi_ic95=m.intervalo_bootstrap(beneficios, stakes),
        clv_medio=float(np.mean(clvs)) if clvs else None,
        tope_maximo_eur=tope_maximo / 100,
        beneficio_acumulado_minimo_eur=float(np.min(np.cumsum(beneficios))) / 100 if beneficios else 0.0,
    )


def _peso_optimo(evaluaciones: list[dict], clave: str) -> tuple[float, dict]:
    """Peso con mejor log loss medio ponderado por partidos."""
    acumulado = {str(p): 0.0 for p in PESOS_MODELO}
    total = 0
    for evaluacion in evaluaciones:
        bloque = evaluacion[clave]
        n = bloque.get("n_con_mercado", 0)
        if not n:
            continue
        total += n
        for peso, valor in bloque["mezcla"].items():
            acumulado[peso] += n * valor
    if not total:
        return PESO_MODELO_INICIAL, {}
    medias = {p: v / total for p, v in acumulado.items()}
    return float(min(medias, key=medias.get)), medias


def _suma_loss_goles(preds: pd.DataFrame) -> float:
    y = _indice_signo(preds["gl"].to_numpy(), preds["gv"].to_numpy())
    total = preds["gl"].to_numpy() + preds["gv"].to_numpy()
    return len(preds) * (
        m.log_loss_multiclase(preds[["p_1", "p_X", "p_2"]].to_numpy(), y)
        + m.log_loss_binario(preds["p_o25"].to_numpy(), (total > 2.5).astype(float))
    )


def backtest_ligas(partidos: pd.DataFrame, temporada_ajuste: int, temporada_validacion: int) -> dict:
    datos = preparar(partidos)
    ligas = {liga: g.reset_index(drop=True) for liga, g in datos.groupby("liga")}
    orden = [l for l in ORDEN_LIGAS if l in ligas]

    # 1. Elegir el decaimiento temporal solo con la temporada de ajuste
    perdidas = {}
    for xi in XI_GOLES:
        total = 0.0
        for liga in orden:
            preds = predecir_goles(ligas[liga], temporada_ajuste, xi)
            total += _suma_loss_goles(preds) if len(preds) else 0.0
        perdidas[xi] = total
    xi_goles = min(perdidas, key=perdidas.get)

    perdidas_est = {}
    for xi in XI_ESTADISTICAS:
        perdidas_est[xi] = sum(
            r["n"] * r["log_loss"]
            for liga in orden
            for nombre in est.ESTADISTICAS
            if (r := evaluar_estadistica(ligas[liga], nombre, temporada_ajuste, xi))["n"]
        )
    xi_estad = min(perdidas_est, key=perdidas_est.get)

    # 2. Predicciones definitivas de las dos temporadas
    preds_por_temporada = {}
    for temporada in (temporada_ajuste, temporada_validacion):
        partes = [predecir_goles(ligas[liga], temporada, xi_goles) for liga in orden]
        preds_por_temporada[temporada] = anadir_mercado(
            pd.concat([p for p in partes if len(p)], ignore_index=True)
        )

    # 3. Pesos de la mezcla, también solo con la temporada de ajuste
    eval_ajuste_por_liga = [
        evaluar_goles(g) for _, g in preds_por_temporada[temporada_ajuste].groupby("liga")
    ]
    peso_1x2, medias_1x2 = _peso_optimo(eval_ajuste_por_liga, "1x2")
    peso_ou, medias_ou = _peso_optimo(eval_ajuste_por_liga, "o25")

    salida = {
        "parametros": {
            "xi_goles": xi_goles,
            "xi_estadisticas": xi_estad,
            "peso_modelo_1x2": peso_1x2,
            "peso_modelo_ou25": peso_ou,
            "log_loss_ajuste_por_peso_1x2": medias_1x2,
            "log_loss_ajuste_por_peso_ou25": medias_ou,
        },
        "temporadas": {},
    }

    # 4. Evaluación: la que cuenta es la de validación
    for temporada, preds in preds_por_temporada.items():
        bloque = {"goles": {}, "estadisticas": {}, "apuestas": {}, "margen_bet365_1x2": {}}
        bloque["goles"]["todas"] = evaluar_goles(preds)
        for liga, grupo in preds.groupby("liga"):
            bloque["goles"][liga] = evaluar_goles(grupo)
            cuotas = grupo[["b365_1", "b365_x", "b365_2"]].dropna()
            if len(cuotas):
                bloque["margen_bet365_1x2"][liga] = float(np.median([margen(c) for c in cuotas.to_numpy()]))
        for liga in orden:
            bloque["estadisticas"][liga] = {
                nombre: evaluar_estadistica(ligas[liga], nombre, temporada, xi_estad) for nombre in est.ESTADISTICAS
            }
        if "PL" in ligas:
            bloque["estadisticas"]["PL_con_arbitro"] = {
                nombre: evaluar_estadistica(ligas["PL"], nombre, temporada, xi_estad, usar_arbitro=True)
                for nombre in ("faltas", "tarjetas")
            }
        bloque["apuestas"]["peso_inicial_0.4"] = vars(simular_boletos(preds, PESO_MODELO_INICIAL, PESO_MODELO_INICIAL))
        bloque["apuestas"]["peso_ajustado"] = vars(simular_boletos(preds, peso_1x2, peso_ou))
        bloque["apuestas"]["solo_modelo"] = vars(simular_boletos(preds, 1.0, 1.0))
        salida["temporadas"][str(temporada)] = bloque
    return salida


def backtest_champions(tablas: pd.DataFrame, temporadas_prueba: tuple[int, ...]) -> dict:
    """Elo con todas las competiciones y goles de Champions por diferencia de Elo."""
    conjunto = elo_previo(tablas, local="id_local", visitante="id_visitante", elo=Elo())
    cl = conjunto[conjunto["competicion"] == "CL"].reset_index(drop=True)
    domesticos = conjunto[conjunto["competicion"] != "CL"]
    cubiertos = set(domesticos["id_local"]) | set(domesticos["id_visitante"])

    filas = []
    prueba = cl[cl["temporada"].isin(temporadas_prueba)]
    for lunes, grupo in _semanas(prueba):
        if not (cl["fecha"] < lunes).any():
            continue
        ajuste = champions.ajustar(cl, lunes)
        for _, fila in grupo.iterrows():
            lam, mu = ajuste.medias(fila["elo_l"], fila["elo_v"], bool(fila["neutral"]))
            mercados = dc.mercados_de_matriz(dc.matriz_marcadores(lam, mu, ajuste.rho))
            filas.append(
                {
                    "temporada": fila["temporada"],
                    "gl": fila["gl"],
                    "gv": fila["gv"],
                    "cubierto": fila["id_local"] in cubiertos and fila["id_visitante"] in cubiertos,
                    "p_1": mercados["1"],
                    "p_X": mercados["X"],
                    "p_2": mercados["2"],
                    "p_o25": mercados["o25"],
                    "p_btts": mercados["btts_si"],
                    "local": ajuste.local,
                    "beta": ajuste.beta,
                    "rho": ajuste.rho,
                }
            )
    if not filas:
        return {"n": 0}
    preds = pd.DataFrame(filas)

    def resumen(p: pd.DataFrame) -> dict:
        if p.empty:
            return {"n": 0}
        y = _indice_signo(p["gl"].to_numpy(), p["gv"].to_numpy())
        total = p["gl"].to_numpy() + p["gv"].to_numpy()
        frecuencias = np.array([(y == i).mean() for i in range(3)])
        return {
            "n": int(len(p)),
            "log_loss_1x2": m.log_loss_multiclase(p[["p_1", "p_X", "p_2"]].to_numpy(), y),
            "log_loss_1x2_frecuencia_fija": m.log_loss_multiclase(np.tile(frecuencias, (len(p), 1)), y),
            "brier_1x2": m.brier_multiclase(p[["p_1", "p_X", "p_2"]].to_numpy(), y),
            "log_loss_o25": m.log_loss_binario(p["p_o25"].to_numpy(), (total > 2.5).astype(float)),
            "log_loss_btts": m.log_loss_binario(
                p["p_btts"].to_numpy(), ((p["gl"] > 0) & (p["gv"] > 0)).to_numpy().astype(float)
            ),
        }

    ultimo = preds.iloc[-1]
    return {
        "todas": resumen(preds),
        "por_temporada": {str(t): resumen(g) for t, g in preds.groupby("temporada")},
        "clubes_con_liga_cubierta": resumen(preds[preds["cubierto"]]),
        "clubes_sin_liga_cubierta": resumen(preds[~preds["cubierto"]]),
        "ultimo_ajuste": {"local": float(ultimo["local"]), "beta": float(ultimo["beta"]), "rho": float(ultimo["rho"])},
        "max_destacados_por_jornada": MAX_DESTACADOS_CHAMPIONS,
    }
