"""Cliente de OddsPapi v4, plan gratuito, con tope mensual de peticiones."""

import time
from datetime import datetime, timezone

import requests

from ..config import TOPE_ODDSPAPI_MES

BASE = "https://api.oddspapi.io/v4"
INTERVALO_MINIMO = 1.0


class CuotaAgotada(Exception):
    """Se ha llegado al tope interno: el pipeline sigue sin cuotas y lo avisa."""


class ContadorPeticiones:
    """Cuenta lo gastado por mes. `leer` y `guardar` los aporta el almacén."""

    def __init__(self, leer, guardar, tope: int = TOPE_ODDSPAPI_MES, ahora=None):
        self._leer = leer
        self._guardar = guardar
        self._tope = tope
        self._ahora = ahora or (lambda: datetime.now(timezone.utc))

    @property
    def mes(self) -> str:
        return self._ahora().strftime("%Y-%m")

    def gastadas(self) -> int:
        return int(self._leer(self.mes) or 0)

    def restantes(self) -> int:
        return max(self._tope - self.gastadas(), 0)

    def reservar(self) -> None:
        """Se llama antes de pedir, porque OddsPapi también cobra los errores."""
        gastadas = self.gastadas()
        if gastadas >= self._tope:
            raise CuotaAgotada(f"Tope de {self._tope} peticiones alcanzado en {self.mes}")
        self._guardar(self.mes, gastadas + 1)

    def igualar(self, gastadas_reales: int) -> None:
        """Si la cuenta de OddsPapi dice más que la nuestra, manda la suya."""
        if gastadas_reales > self.gastadas():
            self._guardar(self.mes, gastadas_reales)


class ClienteOddsPapi:
    def __init__(self, clave: str, contador: ContadorPeticiones, sesion=None, dormir=time.sleep):
        self._clave = clave
        self._contador = contador
        self._sesion = sesion or requests.Session()
        self._dormir = dormir
        self._ultima: dict[str, float] = {}

    def _pedir(self, ruta: str, cuenta: bool = True, **parametros):
        for _ in range(3):
            espera = self._ultima.get(ruta, 0.0) + INTERVALO_MINIMO - time.monotonic()
            if espera > 0:
                self._dormir(espera)
            if cuenta:
                self._contador.reservar()
            respuesta = self._sesion.get(
                f"{BASE}/{ruta}",
                params={**parametros, "apiKey": self._clave},
                headers={"Accept-Encoding": "gzip"},
                timeout=120,
            )
            self._ultima[ruta] = time.monotonic()
            if respuesta.status_code != 429:
                respuesta.raise_for_status()
                return respuesta.json()
            self._dormir(float(respuesta.json().get("retryMs", 5000)) / 1000 + 0.5)
        raise RuntimeError(f"OddsPapi sigue limitando {ruta}")

    def cuotas_por_torneos(self, casa: str, torneos: list[int]) -> list[dict]:
        """Una petición: todos los partidos próximos de hasta 5 torneos para una casa."""
        if not casa:
            raise ValueError("Hay que indicar siempre la casa para no recibir decenas de MB")
        return self._pedir(
            "odds-by-tournaments",
            bookmaker=casa,
            tournamentIds=",".join(str(t) for t in torneos),
            oddsFormat="decimal",
            verbosity=1,
        )

    def mercados(self, deporte: int = 10) -> list[dict]:
        return self._pedir("markets", sportId=deporte)

    def historico(self, partido: str, casas: list[str]) -> dict:
        """No gasta cuota, pero mezcla precios en vivo: usar `antes_del_inicio`."""
        if not casas or len(casas) > 3:
            raise ValueError("El histórico admite de 1 a 3 casas")
        return self._pedir("historical-odds", cuenta=False, fixtureId=partido, bookmakers=",".join(casas))

    def gastadas_segun_la_cuenta(self) -> int:
        """Este endpoint no gasta cuota y sigue accesible aunque esté agotada."""
        cuenta = self._pedir("account", cuenta=False)
        activa = cuenta["current_subscription_id"]
        for suscripcion in cuenta["subscriptions"]:
            if suscripcion["subscription_id"] == activa:
                return int(suscripcion["request_count"])
        raise ValueError("La cuenta de OddsPapi no tiene una suscripción activa")


def lineas_de_partido(partido: dict, casa: str, catalogo: dict[int, dict]) -> list[dict]:
    """Aplana las cuotas activas de una casa con los datos del catálogo de mercados."""
    bloque = (partido.get("bookmakerOdds") or {}).get(casa) or {}
    if bloque.get("suspended"):
        return []
    lineas = []
    for id_mercado, mercado in (bloque.get("markets") or {}).items():
        ficha = catalogo.get(int(id_mercado))
        if not ficha:
            continue
        nombres = {str(o["outcomeId"]): o["outcomeName"] for o in ficha.get("outcomes", [])}
        for id_resultado, resultado in (mercado.get("outcomes") or {}).items():
            for jugador, oferta in (resultado.get("players") or {}).items():
                if not oferta.get("active") or not oferta.get("price"):
                    continue
                lineas.append(
                    {
                        "mercado": int(id_mercado),
                        "nombre": ficha["marketName"],
                        "tipo": ficha["marketType"],
                        "linea": ficha.get("handicap"),
                        "seleccion": nombres.get(str(id_resultado), str(id_resultado)),
                        "jugador": oferta.get("playerName") if jugador != "0" else None,
                        "cuota": float(oferta["price"]),
                    }
                )
    return lineas


def antes_del_inicio(serie: list[dict], inicio: str) -> dict | None:
    """Última cuota activa antes de empezar: la de cierre. Descarta los precios en vivo."""
    limite = datetime.fromisoformat(inicio.replace("Z", "+00:00"))
    validas = [
        p
        for p in serie
        if p.get("active")
        and p.get("price")
        and datetime.fromisoformat(p["createdAt"].replace("Z", "+00:00")) < limite
    ]
    return max(validas, key=lambda p: p["createdAt"]) if validas else None
