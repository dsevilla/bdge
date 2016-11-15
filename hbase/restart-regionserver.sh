#! /bin/sh
while true ; do
	ns=`curl -s http://localhost:60010/jmx | grep numRegionServers | tr -cd [0-9]`
	test -z "$ns" || test $ns -gt 0 || ~/hbase/bin/hbase-daemon.sh start regionserver 
	sleep 30 
done