"""Goles en Champions: las fuerzas se comparan entre ligas con el Elo.

log(media local) = base + local + beta * (diferencia Elo / 400)
log(media visitante) = base - beta * (diferencia Elo / 400)
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from .dixon_coles import RHO_MAX, _tau, pesos_temporales


@dataclass
class AjusteChampions:
    base: float
    local: float
    beta: float
    rho: float

    def medias(self, elo_l: float, elo_v: float, neutral: bool = False) -> tuple[float, float]:
        d = (elo_l - elo_v) / 400.0
        ventaja = 0.0 if neutral else self.local
        return (
            float(np.exp(self.base + ventaja + self.beta * d)),
            float(np.exp(self.base - self.beta * d)),
        )


def ajustar(partidos: pd.DataFrame, referencia: pd.Timestamp, xi: float = 0.001) -> AjusteChampions:
    datos = partidos[partidos["fecha"] < referencia]
    if datos.empty:
        raise ValueError("No hay partidos de Champions anteriores")
    x = datos["gl"].to_numpy(int)
    y = datos["gv"].to_numpy(int)
    d = (datos["elo_l"].to_numpy(float) - datos["elo_v"].to_numpy(float)) / 400.0
    hay_local = 1.0 - datos["neutral"].to_numpy(float)
    w = pesos_temporales(datos["fecha"], referencia, xi)

    def nll(p):
        base, hfa, beta, rho = p
        log_l = base + hfa * hay_local + beta * d
        log_m = base - beta * d
        lam, mu = np.exp(log_l), np.exp(log_m)
        tau = _tau(x, y, lam, mu, rho)
        return -np.sum(w * (np.log(tau) + x * log_l - lam + y * log_m - mu))

    limites = [(None, None), (None, None), (None, None), (-RHO_MAX, RHO_MAX)]
    resultado = minimize(nll, [0.3, 0.2, 0.5, -0.05], method="L-BFGS-B", bounds=limites)
    return AjusteChampions(*(float(v) for v in resultado.x))
