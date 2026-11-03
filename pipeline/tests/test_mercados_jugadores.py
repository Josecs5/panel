import pandas as pd
import pytest

from pronosticos import mercados as mc
from pronosticos.apuestas.politica import estado_mercado, peso_inicial
from pronosticos.auditoria.liquidar import GANADA, PERDIDA, SIN_LIQUIDAR, liquidar_estadistica
from pronosticos.fuentes.emparejar import emparejar_cuotas, mapa_fd_a_csv, normalizar, parecido
from pronosticos.modelo import jugadores as jug


def linea(nombre, seleccion, valor=0.0, jugador=None):
    return {"nombre": nombre, "seleccion": seleccion, "linea": valor, "jugador": jugador}


@pytest.mark.parametrize(
    ("entrada", "clave"),
    [
        (linea("Full Time Result", "X"), "X"),
        (linea("Double Chance Full Time", "2X"), "X2"),
        (linea("Both Teams To Score", "Yes"), "btts_si"),
        (linea("Over Under Full Time", "Over", 2.5), "o25"),
        (linea("Over Under Full Time", "Under", 3.5), "u35"),
        (linea("Over Under Full Time", "Over", 4.5), None),
        (linea("Corners - Over Under Full Time", "Over", 9.5), "corners_o95"),
        (linea("Corners - Over Under Team 1", "Under", 10.5), "corners_l_u105"),
        (linea("Bookings - Over Under Team 2", "Over", 1.5), "tarjetas_v_o15"),
        (linea("Player To Be Carded (incl. overtime)", "Yes", jugador="Ruiz, Ana"), "jug:tarjeta:Ruiz, Ana"),
        (linea("Player Fouls Committed (incl. overtime)", "1+", jugador="Ruiz, Ana"), "jug:faltas:Ruiz, Ana"),
        (linea("Player Fouls Committed (incl. overtime)", "2+", jugador="Ruiz, Ana"), None),
        (linea("Otro mercado", "Over", 2.5), None),
    ],
)
def test_clave_de_linea(entrada, clave):
    assert mc.clave_de_linea(entrada) == clave


@pytest.mark.parametrize(
    ("clave", "grupo"),
    [
        ("1", "1x2"),
        ("X2", "doble_oportunidad"),
        ("btts_no", "ambos_marcan"),
        ("u15", "ou15"),
        ("corners_o95", "corners"),
        ("corners_l_u45", "corners_equipo"),
        ("tiros_puerta_v_o35", "tiros_puerta_equipo"),
        ("jug:faltas:Ruiz, Ana", "jugador_faltas"),
    ],
)
def test_grupo_de(clave, grupo):
    assert mc.grupo_de(clave) == grupo


def test_probabilidades_mercado_quita_el_margen_por_familias():
    p = mc.probabilidades_mercado(
        {"1": 2.0, "X": 3.5, "2": 4.0, "o25": 1.9, "u25": 1.9, "corners_o95": 1.8, "1X": 1.3, "12": 1.3, "X2": 1.8}
    )
    assert p["1"] + p["X"] + p["2"] == pytest.approx(1.0)
    assert p["o25"] == pytest.approx(0.5)
    assert p["1X"] + p["12"] + p["X2"] == pytest.approx(2.0)
    assert "corners_o95" not in p  # sin el otro lado no se puede quitar el margen


def test_el_jugador_usa_un_margen_estimado():
    p = mc.probabilidades_mercado({"jug:tarjeta:Ruiz, Ana": 4.0})
    assert p["jug:tarjeta:Ruiz, Ana"] == pytest.approx(1 / (4.0 * 1.10))


def test_politica_tras_el_backtest():
    assert peso_inicial("1x2") == 0.0
    assert peso_inicial("ou25") == 0.0
    assert peso_inicial("corners") == 0.4
    assert estado_mercado("1x2", None).apostable
    assert estado_mercado("ou25", None).apostable
    assert estado_mercado("corners", None).motivo == "bloqueado_pocos_casos"
    assert estado_mercado("doble_oportunidad", {"n": 49, "log_loss": 0.5, "log_loss_mercado": 0.6}).apostable is False
    assert estado_mercado("faltas", None).motivo == "sin_cuotas"


