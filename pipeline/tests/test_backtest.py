import pandas as pd
import pytest

from pronosticos import backtest
from pronosticos.auditoria import metricas as m
from pronosticos.main import ejecutar_backtest
from sintetico import escribir_csv_sinteticos, liga_sintetica


def test_metricas_de_referencia():
    assert m.brier_binario([0.5, 0.5], [1, 0]) == pytest.approx(0.25)
    assert m.log_loss_binario([0.5], [1]) == pytest.approx(0.6931, abs=1e-3)
    assert m.brier_multiclase([[1 / 3, 1 / 3, 1 / 3]], [0]) == pytest.approx(2 / 3)
    filas = m.calibracion([0.1, 0.15, 0.9], [0, 1, 1], tramos=2)
    assert [f["n"] for f in filas] == [2, 1]
    assert filas[0]["muestra_pequena"]
    assert m.error_calibracion([0.9, 0.9], [1, 1]) == pytest.approx(0.1)


def test_las_predicciones_no_cambian_si_se_altera_el_futuro():
    datos, _ = liga_sintetica(equipos=10, temporadas=3)
    datos = datos.assign(liga="PL")
    primera = backtest.predecir_goles(datos, 1, 0.002).iloc[0]

    alterados = datos.copy()
    corte = primera["fecha"]
    # Todo lo posterior al lunes de su jornada no puede influir en esa predicción
    alterados.loc[alterados["fecha"] > corte + pd.Timedelta(days=7), "gl"] = 9
    otra = backtest.predecir_goles(alterados, 1, 0.002).iloc[0]
    assert primera["p_1"] == pytest.approx(otra["p_1"])


def test_el_backtest_completo_funciona_con_csv_sinteticos(tmp_path):
    escribir_csv_sinteticos(tmp_path / "csv")
    resultado, texto = ejecutar_backtest(tmp_path, token=None)

    parametros = resultado["ligas"]["parametros"]
    assert parametros["xi_goles"] in backtest.XI_GOLES
    assert parametros["peso_modelo_1x2"] in backtest.PESOS_MODELO

    validacion = resultado["ligas"]["temporadas"]["2526"]
    goles = validacion["goles"]["todas"]
    assert goles["1x2"]["n"] > 0
    assert goles["1x2"]["n_con_mercado"] == goles["1x2"]["n"]
    for apuestas in validacion["apuestas"].values():
        assert apuestas["tope_maximo_eur"] <= 5.0
    assert "PL_con_arbitro" in validacion["estadisticas"]
    assert validacion["estadisticas"]["PL"]["corners"]["n"] > 0

    assert resultado["champions"]["error"] == "falta FOOTBALL_DATA_TOKEN"
    assert "# Backtest de Pronósticos" in texto
    assert "Equipo 0" not in texto  # el informe público solo lleva agregados


def test_champions_con_datos_sinteticos():
    datos, _ = liga_sintetica(equipos=8, temporadas=3, inicio="2022-08-15")
    temporadas = datos["temporada"].map({0: 2023, 1: 2024, 2: 2025})
    tablas = datos.assign(
        competicion=["CL" if i % 2 else "PL" for i in range(len(datos))],
        temporada=temporadas,
        id_local=datos["local"],
        id_visitante=datos["visitante"],
        neutral=False,
    )
    resultado = backtest.backtest_champions(tablas, (2024, 2025))
    assert resultado["todas"]["n"] > 0
    assert set(resultado["por_temporada"]) == {"2024", "2025"}
