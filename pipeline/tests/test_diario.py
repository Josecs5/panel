"""Ejecución diaria completa con fuentes falsas y almacén en memoria."""

import numpy as np
import pandas as pd
import pytest

from pronosticos import diario
from pronosticos.almacen.firestore import AlmacenMemoria
from pronosticos.auditoria import auditar as au
from pronosticos.fuentes.oddspapi import ContadorPeticiones, CuotaAgotada

EQUIPOS = {100 + i: f"Club {i} FC" for i in range(8)}
AHORA = pd.Timestamp("2026-11-09T05:00:00Z")  # lunes, 6:00 en Madrid
CATALOGO = {
    101: {
        "marketName": "Full Time Result",
        "marketType": "1x2",
        "handicap": 0.0,
        "outcomes": [
            {"outcomeId": 101, "outcomeName": "1"},
            {"outcomeId": 102, "outcomeName": "X"},
            {"outcomeId": 103, "outcomeName": "2"},
        ],
    },
    1010: {
        "marketName": "Over Under Full Time",
        "marketType": "totals",
        "handicap": 2.5,
        "outcomes": [{"outcomeId": 1010, "outcomeName": "Over"}, {"outcomeId": 1011, "outcomeName": "Under"}],
    },
}


def crudo(ident, competicion, inicio, local, visitante, estado, gl=None, gv=None):
    return {
        "id": ident,
        "status": estado,
        "utcDate": inicio,
        "stage": "REGULAR_SEASON",
        "homeTeam": {"id": local, "name": EQUIPOS[local]},
        "awayTeam": {"id": visitante, "name": EQUIPOS[visitante]},
        "score": {"regularTime": None, "fullTime": {"home": gl, "away": gv}},
        "referees": [],
    }


class FdFalso:
    def __init__(self, azar):
        self.peticiones = 0
        self.temporadas: dict[tuple[str, int], list[dict]] = {}
        ident = 1000
        ids = list(EQUIPOS)
        for temporada in (2024, 2025, 2026):
            fecha = pd.Timestamp(f"{temporada}-08-20T18:00:00Z")
            partidos = []
            for jornada in range(14):
                orden = np.r_[ids[0], np.roll(ids[1:], jornada)]
                for k in range(4):
                    local, visitante = int(orden[k]), int(orden[7 - k])
                    gl, gv = int(azar.poisson(1.6)), int(azar.poisson(1.1))
                    cuando = fecha + pd.Timedelta(days=7 * jornada)
                    if cuando < AHORA:
                        partidos.append(
                            crudo(ident, "PL", cuando.strftime("%Y-%m-%dT%H:%M:%SZ"), local, visitante, "FINISHED", gl, gv)
                        )
                    ident += 1
            self.temporadas[("PL", temporada)] = partidos
        # La jornada en curso: uno hoy, otros más adelante
        self.temporadas[("PL", 2026)] += [
            crudo(1, "PL", "2026-11-09T20:00:00Z", 100, 101, "TIMED"),
            crudo(2, "PL", "2026-11-14T15:00:00Z", 102, 103, "TIMED"),
            crudo(3, "PL", "2026-11-15T15:00:00Z", 104, 105, "TIMED"),
            crudo(4, "PL", "2026-11-15T17:00:00Z", 106, 107, "TIMED"),
        ]

    def partidos(self, competicion, temporada, usar_cache=True):
        self.peticiones += 1
        return self.temporadas.get((competicion, temporada), [])


def fixture_cuotas(ident, inicio, local, visitante, casa, cuotas_1x2, over, under):
    def oferta(precio):
        return {"players": {"0": {"active": True, "price": precio}}}

    return {
        "fixtureId": f"odds{ident}",
        "tournamentId": 17,
        "startTime": inicio,
        "participant1Name": EQUIPOS[local],
        "participant2Name": EQUIPOS[visitante],
        "bookmakerOdds": {
            casa: {
                "suspended": False,
                "markets": {
                    "101": {
                        "outcomes": {
                            "101": oferta(cuotas_1x2[0]),
                            "102": oferta(cuotas_1x2[1]),
                            "103": oferta(cuotas_1x2[2]),
                        }
                    },
                    "1010": {"outcomes": {"1010": oferta(over), "1011": oferta(under)}},
                },
            }
        },
    }


