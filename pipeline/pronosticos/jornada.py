"""Jornada: semana natural de lunes a domingo."""

import pandas as pd


def lunes_de(fecha: pd.Timestamp) -> pd.Timestamp:
    dia = pd.Timestamp(fecha).normalize()
    return dia - pd.Timedelta(days=dia.weekday())


def clave_jornada(fecha: pd.Timestamp) -> str:
    anio, semana, _ = pd.Timestamp(fecha).isocalendar()
    return f"{anio}-W{semana:02d}"
