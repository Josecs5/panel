#!/usr/bin/env bash
# Baja los CSV de football-data.co.uk. Se ejecuta en GitHub Actions; los archivos
# se guardan en la caché del workflow y nunca entran en el repo público.
set -u
destino="${1:-pipeline/datos/csv}"
base="${BASE_CSV:-https://www.football-data.co.uk/mmz4281}"
mkdir -p "$destino"
fallos=0
for temporada in 2223 2324 2425 2526 2627; do
  for liga in SP1 E0 D1 I1; do
    nombre="${temporada}_${liga}"
    archivo="$destino/${nombre}.csv"
    nuevo="$(mktemp)"
    if [ -s "$archivo" ]; then
      opciones=(-z "$archivo")
    else
      opciones=()
    fi
    codigo="$(curl -sS -L -m 60 "${opciones[@]}" -o "$nuevo" -w '%{http_code}' "$base/${temporada}/${liga}.csv" || echo 000)"
    if [ "$codigo" = "304" ]; then
      echo "sin cambios: $nombre"
    elif [ "$codigo" = "200" ] && head -c 200 "$nuevo" | grep -q 'HomeTeam'; then
      mv "$nuevo" "$archivo"
      echo "actualizado: $nombre"
    else
      # Una respuesta inesperada nunca sustituye a una copia buena
      echo "::warning::$nombre no se pudo bajar (HTTP $codigo, $(wc -c < "$nuevo") bytes)"
      fallos=$((fallos + 1))
    fi
    rm -f "$nuevo"
    sleep "${PAUSA_CSV:-2}"
  done
done
echo "CSV disponibles: $(ls "$destino" | wc -l); fallos: $fallos"
