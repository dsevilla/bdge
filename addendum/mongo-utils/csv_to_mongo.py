import csv
from datetime import datetime
from collections.abc import Callable
from pymongo.collection import Collection
import sys

def csv_to_mongo(file: str, coll: Collection) -> None:
    """
    Carga un fichero CSV en Mongo. file especifica el fichero y coll la colección
    dentro de la base de datos.
    """
    # Convertir todos los elementos que se puedan a números
    def to_numeric(d: str) -> int | float | str:
        if len(d) == 0:
            return ''
        if not ((d[0] >= '0' and d[0] <= '9') or d[0] == '-' or d[0] == '+' or d[0]=='.'):
            return d
        try:
            v = int(d)
            return v if abs(v) <= sys.maxsize else d # Ensure number is inside MongoDB max number range
        except ValueError:
            try:
                return float(d)
            except ValueError:
                return d

    def to_date(d: str) -> datetime | None:
        """To ISO Date. If this cannot be converted, return NULL (None)."""
        try:
            return datetime.strptime(d, "%Y-%m-%dT%H:%M:%S.%f")
        except ValueError:
            return None

    coll.drop()

    with open(file, encoding='utf-8') as f:
        # La llamada csv.reader() crea un iterador sobre un fichero CSV
        reader = csv.reader(f, dialect='excel')

        # Se leen las columnas. Sus nombres se usarán para crear las diferentes columnas en la familia
        columns: list[str] = next(reader)

        # Las columnas que contienen 'Date' se interpretan como fechas
        func_to_cols: list[Callable[[str], str|int|float|datetime|None]] = \
            list(map(lambda c: to_date if 'date' in c.lower() else to_numeric, columns))

        coll.insert_many(
            map(lambda row: {k: v for k in columns for v in [func(e) for (func,e) in zip(func_to_cols, row)]},
            reader))
