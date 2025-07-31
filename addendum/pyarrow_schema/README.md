# PyArrow Schema Utilities

This module provides utilities to convert Python dataclasses to PyArrow schemas and tables. It's designed for working with CSV data that has been processed through schema inference, assuming simple, non-nullable types.

## Features

- **Simple Type Mapping**: Direct conversion from basic Python types to PyArrow types
- **Dataclass to Schema Conversion**: Convert any dataclass to a PyArrow schema with proper type mapping
- **Table Creation**: Create PyArrow tables directly from dataclass instances
- **CSV Integration**: Designed to work seamlessly with CSV schema inference tools
- **Clean API**: Simplified interface without complex union/optional type handling

## Installation

```bash
pip install pyarrow pandas
```

## Quick Start

```python
from dataclasses import make_dataclass
from datetime import datetime
from pyarrow_schema_utils import dataclass_to_pyarrow_schema, create_pyarrow_table_from_dataclass_instances

# Create a dataclass (this could come from CSV schema inference)
PersonRecord = make_dataclass(
    "PersonRecord",
    [
        ("name", str),
        ("age", int),
        ("salary", float),
        ("is_active", bool),
        ("birth_date", datetime),
    ]
)

# Convert to PyArrow schema
schema = dataclass_to_pyarrow_schema(PersonRecord, "employees")

# Create data instances
people = [
    PersonRecord("Alice", 30, 75000.0, True, datetime(1993, 1, 1)),
    PersonRecord("Bob", 25, 50000.0, False, datetime(1998, 5, 15)),
]

# Create PyArrow table
table = create_pyarrow_table_from_dataclass_instances(people, schema)

# Use the table (convert to pandas, save to parquet, etc.)
df = table.to_pandas()
```

## Integration with CSV Schema Inference

This module is designed to work with CSV schema inference tools like those in `csv_to_mongo.py`:

```python
from csv_to_mongo import infer_csv_schema_with_dataclass
from pyarrow_schema_utils import dataclass_to_pyarrow_schema

# Infer schema from CSV and get dataclass
with open('data.csv', 'r') as f:
    csv_schema, RecordClass = infer_csv_schema_with_dataclass(f, class_name="MyRecord")

# Convert to PyArrow schema
pa_schema = dataclass_to_pyarrow_schema(RecordClass, "my_data")

# Now you can efficiently process the CSV data with PyArrow
```

## Supported Types

| Python Type | PyArrow Type |
|-------------|--------------|
| `str` | `string` |
| `int` | `int64` |
| `float` | `float64` |
| `bool` | `bool` |
| `datetime.datetime` | `timestamp[us]` |
| `bytes` | `binary` |

## Functions

### `dataclass_to_pyarrow_schema(dataclass_type, schema_name=None)`
Convert a dataclass to a PyArrow schema.

### `create_pyarrow_table_from_dataclass_instances(instances, schema=None)`
Create a PyArrow table from a list of dataclass instances.

### `python_type_to_pyarrow_type(python_type)`
Convert a single Python type to its PyArrow equivalent.

### `print_schema_info(schema)`
Print detailed information about a PyArrow schema.

## Testing

Run the comprehensive test suite:

```bash
python test_pyarrow_schema_utils.py
```

## Design Philosophy

This module follows a simplified approach:

- **No Union Types**: Assumes all fields are non-nullable basic types
- **Direct Mapping**: Simple 1:1 mapping between Python and PyArrow types  
- **Clean API**: Straightforward functions without complex type introspection
- **CSV-Focused**: Optimized for typical CSV processing workflows

## Notes

- All fields are treated as non-nullable unless they have explicit default values
- Field names are preserved exactly as they appear in the dataclass
- Metadata can be attached to schemas for additional context
- The module avoids complex type unions for simplicity and performance