class OddsFalsas:
    """Bet365 paga el local por encima de lo que Pinnacle considera justo en un partido."""

    def __init__(self, tope=200):
        self.memoria = {}
        self.contador = ContadorPeticiones(
            self.memoria.get, self.memoria.__setitem__, tope=tope, ahora=lambda: AHORA.to_pydatetime()
        )
        self.casas_pedidas = []

    def cuotas_por_torneos(self, casa, torneos):
        self.contador.reservar()
        self.casas_pedidas.append(casa)
        if casa not in ("bet365.es", "pinnacle"):
            return []
        justas = casa == "pinnacle"
        return [
            fixture_cuotas(1, "2026-11-09T20:00:00.000Z", 100, 101, casa, (2.0, 3.6, 4.0) if justas else (2.2, 3.3, 3.6), 1.95, 1.95),
            fixture_cuotas(2, "2026-11-14T15:00:00.000Z", 102, 103, casa, (2.5, 3.3, 3.0) if justas else (2.35, 3.1, 2.8), 2.0, 1.85),
        ]

    def historico(self, fixture, casas):
        return {"bookmakers": {}}

    def gastadas_segun_la_cuenta(self):
        return self.contador.gastadas()


def csv_de_prueba(fd: FdFalso) -> pd.DataFrame:
    """Los CSV usan otros nombres y traen estadísticas de los partidos ya jugados."""
    filas = []
    azar = np.random.default_rng(9)
    for (_, temporada), partidos in fd.temporadas.items():
        for p in partidos:
            if p["status"] != "FINISHED":
                continue
            if pd.Timestamp(p["utcDate"]) > pd.Timestamp("2026-11-01T00:00:00Z"):
                continue  # los CSV van con retraso
            filas.append(
                {
                    "liga": "PL",
                    "temporada": diario.codigo_csv(temporada),
                    "fecha": pd.Timestamp(p["utcDate"]).tz_localize(None).normalize(),
                    "local": p["homeTeam"]["name"].replace(" FC", ""),
                    "visitante": p["awayTeam"]["name"].replace(" FC", ""),
                    "gl": p["score"]["fullTime"]["home"],
                    "gv": p["score"]["fullTime"]["away"],
                    "tpl": int(azar.poisson(4)),
                    "tpv": int(azar.poisson(3)),
                    "fl": int(azar.poisson(11)),
                    "fv": int(azar.poisson(11)),
                    "cl": int(azar.poisson(5)),
                    "cv": int(azar.poisson(4)),
                    "al": int(azar.poisson(2)),
                    "av": int(azar.poisson(2)),
                    "rl": 0,
                    "rv": 0,
                    "arbitro": None,
                }
            )
    return pd.DataFrame(filas)


@pytest.fixture
def escenario():
    fd = FdFalso(np.random.default_rng(4))
    return AlmacenMemoria(), fd, csv_de_prueba(fd), OddsFalsas()


def ejecutar(almacen, fd, csv, odds, ahora=AHORA):
    return diario.ejecutar_diario(almacen, fd, odds, csv, ahora, pedir_clubelo=lambda _: None, catalogo=CATALOGO)


