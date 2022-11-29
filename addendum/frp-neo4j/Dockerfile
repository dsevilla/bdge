FROM nginx:latest

COPY default.conf /etc/nginx/conf.d/
COPY 99-execute-serve-frp-neo4j-conf.sh /docker-entrypoint.d/

RUN chmod a+x /docker-entrypoint.d/execute-serve-frp-neo4j-conf.sh

RUN apt-get update && apt-get install python3

RUN wget https://github.com/fatedier/frp/releases/download/v0.38.0/frp_0.38.0_linux_amd64.tar.gz && \
    tar zxvf frp_*


EXPOSE 8080
