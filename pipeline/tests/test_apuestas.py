import pytest

from pronosticos.apuestas.boleto import construir_boleto, simples_validas
from pronosticos.apuestas.combinadas import Apuesta, Seleccion, combinadas_validas
from pronosticos.apuestas.kelly import aplicar_tope, stake_kelly
from pronosticos.apuestas.valor import cuota_minima_aceptable, valor_esperado
from pronosticos.auditoria.liquidar import (
    GANADA,
    PERDIDA,
    SIN_LIQUIDAR,
    beneficio_centimos,
    liquidar_apuesta,
    liquidar_seleccion,
)
from pronosticos.config import TOPE_JORNADA_CENTIMOS


def s(partido, prob, cuota, mercado="1"):
    return Seleccion(partido, mercado, prob, cuota)


def test_valor_esperado_y_cuota_minima():
    assert valor_esperado(0.5, 2.2) == pytest.approx(0.10)
    minima = cuota_minima_aceptable(0.5, 0.04)
    assert minima == pytest.approx(2.08)
    assert valor_esperado(0.5, minima) == pytest.approx(0.04)


def test_kelly_a_un_cuarto_sobre_50_euros_redondeado():
    # f = (0.5*1.2 - 0.5)/1.2 = 0.08333; 1/4 * f * 50 € = 1,04 € -> 1,00 €
    assert stake_kelly(0.5, 2.2) == 100


def test_kelly_sin_ventaja_no_apuesta():
    assert stake_kelly(0.4, 2.0) == 0
    assert stake_kelly(0.9, 1.0) == 0


def test_kelly_aplica_el_minimo_de_50_centimos():
    assert stake_kelly(0.51, 2.0) == 50


def test_tope_no_cambia_lo_que_ya_cabe():
    assert aplicar_tope([200, 300]) == [200, 300]


def test_tope_escala_para_quedar_en_5_euros_o_menos():
    escalados = aplicar_tope([600, 300, 300])
    assert sum(escalados) <= TOPE_JORNADA_CENTIMOS
    assert escalados == [250, 120, 120]


def test_tope_quita_apuestas_si_el_minimo_no_deja_escalar():
    escalados = aplicar_tope([60] * 12)
    assert sum(escalados) <= TOPE_JORNADA_CENTIMOS
    assert all(v in (0, 50) for v in escalados)
    assert sum(1 for v in escalados if v) == 10


def test_el_tope_es_una_constante_de_5_euros():
    assert TOPE_JORNADA_CENTIMOS == 500


def test_filtros_de_la_apuesta_simple():
    buena = s("a", 0.5, 2.2)
    assert simples_validas([buena]) == [Apuesta((buena,))]
    assert simples_validas([s("a", 0.5, 2.05)]) == []  # VE 2,5 %
    assert simples_validas([s("a", 0.2, 5.5)]) == []  # probabilidad y cuota fuera
    assert simples_validas([s("a", 0.8, 1.35)]) == []  # cuota baja


def test_combinadas_nunca_del_mismo_partido():
    grupo = [s("a", 0.6, 1.9), s("a", 0.6, 1.9, "o25"), s("b", 0.6, 1.9)]
    combinadas = combinadas_validas(grupo)
    assert combinadas
    assert all(len(c.partidos) == len(c.selecciones) for c in combinadas)


def test_combinadas_exigen_ve_positivo_en_cada_seleccion():
    grupo = [s("a", 0.7, 1.7), s("b", 0.5, 1.9)]  # la segunda tiene VE negativo
    assert combinadas_validas(grupo) == []


def test_combinadas_exigen_probabilidad_minima_y_como_mucho_tres():
    baja = [s("a", 0.35, 3.1), s("b", 0.35, 3.1)]  # 12,25 %
    assert combinadas_validas(baja) == []
    grupo = [s(p, 0.8, 1.35) for p in "abcd"]
    assert all(len(c.selecciones) <= 3 for c in combinadas_validas(grupo))


def test_probabilidad_de_la_combinada_es_el_producto():
    a = Apuesta((s("a", 0.6, 1.9), s("b", 0.5, 2.2)))
    assert a.prob == pytest.approx(0.3)
    assert a.cuota == pytest.approx(4.18)
    assert a.ve == pytest.approx(0.254)


def test_boleto_vacio_si_nada_cumple():
    assert construir_boleto([s("a", 0.4, 2.0)]) == []


def test_boleto_no_pasa_nunca_de_5_euros_y_usa_cada_partido_una_vez():
    grupo = [s(f"p{i}", 0.55, 2.4) for i in range(12)] + [s("p0", 0.55, 2.4, "o25")]
    boleto = construir_boleto(grupo)
    assert 0 < sum(b.stake_centimos for b in boleto) <= TOPE_JORNADA_CENTIMOS
    usados = [p for b in boleto for p in b.apuesta.partidos]
    assert len(usados) == len(set(usados))


@pytest.mark.parametrize(
    ("mercado", "gl", "gv", "esperado"),
    [
        ("1", 2, 1, GANADA),
        ("X", 2, 1, PERDIDA),
        ("2", 0, 1, GANADA),
        ("1X", 1, 1, GANADA),
        ("12", 1, 1, PERDIDA),
        ("X2", 2, 0, PERDIDA),
        ("o25", 2, 1, GANADA),
        ("u25", 2, 1, PERDIDA),
        ("o15", 1, 0, PERDIDA),
        ("u35", 2, 1, GANADA),
        ("btts_si", 1, 1, GANADA),
        ("btts_no", 1, 0, GANADA),
        ("btts_si", 1, 0, PERDIDA),
    ],
)
def test_liquidacion_de_selecciones(mercado, gl, gv, esperado):
    assert liquidar_seleccion(mercado, gl, gv) == esperado


def test_liquidacion_sin_resultado_y_mercado_desconocido():
    assert liquidar_seleccion("1", None, None) == SIN_LIQUIDAR
    with pytest.raises(ValueError):
        liquidar_seleccion("raro", 1, 0)


def test_liquidacion_de_combinadas():
    assert liquidar_apuesta([GANADA, GANADA]) == GANADA
    assert liquidar_apuesta([GANADA, PERDIDA]) == PERDIDA
    assert liquidar_apuesta([SIN_LIQUIDAR, PERDIDA]) == PERDIDA
    assert liquidar_apuesta([GANADA, SIN_LIQUIDAR]) == SIN_LIQUIDAR


def test_beneficio():
    assert beneficio_centimos(GANADA, 100, 2.5) == 150
    assert beneficio_centimos(PERDIDA, 100, 2.5) == -100
    assert beneficio_centimos(SIN_LIQUIDAR, 100, 2.5) == 0