def test_primera_ejecucion_escribe_jornada_boleto_y_estado(escenario):
    almacen, fd, csv, odds = escenario
    estado = ejecutar(almacen, fd, csv, odds)
    assert estado == {"fecha": "2026-11-09", "version": 1, "partidos": 3}
    assert set(estado) == {"fecha", "version", "partidos"}  # es lo único que se hace público

    jornada = almacen.leer("pronJornadas", "2026-W46")
    assert len(jornada["destacados"]) == 3  # máximo 3 por liga
    boleto = jornada["boleto"]
    assert boleto["apuestas"], "la prueba debe generar alguna apuesta para comprobar sus reglas"
    assert boleto["totalCentimos"] <= 500
    for apuesta in boleto["apuestas"]:
        assert apuesta["ve"] >= 0.04
        for seleccion in apuesta["selecciones"]:
            assert seleccion["casa"] == "bet365.es"
            assert seleccion["clave"] in {"1", "X", "2", "o25", "u25"}

    ejecucion = almacen.leer("pronEstado", "ultima")
    assert ejecucion["oddsPapi"]["gastadas"] == 4  # 3 casas y Pinnacle
    assert ejecucion["errores"] == []
    assert odds.casas_pedidas == ["bet365.es", "codere.es", "bwin.es", "pinnacle"]


def test_con_peso_cero_la_final_es_el_mercado_y_solo_apuesta_si_bet365_lo_supera(escenario):
    almacen, fd, csv, odds = escenario
    ejecutar(almacen, fd, csv, odds)
    partido = almacen.leer("pronPartidos", "1")
    item = partido["items"]["1"]
    esperada = (1 / 2.0) / (1 / 2.0 + 1 / 3.6 + 1 / 4.0)
    assert item["mercado"] == pytest.approx(esperada)
    assert item["final"] == pytest.approx(esperada)
    assert item["modelo"] is not None and item["modelo"] != pytest.approx(esperada)

    apuestas = almacen.leer("pronJornadas", "2026-W46")["boleto"]["apuestas"]
    claves = [(s["partido"], s["clave"]) for a in apuestas for s in a["selecciones"]]
    assert ("1", "1") in claves  # 2,20 en Bet365 frente a una cuota justa de 1,91


def test_los_mercados_bloqueados_no_entran_en_el_boleto(escenario):
    almacen, fd, csv, odds = escenario
    ejecutar(almacen, fd, csv, odds)
    partido = almacen.leer("pronPartidos", "2")
    assert "corners_o95" in partido["items"] or any(k.startswith("corners_") for k in partido["items"])
    assert partido["rangos"]["corners"]["total"][0] <= partido["rangos"]["corners"]["total"][1]
    assert partido["marcadores"][0]["prob"] > 0


def test_solo_se_congela_lo_de_hoy_y_nunca_se_reescribe(escenario):
    almacen, fd, csv, odds = escenario
    ejecutar(almacen, fd, csv, odds)
    congelados = almacen.listar("pronCongelados")
    assert set(congelados) == {"1"}
    original = congelados["1"]["congelado"]
    final = congelados["1"]["items"]["1"]["final"]

    ejecutar(almacen, fd, csv, odds, AHORA + pd.Timedelta(hours=1))
    otra = almacen.leer("pronCongelados", "1")
    assert otra["congelado"] == original
    assert otra["items"]["1"]["final"] == final


def test_el_boleto_es_unico_en_la_jornada(escenario):
    almacen, fd, csv, odds = escenario
    ejecutar(almacen, fd, csv, odds)
    boleto = almacen.leer("pronJornadas", "2026-W46")["boleto"]
    odds_mas_tarde = OddsFalsas()
    ejecutar(almacen, fd, csv, odds_mas_tarde, AHORA + pd.Timedelta(days=1))
    assert almacen.leer("pronJornadas", "2026-W46")["boleto"] == boleto


def test_sin_cuotas_sigue_y_no_fija_un_boleto_vacio(escenario):
    almacen, fd, csv, _ = escenario
    estado = diario.ejecutar_diario(almacen, fd, None, csv, AHORA, pedir_clubelo=lambda _: None)
    assert estado["partidos"] == 3
    assert "boleto" not in almacen.leer("pronJornadas", "2026-W46")
    assert any("OddsPapi" in a for a in almacen.leer("pronEstado", "ultima")["avisos"])


