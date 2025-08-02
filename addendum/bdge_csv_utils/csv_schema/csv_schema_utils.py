from collections.abc import Callable
import csv
from dataclasses import MISSING, Field, make_dataclass, fields, field, dataclass
from typing import Annotated
from datetime import datetime
import sys
from collections import OrderedDict
from typing import Any, TextIO, get_origin, get_args, Union

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


def infer_csv_schema(file_obj: TextIO, entity_name: str = "CSVRecord", sample_rows: int = 10000) -> type:
    """
    Infer the schema of a CSV file by analyzing a sample of rows.

    Args:
        file_obj: Objeto de archivo abierto con el CSV
        sample_rows: Número de filas a analizar para inferir el esquema (default: 10000)

    Returns:
        A dynamically created dataclass type with fields corresponding to the schema, mapping column names to their most common types.

    Ejemplo:

    +------------+------------+
    |   Name     |   Age      |
    +------------+------------+
    | Alice      | 25         |
    | Bob        | 30         |
    | Charlie    | 35         |
    | Diana      |            |
    +------------+------------+

    Corresponding dataclass:

    @dataclass
    class CSVRecord:
        Name: str
        Age: int
    """
    def create_dataclass_from_schema(schema: OrderedDict[str, type], class_name: str = "CSVRecord") -> type:
        fields: list[tuple[str, type]] = []
        for field_name, field_type in schema.items():
            # Clean field name to be a valid Python identifier
            clean_name: str = field_name.replace(' ', '_').replace('-', '_').replace('.', '_')
            clean_name: str = ''.join(c for c in clean_name if c.isalnum() or c == '_')
            if not clean_name:
                clean_name = "unnamed_field"
            elif clean_name[0].isdigit():
                clean_name = f"field_{clean_name}"

            # Use the field type directly without making it optional
            # This simplifies the schema to only use basic types
            fields.append((clean_name, field_type))

        return make_dataclass(class_name, fields)

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

        return create_dataclass_from_schema(schema, entity_name)

    finally:
        # Restore file position
        file_obj.seek(original_position)

def add_fields_to_schema(
    cls: type,
    new_fields: list[tuple[str, Any]]
) -> type:
    """
    Return a new dataclass, same as `cls`, but with additional fields.
    Each entry in new_fields is (name, type) — no default/factory.
    """
    base: list[tuple] = []
    for f in fields(cls):
        if f.default is not f.default_factory.__class__:
            base.append((f.name, f.type, f.default))
        elif f.default_factory is not f.default_factory.__class__:
            base.append((f.name, f.type, f.default_factory))
        else:
            base.append((f.name, f.type))
    combined: list[tuple] = base + new_fields
    return make_dataclass(cls.__name__, combined)

def update_schema_fields(original_schema: type, changes: list[tuple[str, Any]]) -> type:
    """
    Create a new dataclass with updated field types based on the original schema.

    Args:
        original_schema: The original dataclass to update
        changes: List of tuples (field_name, new_type) to change

    Returns:
        A new dataclass with the updated field types
    """
    # Create a mapping of field name to new type
    change_dict: dict[str, Any] = dict(changes)

    # Get all fields from the original schema
    original_fields: tuple[Field[Any], ...] = fields(original_schema)

    # Create field definitions for the new dataclass
    new_field_defs: list[tuple] = []

    for f in original_fields:
        # Get the new type or use the original
        field_type = change_dict.get(f.name, f.type)

        # Create field args dict
        field_args: dict[str, Any] = {}

        # Preserve default if it exists
        if f.default is not MISSING:
            field_args['default'] = f.default

        # Preserve default_factory if it exists
        if f.default_factory is not MISSING:
            field_args['default_factory'] = f.default_factory

        # Handle other field attributes if needed
        for attr in ['init', 'repr', 'compare', 'hash', 'metadata']:
            if hasattr(f, attr):
                field_args[attr] = getattr(f, attr)

        # Create field definition tuple for make_dataclass
        if field_args:
            # Need to use field() for complex field configuration
            new_field_defs.append((f.name, field_type, field(** field_args)))
        else:
            # Simple field with just name and type
            new_field_defs.append((f.name, field_type))

    # Create the new dataclass with the same name and updated field definitions
    return make_dataclass(
        cls_name=original_schema.__name__,
        fields=new_field_defs,
        bases=tuple(),
        namespace={}
    )


