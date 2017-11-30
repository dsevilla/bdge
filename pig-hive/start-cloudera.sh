#! /bin/sh

docker run --hostname=quickstart.cloudera --privileged=true -t -i -p8888:8888 -p80:80 -p7180:7180 -p9090:9090 cloudera/quickstart ${1-/usr/bin/docker-quickstart}