def test_si_se_agota_el_tope_sigue_sin_cuotas_y_lo_avisa(escenario):
    almacen, fd, csv, _ = escenario
    odds = OddsFalsas(tope=0)
    with pytest.raises(CuotaAgotada):
        odds.contador.reservar()
    estado = ejecutar(almacen, fd, csv, odds)
    assert estado["partidos"] == 3
    assert any("tope mensual" in a for a in almacen.leer("pronEstado", "ultima")["avisos"])
    assert odds.casas_pedidas == []


def test_liquida_goles_al_terminar_y_estadisticas_cuando_llegan_los_csv(escenario):
    almacen, fd, csv, odds = escenario
    ejecutar(almacen, fd, csv, odds)
    partido = fd.temporadas[("PL", 2026)]
    jugado = next(p for p in partido if p["id"] == 1)
    jugado["status"] = "FINISHED"
    jugado["score"] = {"regularTime": None, "fullTime": {"home": 2, "away": 1}}

    siguiente = AHORA + pd.Timedelta(days=1)
    ejecutar(almacen, fd, csv, odds, siguiente)
    items = almacen.leer("pronLiquidaciones", "1")["items"]
    assert items["1"]["estado"] == "ganada"
    assert items["2"]["estado"] == "perdida"
    assert items["o25"]["estado"] == "ganada"
    claves_corners = [k for k in items if k.startswith("corners_")]
    assert claves_corners and all(items[k]["estado"] == "pendiente" for k in claves_corners)

    # Llega el CSV con las estadísticas
    fila = {
        "liga": "PL",
        "temporada": 2627,
        "fecha": pd.Timestamp("2026-11-09"),
        "local": "Club 0",
        "visitante": "Club 1",
        "gl": 2,
        "gv": 1,
        "tpl": 5,
        "tpv": 2,
        "fl": 9,
        "fv": 12,
        "cl": 40,
        "cv": 20,
        "al": 1,
        "av": 2,
        "rl": 0,
        "rv": 0,
        "arbitro": None,
    }
    con_fila = pd.concat([csv, pd.DataFrame([fila])], ignore_index=True)
    ejecutar(almacen, fd, con_fila, odds, siguiente + pd.Timedelta(days=1))
    items = almacen.leer("pronLiquidaciones", "1")["items"]
    sobre = [k for k in items if k.startswith("corners_o")]
    assert sobre and all(items[k]["estado"] == "ganada" for k in sobre)


def test_lo_que_no_se_liquida_en_7_dias_no_cuenta(escenario):
    almacen, fd, csv, odds = escenario
    ejecutar(almacen, fd, csv, odds)
    jugado = next(p for p in fd.temporadas[("PL", 2026)] if p["id"] == 1)
    jugado["status"] = "FINISHED"
    jugado["score"] = {"regularTime": None, "fullTime": {"home": 0, "away": 0}}

    ejecutar(almacen, fd, csv, odds, AHORA + pd.Timedelta(days=9))
    documento = almacen.leer("pronLiquidaciones", "1")
    assert documento["fin"] is True
    assert documento["items"]["corners_o" + next(k for k in documento["items"] if k.startswith("corners_o"))[9:]]["estado"] == "sin_liquidar"
    filas = au.filas_liquidadas({"1": documento})
    assert all(not f["clave"].startswith("corners_") for f in filas)


def test_apuesta_real_y_su_liquidacion(escenario):
    almacen, fd, csv, odds = escenario
    ejecutar(almacen, fd, csv, odds)
    almacen.guardar(
        "pronApuestas",
        "2026-W46-1",
        {
            "estado": "hecha",
            "stakeRealCentimos": 100,
            "cuotaReal": 2.2,
            "selecciones": [{"partido": "1", "clave": "1"}],
        },
    )
    almacen.guardar("pronApuestas", "otra", {"estado": "no_hecha", "selecciones": [{"partido": "1", "clave": "1"}]})
    jugado = next(p for p in fd.temporadas[("PL", 2026)] if p["id"] == 1)
    jugado["status"] = "FINISHED"
    jugado["score"] = {"regularTime": None, "fullTime": {"home": 1, "away": 0}}
    ejecutar(almacen, fd, csv, odds, AHORA + pd.Timedelta(days=1))

    assert almacen.leer("pronApuestas", "2026-W46-1")["liquidacion"]["beneficioCentimos"] == 120
    assert "liquidacion" not in almacen.leer("pronApuestas", "otra")
    resumen = au.metricas_apuestas(almacen.listar("pronApuestas"))
    assert resumen["n"] == 1 and resumen["roi"] == pytest.approx(1.2)
    assert resumen["muestra_pequena"] is True


