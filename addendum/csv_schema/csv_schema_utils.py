from collections.abc import Callable
import csv
from dataclasses import make_dataclass
from datetime import datetime
import sys
from collections import OrderedDict
from typing import Any, TextIO

# Type aliases
CSVToPythonConverterFunction = Callable[[str], Any | None]

class CSVConverters:
    """Collection of static methods for common CSV field conversions."""

    @staticmethod
    def int_converter(default_value: int | None = 0) -> CSVToPythonConverterFunction:
        """Return a converter function that converts string to integer, returns default_value if conversion fails."""
        def converter(value: str) -> int | None:
            try:
                return int(value.strip())
            except (ValueError, TypeError):
                return default_value
        return converter

    @staticmethod
    def float_converter(default_value: float | None = 0.0) -> CSVToPythonConverterFunction:
        """Return a converter function that converts string to float, returns default_value if conversion fails."""
        def converter(value: str) -> float | None:
            try:
                return float(value.strip())
            except (ValueError, TypeError):
                return default_value
        return converter

    @staticmethod
    def bool_converter(default_value: bool | None = False) -> CSVToPythonConverterFunction:
        """Return a converter function that converts string to boolean, returns default_value if conversion fails."""
        def converter(value: str) -> bool | None:
            cleaned: str = value.strip().lower()
            if cleaned in ('true', '1', 'yes', 'y'):
                return True
            elif cleaned in ('false', '0', 'no', 'n'):
                return False
            else:
                return default_value
        return converter

    @staticmethod
    def date_converter(default_value: datetime | None = None) -> CSVToPythonConverterFunction:
        """Return a converter function that converts string to datetime, returns default_value if conversion fails."""
        def converter(value: str) -> datetime | None:
            if not value or value.isspace():
                return default_value

            value_stripped: str = value.strip()
            if not value_stripped:
                return default_value

            # Common date formats to try
            date_formats: list[str] = [
                "%Y-%m-%dT%H:%M:%S.%f",  # ISO format with microseconds
                "%Y-%m-%dT%H:%M:%S",     # ISO format without microseconds
                "%Y-%m-%d %H:%M:%S",     # Space separated datetime
                "%Y-%m-%d",              # Date only
                "%d/%m/%Y",              # European format
                "%m/%d/%Y",              # US format
                "%d-%m-%Y",              # European with dashes
                "%Y/%m/%d",              # Alternative format
            ]

            for fmt in date_formats:
                try:
                    return datetime.strptime(value_stripped, fmt)
                except ValueError:
                    continue

            # If no format worked, return default_value
            return default_value
        return converter

    @staticmethod
    def strip_converter(default_value: str | None = None) -> CSVToPythonConverterFunction:
        """Return a converter function that strips whitespace from string, returns default_value if value is empty."""
        def converter(value: str) -> str | None:
            if not value:
                return default_value
            return value.strip()
        return converter

    @staticmethod
    def upper_converter(default_value: str | None = None) -> CSVToPythonConverterFunction:
        """Return a converter function that converts string to uppercase, returns default_value if value is empty."""
        def converter(value: str) -> str | None:
            if not value:
                return default_value
            return value.upper()
        return converter

    @staticmethod
    def lower_converter(default_value: str | None = None) -> CSVToPythonConverterFunction:
        """Return a converter function that converts string to lowercase, returns default_value if value is empty."""
        def converter(value: str) -> str | None:
            if not value:
                return default_value
            return value.lower()
        return converter


class CSVTypeDetectorsForDB:
    """Collection of static methods for CSV type detection and analysis."""

    @staticmethod
    def is_empty_or_null(value: str) -> bool:
        """Check if value is empty, whitespace, or should be treated as null."""
        return not value or value.isspace() or not value.strip()

    @staticmethod
    def is_boolean(value_stripped: str) -> bool:
        """Check if value represents a boolean. Expects pre-stripped value."""
        if not value_stripped:
            return False
        value_lower: str = value_stripped.lower()
        return value_lower in ('true', '1', 'yes', 'y', 'false', '0', 'no', 'n')

    @staticmethod
    def is_integer(value_stripped: str) -> bool:
        """Check if value is a valid 64-bit integer. Expects pre-stripped value."""
        if not value_stripped:
            return False

        try:
            # For integer, don't allow decimal points or scientific notation
            if '.' in value_stripped or 'e' in value_stripped.lower():
                return False

            int_value = int(value_stripped)
            # Check if it fits in 64-bit signed integer range
            return -sys.maxsize - 1 <= int_value <= sys.maxsize
        except ValueError:
            return False

    @staticmethod
    def is_float(value_stripped: str) -> bool:
        """Check if value is a valid 64-bit float. Expects pre-stripped value."""
        if not value_stripped:
            return False

        # Quick check for numeric format
        first_char: str = value_stripped[0]
        if not (first_char.isdigit() or first_char in '+-.' or
                (len(value_stripped) > 1 and first_char in '+-' and value_stripped[1].isdigit()) or
                (len(value_stripped) > 2 and first_char in '+-' and value_stripped[1] == '.' and value_stripped[2].isdigit())):
            return False

        try:
            float(value_stripped)
            return True
        except ValueError:
            return False

    @staticmethod
    def is_date(value_stripped: str) -> bool:
        """Check if value is a valid date. Expects pre-stripped value."""
        if not value_stripped:
            return False

        date_formats = [
            "%Y-%m-%dT%H:%M:%S.%f",  # ISO format with microseconds
            "%Y-%m-%dT%H:%M:%S",     # ISO format without microseconds
            "%Y-%m-%d %H:%M:%S",     # Space separated datetime
            "%Y-%m-%d",              # Date only
            "%d/%m/%Y",              # European format
            "%m/%d/%Y",              # US format
            "%d-%m-%Y",              # European with dashes
            "%Y/%m/%d",              # Alternative format
        ]

        for fmt in date_formats:
            try:
                datetime.strptime(value_stripped, fmt)
                return True
            except ValueError:
                continue
        return False


