import csv
import sys
import os
from datetime import datetime
from typing import Any, TextIO

try:
    # I import from the same directory when running in a notebook
    from csv_schema_utils import ( # type: ignore
        CSVToPythonConverterFunction)
except ImportError:
    # If running as a script, adjust the path to import from the parent directory
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'csv_schema')))
    from csv_schema.csv_schema_utils import CSVToPythonConverterFunction

# Import the CollectionProtocol from the separate module.
from mongo_collection_protocol import CollectionProtocol

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


# Example usage:
# from pymongo import MongoClient
# client = MongoClient('mongodb://localhost:27017/')
# db = client.mydatabase
# collection = db.mycollection
#
# # Infer schema from CSV file (returns OrderedDict to preserve column order):
# with open('data.csv', 'r', encoding='utf-8') as f:
#     schema = infer_csv_schema(f, sample_rows=5000)
#     print("Inferred schema:", schema)
#     # Output example: OrderedDict([('name', <class 'str'>), ('age', <class 'int'>), ('salary', <class 'float'>), ('birth_date', <class 'datetime.datetime'>)])
#     # Note: All types are basic types without unions/optional
#
# # Create a dataclass from the schema:
# with open('data.csv', 'r', encoding='utf-8') as f:
#     schema, RecordClass = infer_csv_schema_with_dataclass(f, sample_rows=5000, class_name="PersonRecord")
#     print("Generated dataclass:", RecordClass)
#     # You can now use RecordClass to create typed objects:
#     # record = RecordClass(name="John", age=25, salary=50000.0, birth_date=datetime(1998, 1, 1))
#     # Note: All fields use basic types, missing values should be handled at data processing level
#
# # Or create dataclass separately:
# with open('data.csv', 'r', encoding='utf-8') as f:
#     schema = infer_csv_schema(f)
#     RecordClass = create_dataclass_from_schema(schema, "MyRecord")
#
# # Using csv_to_mongo (automatic conversion):
# with open('data.csv', 'r', encoding='utf-8') as f:
#     csv_to_mongo(f, collection)
#
# # Using csv_to_mongo_with_converters (custom converters):
# converters = {
#     'age': CSVConverters.int_converter(),  # Uses default 0
#     'optional_age': CSVConverters.int_converter(None),  # Uses None as default
#     'salary': CSVConverters.float_converter(),  # Uses default 0.0
#     'optional_salary': CSVConverters.float_converter(None),  # Uses None as default
#     'birth_date': CSVConverters.date_converter(),  # Use default None
#     'is_active': CSVConverters.bool_converter(),  # Uses default False
#     'optional_flag': CSVConverters.bool_converter(None),  # Uses None as default
#     'name': CSVConverters.upper_converter(""),  # Use empty string as default
#     'email': CSVConverters.strip_converter(),  # Use default None
#     'score': CSVConverters.nullable_float_converter(),  # Use default None
#     # Custom lambda converter (also matches CSVToPythonConverterFunction type)
#     'category': lambda x: x.strip().title() if x else x,
# }
# with open('data.csv', 'r', encoding='utf-8') as f:
#     csv_to_mongo_with_converters(f, collection, converters)
#
# # Generate converters from inferred schema (simplified approach):
# with open('data.csv', 'r', encoding='utf-8') as f:
#     schema = infer_csv_schema(f)
#     converters = {}
#     for col, col_type in schema.items():
#         if col_type == int:
#             converters[col] = CSVConverters.int_converter()  # Uses default 0
#         elif col_type == float:
#             converters[col] = CSVConverters.float_converter()  # Uses default 0.0
#         elif col_type == bool:
#             converters[col] = CSVConverters.bool_converter()  # Uses default False
#         elif col_type == datetime:
#             converters[col] = CSVConverters.date_converter()  # Use default None
#         # str columns don't need converters (keep as-is)
#     csv_to_mongo_with_converters(f, collection, converters)
#
# Or with mock for testing:
# from io import StringIO
# csv_data = "name,age,date\nJohn,25,2023-01-01\nJane,30,2023-02-01"
# from test_csv_to_mongo import MockCollection
# mock_coll = MockCollection()
# csv_to_mongo(StringIO(csv_data), mock_coll)
# print(f"Inserted {len(mock_coll.documents)} documents")
