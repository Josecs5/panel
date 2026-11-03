from datetime import date, datetime, timezone
from types import SimpleNamespace

import pandas as pd
import pytest
import requests

from pronosticos.fuentes import clubelo
from pronosticos.fuentes.csv_fd import leer_csv
from pronosticos.fuentes.football_data_org import ClienteFootballData, a_tabla
from pronosticos.fuentes.oddspapi import (
    ClienteOddsPapi,
    ContadorPeticiones,
    CuotaAgotada,
    antes_del_inicio,
    lineas_de_partido,
)


class Memoria:
    def __init__(self, inicial=None):
        self.datos = dict(inicial or {})

    def leer(self, mes):
        return self.datos.get(mes)

    def guardar(self, mes, valor):
        self.datos[mes] = valor


def contador(tope=200, gastadas=0, mes="2026-11"):
    memoria = Memoria({mes: gastadas})
    ahora = lambda: datetime(int(mes[:4]), int(mes[5:]), 15, tzinfo=timezone.utc)
    return ContadorPeticiones(memoria.leer, memoria.guardar, tope=tope, ahora=ahora), memoria


def test_contador_suma_y_para_en_el_tope():
    c, memoria = contador(tope=2)
    c.reservar()
    c.reservar()
    assert memoria.datos["2026-11"] == 2
    assert c.restantes() == 0
    with pytest.raises(CuotaAgotada):
        c.reservar()
    assert memoria.datos["2026-11"] == 2


def test_contador_empieza_de_cero_cada_mes():
    memoria = Memoria({"2026-10": 200})
    c = ContadorPeticiones(
        memoria.leer, memoria.guardar, ahora=lambda: datetime(2026, 11, 1, tzinfo=timezone.utc)
    )
    assert c.gastadas() == 0
    c.reservar()
    assert memoria.datos == {"2026-10": 200, "2026-11": 1}


def test_contador_se_iguala_con_la_cuenta_solo_hacia_arriba():
    c, _ = contador(gastadas=10)
    c.igualar(4)
    assert c.gastadas() == 10
    c.igualar(25)
    assert c.gastadas() == 25


class Respuesta:
    def __init__(self, estado, cuerpo, cabeceras=None):
        self.status_code = estado
        self._cuerpo = cuerpo
        self.headers = cabeceras or {}

    def json(self):
        return self._cuerpo

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(response=SimpleNamespace(status_code=self.status_code))


class Sesion:
    def __init__(self, respuestas):
        self.respuestas = list(respuestas)
        self.llamadas = []

    def get(self, url, **opciones):
        self.llamadas.append((url, opciones))
        return self.respuestas.pop(0)


def test_oddspapi_cuenta_cada_peticion_filtra_por_casa_y_respeta_retry_ms():
    c, memoria = contador()
    esperas = []
    sesion = Sesion([Respuesta(429, {"retryMs": 2000}), Respuesta(200, [{"fixtureId": "x"}])])
    cliente = ClienteOddsPapi("clave", c, sesion=sesion, dormir=esperas.append)

    assert cliente.cuotas_por_torneos("bet365.es", [7, 8]) == [{"fixtureId": "x"}]
    assert memoria.datos["2026-11"] == 2  # OddsPapi también cobra el intento limitado
    assert any(e >= 2.0 for e in esperas)
    parametros = sesion.llamadas[0][1]["params"]
    assert parametros["bookmaker"] == "bet365.es"
    assert parametros["tournamentIds"] == "7,8"


def test_oddspapi_exige_casa_y_no_pide_si_no_queda_cuota():
    c, _ = contador(tope=1, gastadas=1)
    sesion = Sesion([])
    cliente = ClienteOddsPapi("clave", c, sesion=sesion)
    with pytest.raises(ValueError):
        cliente.cuotas_por_torneos("", [7])
    with pytest.raises(CuotaAgotada):
        cliente.cuotas_por_torneos("bet365.es", [7])
    assert sesion.llamadas == []


def test_oddspapi_historico_y_cuenta_no_gastan_cuota():
    c, memoria = contador()
    sesion = Sesion(
        [
            Respuesta(200, {"bookmakers": {}}),
            Respuesta(
                200,
                {
                    "current_subscription_id": "a",
                    "subscriptions": [{"subscription_id": "a", "request_count": 9}],
                },
            ),
        ]
    )
    cliente = ClienteOddsPapi("clave", c, sesion=sesion, dormir=lambda _: None)
    cliente.historico("id1", ["bet365.es"])
    assert cliente.gastadas_segun_la_cuenta() == 9
    assert memoria.datos["2026-11"] == 0
    with pytest.raises(ValueError):
        cliente.historico("id1", ["a", "b", "c", "d"])


