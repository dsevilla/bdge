import csv
from datetime import datetime
from typing import Protocol, Any, TextIO
from collections.abc import Callable, Iterable
import sys

# Type aliases
DB_Types = str | int | float | datetime | None

class CollectionProtocol(Protocol):
    """Protocol defining the minimal interface needed for a MongoDB-like collection."""

    def insert_many(self, documents: Iterable[dict[str, Any]], ordered: bool = True) -> Any | None:
        """Insert multiple documents into the collection."""
        ...

def csv_to_mongo(file_obj: TextIO, coll: CollectionProtocol) -> dict[str,Any]:
    """
    Carga un fichero CSV en Mongo. file_obj especifica el objeto de archivo y coll la colección
    dentro de la base de datos.

    Args:
        file_obj: Objeto de archivo abierto (puede ser un archivo real o StringIO/BytesIO)
        coll: Objeto que implementa CollectionProtocol (métodos drop() e insert_many()).
              Se supone que la colección está vacía. Sólo se insertarán nuevos datos.
              Si no existe se crea.
    """
    # Convertir todos los elementos que se puedan a números
    def to_numeric(d: str) -> int | float | str:
        if not d or d.isspace():
            return ''

        # Quick check for numeric start
        d_stripped: str = d.strip()
        if not d_stripped:
            return ''

        # Check if it starts with a digit, sign, or decimal point
        first_char: str = d_stripped[0]
        if not (first_char.isdigit() or first_char in '+-.' or
                (len(d_stripped) > 1 and first_char in '+-' and d_stripped[1].isdigit()) or
                (len(d_stripped) > 2 and first_char in '+-' and d_stripped[1] == '.' and d_stripped[2].isdigit())):
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
        date_formats: list[str] = [
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

    result: Any | None = None

    try:
        # La llamada csv.reader() crea un iterador sobre un fichero CSV
        reader = csv.reader(file_obj, dialect='excel')

        # Se leen las columnas. Sus nombres se usarán para crear las diferentes columnas en la familia
        columns: list[str] = next(reader)

        # Las columnas que contienen 'Date' se interpretan como fechas
        func_to_cols: list[Callable[[str], DB_Types]] = \
            [to_date if 'date' in c.lower() else to_numeric for c in columns]

        # Process in batches to handle large files efficiently
        # As the insert_many() method accepts an iterable, we can process the CSV in line,
        # read, convert the values, and insert them into te insert_many() method.

        def process_row(row: list[str]) -> dict[str, DB_Types]:
            """Convert a single row to a dictionary with appropriate types."""
            return {col: func(value) for col, func, value in zip(columns, func_to_cols, row)}

        result = coll.insert_many(map(process_row, reader), ordered=False)

    except Exception as e:
        return {
            "result": "error",
            "error": str(e),
            "result_insert_many": result
        }

    return {
        "result"    : "success",
        "result_insert_many": result
        }
