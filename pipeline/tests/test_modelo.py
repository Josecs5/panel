import numpy as np
import pandas as pd
import pytest
from scipy.optimize import check_grad

from pronosticos.modelo import dixon_coles as dc
from pronosticos.modelo import estadisticas as est
from pronosticos.modelo.elo import Elo, elo_previo, igualdad, multiplicador_goles
from pronosticos.modelo.margen import margen, quitar_margen
from pronosticos.modelo.mezcla import mezclar
from sintetico import liga_sintetica


def test_dixon_coles_recupera_los_parametros_con_datos_sinteticos():
    datos, verdad = liga_sintetica(equipos=20, temporadas=12)
    referencia = datos["fecha"].max() + pd.Timedelta(days=1)
    ajuste = dc.ajustar(datos, referencia, xi=0.0, regularizacion=0.1)

    ataque = [verdad["ataque"][e] for e in ajuste.equipos]
    defensa = [verdad["defensa"][e] for e in ajuste.equipos]
    assert np.corrcoef(ataque, ajuste.ataque)[0, 1] > 0.97
    assert np.corrcoef(defensa, ajuste.defensa)[0, 1] > 0.97
    assert ajuste.local == pytest.approx(verdad["local"], abs=0.05)
    assert ajuste.rho == pytest.approx(verdad["rho"], abs=0.05)


def test_el_gradiente_analitico_coincide_con_el_numerico():
    datos, _ = liga_sintetica(equipos=8, temporadas=1)
    indice = {e: i for i, e in enumerate(sorted(set(datos["local"])))}
    il, iv = datos["local"].map(indice).to_numpy(), datos["visitante"].map(indice).to_numpy()
    x, y = datos["gl"].to_numpy(int), datos["gv"].to_numpy(int)
    w = np.exp(-0.001 * np.arange(len(x)))
    n = len(indice)
    p = np.r_[np.random.default_rng(0).normal(0, 0.2, 2 * n), 0.1, 0.3, -0.08]
    error = check_grad(
        lambda q: dc._objetivo(q, n, il, iv, x, y, w, 1.0)[0],
        lambda q: dc._objetivo(q, n, il, iv, x, y, w, 1.0)[1],
        p,
    )
    assert error < 1e-3


def test_dixon_coles_no_usa_datos_del_futuro():
    datos, _ = liga_sintetica(equipos=10, temporadas=2)
    corte = datos["fecha"].quantile(0.5)
    base = dc.ajustar(datos, corte)
    alterados = datos.copy()
    alterados.loc[alterados["fecha"] >= corte, "gl"] = 9
    otro = dc.ajustar(alterados, corte)
    assert np.allclose(base.params, otro.params)


def test_el_decaimiento_da_mas_peso_a_lo_reciente():
    fechas = pd.Series(pd.to_datetime(["2024-01-01", "2024-06-01"]))
    pesos = dc.pesos_temporales(fechas, pd.Timestamp("2024-06-02"), 0.01)
    assert pesos[1] > pesos[0]
    assert pesos[1] == pytest.approx(np.exp(-0.01), rel=1e-6)


def test_la_matriz_de_marcadores_suma_uno_y_cuadra_con_los_mercados():
    matriz = dc.matriz_marcadores(1.6, 1.1, -0.1)
    assert matriz.sum() == pytest.approx(1.0)
    mercados = dc.mercados_de_matriz(matriz)
    assert mercados["1"] + mercados["X"] + mercados["2"] == pytest.approx(1.0)
    assert mercados["1X"] == pytest.approx(mercados["1"] + mercados["X"])
    assert mercados["o25"] + mercados["u25"] == pytest.approx(1.0)
    assert mercados["o15"] > mercados["o25"] > mercados["o35"]
    assert len(mercados["marcadores"]) == 3
    assert mercados["marcadores"][0][2] >= mercados["marcadores"][1][2]


def test_un_equipo_sin_partidos_queda_por_debajo_de_la_media():
    datos, _ = liga_sintetica(equipos=10, temporadas=1)
    ajuste = dc.ajustar(datos, datos["fecha"].max() + pd.Timedelta(days=1))
    assert ajuste.medias("Recien ascendido", "Equipo 00")[0] > 0
    assert ajuste._fuerza("Recien ascendido")[0] < float(np.max(ajuste.ataque))


