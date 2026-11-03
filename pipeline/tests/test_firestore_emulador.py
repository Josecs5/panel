"""Solo se ejecuta con el emulador de Firestore: FIRESTORE_EMULATOR_HOST."""

import os

import pytest

from pronosticos.almacen.firestore import AlmacenFirestore

pytestmark = pytest.mark.skipif(not os.environ.get("FIRESTORE_EMULATOR_HOST"), reason="sin emulador de Firestore")


@pytest.fixture(scope="module")
def almacen():
    from firebase_admin import credentials
    from google.auth.credentials import AnonymousCredentials

    class Anonima(credentials.Base):
        def get_credential(self):
            return AnonymousCredentials()

    return AlmacenFirestore(None, "uid-de-prueba", proyecto="demo-panel", credencial=Anonima())


def test_crear_nunca_sobrescribe(almacen):
    assert almacen.crear("pronCongelados", "1", {"final": 0.4}) is True
    assert almacen.crear("pronCongelados", "1", {"final": 0.9}) is False
    assert almacen.leer("pronCongelados", "1") == {"final": 0.4}


def test_guarda_y_lee_claves_con_caracteres_especiales(almacen):
    items = {
        "jug:faltas:Ruiz, Ana": {"final": 0.81, "modelo": None},
        "jug:tarjeta:Souza Jr.": {"final": 0.3, "modelo": None},
        "corners_l_o45": {"final": 0.5, "modelo": 0.5},
        "1": {"final": 0.5, "modelo": 0.4},
    }
    almacen.guardar("pronPartidos", "2", {"items": items, "marcadores": [{"local": 1, "prob": 0.1}]}, unir=False)
    assert almacen.leer("pronPartidos", "2")["items"] == items


def test_unir_conserva_lo_demas_y_admite_claves_con_guion_y_almohadilla(almacen):
    almacen.guardar("pronJornadas", "2026-W46", {"destacados": ["1"], "boleto": {"vacio": True}}, unir=False)
    almacen.guardar("pronJornadas", "2026-W46", {"seguimiento": {"2026-W46-1#0": {"cuotaHoy": 2.1, "cumple": True}}})
    doc = almacen.leer("pronJornadas", "2026-W46")
    assert doc["destacados"] == ["1"]
    assert doc["seguimiento"]["2026-W46-1#0"]["cuotaHoy"] == 2.1

    almacen.guardar("pronEstado", "oddspapi", {"2026-11": 4})
    almacen.guardar("pronEstado", "oddspapi", {"2026-12": 1})
    assert almacen.leer("pronEstado", "oddspapi") == {"2026-11": 4, "2026-12": 1}


def test_listar_y_documento_inexistente(almacen):
    almacen.guardar("pronVersiones", "v1", {"numero": 1}, unir=False)
    assert almacen.listar("pronVersiones")["v1"] == {"numero": 1}
    assert almacen.leer("pronVersiones", "no-existe") is None


def test_un_documento_real_de_34_kb(almacen):
    items = {
        f"corners_{lado}{i}5": {
            "grupo": "corners",
            "modelo": 0.123456789,
            "mercado": None,
            "final": 0.5,
            "cuota": 1.9,
            "casa": "bet365.es",
            "ids": {"bet365.es": {"mercado": 1, "resultado": "2", "jugador": "0"}},
        }
        for i in range(70)
        for lado in "ou"
    }
    almacen.guardar("pronCongelados", "grande", {"items": items}, unir=False)
    assert len(almacen.leer("pronCongelados", "grande")["items"]) == 140