def test_un_mercado_no_comprobado_se_desbloquea_si_no_es_peor():
    bueno = {"n": 50, "log_loss": 0.60, "log_loss_mercado": 0.60}
    malo = {"n": 50, "log_loss": 0.61, "log_loss_mercado": 0.60}
    assert estado_mercado("corners", bueno).apostable
    assert estado_mercado("corners", malo).motivo == "bloqueado_peor_que_mercado"
    assert estado_mercado("jugador_faltas", {"n": 200}).motivo == "bloqueado_sin_mercado"


def test_un_mercado_rindiendo_claramente_peor_queda_en_pausa():
    metricas = {"n": 200, "n_ultimos_100": 100, "log_loss_ultimos_100": 0.70, "log_loss_mercado_ultimos_100": 0.68}
    assert estado_mercado("1x2", metricas).motivo == "en_pausa"
    metricas["log_loss_ultimos_100"] = 0.685
    assert estado_mercado("1x2", metricas).apostable


def test_liquidar_estadistica():
    datos = {"corners_l": 6, "corners_v": 4, "tarjetas_l": 2, "tarjetas_v": None}
    assert liquidar_estadistica("corners_o95", datos) == GANADA
    assert liquidar_estadistica("corners_u95", datos) == PERDIDA
    assert liquidar_estadistica("corners_l_o55", datos) == GANADA
    assert liquidar_estadistica("corners_v_o45", datos) == PERDIDA
    assert liquidar_estadistica("tarjetas_o35", datos) == SIN_LIQUIDAR
    assert liquidar_estadistica("tarjetas_l_u25", datos) == GANADA
    assert liquidar_estadistica("corners_o95", None) == SIN_LIQUIDAR


def test_normalizar_y_parecido_de_nombres():
    assert normalizar("Club Atlético de Madrid") == "atletico madrid"
    assert parecido("Club Atlético de Madrid", "Atletico Madrid") == 1.0
    assert parecido("Everton FC", "Everton FC") == 1.0
    assert parecido("Real Madrid CF", "Real Sociedad de Fútbol") < 0.6


def test_el_mapa_de_equipos_sale_de_los_partidos_comunes():
    csv = pd.DataFrame(
        {
            "fecha": pd.to_datetime(["2025-01-04", "2025-01-11", "2025-01-18"]),
            "local": ["Ath Madrid", "Betis", "Ath Madrid"],
            "visitante": ["Betis", "Sevilla", "Sevilla"],
            "gl": [2, 0, 1],
            "gv": [1, 0, 3],
        }
    )
    fd = pd.DataFrame(
        {
            "fecha": pd.to_datetime(["2025-01-04 20:00", "2025-01-11 18:00", "2025-01-19 00:30"]),
            "id_local": [78, 90, 78],
            "id_visitante": [90, 559, 559],
            "gl": [2, 0, 1],
            "gv": [1, 0, 3],
        }
    )
    assert mapa_fd_a_csv(fd, csv) == {78: "Ath Madrid", 90: "Betis", 559: "Sevilla"}


def test_emparejar_cuotas_exige_competicion_hora_y_nombres():
    partido = {
        "inicio": "2026-11-06T20:00:00Z",
        "torneo_odds": 17,
        "local": "Everton FC",
        "visitante": "Coventry City FC",
    }
    bueno = {
        "tournamentId": 17,
        "startTime": "2026-11-06T20:00:00.000Z",
        "participant1Name": "Everton FC",
        "participant2Name": "Coventry City",
    }
    otra_hora = {**bueno, "startTime": "2026-11-08T20:00:00.000Z"}
    otro_torneo = {**bueno, "tournamentId": 8}
    otro_partido = {**bueno, "participant1Name": "Arsenal", "participant2Name": "Liverpool"}
    assert emparejar_cuotas(partido, [otra_hora, otro_torneo, otro_partido, bueno]) is bueno
    assert emparejar_cuotas(partido, [otra_hora, otro_torneo, otro_partido]) is None


