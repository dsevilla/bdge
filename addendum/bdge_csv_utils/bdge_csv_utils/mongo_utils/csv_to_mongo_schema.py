import csv
from datetime import datetime
from typing import Any, TextIO
from csv_schema.csv_schema_utils import CSVToPythonConverterFunction

# Import the CollectionProtocol from the separate module.
from .mongo_collection_protocol import CollectionProtocol

# Type aliases
DB_Types = str | int | float | datetime | None

def csv_to_mongo_with_converters(
    file_obj: TextIO,
    coll: CollectionProtocol,
    converters: dict[str, CSVToPythonConverterFunction],
) -> None:
    """
    Carga un fichero CSV en Mongo usando convertidores personalizados para cada columna.

    Args:
        file_obj: Objeto de archivo abierto (puede ser un archivo real o StringIO/BytesIO)
        coll: Objeto que implementa CollectionProtocol (métodos drop() e insert_many()).
              Se supone que la colección está vacía. Sólo se insertarán nuevos datos.
              Si no existe se crea.
        converters: Diccionario que mapea nombres de columna a funciones de conversión de tipo CSVToPythonConverterFunction
    """
    # Use DictReader to directly get dictionaries with column names as keys
    reader: csv.DictReader[str] = csv.DictReader(file_obj, dialect='excel')

    # Process in batches to handle large files efficiently
    # As the insert_many() method accepts an iterable, we can process the CSV in line,
    # read, convert the values, and insert them into the insert_many() method.

    def process_row(row: dict[str, Any]) -> dict[str, Any]:
        """Apply converters to a single row."""
        return {col: converters[col](value) if col in converters else value
                for col, value in row.items()}

    coll.insert_many(map(process_row, reader), ordered=False)
