"""Elo propio: se usa para destacar partidos, medir igualdad y comparar ligas."""

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


def multiplicador_goles(diferencia: int) -> float:
    """Pondera más las victorias amplias, como el World Football Elo."""
    d = abs(int(diferencia))
    if d <= 1:
        return 1.0
    if d == 2:
        return 1.5
    return (11.0 + d) / 8.0


@dataclass
class Elo:
    k: float = 20.0
    ventaja_local: float = 65.0
    inicial: float = 1500.0
    valores: dict = field(default_factory=dict)

    def de(self, equipo) -> float:
        return self.valores.get(equipo, self.inicial)

    def esperado_local(self, local, visitante, neutral: bool = False) -> float:
        ventaja = 0.0 if neutral else self.ventaja_local
        return 1.0 / (1.0 + 10.0 ** ((self.de(visitante) - self.de(local) - ventaja) / 400.0))

    def actualizar(self, local, visitante, gl: int, gv: int, neutral: bool = False) -> None:
        esperado = self.esperado_local(local, visitante, neutral)
        real = 1.0 if gl > gv else 0.0 if gl < gv else 0.5
        cambio = self.k * multiplicador_goles(gl - gv) * (real - esperado)
        self.valores[local] = self.de(local) + cambio
        self.valores[visitante] = self.de(visitante) - cambio


def igualdad(elo_local: float, elo_visitante: float) -> float:
    """1 si los dos equipos son iguales; 0 si se llevan 400 puntos o más."""
    return float(max(1.0 - abs(elo_local - elo_visitante) / 400.0, 0.0))


def elo_previo(partidos: pd.DataFrame, local="local", visitante="visitante", elo: Elo | None = None) -> pd.DataFrame:
    """Añade el Elo anterior a cada partido: nunca usa datos del propio partido."""
    motor = elo or Elo()
    ordenados = partidos.sort_values("fecha", kind="stable")
    elo_l, elo_v = [], []
    tiene_neutral = "neutral" in ordenados.columns
    for fila in ordenados.itertuples(index=False):
        eq_l, eq_v = getattr(fila, local), getattr(fila, visitante)
        elo_l.append(motor.de(eq_l))
        elo_v.append(motor.de(eq_v))
        motor.actualizar(
            eq_l, eq_v, int(fila.gl), int(fila.gv), bool(fila.neutral) if tiene_neutral else False
        )
    salida = ordenados.copy()
    salida["elo_l"] = np.array(elo_l, dtype=float)
    salida["elo_v"] = np.array(elo_v, dtype=float)
    salida["igualdad"] = [igualdad(a, b) for a, b in zip(elo_l, elo_v)]
    return salida
