"""Resumen del backtest. Solo cifras agregadas: el registro de Actions es público."""

from .config import ORDEN_LIGAS

NOMBRES_ESTADISTICA = {
    "tiros_puerta": "Tiros a puerta",
    "corners": "Córners",
    "faltas": "Faltas",
    "tarjetas": "Tarjetas",
}


def _num(valor, decimales: int = 4) -> str:
    return "-" if valor is None else f"{valor:.{decimales}f}"


def _tabla(cabecera: list[str], filas: list[list[str]]) -> list[str]:
    return [
        "| " + " | ".join(cabecera) + " |",
        "|" + "---|" * len(cabecera),
        *("| " + " | ".join(str(c) for c in fila) + " |" for fila in filas),
        "",
    ]


def _bloque_temporada(nombre: str, bloque: dict) -> list[str]:
    lineas = [f"## {nombre}", ""]
    filas = []
    for clave in ("todas", *ORDEN_LIGAS):
        g = bloque["goles"].get(clave)
        if not g:
            continue
        x = g["1x2"]
        o = g["o25"]
        filas.append(
            [
                clave,
                x["n"],
                x["n_con_mercado"],
                _num(x.get("modelo_mismos_partidos", {}).get("log_loss")),
                _num(x.get("mercado", {}).get("log_loss")),
                _num(x["mezcla"].get("0.4") if "mezcla" in x else None),
                _num(o.get("modelo_mismos_partidos_log_loss")),
                _num(o.get("mercado_log_loss")),
                _num(o["mezcla"].get("0.4") if "mezcla" in o else None),
            ]
        )
    lineas += ["### Goles: log loss frente al mercado (más bajo es mejor)", ""]
    lineas += _tabla(
        ["Liga", "n", "Con mercado", "1X2 modelo", "1X2 mercado", "1X2 mezcla 0,4", "+2,5 modelo", "+2,5 mercado", "+2,5 mezcla 0,4"],
        filas,
    )

    t = bloque["goles"]["todas"]
    lineas += ["### Goles: mercados sin cuotas en los CSV (solo calibración)", ""]
    lineas += _tabla(
        ["Mercado", "n", "Log loss", "Brier", "Error de calibración"],
        [
            [etiqueta, t[c]["n"], _num(t[c]["log_loss"]), _num(t[c]["brier"]), _num(t[c]["error_calibracion"])]
            for etiqueta, c in (("Más de 1,5", "o15"), ("Más de 3,5", "o35"), ("Ambos marcan", "btts"))
        ],
    )
    lineas += [
        f"Error medio en goles esperados: {_num(t['error_goles_esperados'], 3)}. "
        f"Acierto del marcador más probable: {t['acierto_marcador_mas_probable']:.1%}.",
        "",
    ]

    lineas += ["### Calibración del 1X2", ""]
    filas = [
        [signo, f["tramo"], f["n"], f"{f['esperado']:.1%}", f"{f['real']:.1%}", "sí" if f["muestra_pequena"] else ""]
        for signo, tramos in t["calibracion_1x2"].items()
        for f in tramos
    ]
    lineas += _tabla(["Signo", "Tramo", "n", "Esperado", "Real", "Muestra pequeña"], filas)

    lineas += ["### Estadísticas por equipo y partido", ""]
    filas = []
    for liga, stats in bloque["estadisticas"].items():
        for clave, r in stats.items():
            if not r.get("n"):
                filas.append([liga, NOMBRES_ESTADISTICA[clave], 0, "-", "-", "-", "-", "-", "-"])
                continue
            filas.append(
                [
                    liga,
                    NOMBRES_ESTADISTICA[clave],
                    r["n"],
                    _num(r["log_loss"]),
                    _num(r["log_loss_frecuencia"]),
                    _num(r["error_calibracion"]),
                    f"{r['cobertura_25_75']:.1%}",
                    _num(r["alfa"], 3),
                    r["distribucion"],
                ]
            )
    lineas += _tabla(
        ["Liga", "Estadística", "n", "Log loss", "Frecuencia histórica", "Error calibración", "Dentro de 25-75", "Alfa", "Distribución"],
        filas,
    )

    lineas += ["### Apuestas simuladas (destacados, 1X2 y +/-2,5, cuotas de Bet365)", ""]
    filas = []
    for etiqueta, a in bloque["apuestas"].items():
        filas.append(
            [
                etiqueta,
                a["jornadas"],
                a["jornadas_sin_apuesta"],
                a["simples"],
                a["combinadas"],
                a["ganadas"],
                f"{a['apostado_eur']:.2f} €",
                f"{a['beneficio_eur']:.2f} €",
                f"{a['roi']:.1%}",
                f"{a['roi_ic95'][0]:.1%} a {a['roi_ic95'][1]:.1%}",
                "-" if a["clv_medio"] is None else f"{a['clv_medio']:.1%}",
                f"{a['tope_maximo_eur']:.2f} €",
            ]
        )
    lineas += _tabla(
        ["Peso", "Jornadas", "A 0 €", "Simples", "Combinadas", "Ganadas", "Apostado", "Beneficio", "ROI", "ROI IC 95 %", "CLV", "Máx. jornada"],
        filas,
    )
    margenes = ", ".join(f"{k} {v:.1%}" for k, v in bloque["margen_bet365_1x2"].items())
    lineas += [f"Margen mediano de Bet365 en 1X2: {margenes}.", ""]
    return lineas


