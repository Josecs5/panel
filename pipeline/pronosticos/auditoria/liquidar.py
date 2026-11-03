"""Liquidación de selecciones y apuestas con el resultado del partido."""

import re

GANADA = "ganada"
PERDIDA = "perdida"
SIN_LIQUIDAR = "sin_liquidar"


def liquidar_seleccion(mercado: str, gl: int | None, gv: int | None) -> str:
    """Mercados de goles: 1, X, 2, 1X, 12, X2, btts_si, btts_no, o25, u25..."""
    if gl is None or gv is None:
        return SIN_LIQUIDAR
    total = gl + gv
    if mercado in ("1", "X", "2", "1X", "12", "X2"):
        signo = "1" if gl > gv else "2" if gl < gv else "X"
        return GANADA if signo in mercado else PERDIDA
    if mercado == "btts_si":
        return GANADA if gl > 0 and gv > 0 else PERDIDA
    if mercado == "btts_no":
        return PERDIDA if gl > 0 and gv > 0 else GANADA
    if mercado[0] in ("o", "u") and mercado[1:].isdigit():
        linea = int(mercado[1:]) / 10.0
        supera = total > linea
        return GANADA if supera == (mercado[0] == "o") else PERDIDA
    raise ValueError(f"Mercado desconocido: {mercado}")


def liquidar_estadistica(clave: str, estadisticas: dict | None) -> str:
    """Claves como corners_o95 o tarjetas_l_u25; `estadisticas` trae los conteos del partido.

    `estadisticas` usa los campos corners_l, corners_v, tarjetas_l, tarjetas_v...
    """
    coincidencia = re.fullmatch(r"(corners|tarjetas|faltas|tiros_puerta)_(l_|v_)?([ou])(\d+)", clave)
    if not coincidencia:
        raise ValueError(f"Mercado de estadísticas desconocido: {clave}")
    nombre, equipo, lado, digitos = coincidencia.groups()
    if not estadisticas:
        return SIN_LIQUIDAR
    local, visitante = estadisticas.get(f"{nombre}_l"), estadisticas.get(f"{nombre}_v")
    if equipo == "l_":
        valor = local
    elif equipo == "v_":
        valor = visitante
    else:
        valor = None if local is None or visitante is None else local + visitante
    if valor is None or valor != valor:
        return SIN_LIQUIDAR
    supera = valor > int(digitos) / 10.0
    return GANADA if supera == (lado == "o") else PERDIDA


def liquidar_apuesta(resultados: list[str]) -> str:
    """Una combinada se pierde con un fallo y se gana solo si aciertan todas."""
    if PERDIDA in resultados:
        return PERDIDA
    if SIN_LIQUIDAR in resultados:
        return SIN_LIQUIDAR
    return GANADA


def beneficio_centimos(estado: str, stake: int, cuota: float) -> int:
    if estado == GANADA:
        return int(round(stake * (cuota - 1.0)))
    if estado == PERDIDA:
        return -stake
    return 0
