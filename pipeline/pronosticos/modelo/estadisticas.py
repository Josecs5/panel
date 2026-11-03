"""Tiros a puerta, córners, faltas y tarjetas por equipo.

La media sale de un modelo log-lineal: tendencia propia, lo que concede el rival,
ser local, igualdad del partido y árbitro (si hay dato). La distribución se elige
con los datos: binomial negativa si hay sobredispersión y Poisson si no.
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.stats import nbinom, poisson

# Columnas del equipo local y visitante para cada estadística
ESTADISTICAS = {
    "tiros_puerta": ("tpl", "tpv"),
    "corners": ("cl", "cv"),
    "faltas": ("fl", "fv"),
    "tarjetas": ("tarj_l", "tarj_v"),
}
ALFA_MINIMO = 0.02
MAX_CONTEO = 60


def anadir_tarjetas(partidos: pd.DataFrame) -> pd.DataFrame:
    salida = partidos.copy()
    salida["tarj_l"] = salida["al"] + salida["rl"].fillna(0)
    salida["tarj_v"] = salida["av"] + salida["rv"].fillna(0)
    return salida


@dataclass
class AjusteEstadistica:
    nombre: str
    equipos: dict[str, int]
    propio: np.ndarray
    concedido: np.ndarray
    base: float
    local: float
    igualdad: float
    arbitros: dict[str, float]
    alfa: float
    params: np.ndarray

    @property
    def distribucion(self) -> str:
        return "binomial_negativa" if self.alfa > ALFA_MINIMO else "poisson"

    def _fuerzas(self, equipo: str) -> tuple[float, float]:
        i = self.equipos.get(equipo)
        return (0.0, 0.0) if i is None else (float(self.propio[i]), float(self.concedido[i]))

    def medias(self, local: str, visitante: str, igualdad: float, arbitro: str | None = None) -> tuple[float, float]:
        pr_l, co_l = self._fuerzas(local)
        pr_v, co_v = self._fuerzas(visitante)
        comun = self.base + self.igualdad * igualdad + self.arbitros.get(arbitro, 0.0)
        return (
            float(np.exp(comun + self.local + pr_l + co_v)),
            float(np.exp(comun + pr_v + co_l)),
        )

    def pmf(self, media: float) -> np.ndarray:
        return pmf_conteo(media, self.alfa)


def pmf_conteo(media: float, alfa: float) -> np.ndarray:
    k = np.arange(MAX_CONTEO + 1)
    if alfa > ALFA_MINIMO:
        r = 1.0 / alfa
        pmf = nbinom.pmf(k, r, r / (r + media))
    else:
        pmf = poisson.pmf(k, media)
    return pmf / pmf.sum()


def prob_mas_de(pmf: np.ndarray, linea: float) -> float:
    return float(pmf[np.arange(pmf.size) > linea].sum())


def pmf_total(pmf_a: np.ndarray, pmf_b: np.ndarray) -> np.ndarray:
    return np.convolve(pmf_a, pmf_b)


def percentiles(pmf: np.ndarray, inferior: float = 0.25, superior: float = 0.75) -> tuple[int, int]:
    acumulada = np.cumsum(pmf)
    return int(np.searchsorted(acumulada, inferior)), int(np.searchsorted(acumulada, superior))


def ajustar(
    partidos: pd.DataFrame,
    nombre: str,
    referencia: pd.Timestamp,
    xi: float = 0.002,
    regularizacion: float = 2.0,
    usar_arbitro: bool = False,
    reg_arbitro: float = 20.0,
    previo: AjusteEstadistica | None = None,
) -> AjusteEstadistica:
    col_l, col_v = ESTADISTICAS[nombre]
    datos = partidos[
        (partidos["fecha"] < referencia) & partidos[col_l].notna() & partidos[col_v].notna()
    ]
    if datos.empty:
        raise ValueError(f"No hay datos de {nombre} antes de {referencia}")

    nombres = sorted(set(datos["local"]) | set(datos["visitante"]))
    equipos = {e: i for i, e in enumerate(nombres)}
    n = len(nombres)

    arbitros: list[str] = []
    if usar_arbitro:
        presentes = datos["arbitro"].dropna()
        arbitros = sorted(presentes.unique())
    ia = {a: i for i, a in enumerate(arbitros)}
    m = len(arbitros)

    pesos_base = np.exp(-xi * (referencia - datos["fecha"]).dt.total_seconds().to_numpy() / 86400.0)
    il, iv = datos["local"].map(equipos).to_numpy(), datos["visitante"].map(equipos).to_numpy()

    # Cada partido aporta dos filas: una por equipo
    propio = np.concatenate([il, iv])
    rival = np.concatenate([iv, il])
    es_local = np.concatenate([np.ones(len(il)), np.zeros(len(iv))])
    y = np.concatenate([datos[col_l].to_numpy(float), datos[col_v].to_numpy(float)])
    igual = np.tile(datos["igualdad"].to_numpy(float), 2)
    w = np.tile(pesos_base, 2)
    if m:
        cod = datos["arbitro"].map(lambda a: ia.get(a, -1)).to_numpy(int)
        ar = np.tile(cod, 2)
    else:
        ar = np.full(y.shape, -1)
    con_arbitro = ar >= 0

    def objetivo(p):
        pr, co, base, hfa, gam = p[:n], p[n : 2 * n], p[2 * n], p[2 * n + 1], p[2 * n + 2]
        ref = p[2 * n + 3 :]
        eta = base + hfa * es_local + pr[propio] + co[rival] + gam * igual
        if m:
            eta = eta + np.where(con_arbitro, ref[np.maximum(ar, 0)], 0.0)
        media = np.exp(eta)
        ll = np.sum(w * (y * eta - media))
        ll -= regularizacion * (np.sum(pr**2) + np.sum(co**2)) + reg_arbitro * np.sum(ref**2)
        residuo = w * (y - media)
        grad = np.zeros_like(p)
        np.add.at(grad[:n], propio, residuo)
        np.add.at(grad[n : 2 * n], rival, residuo)
        grad[:n] -= 2.0 * regularizacion * pr
        grad[n : 2 * n] -= 2.0 * regularizacion * co
        grad[2 * n] = residuo.sum()
        grad[2 * n + 1] = np.sum(residuo * es_local)
        grad[2 * n + 2] = np.sum(residuo * igual)
        if m:
            np.add.at(grad[2 * n + 3 :], ar[con_arbitro], residuo[con_arbitro])
            grad[2 * n + 3 :] -= 2.0 * reg_arbitro * ref
        return -ll, -grad

    inicio = np.zeros(2 * n + 3 + m)
    inicio[2 * n] = np.log(max(y.mean(), 0.1))
    if previo is not None:
        for equipo, i in equipos.items():
            j = previo.equipos.get(equipo)
            if j is not None:
                inicio[i] = previo.propio[j]
                inicio[n + i] = previo.concedido[j]
        inicio[2 * n], inicio[2 * n + 1], inicio[2 * n + 2] = previo.base, previo.local, previo.igualdad

    resultado = minimize(objetivo, inicio, jac=True, method="L-BFGS-B", options={"maxiter": 300})
    p = resultado.x
    pr, co, base, hfa, gam = p[:n], p[n : 2 * n], p[2 * n], p[2 * n + 1], p[2 * n + 2]
    ref = p[2 * n + 3 :]

    # Sobredispersión por momentos: Var = media + alfa * media²
    eta = base + hfa * es_local + pr[propio] + co[rival] + gam * igual
    if m:
        eta = eta + np.where(con_arbitro, ref[np.maximum(ar, 0)], 0.0)
    media = np.exp(eta)
    alfa = float(np.sum(w * ((y - media) ** 2 - media)) / np.sum(w * media**2))

    return AjusteEstadistica(
        nombre=nombre,
        equipos=equipos,
        propio=pr,
        concedido=co,
        base=float(base),
        local=float(hfa),
        igualdad=float(gam),
        arbitros={a: float(ref[i]) for a, i in ia.items()},
        alfa=max(alfa, 0.0),
        params=p,
    )
