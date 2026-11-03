#!/usr/bin/env bash
# Baja los CSV de football-data.co.uk. Se ejecuta en GitHub Actions; los archivos
# se guardan en la caché del workflow y nunca entran en el repo público.
set -u
destino="${1:-pipeline/datos/csv}"
mkdir -p "$destino"
fallos=0
for temporada in 2223 2324 2425 2526 2627; do
  for liga in SP1 E0 D1 I1; do
    archivo="$destino/${temporada}_${liga}.csv"
    url="https://www.football-data.co.uk/mmz4281/${temporada}/${liga}.csv"
    nuevo="$(mktemp)"
    if [ -s "$archivo" ]; then
      opciones=(-z "$archivo")
    else
      opciones=()
    fi
    if curl --fail -sS -m 60 "${opciones[@]}" -o "$nuevo" "$url"; then
      if [ -s "$nuevo" ]; then mv "$nuevo" "$archivo"; echo "actualizado: ${temporada}_${liga}"; else rm -f "$nuevo"; echo "sin cambios: ${temporada}_${liga}"; fi
    else
      rm -f "$nuevo"
      echo "::warning::No se pudo bajar ${temporada}_${liga}"
      fallos=$((fallos + 1))
    fi
    sleep 2
  done
done
echo "CSV disponibles: $(ls "$destino" | wc -l); fallos: $fallos"