FILAS = [
    {"jugador": "Ana Ruiz", "equipo": "Equipo A", "minutos": 900, "faltas_cometidas": 30, "faltas_recibidas": 10, "amarillas": 5, "tiros_puerta": 5},
    {"jugador": "Eva Sanz", "equipo": "Equipo A", "minutos": 90, "faltas_cometidas": 6, "faltas_recibidas": 1, "amarillas": 1, "tiros_puerta": 0},
    {"jugador": "Sin minutos", "equipo": "Equipo A", "minutos": 0, "faltas_cometidas": 9},
    {"jugador": "Luz Gil", "equipo": "Equipo B", "minutos": 900, "faltas_cometidas": 5, "faltas_recibidas": 30, "amarillas": 1, "tiros_puerta": 20},
]


def test_las_tasas_se_encogen_hacia_la_media():
    tabla = {t["jugador"]: t for t in jug.tasas(FILAS)}
    assert "Sin minutos" not in tabla
    bruta = 6 / 90 * 90
    media = (30 + 6 + 5) / (900 + 90 + 900) * 90
    assert media < tabla["Eva Sanz"]["faltas"] < bruta
    assert tabla["Ana Ruiz"]["minutos_esperados"] == 90.0
    assert tabla["Eva Sanz"]["minutos_esperados"] == pytest.approx(9.0)


def test_probabilidad_de_al_menos_un_evento():
    assert jug.probabilidad_evento(1.0, 90.0) == pytest.approx(1 - 2.718281828**-1, abs=1e-6)
    assert jug.probabilidad_evento(1.0, 90.0, 2.0) > jug.probabilidad_evento(1.0, 90.0)
    assert jug.probabilidad_evento(0.0, 90.0) == 0.0


def test_top_marca_el_origen_y_prefiere_el_mercado():
    tabla = jug.tasas(FILAS)
    a = jug.del_equipo(tabla, "Equipo A FC")
    b = jug.del_equipo(tabla, "Equipo B")
    mercado = {"tarjeta": {"Ruiz, Ana": 0.31, "Lopez, Mar": 0.28}}
    top = jug.top_por_categoria(a, b, {}, mercado)
    assert all(len(v) <= 3 for v in top.values())
    tarjeta = {j.jugador: j for j in top["tarjeta"]}
    assert tarjeta["Ruiz, Ana"].origen == "mercado"
    assert tarjeta["Ruiz, Ana"].probabilidad == 0.31
    assert tarjeta["Lopez, Mar"].origen == "mercado"
    assert top["recibe_falta"][0].jugador == "Luz Gil"
    assert top["recibe_falta"][0].origen == "modelo"
    assert jug.del_equipo(tabla, "Otro Club Distinto") == []


def test_nombres_oficiales_y_comerciales_del_mismo_club():
    assert parecido("PAE AEK", "AEK Athens") == 1.0
    assert parecido("Real Betis Balompié", "Real Betis Seville") >= 0.5


def _importacion(fecha, *filas):
    return {"fecha": fecha, "fuente": "web", "filas": list(filas)}


def test_las_importaciones_se_combinan_sin_pisar_lo_que_no_traen():
    faltas = _importacion(
        "2026-11-01",
        {"jugador": "Ana Ruiz", "equipo": "Sevilla FC", "minutos": 900, "faltas_cometidas": 20, "faltas_recibidas": 9},
    )
    tiros = _importacion("2026-11-02", {"jugador": "Ana Ruiz", "equipo": "Sevilla FC", "tiros_puerta": 7})
    fichas, ultima = jug.combinar_importaciones([tiros, faltas])
    assert ultima == "2026-11-02"
    assert fichas == [
        {
            "jugador": "Ana Ruiz",
            "equipo": "Sevilla FC",
            "minutos": 900,
            "faltas_cometidas": 20,
            "faltas_recibidas": 9,
            "tiros_puerta": 7,
        }
    ]


