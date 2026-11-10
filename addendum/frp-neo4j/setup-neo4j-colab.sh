#! /bin/sh
# Instala y arranca Neo4j en Google Colab y, si el servidor frp de la UM es
# alcanzable, abre un túnel para usar Neo4j Browser desde fuera de Colab.
#
# Neo4j arranca con autenticación y una contraseña aleatoria corta (usuario
# neo4j): con el túnel abierto, cualquiera que recorra los puertos del servidor
# llegaría a la base. Los cuadernos leen de la salida estándar estas líneas:
#   NEO4J_PASSWORD=<contraseña>
#   NEO4J_HTTP_URL=<URL pública de Neo4j Browser>   (sólo si se abre el túnel)
#   NEO4J_BOLT_URL=<URL Bolt pública>               (sólo si se abre el túnel)
# Si el túnel no se abre, se imprime una línea "[AVISO] ...".

FRP_VERSION="0.72.0"
FRP_SERVER="dsevilla-proxy.inf.um.es"
FRP_SERVER_PORT="8080"
# Debe coincidir con auth.token de frps.toml. No es un secreto (ver frps.toml).
FRP_TOKEN="bdge-neo4j"

sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -qq -y ca-certificates gnupg default-jre-headless
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://debian.neo4j.com/neotechnology.gpg.key \
  | sudo gpg --dearmor --yes -o /etc/apt/keyrings/neotechnology.gpg
echo "deb [signed-by=/etc/apt/keyrings/neotechnology.gpg] https://debian.neo4j.com stable latest" \
  | sudo tee /etc/apt/sources.list.d/neo4j.list >/dev/null
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install --reinstall -y -qq neo4j
# Neo4j exige por omisión contraseñas de 8 caracteres; se baja a 6 para que el
# alumno pueda teclearla con comodidad en Neo4j Browser.
grep -q -e '^# Updated' /etc/neo4j/neo4j.conf || \
  sudo sed -i -e '1s/^/dbms.security.auth_minimum_password_length=6\n/;1s/^/server.memory.heap.initial_size=6G\n/;1s/^/server.memory.heap.max_size=6G\n/;1s/^/# Updated config\n/' /etc/neo4j/neo4j.conf
head /etc/neo4j/neo4j.conf

# La contraseña inicial sólo se puede fijar antes del primer arranque, así que
# se guarda para reutilizarla si el script se vuelve a ejecutar en la misma
# máquina. Sin caracteres que se confundan al copiarla (0/o, 1/l/i).
PASSWORD_FILE="/etc/neo4j/bdge-password"
if sudo test -s "$PASSWORD_FILE"; then
  NEO4J_PASSWORD=$(sudo cat "$PASSWORD_FILE")
else
  NEO4J_PASSWORD=$(LC_ALL=C tr -dc 'abcdefghjkmnpqrstuvwxyz23456789' </dev/urandom | head -c 6)
  [ "${#NEO4J_PASSWORD}" -eq 6 ] || { echo "[ERROR] No se pudo generar la contraseña de Neo4j." >&2; exit 1; }
  sudo neo4j-admin dbms set-initial-password "$NEO4J_PASSWORD" || { echo "[ERROR] No se pudo fijar la contraseña de Neo4j." >&2; exit 1; }
  printf '%s\n' "$NEO4J_PASSWORD" | sudo tee "$PASSWORD_FILE" >/dev/null
  sudo chmod 600 "$PASSWORD_FILE"
fi

sudo neo4j start || echo "[AVISO] 'neo4j start' devolvió un código de error; se comprobará igualmente si Bolt llega a responder."

echo "Esperando a que Neo4j acepte conexiones Bolt en localhost:7687..."
ready=0
for i in $(seq 1 60); do
  if timeout 5 cypher-shell -a bolt://localhost:7687 -u neo4j -p "$NEO4J_PASSWORD" "RETURN 1;" </dev/null >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [ "$ready" -ne 1 ]; then
  echo "[ERROR] Neo4j no respondió por Bolt tras varios minutos de espera. Diagnóstico:" >&2
  sudo neo4j status || true
  sudo tail -n 100 /var/log/neo4j/neo4j.log 2>/dev/null || true
  sudo tail -n 100 /var/log/neo4j/debug.log 2>/dev/null || true
  exit 1
fi
echo "Neo4j está aceptando conexiones Bolt."
printf 'NEO4J_PASSWORD=%s\n' "$NEO4J_PASSWORD"

# El túnel frp sólo sirve para abrir Neo4j Browser desde fuera de la máquina
# de Colab; si el servidor no es alcanzable (por ejemplo, desde un runner de
# GitLab CI ajeno a la red de la UM) no debe hacer fallar todo el script,
# porque la conexión local por Bolt ya ha quedado confirmada arriba.
#
# frps asigna los puertos (remotePort = 0) y frpc los publica en su API local
# (/api/status), de donde se leen. El usuario aleatorio hace únicos los nombres
# de los proxies en frps, que los exige únicos entre todas las sesiones.
abrir_tunel() {
  frp_dir="frp_${FRP_VERSION}_linux_amd64"
  curl -fsSL --connect-timeout 10 --max-time 120 --retry 3 \
    "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/${frp_dir}.tar.gz" \
    | tar zxf - || return 1
  [ -x "${frp_dir}/frpc" ] || return 1

  frp_user="colab-$(cut -c1-8 /proc/sys/kernel/random/uuid)"
  cat > frpc.toml <<EOF
serverAddr = "${FRP_SERVER}"
serverPort = ${FRP_SERVER_PORT}
user = "${frp_user}"
auth.token = "${FRP_TOKEN}"
loginFailExit = true
webServer.addr = "127.0.0.1"
webServer.port = 7400

[[proxies]]
name = "http"
type = "tcp"
localIP = "127.0.0.1"
localPort = 7474
remotePort = 0
transport.useCompression = true

[[proxies]]
name = "bolt"
type = "tcp"
localIP = "127.0.0.1"
localPort = 7687
remotePort = 0
transport.useCompression = true
EOF

  nohup "./${frp_dir}/frpc" -c frpc.toml >frpc.log 2>&1 &
  frpc_pid=$!

  for i in $(seq 1 15); do
    sleep 2
    # Con loginFailExit, frpc termina si frps lo rechaza o no responde.
    kill -0 "$frpc_pid" 2>/dev/null || return 1
    puertos=$(curl -fsS http://127.0.0.1:7400/api/status 2>/dev/null | python3 -c '
import json, sys
estado = json.load(sys.stdin)
puertos = {
    p["name"].rsplit(".", 1)[-1]: p["remote_addr"].rsplit(":", 1)[-1]
    for p in estado.get("tcp", [])
    if p["status"] == "running"
}
print(puertos["http"], puertos["bolt"])
' 2>/dev/null) && break
    puertos=""
  done
  [ -n "$puertos" ] || return 1

  http_port="${puertos% *}"
  bolt_port="${puertos#* }"
  printf 'NEO4J_HTTP_URL=http://%s:%s\nNEO4J_BOLT_URL=bolt://%s:%s\n' \
    "$FRP_SERVER" "$http_port" "$FRP_SERVER" "$bolt_port"
}

if ! abrir_tunel; then
  [ -n "${frpc_pid:-}" ] && kill "$frpc_pid" 2>/dev/null
  tail -n 20 frpc.log 2>/dev/null >&2 || true
  echo "[AVISO] No se pudo contactar con el proxy frp; Neo4j Browser no será accesible desde fuera, pero la conexión Bolt local funciona."
fi
