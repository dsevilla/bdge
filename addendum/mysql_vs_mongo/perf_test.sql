-- Esquema MySQL 8: la carga y los seis tiempos los mide benchmark.py
CREATE TABLE sensor_log (
  id BIGINT NOT NULL PRIMARY KEY,
  location INT NOT NULL,
  reading INT NOT NULL,
  reading_date DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;