def test_lineas_de_partido_solo_devuelve_cuotas_activas():
    catalogo = {
        101: {
            "marketName": "Full Time Result",
            "marketType": "1x2",
            "handicap": 0.0,
            "outcomes": [{"outcomeId": 101, "outcomeName": "1"}, {"outcomeId": 102, "outcomeName": "X"}],
        }
    }
    partido = {
        "bookmakerOdds": {
            "bet365.es": {
                "suspended": False,
                "markets": {
                    "101": {
                        "outcomes": {
                            "101": {"players": {"0": {"active": True, "price": 1.66}}},
                            "102": {"players": {"0": {"active": False, "price": 3.9}}},
                        }
                    },
                    "999": {"outcomes": {}},
                },
            }
        }
    }
    lineas = lineas_de_partido(partido, "bet365.es", catalogo)
    assert lineas == [
        {
            "mercado": 101,
            "nombre": "Full Time Result",
            "tipo": "1x2",
            "linea": 0.0,
            "seleccion": "1",
            "id_resultado": "101",
            "id_jugador": "0",
            "jugador": None,
            "cuota": 1.66,
        }
    ]
    assert lineas_de_partido(partido, "bwin.es", catalogo) == []


def test_antes_del_inicio_descarta_los_precios_en_vivo():
    serie = [
        {"createdAt": "2026-10-20T10:00:00.000Z", "price": 1.76, "active": True},
        {"createdAt": "2026-10-20T16:44:00.000Z", "price": 1.70, "active": True},
        {"createdAt": "2026-10-20T16:50:00.000Z", "price": 1.41, "active": True},
        {"createdAt": "2026-10-20T18:36:00.000Z", "price": 21.0, "active": False},
    ]
    assert antes_del_inicio(serie, "2026-10-20T16:45:00.000Z")["price"] == 1.70
    assert antes_del_inicio(serie[2:], "2026-10-20T16:45:00.000Z") is None


def test_lectura_de_csv_con_formatos_de_fecha_y_columnas_que_faltan(tmp_path):
    ruta = tmp_path / "2526_E0.csv"
    ruta.write_text(
        "Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,HC,AC,B365H,B365D,B365A\n"
        "E0,15/08/2025,A,B,2,1,5,4,1.9,3.5,4.0\n"
        "E0,16/08/25,C,D,0,0,,3,2.1,3.2,3.6\n"
        ",,,,,,,,,,\n",
        encoding="utf-8",
    )
    tabla = leer_csv(ruta, "PL", 2526)
    assert len(tabla) == 2
    assert tabla["fecha"].tolist() == [pd.Timestamp("2025-08-15"), pd.Timestamp("2025-08-16")]
    assert tabla["liga"].iloc[0] == "PL"
    assert tabla["cl"].iloc[0] == 5 and pd.isna(tabla["cl"].iloc[1])
    assert pd.isna(tabla["ps_1"].iloc[0])  # Pinnacle no viene en este archivo
    assert tabla["arbitro"].iloc[0] is None


def test_csv_sin_columnas_basicas_da_error(tmp_path):
    ruta = tmp_path / "x.csv"
    ruta.write_text("Div,Date\nE0,15/08/2025\n", encoding="utf-8")
    with pytest.raises(ValueError):
        leer_csv(ruta, "PL", 2526)


def _partido_fd(estado="FINISHED", regular=None, final=None, etapa="REGULAR_SEASON"):
    return {
        "id": 1,
        "status": estado,
        "utcDate": "2025-05-25T19:00:00Z",
        "stage": etapa,
        "homeTeam": {"id": 10, "name": "A"},
        "awayTeam": {"id": 20, "name": "B"},
        "score": {"regularTime": regular, "fullTime": final or {"home": 2, "away": 1}},
        "referees": [{"name": "Arbitro"}],
    }


def test_tabla_de_football_data_usa_el_marcador_de_90_minutos():
    tabla = a_tabla(
        [
            _partido_fd(),
            _partido_fd(estado="TIMED"),
            _partido_fd(regular={"home": 1, "away": 1}, final={"home": 2, "away": 1}, etapa="FINAL"),
        ],
        "CL",
        2024,
    )
    assert len(tabla) == 2
    assert (tabla["gl"].iloc[0], tabla["gv"].iloc[0]) == (2, 1)
    assert (tabla["gl"].iloc[1], tabla["gv"].iloc[1]) == (1, 1)
    assert bool(tabla["neutral"].iloc[1]) is True
    assert tabla["arbitro"].iloc[0] == "Arbitro"


def test_football_data_guarda_en_cache_y_espera_ante_un_429(tmp_path):
    esperas = []
    sesion = Sesion(
        [
            Respuesta(429, {}, {"X-RequestCounter-Reset": "30"}),
            Respuesta(200, {"matches": [_partido_fd()]}),
        ]
    )
    cliente = ClienteFootballData("t", cache=tmp_path, sesion=sesion, dormir=esperas.append)
    assert len(cliente.partidos("PL", 2024)) == 1
    assert 31.0 in esperas
    assert len(cliente.partidos("PL", 2024)) == 1  # segunda vez, desde la caché
    assert len(sesion.llamadas) == 2


def test_clubelo_devuelve_none_si_falla():
    assert clubelo.pedir_elo(date(2026, 11, 3), sesion=Sesion([Respuesta(502, {})])) is None

    class Rota:
        def get(self, *_a, **_k):
            raise requests.ConnectionError()

    assert clubelo.pedir_elo(date(2026, 11, 3), sesion=Rota()) is None
    assert clubelo.leer_tabla("Rank,Club,Country,Level,Elo,From,To\n1,Madrid,ESP,1,1900.5,x,y\n") == {"Madrid": 1900.5}
