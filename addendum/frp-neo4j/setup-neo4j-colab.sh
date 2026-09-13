#! /bin/sh

sudo apt update -qq
DEBIAN_FRONTEND=noninteractive sudo apt install -qq -y apt-transport-https ca-certificates software-properties-common apt-utils default-jre-headless
curl -fsSL https://debian.neo4j.com/neotechnology.gpg.key | sudo apt-key add -
sudo add-apt-repository -y "deb https://debian.neo4j.com stable latest"
DEBIAN_FRONTEND=noninteractive sudo apt install --reinstall -y -qq neo4j
grep -q -e '^# Updated' /etc/neo4j/neo4j.conf || \
  sudo sed -i -e '1s/^/dbms.security.auth_enabled=false\n/;1s/^/server.memory.heap.initial_size=6G\n/;1s/^/server.memory.heap.max_size=6G\n/;1s/^/# Updated config\n/' /etc/neo4j/neo4j.conf
head /etc/neo4j/neo4j.conf

sudo neo4j start || echo "[AVISO] 'neo4j start' devolvió un código de error; se comprobará igualmente si Bolt llega a responder."

echo "Esperando a que Neo4j acepte conexiones Bolt en localhost:7687..."
ready=0
for i in $(seq 1 60); do
  if cypher-shell -a bolt://localhost:7687 -u neo4j -p "" "RETURN 1;" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [ "$ready" -ne 1 ]; then
  echo "[ERROR] Neo4j no respondió por Bolt tras esperar 120s. Diagnóstico:" >&2
  sudo neo4j status || true
  sudo tail -n 100 /var/log/neo4j/neo4j.log 2>/dev/null || true
  sudo tail -n 100 /var/log/neo4j/debug.log 2>/dev/null || true
  exit 1
fi
echo "Neo4j está aceptando conexiones Bolt."

# El túnel frp sólo sirve para abrir Neo4j Browser desde fuera de la máquina
# de Colab; si el proxy no es alcanzable (por ejemplo, desde un runner de
# GitLab CI ajeno a la red de la UM) no debe hacer fallar todo el script,
# porque la conexión local por Bolt ya ha quedado confirmada arriba.
if curl --connect-timeout 10 --max-time 30 --retry 5 --retry-delay 2 -fsL http://dsevilla-proxy.inf.um.es:81/frp-neo4j -o frpc.ini; then
  curl -fsL "https://github.com/fatedier/frp/releases/download/v0.65.0/frp_0.65.0_linux_amd64.tar.gz" | tar zxf -
  ./frp_*/frpc -c frpc.ini >/dev/null 2>&1 &
  grep ^remote_port frpc.ini | sed -e '1s/remote_port = /http:\/\/dsevilla-proxy.inf.um.es:/;2s/remote_port = /bolt:\/\/dsevilla-proxy.inf.um.es:/'
else
  echo "[AVISO] No se pudo contactar con el proxy frp; Neo4j Browser no será accesible desde fuera, pero la conexión Bolt local funciona." >&2
fi
