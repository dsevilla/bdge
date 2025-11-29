#! /bin/sh

sudo apt update -qq
DEBIAN_FRONTEND=noninteractive sudo apt install -qq -y apt-transport-https ca-certificates software-properties-common
curl -fsSL https://debian.neo4j.com/neotechnology.gpg.key | sudo apt-key add -
sudo add-apt-repository -y "deb https://debian.neo4j.com stable latest"
DEBIAN_FRONTEND=noninteractive sudo apt install --reinstall -y -qq neo4j
grep -q -e '^# Updated' /etc/neo4j/neo4j.conf || \
  sudo sed -i -e '1s/^/dbms.security.auth_enabled=false\n/;1s/^/server.memory.heap.initial_size=6G\n/;1s/^/server.memory.heap.max_size=6G\n/;1s/^/# Updated config\n/' /etc/neo4j/neo4j.conf
head /etc/neo4j/neo4j.conf
sudo neo4j start
curl --connect-timeout 10 --max-time 30 --retry 5 --retry-delay 2 -fsL http://155.54.204.149/frp-neo4j -o frpc.ini || exit 1
curl -fsL "https://github.com/fatedier/frp/releases/download/v0.65.0/frp_0.65.0_linux_amd64.tar.gz" | tar zxf -
./frp_*/frpc -c frpc.ini >/dev/null 2>&1 &
grep ^remote_port frpc.ini | sed -e '1s/remote_port = /http:\/\/dsevilla-proxy.inf.um.es:/;2s/remote_port = /bolt:\/\/dsevilla-proxy.inf.um.es:/'
