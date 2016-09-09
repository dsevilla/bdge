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
       NOW() - INTERVAL (g.n * 10) HOUR
  FROM generator_1m g;

CREATE INDEX idx_sensor_log_date
    ON sensor_log (reading_date);

UPDATE sensor_log
   SET reading = reading + 1
 WHERE reading_date >= NOW() - INTERVAL 8 DAY
   AND reading_date < NOW() - INTERVAL 7 DAY;

DELETE FROM sensor_log
   SET reading = reading + 1
 WHERE reading_date >= NOW() - INTERVAL 9 DAY
   AND reading_date < NOW() - INTERVAL 8 DAY;

SELECT COUNT(*) FROM sensor_log;

SELECT *
  FROM sensor_log
 WHERE reading_date < NOW() - INTERVAL 2 WEEK
 ORDER BY reading_date ASC
 LIMIT 5
 OFFSET 20;

-- Show hi res timing information
SHOW profiles;

DROP DATABASE perf_test;