def a_markdown(resultado: dict, recuento: dict[str, int]) -> str:
    parametros = resultado["ligas"]["parametros"]
    lineas = ["# Backtest de Pronósticos", "", "## Datos", ""]
    lineas += _tabla(["Temporada", "Partidos"], [[k, v] for k, v in recuento.items()])
    lineas += [
        "## Parámetros elegidos con la temporada de ajuste",
        "",
        f"- Decaimiento temporal en goles: {parametros['xi_goles']}",
        f"- Decaimiento temporal en estadísticas: {parametros['xi_estadisticas']}",
        f"- Peso del modelo en 1X2: {parametros['peso_modelo_1x2']}",
        f"- Peso del modelo en +/-2,5: {parametros['peso_modelo_ou25']}",
        "",
    ]
    temporadas = resultado["ligas"]["temporadas"]
    etiquetas = {
        resultado["temporada_validacion"]: "Validación (no intervino en elegir parámetros)",
        resultado["temporada_ajuste"]: "Ajuste (los parámetros se eligieron aquí)",
    }
    for temporada, etiqueta in etiquetas.items():
        if str(temporada) in temporadas:
            lineas += _bloque_temporada(f"{temporada}: {etiqueta}", temporadas[str(temporada)])

    cl = resultado.get("champions") or {}
    lineas += ["## Champions (solo goles, sin mercado)", ""]
    if cl.get("error"):
        lineas += [f"No evaluada: {cl['error']}", ""]
    elif cl.get("todas", {}).get("n"):
        filas = []
        grupos = {
            "Todas": cl["todas"],
            **{f"Temporada {k}": v for k, v in cl["por_temporada"].items()},
            "Clubes con liga cubierta": cl["clubes_con_liga_cubierta"],
            "Algún club sin liga cubierta": cl["clubes_sin_liga_cubierta"],
        }
        for etiqueta, r in grupos.items():
            if not r.get("n"):
                continue
            filas.append(
                [
                    etiqueta,
                    r["n"],
                    _num(r["log_loss_1x2"]),
                    _num(r["log_loss_1x2_frecuencia_fija"]),
                    _num(r["brier_1x2"]),
                    _num(r["log_loss_o25"]),
                    _num(r["log_loss_btts"]),
                ]
            )
        lineas += _tabla(["Grupo", "n", "1X2 modelo", "1X2 frecuencia fija", "Brier 1X2", "+2,5", "Ambos marcan"], filas)
        u = cl["ultimo_ajuste"]
        lineas += [f"Último ajuste: ventaja local {u['local']:.3f}, beta {u['beta']:.3f}, rho {u['rho']:.3f}.", ""]
    return "\n".join(lineas)
