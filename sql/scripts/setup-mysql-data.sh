#! /usr/bin/env sh
set -eux

# If first parameter given, specifies the base directory
BASE_DIR="${1:-.}"

# Caso especial ejecutado por el CI, para que la ejecución local en el
# ditectorio sql y desde el CI en el raíz caigan en el mismo sitio,
# compruebo si existe un directorio "sql". Si existe, lo añado como elemento
# adicional al path
test -e "${BASE_DIR}/sql" && BASE_DIR="${BASE_DIR}/sql"

# Already exists? exit
test -e "${BASE_DIR}/data/stackoverflow.sql.gz" && test -e "${BASE_DIR}/data/done" && exit 0

BASE_URL="https://github.com/dsevilla/bd2-data/raw/refs/heads/main/es.stackoverflow/mysql"

for f in `wget -qO - ${BASE_URL}/stackoverflow.sql.gz.list.txt`; do
    wget -qO - "${BASE_URL}/$f"
done > "${BASE_DIR}/data/stackoverflow.sql.gz"

# Signal we're done
touch "${BASE_DIR}/data/done"
