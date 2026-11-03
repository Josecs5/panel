"""Qué mercados se pueden apostar y con qué peso entra el modelo.

Decisión del 3/11/2026, tras el backtest: 1X2 y más/menos 2,5 empiezan con peso 0 del
modelo porque este no ganó al mercado. El resto de mercados no se pudo comparar con
cuotas, así que no se apuestan hasta demostrar en vivo que no son peores.
"""

from dataclasses import dataclass

COMPROBADOS_EN_BACKTEST = frozenset({"1x2", "ou25"})
SIN_CUOTAS = frozenset(
    {"tiros_puerta", "tiros_puerta_equipo", "faltas", "faltas_equipo", "jugador_recibe_falta"}
)
PESOS_INICIALES = {"1x2": 0.0, "ou25": 0.0}
PESO_POR_DEFECTO = 0.4

CASOS_PARA_DESBLOQUEAR = 50
CASOS_PARA_PAUSAR = 100
TOLERANCIA_PEOR = 0.0
MARGEN_CLARAMENTE_PEOR = 0.01


@dataclass(frozen=True)
class EstadoMercado:
    apostable: bool
    motivo: str


def peso_inicial(grupo: str) -> float:
    if grupo in SIN_CUOTAS:
        return 1.0  # no hay mercado con el que mezclar
    return PESOS_INICIALES.get(grupo, PESO_POR_DEFECTO)


def estado_mercado(grupo: str, metricas: dict | None) -> EstadoMercado:
    """`metricas` lleva n, log_loss, log_loss_mercado y, si existen, los de los últimos 100."""
    if grupo in SIN_CUOTAS:
        return EstadoMercado(False, "sin_cuotas")

    datos = metricas or {}
    n_reciente = datos.get("n_ultimos_100", 0)
    if (
        n_reciente >= CASOS_PARA_PAUSAR
        and datos.get("log_loss_ultimos_100") is not None
        and datos.get("log_loss_mercado_ultimos_100") is not None
        and datos["log_loss_ultimos_100"] - datos["log_loss_mercado_ultimos_100"] > MARGEN_CLARAMENTE_PEOR
    ):
        return EstadoMercado(False, "en_pausa")

    if grupo in COMPROBADOS_EN_BACKTEST:
        return EstadoMercado(True, "comprobado")

    n = datos.get("n", 0)
    if n < CASOS_PARA_DESBLOQUEAR:
        return EstadoMercado(False, "bloqueado_pocos_casos")
    if datos.get("log_loss_mercado") is None:
        return EstadoMercado(False, "bloqueado_sin_mercado")
    if datos["log_loss"] - datos["log_loss_mercado"] > TOLERANCIA_PEOR:
        return EstadoMercado(False, "bloqueado_peor_que_mercado")
    return EstadoMercado(True, "desbloqueado")
