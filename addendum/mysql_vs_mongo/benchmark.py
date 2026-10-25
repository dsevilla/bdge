#!/usr/bin/env python3
"""Seis operaciones completas en servidores dedicados; tiempos del mismo cliente."""
from __future__ import annotations

import csv
import json
import os
import platform
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from importlib.metadata import version
from pathlib import Path
from statistics import median
from time import perf_counter
from typing import Any

import pymysql
from pymongo import MongoClient, WriteConcern
from pymongo.collection import Collection
from pymysql.connections import Connection

ROOT: Path = Path(__file__).resolve().parent
BASE_DATE: datetime = datetime(2026, 1, 1)
OPERATIONS: tuple[str, ...] = ("Fill", "Index", "Update", "Delete", "Count", "Interval")
LABELS: tuple[str, ...] = ("Carga", "Índice", "Actualización", "Borrado", "Recuento", "Intervalo")
BATCH_SIZE: int = 5000


def measure(action: Callable[[], Any]) -> tuple[float, Any]:
    start: float = perf_counter()
    result: Any = action()
    return perf_counter() - start, result


def query(connection: Connection, sql: str, parameters: tuple[Any, ...] = ()) -> Any:
    cursor: Any
    with connection.cursor() as cursor:
        cursor.execute(sql, parameters)
        result: Any = cursor.fetchall() if cursor.description else cursor.rowcount
    return result


def mysql_run(connection: Connection, rows: list[tuple[int, int, int, datetime]]) -> tuple[dict[str, float], dict[str, Any]]:
    query(connection, "DROP TABLE IF EXISTS sensor_log")
    query(connection, (ROOT / "perf_test.sql").read_text())
    times: dict[str, float] = {}
    checks: dict[str, Any] = {}
    ignored: Any

    def fill() -> int:
        cursor: Any
        with connection.cursor() as cursor:
            for offset in range(0, len(rows), BATCH_SIZE):
                cursor.executemany(
                    "INSERT INTO sensor_log (id, location, reading, reading_date) VALUES (%s,%s,%s,%s)",
                    rows[offset:offset + BATCH_SIZE])
                connection.commit()
        return len(rows)

    times["Fill"], checks["inserted"] = measure(fill)
    checks["initial_count"] = query(connection, "SELECT COUNT(*) FROM sensor_log")[0][0]
    times["Index"], ignored = measure(lambda: query(connection, "CREATE INDEX idx_date ON sensor_log (reading_date)"))

    def update() -> int:
        affected: int = query(connection,
            "UPDATE sensor_log SET reading = reading + 1 WHERE reading_date >= %s AND reading_date < %s",
            (BASE_DATE - timedelta(days=8), BASE_DATE - timedelta(days=7)))
        connection.commit()
        return affected

    times["Update"], checks["updated"] = measure(update)

    def delete() -> int:
        affected: int = query(connection,
            "DELETE FROM sensor_log WHERE reading_date >= %s AND reading_date < %s",
            (BASE_DATE - timedelta(days=9), BASE_DATE - timedelta(days=8)))
        connection.commit()
        return affected

    times["Delete"], checks["deleted"] = measure(delete)
    count_result: Any
    times["Count"], count_result = measure(lambda: query(connection, "SELECT COUNT(*) FROM sensor_log"))
    checks["remaining"] = count_result[0][0]
    interval_result: Any
    times["Interval"], interval_result = measure(lambda: query(connection,
        "SELECT id, location, reading, reading_date FROM sensor_log WHERE reading_date < %s ORDER BY reading_date ASC LIMIT 5 OFFSET 20",
        (BASE_DATE - timedelta(days=14),)))
    checks["interval"] = [[row[0], row[1], row[2], row[3].isoformat()] for row in interval_result]
    checks["reading_sum"] = int(query(connection, "SELECT SUM(reading) FROM sensor_log")[0][0])
    connection.commit()
    return times, checks


