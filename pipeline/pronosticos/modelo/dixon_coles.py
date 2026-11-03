"""Dixon-Coles con ponderación temporal, ajustado por liga."""

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.stats import poisson

MAX_GOLES = 10
RHO_MAX = 0.2


@dataclass
class AjusteDC:
    equipos: dict[str, int]
    ataque: np.ndarray
    defensa: np.ndarray
    base: float
    local: float
    rho: float
    xi: float
    params: np.ndarray

    def _fuerza(self, equipo: str) -> tuple[float, float]:
        indice = self.equipos.get(equipo)
        if indice is not None:
            return float(self.ataque[indice]), float(self.defensa[indice])
        # Un recién ascendido aún sin partidos: se le supone por debajo de la media.
        return float(np.quantile(self.ataque, 0.25)), float(np.quantile(self.defensa, 0.25))

    def medias(self, local: str, visitante: str) -> tuple[float, float]:
        at_l, de_l = self._fuerza(local)
        at_v, de_v = self._fuerza(visitante)
        return (
            float(np.exp(self.base + self.local + at_l - de_v)),
            float(np.exp(self.base + at_v - de_l)),
        )

    def matriz(self, local: str, visitante: str) -> np.ndarray:
        lam, mu = self.medias(local, visitante)
        return matriz_marcadores(lam, mu, self.rho)


def _tau(x, y, lam, mu, rho):
    tau = np.ones_like(lam, dtype=float)
    tau = np.where((x == 0) & (y == 0), 1.0 - lam * mu * rho, tau)
    tau = np.where((x == 0) & (y == 1), 1.0 + lam * rho, tau)
    tau = np.where((x == 1) & (y == 0), 1.0 + mu * rho, tau)
    tau = np.where((x == 1) & (y == 1), 1.0 - rho, tau)
    return np.maximum(tau, 1e-10)


def pesos_temporales(fechas: pd.Series, referencia: pd.Timestamp, xi: float) -> np.ndarray:
    dias = (referencia - fechas).dt.total_seconds().to_numpy() / 86400.0
    return np.exp(-xi * np.maximum(dias, 0.0))


def _objetivo(p, n, il, iv, x, y, w, regularizacion):
    """Verosimilitud negativa y su gradiente analítico."""
    a, d, base, hfa, rho = p[:n], p[n : 2 * n], p[2 * n], p[2 * n + 1], p[2 * n + 2]
    log_l = base + hfa + a[il] - d[iv]
    log_m = base + a[iv] - d[il]
    lam, mu = np.exp(log_l), np.exp(log_m)
    tau = _tau(x, y, lam, mu, rho)

    ll = np.sum(w * (np.log(tau) + x * log_l - lam + y * log_m - mu))
    ll -= regularizacion * (np.sum(a**2) + np.sum(d**2))

    es00, es01 = (x == 0) & (y == 0), (x == 0) & (y == 1)
    es10, es11 = (x == 1) & (y == 0), (x == 1) & (y == 1)
    dtau_lam = np.where(es00, -mu * rho, np.where(es01, rho, 0.0)) / tau
    dtau_mu = np.where(es00, -lam * rho, np.where(es10, rho, 0.0)) / tau
    dtau_rho = (
        np.where(es00, -lam * mu, 0.0)
        + np.where(es01, lam, 0.0)
        + np.where(es10, mu, 0.0)
        + np.where(es11, -1.0, 0.0)
    ) / tau
    g_l = w * (x - lam + lam * dtau_lam)
    g_m = w * (y - mu + mu * dtau_mu)

    grad = np.zeros_like(p)
    np.add.at(grad[:n], il, g_l)
    np.add.at(grad[:n], iv, g_m)
    np.add.at(grad[n : 2 * n], iv, -g_l)
    np.add.at(grad[n : 2 * n], il, -g_m)
    grad[:n] -= 2.0 * regularizacion * a
    grad[n : 2 * n] -= 2.0 * regularizacion * d
    grad[2 * n] = np.sum(g_l) + np.sum(g_m)
    grad[2 * n + 1] = np.sum(g_l)
    grad[2 * n + 2] = np.sum(w * dtau_rho)
    return -ll, -grad