def schema_to_python_code(cls: type) -> str:
    """
    Convert a dataclass to its Python code representation.

    Args:
        cls: The dataclass type to serialize

    Returns:
        String containing the Python code that would define this dataclass

    Example:
        @dataclass
        class Person:
            name: str
            age: int = 0
            tags: list[str] = field(default_factory=list)
    """
    if not hasattr(cls, '__dataclass_fields__'):
        raise ValueError(f"{cls.__name__} is not a dataclass")

    lines = []

    # Add the dataclass decorator and class definition
    lines.append('@dataclass')
    lines.append(f'class {cls.__name__}:')

    # Add fields
    class_fields: tuple[Field[Any], ...] = fields(cls)
    if not class_fields:
        lines.append('    pass')
    else:
        for f in class_fields:
            field_line: str = f'    {f.name}: {_get_type_string(f.type)}'

            # Handle default values and field() configurations
            if f.default is not MISSING:
                if isinstance(f.default, str):
                    field_line += f' = "{f.default}"'
                else:
                    field_line += f' = {repr(f.default)}'
            elif f.default_factory is not MISSING:
                # Handle different types of default factories
                factory_name = getattr(f.default_factory, '__name__', repr(f.default_factory))
                # Treat special case for datetime.now() to avoid import issues
                if factory_name == 'now':
                    factory_name = 'datetime.now'
                field_line += f' = field(default_factory={factory_name})'
            elif any(getattr(f, attr, None) is not None
                    for attr in ['init', 'repr', 'compare', 'hash', 'metadata']
                    if not getattr(f, attr, True)):
                # Field has non-default configuration
                field_args = []
                for attr in ['init', 'repr', 'compare', 'hash']:
                    value = getattr(f, attr, True)
                    if not value:
                        field_args.append(f'{attr}={value}')
                if f.metadata:
                    field_args.append(f'metadata={repr(f.metadata)}')

                if field_args:
                    field_line += f' = field({", ".join(field_args)})'

            lines.append(field_line)

    return '\n'.join(lines)


def _get_type_string(type_annotation: Any) -> str:
    """Helper function to convert type annotations to their string representation."""
    if type_annotation is str:
        return 'str'
    elif type_annotation is int:
        return 'int'
    elif type_annotation is float:
        return 'float'
    elif type_annotation is bool:
        return 'bool'
    elif type_annotation is datetime:
        return 'datetime'
    elif hasattr(type_annotation, '__origin__'):
        # Handle generic types like list[str], dict[str, int], Optional[str]
        origin = get_origin(type_annotation)
        args: tuple[Any, ...] = get_args(type_annotation)

        if origin is list:
            if args:
                return f'list[{_get_type_string(args[0])}]'
            return 'list'
        elif origin is dict:
            if len(args) == 2:
                return f'dict[{_get_type_string(args[0])}, {_get_type_string(args[1])}]'
            return 'dict'
        elif origin is Union:
            # Handle Optional[T] which is Union[T, None]
            if len(args) == 2 and type(None) in args:
                non_none_type = args[0] if args[1] is type(None) else args[1]
                return f'{_get_type_string(non_none_type)} | None'
            else:
                # General Union
                type_strs = [_get_type_string(arg) for arg in args]
                return f'{" | ".join(type_strs)}'

    # Fallback: use string representation
    return str(type_annotation).replace('typing.', '')


def save_schema_to_file(cls: type, filepath: str) -> None:
    """
    Save a dataclass definition to a Python file.

    Args:
        cls: The dataclass to save
        filepath: Path where to save the file (should end with .py)
    """
    code: str = schema_to_python_code(cls)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(code)


def _execute_code_in_namespace(code: str, class_name: str) -> type:
    """
    Helper function to execute code in a new namespace populated with caller's symbols.

    Args:
        code: Python code string containing the dataclass definition
        class_name: Name of the dataclass to extract

    Returns:
        The loaded dataclass type
    """
    import inspect

    # Get the current frame's globals and locals
    frame = inspect.currentframe()
    try:
        if frame is None:
            raise RuntimeError("Could not get current frame")

        caller_frame = frame.f_back
        if caller_frame is None:
            raise RuntimeError("Could not get caller's frame")

        # Create a new namespace populated with caller's symbols
        new_namespace = {}

        # First, add all globals from the caller
        new_namespace.update(caller_frame.f_globals)

        # Then, add all locals from the caller (locals take precedence)
        new_namespace.update(caller_frame.f_locals)

        # Execute the code in the new namespace
        exec(code, new_namespace)

        # Extract the class from the new namespace
        if class_name in new_namespace:
            return new_namespace[class_name]
        else:
            raise AttributeError(f"Class {class_name} not found in provided code")
    finally:
        del frame


def load_schema_from_file(filepath: str, class_name: str) -> type:
    """
    Load a dataclass from a Python file.

    Args:
        filepath: Path to the Python file containing the dataclass
        class_name: Name of the dataclass to load

    Returns:
        The loaded dataclass type
    """
    import os

    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File {filepath} not found")

    # Read the file's contents
    with open(filepath, 'r', encoding='utf-8') as file:
        code = file.read()

    return _execute_code_in_namespace(code, class_name)


def load_schema_from_string(code: str, class_name: str) -> type:
    """
    Load a dataclass from a Python code string using a new namespace populated with current symbols.

    Args:
        code: Python code string containing the dataclass definition
        class_name: Name of the dataclass to extract

    Returns:
        The loaded dataclass type
    """
    return _execute_code_in_namespace(code, class_name)