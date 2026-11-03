"""Valor esperado y cuota mínima aceptable."""


def valor_esperado(probabilidad: float, cuota: float) -> float:
    return probabilidad * cuota - 1.0


def cuota_minima_aceptable(probabilidad: float, ve_minimo: float) -> float:
    """La cuota más baja que mantiene el valor esperado exigido."""
    if probabilidad <= 0.0:
        raise ValueError("La probabilidad debe ser positiva")
    return (1.0 + ve_minimo) / probabilidad