def test_la_jornada_nueva_crea_version_con_changelog(escenario):
    almacen, fd, csv, odds = escenario
    ejecutar(almacen, fd, csv, odds)
    assert set(almacen.listar("pronVersiones")) == {"v1"}
    estado = ejecutar(almacen, fd, csv, odds, AHORA + pd.Timedelta(days=7))
    assert estado["version"] == 2
    version = almacen.leer("pronVersiones", "v2")
    assert version["anterior"] == 1
    assert version["changelog"][0]["texto"].startswith("Sin cambios")


def _liquidaciones_sinteticas(n, grupo, modelo, mercado, azar):
    items = {}
    for i in range(n):
        y = azar.random() < mercado
        items[f"{grupo}{i}"] = {
            "estado": "ganada" if y else "perdida",
            "grupo": grupo,
            "final": mercado,
            "modelo": modelo,
            "mercado": mercado,
        }
    return {"a": {"competicion": "PL", "version": 1, "inicio": "2026-11-01", "items": items}}


def test_recalibrar_sube_el_peso_del_mercado_con_explicacion():
    azar = np.random.default_rng(1)
    liquidaciones = _liquidaciones_sinteticas(400, "corners", 0.8, 0.5, azar)
    version = {"numero": 3, "pesos": {"corners": 0.4}}
    nueva = au.recalibrar(version, liquidaciones, AHORA)
    assert nueva["numero"] == 4
    assert nueva["pesos"]["corners"] == 0.3
    assert "Subo el peso del mercado en córners de 0,6 a 0,7" in nueva["changelog"][0]["texto"]


def test_recalibrar_no_cambia_nada_con_pocos_casos():
    azar = np.random.default_rng(1)
    version = {"numero": 3, "pesos": {"corners": 0.4}}
    nueva = au.recalibrar(version, _liquidaciones_sinteticas(49, "corners", 0.8, 0.5, azar), AHORA)
    assert nueva["pesos"]["corners"] == 0.4


def test_el_error_nunca_lleva_la_url_con_la_clave():
    class Falla(Exception):
        response = type("R", (), {"status_code": 401})()

    texto = diario.describir_error(Falla("https://api.oddspapi.io/v4/x?apiKey=secreta"))
    assert "secreta" not in texto
    assert texto == "Falla 401"


def test_los_ajustes_invalidos_se_ignoran_y_pinnacle_no_es_casa_de_apuesta():
    almacen = AlmacenMemoria()
    almacen.guardar(
        "ajustes",
        "pronosticos",
        {
            "casas": ["bet365.es", "pinnacle", 7],
            "maxDestacadosLiga": 99,
            "maxDestacadosChampions": 2,
            "veMinimo": -1,
            "probMinima": 0.3,
            "derbis": [["Real Madrid CF", "Club Atlético de Madrid"], ["solo uno"]],
            "topeJornada": 10000,
        },
    )
    ajustes = diario.leer_ajustes(almacen)
    assert ajustes.casas == ["bet365.es"]
    assert ajustes.max_liga == 3
    assert ajustes.max_champions == 2
    assert ajustes.umbrales.ve_minimo == 0.04
    assert ajustes.umbrales.prob_minima == 0.3
    assert len(ajustes.derbis) == 1
    assert not hasattr(ajustes, "tope")
