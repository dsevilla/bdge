FROM nginx:latest

COPY default.conf /etc/nginx/conf.d/

RUN apt-get update && apt-get install python3

RUN wget https://github.com/fatedier/frp/releases/download/v0.38.0/frp_0.38.0_linux_amd64.tar.gz && \
    tar zxvf frp_*


EXPOSE 8080
