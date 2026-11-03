"""Probabilidad final: mezcla del modelo y del mercado sin margen."""

import numpy as np


def mezclar(modelo, mercado, peso_modelo: float) -> np.ndarray:
    if not 0.0 <= peso_modelo <= 1.0:
        raise ValueError("El peso del modelo debe estar entre 0 y 1")
    final = peso_modelo * np.asarray(modelo, dtype=float) + (1.0 - peso_modelo) * np.asarray(mercado, dtype=float)
    return final / final.sum()