def ajustar(
    partidos: pd.DataFrame,
    referencia: pd.Timestamp,
    xi: float = 0.002,
    regularizacion: float = 1.0,
    previo: AjusteDC | None = None,
) -> AjusteDC:
    """Máxima verosimilitud con gradiente analítico. Solo usa partidos anteriores."""
    datos = partidos[partidos["fecha"] < referencia]
    if datos.empty:
        raise ValueError("No hay partidos anteriores a la fecha de referencia")

    nombres = sorted(set(datos["local"]) | set(datos["visitante"]))
    equipos = {nombre: i for i, nombre in enumerate(nombres)}
    n = len(nombres)
    il = datos["local"].map(equipos).to_numpy()
    iv = datos["visitante"].map(equipos).to_numpy()
    x = datos["gl"].to_numpy(dtype=int)
    y = datos["gv"].to_numpy(dtype=int)
    w = pesos_temporales(datos["fecha"], referencia, xi)

    objetivo = lambda p: _objetivo(p, n, il, iv, x, y, w, regularizacion)

    inicio = np.zeros(2 * n + 3)
    inicio[2 * n] = 0.25
    inicio[2 * n + 1] = 0.25
    inicio[2 * n + 2] = -0.05
    if previo is not None:
        for nombre, i in equipos.items():
            j = previo.equipos.get(nombre)
            if j is not None:
                inicio[i] = previo.ataque[j]
                inicio[n + i] = previo.defensa[j]
        inicio[2 * n], inicio[2 * n + 1], inicio[2 * n + 2] = previo.base, previo.local, previo.rho

    limites = [(None, None)] * (2 * n + 2) + [(-RHO_MAX, RHO_MAX)]
    resultado = minimize(objetivo, inicio, jac=True, method="L-BFGS-B", bounds=limites, options={"maxiter": 500})
    p = resultado.x
    return AjusteDC(
        equipos=equipos,
        ataque=p[:n],
        defensa=p[n : 2 * n],
        base=float(p[2 * n]),
        local=float(p[2 * n + 1]),
        rho=float(p[2 * n + 2]),
        xi=xi,
        params=p,
    )


def matriz_marcadores(lam: float, mu: float, rho: float, max_goles: int = MAX_GOLES) -> np.ndarray:
    goles = np.arange(max_goles + 1)
    matriz = np.outer(poisson.pmf(goles, lam), poisson.pmf(goles, mu))
    matriz[0, 0] *= max(1.0 - lam * mu * rho, 0.0)
    matriz[0, 1] *= max(1.0 + lam * rho, 0.0)
    matriz[1, 0] *= max(1.0 + mu * rho, 0.0)
    matriz[1, 1] *= max(1.0 - rho, 0.0)
    return matriz / matriz.sum()


def mercados_de_matriz(matriz: np.ndarray) -> dict:
    """1X2, doble oportunidad, totales, ambos marcan y marcadores más probables."""
    p1 = float(np.tril(matriz, -1).sum())
    px = float(np.trace(matriz))
    p2 = float(np.triu(matriz, 1).sum())
    n = matriz.shape[0]
    filas, columnas = np.indices((n, n))
    totales = filas + columnas
    mercados = {
        "1": p1,
        "X": px,
        "2": p2,
        "1X": p1 + px,
        "12": p1 + p2,
        "X2": px + p2,
        "btts_si": float(matriz[1:, 1:].sum()),
        "btts_no": float(1.0 - matriz[1:, 1:].sum()),
    }
    for linea in (1.5, 2.5, 3.5):
        mas = float(matriz[totales > linea].sum())
        clave = str(linea).replace(".", "")
        mercados[f"o{clave}"] = mas
        mercados[f"u{clave}"] = 1.0 - mas
    orden = np.argsort(matriz, axis=None)[::-1][:3]
    mercados["marcadores"] = [
        (int(i), int(j), float(matriz[i, j])) for i, j in zip(*np.unravel_index(orden, matriz.shape))
    ]
    return mercados
