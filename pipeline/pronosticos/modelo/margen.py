"""Quitar el margen de la casa a un grupo de cuotas del mismo mercado."""

import numpy as np


def quitar_margen(cuotas) -> np.ndarray:
    """Probabilidades sin margen, repartiéndolo en proporción a cada cuota."""
    valores = np.asarray(cuotas, dtype=float)
    if valores.size < 2 or not np.all(np.isfinite(valores)) or np.any(valores <= 1.0):
        raise ValueError("Hacen falta al menos dos cuotas válidas mayores que 1")
    implicitas = 1.0 / valores
    return implicitas / implicitas.sum()


def margen(cuotas) -> float:
    return float((1.0 / np.asarray(cuotas, dtype=float)).sum() - 1.0)
