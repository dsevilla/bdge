FROM nginx:latest

COPY default.conf /etc/nginx/conf.d/
COPY serve-frp-neo4j-conf.py /
COPY 99-execute-serve-frp-neo4j-conf.sh /docker-entrypoint.d/
COPY frp_0.38.0_linux_amd64.tar.gz /

RUN chmod a+x /docker-entrypoint.d/99-execute-serve-frp-neo4j-conf.sh

RUN apt-get update -qq && apt-get install -y python3

RUN tar zxvf /frp_*

EXPOSE 8080
EXPOSE 8081-8141