def infer_csv_schema(file_obj: TextIO, sample_rows: int = 10000) -> OrderedDict[str, type]:
    """
    Infer the schema of a CSV file by analyzing a sample of rows.

    Args:
        file_obj: Objeto de archivo abierto con el CSV
        sample_rows: Número de filas a analizar para inferir el esquema (default: 10000)

    Returns:
        OrderedDict que mapea nombres de columna a tipos de Python (int, float, bool, datetime, str)
        preservando el orden de las columnas en el CSV

    Ejemplo:

    +------------+------------+
    |   Name     |   Age      |
    +------------+------------+
    | Alice      | 25         |
    | Bob        | 30         |
    | Charlie    | 35         |
    | Diana      |            |
    +------------+------------+

    Corresponding OrderedDict mapping column names to their most common types:

    OrderedDict([
        ("Name", str),
        ("Age", int),
    ])
    """
    # Helper function from csv_to_mongo with same optimizations
    def analyze_value(value: str) -> type | None:
        """Analyze a single value and return its inferred type, or None for empty values."""
        if not value or value.isspace():
            # Return None for empty values so they're not counted in type inference
            return None

        value_stripped: str = value.strip()
        if not value_stripped:
            # Return None for empty values so they're not counted in type inference
            return None

        # Check types in order of specificity (most specific first)
        # Pass the stripped value to avoid redundant stripping in detectors
        if CSVTypeDetectorsForDB.is_boolean(value_stripped):
            return bool

        if CSVTypeDetectorsForDB.is_integer(value_stripped):
            return int

        if CSVTypeDetectorsForDB.is_float(value_stripped):
            return float

        if CSVTypeDetectorsForDB.is_date(value_stripped):
            return datetime

        # Default to string
        return str

    # Save current position to restore later
    original_position: int = file_obj.tell()

    try:
        # Read the CSV
        reader: csv.DictReader[str] = csv.DictReader(file_obj, dialect='excel')

        # Initialize type counters for each column (preserve order)
        column_types: OrderedDict[str, dict[type, int]] = OrderedDict()
        total_rows = 0

        # Process sample rows
        for i, row in enumerate(reader):
            if i >= sample_rows:
                break

            total_rows += 1

            for col, value in row.items():
                if col not in column_types:
                    column_types[col] = {}

                inferred_type: type | None = analyze_value(value)
                # Only count non-empty values for type inference
                if inferred_type is not None:
                    column_types[col][inferred_type] = column_types[col].get(inferred_type, 0) + 1

        # Determine final type for each column based on majority type
        schema: OrderedDict[str, type] = OrderedDict()

        for col, type_counts in column_types.items():
            if not type_counts:
                schema[col] = str  # Default to string if no data
                continue

            # Calculate percentages, treating all types equally
            total_col_values: int = sum(type_counts.values())

            # Get the most common type (including str for empty values)
            most_common_type: type = max(type_counts, key=lambda t: type_counts[t])
            most_common_count: int = type_counts[most_common_type]

            # Use 90% threshold for type consistency
            # If most values are of one type, use that type
            percentage: float = (most_common_count / total_col_values) * 100

            if percentage >= 90.0:
                schema[col] = most_common_type
            else:
                # Mixed types, default to string for safety
                schema[col] = str

        return schema

    finally:
        # Restore file position
        file_obj.seek(original_position)


def create_dataclass_from_schema(schema: OrderedDict[str, type], class_name: str = "CSVRecord") -> type:
    """
    Create a dataclass from an inferred CSV schema.

    Args:
        schema: OrderedDict mapping column names to Python types
        class_name: Name for the generated dataclass (default: "CSVRecord")

    Returns:
        A dynamically created dataclass type with fields corresponding to the schema
    """
    fields: list[tuple[str, type]] = []
    for field_name, field_type in schema.items():
        # Clean field name to be a valid Python identifier
        clean_name: str = field_name.replace(' ', '_').replace('-', '_').replace('.', '_')
        clean_name: str = ''.join(c for c in clean_name if c.isalnum() or c == '_')
        if clean_name and clean_name[0].isdigit():
            clean_name = f"field_{clean_name}"
        if not clean_name:
            clean_name = "unnamed_field"

        # Use the field type directly without making it optional
        # This simplifies the schema to only use basic types
        fields.append((clean_name, field_type))

    return make_dataclass(class_name, fields)


def infer_csv_schema_with_dataclass(
    file_obj: TextIO,
    sample_rows: int = 10000,
    class_name: str = "CSVRecord"
) -> tuple[OrderedDict[str, type], type]:
    """
    Infer CSV schema and create a corresponding dataclass.

    Args:
        file_obj: Objeto de archivo abierto con el CSV
        sample_rows: Número de filas a analizar para inferir el esquema (default: 10000)
        class_name: Name for the generated dataclass (default: "CSVRecord")

    Returns:
        Tuple containing:
        - OrderedDict mapping column names to Python types
        - Dynamically created dataclass type
    """
    schema: OrderedDict[str, type] = infer_csv_schema(file_obj, sample_rows)
    dataclass_type: type = create_dataclass_from_schema(schema, class_name)
    return schema, dataclass_type
