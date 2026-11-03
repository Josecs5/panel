"""Construye el boleto de la jornada: máximo 5 € y cada partido, una sola vez."""

from dataclasses import dataclass

from ..config import TOPE_JORNADA_CENTIMOS, Umbrales
from .combinadas import Apuesta, Seleccion, combinadas_validas
from .kelly import aplicar_tope, stake_kelly


@dataclass(frozen=True)
class ApuestaConStake:
    apuesta: Apuesta
    stake_centimos: int


def simples_validas(selecciones: list[Seleccion], umbrales: Umbrales = Umbrales()) -> list[Apuesta]:
    return [
        Apuesta((s,))
        for s in selecciones
        if s.ve >= umbrales.ve_minimo
        and s.prob >= umbrales.prob_minima
        and umbrales.cuota_minima <= s.cuota <= umbrales.cuota_maxima
    ]


def construir_boleto(selecciones: list[Seleccion], umbrales: Umbrales = Umbrales()) -> list[ApuestaConStake]:
    """Prioriza por stake de Kelly. Si nada cumple las reglas, el boleto queda vacío."""
    candidatas = simples_validas(selecciones, umbrales) + combinadas_validas(selecciones, umbrales)
    ordenadas = sorted(candidatas, key=lambda a: (stake_kelly(a.prob, a.cuota), a.ve), reverse=True)

    elegidas: list[Apuesta] = []
    usados: set[str] = set()
    for apuesta in ordenadas:
        if apuesta.partidos & usados:
            continue
        if stake_kelly(apuesta.prob, apuesta.cuota) == 0:
            continue
        elegidas.append(apuesta)
        usados |= apuesta.partidos

    stakes = aplicar_tope([stake_kelly(a.prob, a.cuota) for a in elegidas])
    boleto = [ApuestaConStake(a, s) for a, s in zip(elegidas, stakes) if s > 0]
    assert sum(b.stake_centimos for b in boleto) <= TOPE_JORNADA_CENTIMOS
    return boleto
