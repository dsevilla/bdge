import csv
from datetime import datetime
from collections.abc import Callable
from pymongo.collection import Collection
import sys

def csv_to_mongo(file: str, coll: Collection, batch_size: int = 5000) -> None:
    """
    Carga un fichero CSV en Mongo. file especifica el fichero y coll la colección
    dentro de la base de datos.

    Args:
        file: Ruta al archivo CSV
        coll: Colección de MongoDB donde insertar los datos
        batch_size: Número de documentos a insertar en cada lote (default: 5000)
    """
    # Convertir todos los elementos que se puedan a números
    def to_numeric(d: str) -> int | float | str:
        if not d or d.isspace():
            return ''

        # Quick check for numeric start
        d_stripped = d.strip()
        if not d_stripped:
            return ''

        # Check if it starts with a digit, sign, or decimal point
        first_char = d_stripped[0]
        if not (first_char.isdigit() or first_char in '+-.' or
                (len(d_stripped) > 1 and first_char in '+-' and d_stripped[1].isdigit())):
            return d_stripped

        # Try integer first (more common), then float
        try:
            # Handle potential whitespace and check for integer
            if '.' not in d_stripped and 'e' not in d_stripped.lower():
                v = int(d_stripped)
                return v if abs(v) <= sys.maxsize else d_stripped
            else:
                return float(d_stripped)
        except ValueError:
            return d_stripped

    def to_date(d: str) -> datetime | None:
        """To ISO Date. If this cannot be converted, return NULL (None)."""
        if not d or d.isspace():
            return None

        d_stripped = d.strip()
        if not d_stripped:
            return None

        # Common date formats to try
        date_formats = [
            "%Y-%m-%dT%H:%M:%S.%f",  # Original format
            "%Y-%m-%dT%H:%M:%S",     # Without microseconds
            "%Y-%m-%d %H:%M:%S",     # Space separated
            "%Y-%m-%d",              # Date only
            "%d/%m/%Y",              # European format
            "%m/%d/%Y",              # US format
        ]

        for fmt in date_formats:
            try:
                return datetime.strptime(d_stripped, fmt)
            except ValueError:
                continue
        return None

    coll.drop()

    with open(file, encoding='utf-8') as f:
        # La llamada csv.reader() crea un iterador sobre un fichero CSV
        reader = csv.reader(f, dialect='excel')

        # Se leen las columnas. Sus nombres se usarán para crear las diferentes columnas en la familia
        columns: list[str] = next(reader)

        # Las columnas que contienen 'Date' se interpretan como fechas
        func_to_cols: list[Callable[[str], str|int|float|datetime|None]] = \
            [to_date if 'date' in c.lower() else to_numeric for c in columns]

        # Process in batches to handle large files efficiently
        batch: list[dict[str, str | int | float | datetime | None]] = []
        for row in reader:
            # Process each row and convert values according to column types
            processed_row: dict[str, str | int | float | datetime | None] = {
                col: func(value)
                for col, func, value in zip(columns, func_to_cols, row)
            }
            batch.append(processed_row)

            # Insert batch when it reaches the specified size
            if len(batch) >= batch_size:
                if batch:  # Only insert if batch is not empty
                    coll.insert_many(batch)
                batch = []

        # Insert remaining documents in the last batch
        if batch:
            coll.insert_many(batch)