def test_si_dos_tablas_traen_el_mismo_dato_manda_la_mas_reciente():
    vieja = _importacion("2026-11-01", {"jugador": "Ana Ruiz", "equipo": "Sevilla", "minutos": 450, "amarillas": 1})
    nueva = _importacion("2026-11-08", {"jugador": "Ana Ruiz", "equipo": "Sevilla", "minutos": 540, "amarillas": 2})
    fichas, _ = jug.combinar_importaciones([nueva, vieja])
    assert fichas[0]["minutos"] == 540 and fichas[0]["amarillas"] == 2


def test_combina_aunque_cambie_el_formato_del_nombre_o_del_equipo():
    a = _importacion("2026-11-01", {"jugador": "Ana Ruiz", "equipo": "Sevilla FC", "minutos": 900})
    b = _importacion("2026-11-02", {"jugador": "Ruiz, Ana", "equipo": "Sevilla", "amarillas": 3})
    c = _importacion("2026-11-03", {"jugador": "Ána Ruíz", "tiros_puerta": 4})
    fichas, _ = jug.combinar_importaciones([a, b, c])
    assert len(fichas) == 1
    assert fichas[0]["minutos"] == 900 and fichas[0]["amarillas"] == 3 and fichas[0]["tiros_puerta"] == 4


def test_dos_homonimos_de_equipos_distintos_no_se_mezclan():
    a = _importacion("2026-11-01", {"jugador": "Ana Ruiz", "equipo": "Arsenal FC", "minutos": 900})
    b = _importacion("2026-11-02", {"jugador": "Ana Ruiz", "equipo": "Everton FC", "minutos": 100})
    fichas, _ = jug.combinar_importaciones([a, b])
    assert sorted(f["minutos"] for f in fichas) == [100, 900]


def test_borrar_una_importacion_quita_solo_su_aportacion():
    faltas = _importacion("2026-11-01", {"jugador": "Ana", "equipo": "A", "minutos": 900, "faltas_cometidas": 20})
    tiros = _importacion("2026-11-02", {"jugador": "Ana", "equipo": "A", "tiros_puerta": 7})
    assert "tiros_puerta" in jug.combinar_importaciones([faltas, tiros])[0][0]
    assert "tiros_puerta" not in jug.combinar_importaciones([faltas])[0][0]


def test_un_dato_que_falta_no_cuenta_como_cero():
    filas = [
        {"jugador": "Ana", "equipo": "A", "minutos": 900, "faltas_cometidas": 30},
        {"jugador": "Eva", "equipo": "A", "minutos": 900, "faltas_cometidas": 10, "tiros_puerta": 18},
    ]
    tabla = {t["jugador"]: t for t in jug.tasas(filas)}
    assert "tiros_puerta" not in tabla["Ana"]
    # La media de tiros sale solo de quien tiene el dato: 18 en 900 minutos
    assert tabla["Eva"]["tiros_puerta"] == pytest.approx(18 / 900 * 90)

    top = jug.top_por_categoria(jug.tasas(filas), [], {}, {})
    assert [j.jugador for j in top["tiros_puerta"]] == ["Eva"]
    assert {j.jugador for j in top["faltas"]} == {"Ana", "Eva"}
    assert top["recibe_falta"] == []


def test_un_jugador_sin_minutos_en_ninguna_tabla_no_se_usa_todavia():
    fichas, _ = jug.combinar_importaciones([_importacion("2026-11-01", {"jugador": "Ana", "equipo": "A", "amarillas": 3})])
    assert jug.tasas(fichas) == []
