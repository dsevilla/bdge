FROM nginx:latest

COPY default.conf /etc/nginx/conf.d/
COPY serve-frp-neo4j-conf.py /
COPY frps.ini /
COPY 90-execute-frps.sh /docker-entrypoint.d/
COPY 99-execute-serve-frp-neo4j-conf.sh /docker-entrypoint.d/

RUN chmod a+x /docker-entrypoint.d/90-execute-frps.sh
RUN chmod a+x /docker-entrypoint.d/99-execute-serve-frp-neo4j-conf.sh

RUN apt-get update -qq && apt-get install -y python3 wget

RUN wget https://github.com/fatedier/frp/releases/download/v0.52.3/frp_0.52.3_linux_amd64.tar.gz

RUN tar zxvf /frp_*

EXPOSE 8080
EXPOSE 8081-8181
