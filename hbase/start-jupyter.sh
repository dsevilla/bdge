#! /bin/sh
docker run --rm -it --user root -e 'GRANT_SUDO=yes' -e "NB_UID=$(id -u)" -p 8888:8888 --link master.krejcmat.com:hbase -v `pwd`/..:/home/jovyan/bdge jupyter/all-spark-notebook start-notebook.sh --NotebookApp.token=''