def test_quitar_margen_deja_probabilidades_que_suman_uno():
    cuotas = [2.0, 3.4, 3.8]
    p = quitar_margen(cuotas)
    assert p.sum() == pytest.approx(1.0)
    assert margen(cuotas) == pytest.approx(1 / 2 + 1 / 3.4 + 1 / 3.8 - 1)
    assert p[0] == pytest.approx((1 / 2) / (1 + margen(cuotas)))


def test_quitar_margen_con_cuotas_justas_no_cambia_nada():
    assert quitar_margen([2.0, 2.0]) == pytest.approx([0.5, 0.5])


@pytest.mark.parametrize("malas", [[1.0, 2.0], [float("nan"), 2.0], [2.0]])
def test_quitar_margen_rechaza_cuotas_invalidas(malas):
    with pytest.raises(ValueError):
        quitar_margen(malas)


def test_mezcla_respeta_el_peso():
    assert mezclar([0.6, 0.4], [0.5, 0.5], 0.4) == pytest.approx([0.54, 0.46])
    assert mezclar([0.6, 0.4], [0.5, 0.5], 0.0) == pytest.approx([0.5, 0.5])
    with pytest.raises(ValueError):
        mezclar([0.6, 0.4], [0.5, 0.5], 1.5)


def test_elo_es_de_suma_cero_y_premia_la_goleada():
    elo = Elo()
    elo.actualizar("A", "B", 3, 0)
    assert elo.de("A") + elo.de("B") == pytest.approx(3000)
    assert elo.de("A") > 1500
    assert multiplicador_goles(0) == 1.0
    assert multiplicador_goles(2) == 1.5
    assert multiplicador_goles(5) == 2.0


def test_elo_previo_no_usa_el_propio_partido():
    datos = pd.DataFrame(
        {
            "fecha": pd.to_datetime(["2024-01-01", "2024-01-08"]),
            "local": ["A", "A"],
            "visitante": ["B", "B"],
            "gl": [5, 0],
            "gv": [0, 0],
        }
    )
    salida = elo_previo(datos)
    assert salida["elo_l"].iloc[0] == 1500
    assert salida["elo_l"].iloc[1] > 1500
    assert igualdad(1500, 1500) == 1.0
    assert igualdad(1000, 1500) == 0.0


def _datos_estadistica(semilla=5, alfa=0.0):
    azar = np.random.default_rng(semilla)
    datos, _ = liga_sintetica(equipos=12, temporadas=3, semilla=semilla)
    n = len(datos)
    medias = np.full(n, 5.0)
    if alfa:
        r = 1 / alfa
        cl = azar.negative_binomial(r, r / (r + medias))
        cv = azar.negative_binomial(r, r / (r + medias))
    else:
        cl = azar.poisson(medias)
        cv = azar.poisson(medias)
    return datos.assign(cl=cl.astype(float), cv=cv.astype(float), igualdad=0.5, arbitro=None)


def test_la_distribucion_se_elige_con_la_sobredispersion():
    referencia = pd.Timestamp("2030-01-01")
    poisson_ = est.ajustar(_datos_estadistica(alfa=0.0), "corners", referencia, xi=0.0)
    negativa = est.ajustar(_datos_estadistica(alfa=0.15), "corners", referencia, xi=0.0)
    assert poisson_.distribucion == "poisson"
    assert negativa.distribucion == "binomial_negativa"
    assert negativa.alfa == pytest.approx(0.15, abs=0.05)


def test_pmf_total_y_percentiles_son_coherentes():
    pmf_a, pmf_b = est.pmf_conteo(5.0, 0.0), est.pmf_conteo(4.0, 0.1)
    total = est.pmf_total(pmf_a, pmf_b)
    assert total.sum() == pytest.approx(1.0)
    media = float((np.arange(total.size) * total).sum())
    assert media == pytest.approx(9.0, abs=0.01)
    bajo, alto = est.percentiles(total)
    assert bajo < media < alto
    assert 0.0 < est.prob_mas_de(total, 9.5) < 1.0
