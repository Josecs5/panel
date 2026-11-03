"""Métricas de auditoría: Brier, log loss, calibración y rentabilidad."""

import numpy as np

MUESTRA_PEQUENA = 30
_EPS = 1e-12


def log_loss_binario(p, y) -> float:
    p = np.clip(np.asarray(p, float), _EPS, 1 - _EPS)
    y = np.asarray(y, float)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def brier_binario(p, y) -> float:
    return float(np.mean((np.asarray(p, float) - np.asarray(y, float)) ** 2))


def log_loss_multiclase(p, indice) -> float:
    p = np.clip(np.asarray(p, float), _EPS, 1.0)
    return float(-np.mean(np.log(p[np.arange(len(p)), np.asarray(indice, int)])))


def brier_multiclase(p, indice) -> float:
    p = np.asarray(p, float)
    y = np.zeros_like(p)
    y[np.arange(len(p)), np.asarray(indice, int)] = 1.0
    return float(np.mean(np.sum((p - y) ** 2, axis=1)))


def calibracion(p, y, tramos: int = 10) -> list[dict]:
    """Acierto real frente a esperado por tramos de probabilidad."""
    p, y = np.asarray(p, float), np.asarray(y, float)
    bordes = np.linspace(0.0, 1.0, tramos + 1)
    filas = []
    for i in range(tramos):
        marca = (p >= bordes[i]) & (p < bordes[i + 1] if i < tramos - 1 else p <= bordes[i + 1])
        n = int(marca.sum())
        if n:
            filas.append(
                {
                    "tramo": f"{bordes[i]:.1f}-{bordes[i + 1]:.1f}",
                    "n": n,
                    "esperado": float(p[marca].mean()),
                    "real": float(y[marca].mean()),
                    "muestra_pequena": n < MUESTRA_PEQUENA,
                }
            )
    return filas


def error_calibracion(p, y, tramos: int = 10) -> float:
    """Error medio entre esperado y real, ponderado por casos."""
    filas = calibracion(p, y, tramos)
    total = sum(f["n"] for f in filas)
    return float(sum(f["n"] * abs(f["esperado"] - f["real"]) for f in filas) / total) if total else 0.0


def intervalo_bootstrap(
    beneficios_por_jornada, stakes_por_jornada, repeticiones: int = 2000, semilla: int = 7
) -> tuple[float, float]:
    """Intervalo del 95 % del ROI, remuestreando jornadas enteras."""
    b, s = np.asarray(beneficios_por_jornada, float), np.asarray(stakes_por_jornada, float)
    if len(b) == 0 or s.sum() == 0:
        return (0.0, 0.0)
    azar = np.random.default_rng(semilla)
    indices = azar.integers(0, len(b), size=(repeticiones, len(b)))
    sumas_s = s[indices].sum(axis=1)
    validas = sumas_s > 0
    rois = b[indices].sum(axis=1)[validas] / sumas_s[validas]
    return float(np.quantile(rois, 0.025)), float(np.quantile(rois, 0.975))
