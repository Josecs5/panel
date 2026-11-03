"""Constantes del módulo. Lo que no se puede editar desde la web vive aquí."""

from dataclasses import dataclass

# Tope por jornada. Es una constante a propósito: la web no puede cambiarlo y las
# pérdidas de una jornada nunca aumentan el presupuesto de la siguiente.
TOPE_JORNADA_CENTIMOS = 500

BANKROLL_TEORICO_EUR = 50.0
FRACCION_KELLY = 0.25
STAKE_MINIMO_CENTIMOS = 50
PASO_STAKE_CENTIMOS = 10

PESO_MODELO_INICIAL = 0.4
TOPE_ODDSPAPI_MES = 200


@dataclass(frozen=True)
class Umbrales:
    """Valores por defecto; los configurables llegarán desde Ajustes."""

    ve_minimo: float = 0.04
    prob_minima: float = 0.25
    cuota_minima: float = 1.40
    cuota_maxima: float = 5.00
    ve_minimo_combinada: float = 0.04
    prob_minima_combinada: float = 0.15
    max_selecciones_combinada: int = 3


LIGAS_CSV = {"SP1": "PD", "E0": "PL", "D1": "BL1", "I1": "SA"}
ORDEN_LIGAS = ("PD", "PL", "BL1", "SA")

# Temporadas de los CSV. Las dos primeras solo sirven para entrenar el backtest.
TEMPORADAS_CSV = (2223, 2324, 2425, 2526, 2627)
TEMPORADA_AJUSTE = 2425
TEMPORADA_VALIDACION = 2526

# Competiciones gratuitas con las que se conecta el Elo entre ligas.
COMPETICIONES_ELO = ("PD", "PL", "BL1", "SA", "FL1", "DED", "PPL", "CL")
TEMPORADAS_CHAMPIONS = (2023, 2024, 2025)

MAX_DESTACADOS_LIGA = 3
MAX_DESTACADOS_CHAMPIONS = 4
