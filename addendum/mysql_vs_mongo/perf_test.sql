-- -*- sql-product: mysql -*-

-- Adapted from http://bonesmoses.org/2016/07/15/pg-phriday-a-postgres-persepctive-on-mongodb/
-- and http://use-the-index-luke.com/blog/2011-07-30/mysql-row-generator#mysql_generator_code

CREATE DATABASE IF NOT EXISTS perf_test;

USE perf_test;

CREATE TABLE IF NOT EXISTS sensor_log (
  id            BIGINT NOT NULL PRIMARY KEY,
  location      TEXT NOT NULL,
  reading       INT NOT NULL,
  reading_date  TIMESTAMP NOT NULL
);

CREATE OR REPLACE VIEW generator_16
AS SELECT 0 n UNION ALL SELECT 1  UNION ALL SELECT 2  UNION ALL
   SELECT 3   UNION ALL SELECT 4  UNION ALL SELECT 5  UNION ALL
   SELECT 6   UNION ALL SELECT 7  UNION ALL SELECT 8  UNION ALL
   SELECT 9   UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL
   SELECT 12  UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL
   SELECT 15;

CREATE OR REPLACE VIEW generator_256
AS SELECT ( ( hi.n << 4 ) | lo.n ) AS n
     FROM generator_16 lo, generator_16 hi;

CREATE OR REPLACE VIEW generator_4k
AS SELECT ( ( hi.n << 8 ) | lo.n ) AS n
     FROM generator_256 lo, generator_16 hi;

CREATE OR REPLACE VIEW generator_64k
AS SELECT ( ( hi.n << 8 ) | lo.n ) AS n
     FROM generator_256 lo, generator_256 hi;

CREATE OR REPLACE VIEW generator_1m
AS SELECT ( ( hi.n << 16 ) | lo.n ) AS n
     FROM generator_64k lo, generator_16 hi;

-- Start hi res timing
SET profiling=1;

INSERT INTO sensor_log (id, location, reading, reading_date)
SELECT g.n, g.n % 1000, g.n % 100,
       CURRENT_DATE() - INTERVAL (g.n * 10) SECOND
  FROM generator_1m g;

-- 10.022 s

CREATE INDEX idx_sensor_log_date
    ON sensor_log (reading_date);

-- 2.789 s

UPDATE sensor_log
   SET reading = reading + 1
 WHERE reading_date >= CURRENT_DATE() - INTERVAL 8 DAY
   AND reading_date < CURRENT_DATE() - INTERVAL 7 DAY;

-- 0.00201975 s

DELETE FROM sensor_log
 WHERE reading_date >= CURRENT_DATE() - INTERVAL 9 DAY
   AND reading_date < CURRENT_DATE() - INTERVAL 8 DAY;

-- 0.01704775 s

SELECT COUNT(*) FROM sensor_log;

-- 7.08739600 s

SELECT *
  FROM sensor_log
 WHERE reading_date < CURRENT_DATE() - INTERVAL 2 WEEK
 ORDER BY reading_date ASC
 LIMIT 5
 OFFSET 20;

-- 0.00070475 s

-- Show hi res timing information
SHOW profiles;

DROP DATABASE perf_test;

-- +----------+-------------+--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
-- | Query_ID | Duration    | Query                                                                                                                                                                                                                                                                                                        |
-- +----------+-------------+--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
-- |       11 |  0.00049450 | show databases                                                                                                                                                                                                                                                                                               |
-- |       12 |  0.00029375 | show tables                                                                                                                                                                                                                                                                                                  |
-- |       13 |  0.00887575 | CREATE TABLE IF NOT EXISTS sensor_log (
--   id            BIGINT NOT NULL PRIMARY KEY,
--   location      TEXT NOT NULL,
--   reading       INT NOT NULL,
--   reading_date  TIMESTAMP NOT NULL
-- )                                                                                                                       |
-- |       14 |  0.00426550 | CREATE OR REPLACE VIEW generator_16
-- AS SELECT 0 n UNION ALL SELECT 1  UNION ALL SELECT 2  UNION ALL
--    SELECT 3   UNION ALL SELECT 4  UNION ALL SELECT 5  UNION ALL
--    SELECT 6   UNION ALL SELECT 7  UNION ALL SELECT 8  UNION ALL
--    SELECT 9   UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL
--    SELEC |
-- |       15 |  0.00210500 | CREATE OR REPLACE VIEW generator_256
-- AS SELECT ( ( hi.n << 4 ) | lo.n ) AS n
--      FROM generator_16 lo, generator_16 hi                                                                                                                                                                                      |
-- |       16 |  0.02889725 | CREATE OR REPLACE VIEW generator_4k
-- AS SELECT ( ( hi.n << 8 ) | lo.n ) AS n
--      FROM generator_256 lo, generator_16 hi                                                                                                                                                                                      |
-- |       17 |  0.00300500 | CREATE OR REPLACE VIEW generator_64k
-- AS SELECT ( ( hi.n << 8 ) | lo.n ) AS n
--      FROM generator_256 lo, generator_256 hi                                                                                                                                                                                    |
-- |       18 |  0.00357550 | CREATE OR REPLACE VIEW generator_1m
-- AS SELECT ( ( hi.n << 16 ) | lo.n ) AS n
--      FROM generator_64k lo, generator_16 hi                                                                                                                                                                                     |
-- |       19 |  0.00011400 | SET profiling=1                                                                                                                                                                                                                                                                                              |
-- |       20 | 10.87280750 | INSERT INTO sensor_log (id, location, reading, reading_date)
-- SELECT g.n, g.n % 1000, g.n % 100,
--        CURRENT_DATE() - INTERVAL (g.n * 10) SECOND
--   FROM generator_1m g                                                                                                                                              |
-- |       21 |  2.46924525 | CREATE INDEX idx_sensor_log_date
--     ON sensor_log (reading_date)                                                                                                                                                                                                                                            |
-- |       22 |  0.26496200 | UPDATE sensor_log
--    SET reading = reading + 1
--  WHERE reading_date >= CURRENT_DATE() - INTERVAL 8 DAY
--    AND reading_date < CURRENT_DATE() - INTERVAL 7 DAY                                                                                                                                                                    |
-- |       23 |  0.18579875 | DELETE FROM sensor_log
--  WHERE reading_date >= CURRENT_DATE() - INTERVAL 9 DAY
--    AND reading_date < CURRENT_DATE() - INTERVAL 8 DAY                                                                                                                                                                                            |
-- |       24 |  2.31224975 | SELECT COUNT(*) FROM sensor_log                                                                                                                                                                                                                                                                              |
-- |       25 |  0.00086700 | SELECT *
--   FROM sensor_log
--  WHERE reading_date < CURRENT_DATE() - INTERVAL 2 WEEK
--  ORDER BY reading_date ASC
--  LIMIT 5
--  OFFSET 20                                                                                                                                                                                      |
-- +----------+-------------+--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
-- 15 rows in set, 1 warning (0.00 sec)

-- select QUERY_ID, FORMAT(sum(DURATION),6) AS DURATION FROM INFORMATION_SCHEMA.PROFILING GROUP BY QUERY_ID;