def mongo_run(collection: Collection, documents: list[dict[str, Any]]) -> tuple[dict[str, float], dict[str, Any]]:
    collection.drop()
    times: dict[str, float] = {}
    checks: dict[str, Any] = {}
    ignored: Any

    def fill() -> int:
        for offset in range(0, len(documents), BATCH_SIZE):
            collection.insert_many(documents[offset:offset + BATCH_SIZE], ordered=True)
        return len(documents)

    times["Fill"], checks["inserted"] = measure(fill)
    checks["initial_count"] = collection.count_documents({})
    times["Index"], ignored = measure(lambda: collection.create_index("reading_date", name="idx_date"))
    update_result: Any
    times["Update"], update_result = measure(lambda: collection.update_many(
        {"reading_date": {"$gte": BASE_DATE - timedelta(days=8), "$lt": BASE_DATE - timedelta(days=7)}},
        {"$inc": {"reading": 1}}))
    checks["updated"] = update_result.modified_count
    delete_result: Any
    times["Delete"], delete_result = measure(lambda: collection.delete_many(
        {"reading_date": {"$gte": BASE_DATE - timedelta(days=9), "$lt": BASE_DATE - timedelta(days=8)}}))
    checks["deleted"] = delete_result.deleted_count
    times["Count"], checks["remaining"] = measure(lambda: collection.count_documents({}))
    interval_result: Any
    # list() recibe los cinco documentos dentro del cronómetro
    times["Interval"], interval_result = measure(lambda: list(collection.find(
        {"reading_date": {"$lt": BASE_DATE - timedelta(days=14)}}).sort("reading_date", 1).skip(20).limit(5)))
    checks["interval"] = [[doc["_id"], doc["location"], doc["reading"], doc["reading_date"].isoformat()] for doc in interval_result]
    total: list[dict[str, Any]] = list(collection.aggregate([{"$group": {"_id": None, "total": {"$sum": "$reading"}}}]))
    checks["reading_sum"] = total[0]["total"]
    return times, checks


