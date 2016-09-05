-- http://bl.ocks.org/mbostock/4180634
-- https://en.wikipedia.org/wiki/ISO_3166-1_numeric
-- http://blog.cloudera.com/blog/2009/06/analyzing-apache-logs-with-pig/

REGISTER 'pig/lib/piggybank.jar';
DEFINE ApacheCommonLogLoader org.apache.pig.piggybank.storage.apachelog.CombinedLogLoader();
DEFINE CSVExcelStorage org.apache.pig.piggybank.storage.CSVExcelStorage();
DEFINE POW org.apache.pig.piggybank.evaluation.math.POW;
DEFINE EXP org.apache.pig.piggybank.evaluation.math.EXP;

REGISTER '/vagrant/es.um.bdge.pig-0.0.1-SNAPSHOT.jar';
DEFINE BagDistinct es.um.bdge.pig.BagDistinct;

Logs = LOAD 'access.log' USING ApacheCommonLogLoader AS (jaddr, jlogname, juser, jdt, jmethod, juri, jproto, jstatus, jbytes);

ILLUSTRATE Logs;

-- store Logs into 'output.json' using JsonStorage();
GEO = LOAD 'GeoLite2-Country-Blocks-IPv4.csv' USING CSVExcelStorage AS (network,geoname_id);
GEO_IPs = FOREACH GEO GENERATE *, REGEX_EXTRACT_ALL(network, '(.*)\\.(.*)\\.(.*)\\.(.*)/(.*)') AS (T: (d1,d2,d3,d4,n));

GEO_IPs = FOREACH GEO_IPs GENERATE *,
        (long)T.d1 * 16777216L + (long)T.d2 * 65536L + (long)T.d3*256 + (long)T.d4 AS ipl;
-- GEO_IPs = FOREACH GEO_IPs GENERATE *, (long)(ipl + POW(2,32-T.n) - 1) AS ipm;


IPs = FOREACH Logs GENERATE *,REGEX_EXTRACT_ALL(jaddr, '(.*?)\\.(.*?)\\.(.*?)\\.(.*?)') AS (T: (d1,d2,d3,d4));
IPs = FOREACH IPs GENERATE *,
        (long)T.d1 * 16777216L + (long)T.d2 * 65536L + (long)T.d3*256 + (long)T.d4 AS ipv;

IPg = GROUP IPs BY ipv;
IPg = FOREACH IPg GENERATE *, group AS ipv, COUNT ($1) AS count;

-- Generar el Bag que va a guardar todas las posibles redes a partir de esta IP
IPg = FOREACH IPg GENERATE *, {
        (ipv%2 == 0 ? 0 : (long)(ipv / 2) * 2), -- /31
        (ipv%4 == 0 ? 0 : (long)(ipv / 4) * 4), -- /30
        (ipv%8 == 0 ? 0 : (long)(ipv / 8) * 8), -- /29
        (ipv%16 == 0 ? 0 : (long)(ipv / 16) * 16), -- /28
        (ipv%32 == 0 ? 0 : (long)(ipv / 32) * 32), -- /27
        (ipv%64 == 0 ? 0 : (long)(ipv / 64) * 64), -- /26
        (ipv%128 == 0 ? 0 : (long)(ipv / 128) * 128), -- /25
        (ipv%256 == 0 ? 0 : (long)(ipv / 256) * 256), -- /24
        (ipv%512 == 0 ? 0 : (long)(ipv / 512) * 512), -- /23
        (ipv%1024 == 0 ? 0 : (long)(ipv / 1024) * 1024), -- /22
        (ipv%2048 == 0 ? 0 : (long)(ipv / 2048) * 2048), -- /21
        (ipv%4096 == 0 ? 0 : (long)(ipv / 4096) * 4096), -- /20
        (ipv%8192 == 0 ? 0 : (long)(ipv / 8192) * 8192), -- /19
        (ipv%16384L == 0 ? 0 : (long)(ipv / 16384L) * 16384L), -- /18
        (ipv%32768L == 0 ? 0 : (long)(ipv / 32768L) * 32768L), -- /17
        (ipv%65536L == 0 ? 0 : (long)(ipv / 65536L) * 65536L), -- /16
        (ipv%131072L == 0 ? 0 : (long)(ipv / 131072L) * 131072L), -- /15
        (ipv%262144L == 0 ? 0 : (long)(ipv / 262144L) * 262144L), -- /14
        (ipv%524288L == 0 ? 0 : (long)(ipv / 524288L) * 524288L), -- /13
        (ipv%1048576L == 0 ? 0 : (long)(ipv / 1048576L) * 1048576L), -- /12
        (ipv%2097152L == 0 ? 0 : (long)(ipv / 2097152L) * 2097152L), -- /11
        (ipv%4194304L == 0 ? 0 : (long)(ipv / 4194304L) * 4194304L), -- /10
        (ipv%8388608L == 0 ? 0 : (long)(ipv / 8388608L) * 8388608L), -- /9
        (ipv%16777216L == 0 ? 0 : (long)(ipv / 16777216L) * 16777216L), -- /8
        (ipv%33554432L == 0 ? 0 : (long)(ipv / 33554432L) * 33554432L) -- /7
} AS ipBag;

IPn = FOREACH IPg GENERATE *, FLATTEN(BagDistinct(ipBag)) AS ipExp;
IPn = FILTER IPn BY ipExp > 0;

Result = JOIN IPn BY ipExp, GEO_IPs BY ipl;
Result = FILTER Result BY
        (long)((long)(IPn::ipv / POW(2,32-GEO_IPs::T.n)) * POW(2,32-GEO_IPs::T.n)) == GEO_IPs::ipl;

-- IP_loc = FOREACH IPs { Q = FILTER GEO_IPs BY ipm > ipv; Q2 = LIMIT Q 1; GENERATE ipv,FLATTEN(Q2); };

-- Q = FILTER GEO_IPs BY ipm > (long)2637637392L;
-- R = LIMIT Q 1;
