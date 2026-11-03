"""Combinadas de partidos distintos, con valor esperado positivo en cada selección."""

from dataclasses import dataclass
from itertools import combinations

from ..config import Umbrales
from .valor import valor_esperado

MAX_CANDIDATAS = 12


@dataclass(frozen=True)
class Seleccion:
    partido: str
    mercado: str
    prob: float
    cuota: float
    casa: str = ""

    @property
    def ve(self) -> float:
        return valor_esperado(self.prob, self.cuota)


@dataclass(frozen=True)
class Apuesta:
    selecciones: tuple[Seleccion, ...]

    @property
    def prob(self) -> float:
        total = 1.0
        for s in self.selecciones:
            total *= s.prob
        return total

    @property
    def cuota(self) -> float:
        total = 1.0
        for s in self.selecciones:
            total *= s.cuota
        return total

    @property
    def ve(self) -> float:
        return valor_esperado(self.prob, self.cuota)

    @property
    def partidos(self) -> set[str]:
        return {s.partido for s in self.selecciones}

    @property
    def es_combinada(self) -> bool:
        return len(self.selecciones) > 1


def combinadas_validas(selecciones: list[Seleccion], umbrales: Umbrales = Umbrales()) -> list[Apuesta]:
    positivas = sorted((s for s in selecciones if s.ve > 0.0), key=lambda s: s.ve, reverse=True)[:MAX_CANDIDATAS]
    validas = []
    for tamano in range(2, umbrales.max_selecciones_combinada + 1):
        for grupo in combinations(positivas, tamano):
            if len({s.partido for s in grupo}) != tamano:
                continue
            apuesta = Apuesta(grupo)
            if apuesta.ve >= umbrales.ve_minimo_combinada and apuesta.prob >= umbrales.prob_minima_combinada:
                validas.append(apuesta)
    return validas