def plot(report: dict[str, Any], output: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    figure: Any
    axis: Any
    figure, axis = plt.subplots(figsize=(12, 5.1), layout="constrained")
    positions: list[int] = list(range(len(OPERATIONS)))
    for engine, shift, color in (("MySQL", -0.19, "#c98b00"), ("MongoDB", 0.19, "#a9251a")):
        samples: list[list[float]] = [[run[operation] for run in report["samples"][engine]] for operation in OPERATIONS]
        medians: list[float] = [median(values) for values in samples]
        errors: list[list[float]] = [[middle - min(values) for middle, values in zip(medians, samples)],
                                    [max(values) - middle for middle, values in zip(medians, samples)]]
        axis.bar([position + shift for position in positions], medians, width=0.36,
                 label=engine, color=color, yerr=errors, capsize=4)
    axis.set_yscale("log")
    axis.set_ylabel("Tiempo completo (s), escala logarítmica")
    axis.set_xticks(positions, LABELS)
    axis.legend()
    axis.grid(axis="y", alpha=0.25)
    axis.set_axisbelow(True)
    axis.set_title(f'{report["rows"]:,} registros · mediana y rango de {report["repeats"]} repeticiones\n'
                   f'MySQL {report["versions"]["MySQL"]} · MongoDB {report["versions"]["MongoDB"]}')
    figure.savefig(output, dpi=150)
    plt.close(figure)


def main() -> None:
    size: int = int(os.environ.get("BENCHMARK_ROWS", "1000000"))
    repeats: int = int(os.environ.get("BENCHMARK_REPEATS", "3"))
    if size < 130000 or repeats < 1:
        raise ValueError("Se requieren al menos 130000 registros y una repetición para cubrir todos los rangos")
    rows: list[tuple[int, int, int, datetime]] = [
        (number, number % 1000, number % 100, BASE_DATE - timedelta(seconds=number * 10))
        for number in range(1, size + 1)]
    documents: list[dict[str, Any]] = [
        {"_id": row[0], "location": row[1], "reading": row[2], "reading_date": row[3]} for row in rows]
    connection: Connection = pymysql.connect(
        host=os.environ.get("MYSQL_HOST", "127.0.0.1"), user="benchmark",
        password=os.environ["MYSQL_PASSWORD"], database="benchmark", charset="utf8mb4",
        autocommit=False, read_timeout=300, write_timeout=300)
    client: MongoClient = MongoClient(os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017"), serverSelectionTimeoutMS=10000)
    collection: Collection = client.benchmark.get_collection("sensor_log", write_concern=WriteConcern(w=1, j=True))
    samples: dict[str, list[dict[str, float]]] = {"MySQL": [], "MongoDB": []}
    validations: list[dict[str, Any]] = []
    try:
        query(connection, "SET SESSION time_zone = '+00:00'")
        versions: dict[str, str] = {"MySQL": query(connection, "SELECT VERSION()")[0][0],
            "MongoDB": client.server_info()["version"], "pymongo": version("pymongo"), "PyMySQL": version("PyMySQL")}
        durability: Any = query(connection, "SELECT @@innodb_flush_log_at_trx_commit, @@sync_binlog")
        assert durability == ((1, 1),), durability
        connection.commit()
        for repetition in range(repeats + 1):
            results: dict[str, tuple[dict[str, float], dict[str, Any]]] = {}
            order: tuple[str, str] = ("MySQL", "MongoDB") if repetition % 2 == 0 else ("MongoDB", "MySQL")
            for engine in order:
                print(f'{"Calentamiento" if repetition == 0 else f"Repetición {repetition}"}: {engine}', flush=True)
                results[engine] = mysql_run(connection, rows) if engine == "MySQL" else mongo_run(collection, documents)
                print(results[engine][0], flush=True)
            assert results["MySQL"][1] == results["MongoDB"][1], results
            check: dict[str, Any] = results["MySQL"][1]
            assert check["initial_count"] == size
            expected_update: int = sum(BASE_DATE - timedelta(days=8) <= row[3] < BASE_DATE - timedelta(days=7) for row in rows)
            expected_delete: int = sum(BASE_DATE - timedelta(days=9) <= row[3] < BASE_DATE - timedelta(days=8) for row in rows)
            assert check["updated"] == expected_update
            assert check["deleted"] == expected_delete
            assert check["remaining"] == size - expected_delete
            expected_rows: list[tuple[int, int, int, datetime]] = [row for row in reversed(rows) if row[3] < BASE_DATE - timedelta(days=14)][:25][20:]
            assert check["interval"] == [[row[0], row[1], row[2], row[3].isoformat()] for row in expected_rows]
            expected_sum: int = sum(row[2] + int(BASE_DATE - timedelta(days=8) <= row[3] < BASE_DATE - timedelta(days=7))
                for row in rows if not BASE_DATE - timedelta(days=9) <= row[3] < BASE_DATE - timedelta(days=8))
            assert check["reading_sum"] == expected_sum
            if repetition:
                for engine in order:
                    samples[engine].append(results[engine][0])
                validations.append(check)
        report: dict[str, Any] = {
            "measured_at_utc": datetime.now(timezone.utc).isoformat(), "rows": size,
            "repeats": repeats, "warmup_runs": 1, "batch_size": BATCH_SIZE, "unit": "s",
            "versions": versions, "python": platform.python_version(), "platform": platform.platform(),
            "limits_per_server": {"cpus": 2, "memory_bytes": 2147483648},
            "durability": {"MySQL": "commit por lote; innodb_flush_log_at_trx_commit=1; sync_binlog=1",
                "MongoDB": "w=1, j=true; atomicidad por documento; sin transacción multidocumento"},
            "samples": samples, "checks": validations,
            "scope": "Un nodo por producto, operaciones secuenciales; no mide escalabilidad ni iguala la atomicidad entre productos"}
        (ROOT / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        for engine, filename in (("MySQL", "mysql.csv"), ("MongoDB", "mongo.csv")):
            stream: Any
            with (ROOT / filename).open("w", newline="") as stream:
                writer: Any = csv.writer(stream, lineterminator="\n")
                writer.writerow(["query", "duration_s", "min_s", "max_s"])
                for operation in OPERATIONS:
                    values: list[float] = [run[operation] for run in samples[engine]]
                    writer.writerow([operation, median(values), min(values), max(values)])
        plot(report, ROOT / "benchmark.png")
    finally:
        connection.close()
        client.close()


if __name__ == "__main__":
    main()
