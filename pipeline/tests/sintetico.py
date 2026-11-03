"""Generador de ligas inventadas para las pruebas. Nunca se usan datos reales."""

from pathlib import Path

import numpy as np
import pandas as pd

from pronosticos.modelo.dixon_coles import matriz_marcadores, mercados_de_matriz


def liga_sintetica(
    equipos: int = 20,
    temporadas: int = 3,
    semilla: int = 1,
    base: float = 0.1,
    local: float = 0.3,
    rho: float = -0.1,
    inicio: str = "2020-08-15",
):
    azar = np.random.default_rng(semilla)
    nombres = [f"Equipo {i:02d}" for i in range(equipos)]
    ataque = azar.normal(0, 0.3, equipos)
    defensa = azar.normal(0, 0.25, equipos)
    ataque -= ataque.mean()
    defensa -= defensa.mean()
    filas = []
    fecha = pd.Timestamp(inicio)
    goles = np.arange(11)
    for temporada in range(temporadas):
        for vuelta in range(2):
            for jornada in range(equipos - 1):
                orden = np.r_[0, np.roll(np.arange(1, equipos), jornada)]
                for k in range(equipos // 2):
                    i, j = int(orden[k]), int(orden[equipos - 1 - k])
                    if (vuelta + jornada) % 2:
                        i, j = j, i
                    lam = float(np.exp(base + local + ataque[i] - defensa[j]))
                    mu = float(np.exp(base + ataque[j] - defensa[i]))
                    matriz = matriz_marcadores(lam, mu, rho)
                    celda = azar.choice(matriz.size, p=matriz.ravel())
                    gl, gv = (int(v) for v in np.unravel_index(celda, matriz.shape))
                    filas.append(
                        {
                            "fecha": fecha + pd.Timedelta(days=k % 3),
                            "local": nombres[i],
                            "visitante": nombres[j],
                            "gl": gl,
                            "gv": gv,
                            "lam_real": lam,
                            "mu_real": mu,
                            "temporada": temporada,
                        }
                    )
                fecha += pd.Timedelta(days=7)
        fecha += pd.Timedelta(days=60)
    datos = pd.DataFrame(filas)
    verdad = {
        "ataque": dict(zip(nombres, ataque)),
        "defensa": dict(zip(nombres, defensa)),
        "local": local,
        "rho": rho,
    }
    return datos, verdad


def escribir_csv_sinteticos(carpeta: Path, temporadas=(2223, 2324, 2425, 2526), semilla: int = 3) -> None:
    """CSV con el mismo formato que football-data.co.uk, con árbitro solo en E0."""
    carpeta.mkdir(parents=True, exist_ok=True)
    azar = np.random.default_rng(semilla)
    for n, codigo in enumerate(("SP1", "E0", "D1", "I1")):
        datos, _ = liga_sintetica(equipos=10, temporadas=len(temporadas), semilla=semilla + n)
        for indice, temporada in enumerate(temporadas):
            parte = datos[datos["temporada"] == indice]
            filas = []
            for fila in parte.itertuples(index=False):
                mercados = mercados_de_matriz(matriz_marcadores(fila.lam_real, fila.mu_real, -0.1))
                ruido = azar.normal(1, 0.015, 8)
                def cuota(p, r, m=1.05):
                    return max(round(float(1 / (p * m) * r), 2), 1.01)  # como en los CSV reales
                registro = {
                    "Div": codigo,
                    "Date": fila.fecha.strftime("%d/%m/%Y"),
                    "HomeTeam": fila.local,
                    "AwayTeam": fila.visitante,
                    "FTHG": fila.gl,
                    "FTAG": fila.gv,
                    "HST": int(azar.poisson(4.5)),
                    "AST": int(azar.poisson(3.8)),
                    "HF": int(azar.poisson(11)),
                    "AF": int(azar.poisson(11.5)),
                    "HC": int(azar.negative_binomial(8, 8 / (8 + 5.5))),
                    "AC": int(azar.negative_binomial(8, 8 / (8 + 4.5))),
                    "HY": int(azar.poisson(1.7)),
                    "AY": int(azar.poisson(2.0)),
                    "HR": int(azar.random() < 0.05),
                    "AR": int(azar.random() < 0.06),
                    "B365H": cuota(mercados["1"], ruido[0], 1.07),
                    "B365D": cuota(mercados["X"], ruido[1], 1.07),
                    "B365A": cuota(mercados["2"], ruido[2], 1.07),
                    "AvgH": cuota(mercados["1"], ruido[3]),
                    "AvgD": cuota(mercados["X"], ruido[4]),
                    "AvgA": cuota(mercados["2"], ruido[5]),
                    "B365>2.5": cuota(mercados["o25"], ruido[6]),
                    "B365<2.5": cuota(mercados["u25"], ruido[7]),
                    "Avg>2.5": cuota(mercados["o25"], ruido[6], 1.06),
                    "Avg<2.5": cuota(mercados["u25"], ruido[7], 1.06),
                    "AvgCH": cuota(mercados["1"], 1.0),
                    "AvgCD": cuota(mercados["X"], 1.0),
                    "AvgCA": cuota(mercados["2"], 1.0),
                    "AvgC>2.5": cuota(mercados["o25"], 1.0),
                    "AvgC<2.5": cuota(mercados["u25"], 1.0),
                }
                if codigo == "E0":
                    registro["Referee"] = f"Arbitro {int(azar.integers(0, 8))}"
                filas.append(registro)
            pd.DataFrame(filas).to_csv(carpeta / f"{temporada}_{codigo}.csv", index=False)
