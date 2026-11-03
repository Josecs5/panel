"""Stakes: 1/4 de Kelly, en céntimos enteros para evitar errores de redondeo."""

from ..config import (
    BANKROLL_TEORICO_EUR,
    FRACCION_KELLY,
    PASO_STAKE_CENTIMOS,
    STAKE_MINIMO_CENTIMOS,
    TOPE_JORNADA_CENTIMOS,
)


def stake_kelly(probabilidad: float, cuota: float) -> int:
    """Stake en céntimos; 0 si no hay ventaja."""
    if cuota <= 1.0:
        return 0
    b = cuota - 1.0
    fraccion = (probabilidad * b - (1.0 - probabilidad)) / b
    if fraccion <= 0.0:
        return 0
    centimos = FRACCION_KELLY * fraccion * BANKROLL_TEORICO_EUR * 100.0
    redondeado = int(round(centimos / PASO_STAKE_CENTIMOS)) * PASO_STAKE_CENTIMOS
    return max(redondeado, STAKE_MINIMO_CENTIMOS)


def aplicar_tope(stakes: list[int]) -> list[int]:
    """Escala los stakes para no pasar de 5 € y deja a 0 los que ya no quepan.

    Al escalar, un stake no baja del mínimo, así que el total aún podría pasarse:
    en ese caso se quitan primero las apuestas más pequeñas.
    """
    total = sum(stakes)
    if total <= TOPE_JORNADA_CENTIMOS:
        return list(stakes)

    factor = TOPE_JORNADA_CENTIMOS / total
    escalados = [
        0 if s == 0 else max(int(s * factor) // PASO_STAKE_CENTIMOS * PASO_STAKE_CENTIMOS, STAKE_MINIMO_CENTIMOS)
        for s in stakes
    ]
    while sum(escalados) > TOPE_JORNADA_CENTIMOS:
        menor = min((s, i) for i, s in enumerate(escalados) if s > 0)[1]
        escalados[menor] = 0
    return escalados
