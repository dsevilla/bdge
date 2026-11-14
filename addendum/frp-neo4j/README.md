# Túneles frp para Neo4j en Colab

En Colab, Neo4j se ejecuta dentro de la máquina virtual del cuaderno y el
cuaderno se conecta a él por Bolt en `localhost`. Para abrir además Neo4j
Browser desde el navegador del alumno, `setup-neo4j-colab.sh` abre un túnel
[frp](https://github.com/fatedier/frp) hasta `dsevilla-proxy.inf.um.es`.

## Servidor

```sh
docker compose up -d
```

Arranca la imagen oficial `ghcr.io/fatedier/frps` con `frps.toml`:

- escucha a los clientes en el puerto 8080;
- asigna a cada túnel un puerto libre del rango 8082-8181 (50 sesiones con dos
  puertos cada una);
- limita cada sesión a dos puertos.

El cortafuegos del anfitrión debe dejar pasar el 8080 y el rango 8082-8181.

## Cliente (Colab)

`setup-neo4j-colab.sh` instala Neo4j con autenticación y una contraseña
aleatoria de seis caracteres para el usuario `neo4j`, y espera a que acepte
conexiones Bolt. Con el túnel abierto, cualquiera que recorra los puertos del
servidor llegaría a la base, así que no se arranca sin contraseña. El script
imprime `NEO4J_PASSWORD=<contraseña>`; los cuadernos la guardan en la variable
de entorno `NEO4J_PASSWORD`, la usan en `basic_auth` y se la muestran al alumno,
que la necesita para entrar en Neo4j Browser.

Luego descarga `frpc` y lo arranca con dos proxies TCP (7474 y 7687) que piden
`remotePort = 0`: cada sesión recibe así puertos distintos sin que nadie los
reparta. El script lee los puertos asignados en la API local de `frpc`
(`127.0.0.1:7400/api/status`) e imprime al final la URL HTTP de Neo4j Browser
y la URL Bolt pública (`NEO4J_HTTP_URL=...` y `NEO4J_BOLT_URL=...`). Si el
túnel no se abre, imprime una línea `[AVISO]` y
la conexión local por Bolt sigue funcionando.

## Actualizar frp

La versión aparece en dos sitios, `docker-compose.yml` (etiqueta de la imagen)
y `FRP_VERSION` en `setup-neo4j-colab.sh`. Se actualiza primero el servidor y
después el cliente.

## Kubernetes

La configuración compartida por Docker y Kubernetes está en `k8s/base/frps.toml`.
La base describe el servicio; `k8s/homelab` lo fija al nodo
`dsevilla-proxy` mediante `kubernetes.io/hostname`. Como usa la red del
anfitrión, los clientes de Colab necesitan que frps escuche precisamente
en ese nodo. Si no está disponible, el pod queda pendiente.
Consulta los contextos con `kubectl config get-contexts`
y usa el fichero de acceso adecuado mediante `KUBECONFIG` si es necesario:

```sh
export KUBECONFIG=~/svn/kubernetes/kubeconfig
make k8s-diff KUBE_CONTEXT=homelab
make k8s-apply KUBE_CONTEXT=homelab
make k8s-status KUBE_CONTEXT=homelab
make k8s-logs KUBE_CONTEXT=homelab
```

Comprueba el nombre real del contexto antes de usarlo. `diff` muestra cambios;
`apply` los aplica y espera al arranque. Como frps usa la red del nodo y
estrategia `Recreate`, una actualización interrumpe brevemente los túneles.
Para otro clúster, crea un overlay adaptado y pásalo con `K8S_DIR=...`.

`make k8s-delete KUBE_CONTEXT=homelab` elimina el Deployment y detiene los
túneles; conserva el namespace y el ConfigMap.
