"""Acceso a Firestore en users/{uid}/... con firebase-admin.

`AlmacenMemoria` tiene la misma interfaz y sirve para las pruebas.
"""

import copy
import json

_YA_EXISTE = "ya_existe"


class AlmacenMemoria:
    def __init__(self):
        self.datos: dict[str, dict[str, dict]] = {}

    def leer(self, coleccion: str, ident: str) -> dict | None:
        doc = self.datos.get(coleccion, {}).get(ident)
        return copy.deepcopy(doc) if doc is not None else None

    def listar(self, coleccion: str) -> dict[str, dict]:
        return copy.deepcopy(self.datos.get(coleccion, {}))

    def crear(self, coleccion: str, ident: str, datos: dict) -> bool:
        """Crea el documento solo si no existe. Devuelve False si ya estaba."""
        docs = self.datos.setdefault(coleccion, {})
        if ident in docs:
            return False
        docs[ident] = copy.deepcopy(datos)
        return True

    def guardar(self, coleccion: str, ident: str, datos: dict, unir: bool = True) -> None:
        docs = self.datos.setdefault(coleccion, {})
        if unir and ident in docs:
            docs[ident] = {**docs[ident], **copy.deepcopy(datos)}
        else:
            docs[ident] = copy.deepcopy(datos)


class AlmacenFirestore:
    def __init__(self, cuenta_servicio: str | None, uid: str, proyecto: str | None = None, credencial=None):
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not uid:
            raise ValueError("Falta el UID del panel")
        opciones = {"projectId": proyecto} if proyecto else None
        if credencial is None and cuenta_servicio:
            credencial = credentials.Certificate(json.loads(cuenta_servicio))
        self._app = firebase_admin.initialize_app(credencial, opciones, name=f"pronosticos-{id(self)}")
        self._db = firestore.client(self._app)
        self._raiz = self._db.collection("users").document(uid)

    def _coleccion(self, coleccion: str):
        return self._raiz.collection(coleccion)

    def leer(self, coleccion: str, ident: str) -> dict | None:
        foto = self._coleccion(coleccion).document(ident).get()
        return foto.to_dict() if foto.exists else None

    def listar(self, coleccion: str) -> dict[str, dict]:
        return {foto.id: foto.to_dict() for foto in self._coleccion(coleccion).stream()}

    def crear(self, coleccion: str, ident: str, datos: dict) -> bool:
        from google.api_core.exceptions import AlreadyExists

        try:
            self._coleccion(coleccion).document(ident).create(datos)
            return True
        except AlreadyExists:
            return False

    def guardar(self, coleccion: str, ident: str, datos: dict, unir: bool = True) -> None:
        self._coleccion(coleccion).document(ident).set(datos, merge=unir)
