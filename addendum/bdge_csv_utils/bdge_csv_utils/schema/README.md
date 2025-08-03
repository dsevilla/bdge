# Schema System Documentation

This directory contains a comprehensive schema system that allows you to define, manipulate, and convert data structures with full support for dataclass integration and SQL generation.

## Overview

The schema system provides:

- **Schema Definition**: Define data structures with typed fields
- **Dataclass Integration**: Convert between schemas and Python dataclasses
- **SQL Generation**: Generate CREATE TABLE, INSERT, and SELECT statements
- **Schema Operations**: Add, remove, rename, merge, and validate schemas
- **Annotations Support**: Primary keys, foreign key references, and optional fields
- **Nested Schemas**: Support for complex nested data structures

## Core Components

### 1. Types (`types.py`)

Core classes for defining schemas:

```python
from bdge_csv_utils.schema.types import Schema, Field, PrimaryKey, Reference
from typing import Annotated

# Define a schema
user_schema = Schema([
    Field("id", Annotated[int, PrimaryKey()]),
    Field("username", str),
    Field("email", str | None),
    Field("created_at", datetime)
])
```

### 2. Dataclass Conversion (`dataclass_conversion.py`)

Convert between schemas and dataclasses:

```python
from bdge_csv_utils.schema.dataclass_conversion import (
    schema_to_dataclass,
    dataclass_to_schema,
    instance_to_schema
)

# Schema to dataclass
UserClass = schema_to_dataclass(user_schema, "User")

# Create instance
user = UserClass(id=1, username="alice", email="alice@example.com", created_at=datetime.now())

# Dataclass to schema
@dataclass
class Product:
    id: int
    name: str
    price: float

product_schema = dataclass_to_schema(Product)
```

### 3. Schema Operations (`ops.py`)

Manipulate and query schemas:

```python
from bdge_csv_utils.schema.ops import (
    add_field, remove_field, rename_field, merge_schemas,
    validate_schema, schema_to_sql
)

# Add a field
extended_schema = add_field(user_schema, Field("last_login", datetime | None))

# Generate SQL
create_sql = schema_to_sql(user_schema, "users")
# CREATE TABLE users (
#   id INTEGER PRIMARY KEY,
#   username TEXT NOT NULL,
#   email TEXT,
#   created_at TIMESTAMP NOT NULL
# );
```

## Features

### Schema Creation

Create schemas programmatically with various field types:

```python
from typing import List, Dict, Any

schema = Schema([
    Field("id", Annotated[int, PrimaryKey()]),
    Field("name", str),
    Field("tags", List[str]),
    Field("metadata", Dict[str, Any]),
    Field("parent_id", Annotated[int | None, Reference[int]()]),
    Field("is_active", bool)
])
```

### Type Support

The system supports various Python types:

- **Basic Types**: `int`, `str`, `float`, `bool`
- **Date/Time**: `datetime`, `date`
- **Optional Types**: `T | None` or `T | None`
- **Collections**: `List[T]`, `Dict[K, V]`
- **Annotations**: `Annotated[T, metadata]`
- **Nested Schemas**: `Schema` objects as field types

### SQL Generation

Generate SQL statements with proper type mapping:

```python
# CREATE TABLE
create_sql = schema_to_sql(schema, "table_name")

# INSERT template
insert_sql = schema_to_sql_insert(schema, "table_name")
# INSERT INTO table_name (id, name, is_active) VALUES (?, ?, ?);

# SELECT statement
select_sql = schema_to_sql_select(schema, "table_name")
# SELECT id, name, is_active FROM table_name;
```

#### SQL Type Mapping

| Python Type | SQL Type |
|-------------|----------|
| `int` | `INTEGER` |
| `str` | `TEXT` |
| `float` | `REAL` |
| `bool` | `BOOLEAN` |
| `datetime` | `TIMESTAMP` |
| `date` | `DATE` |
| `bytes` | `BLOB` |
| Complex types | `TEXT` |

### Schema Operations

Perform various operations on schemas:

```python
# Add field
new_schema = add_field(schema, Field("new_field", str))

# Remove field
reduced_schema = remove_field(schema, "field_name")

# Rename field
renamed_schema = rename_field(schema, "old_name", "new_name")

# Merge schemas (second schema takes precedence)
merged_schema = merge_schemas(schema1, schema2)

# Validate schema
errors = validate_schema(schema)
if errors:
    print("Validation errors:", errors)
```

### Validation

The validation system checks for:

- **Duplicate field names**
- **Invalid field names** (must be valid Python identifiers)
- **Reserved keywords** (Python keywords)

### Nested Schemas

Support for complex nested data structures:

```python
address_schema = Schema([
    Field("street", str),
    Field("city", str),
    Field("postal_code", str)
])

person_schema = Schema([
    Field("id", int),
    Field("name", str),
    Field("address", address_schema),  # Nested schema
    Field("work_address"[address_schema])  # Optional nested schema
])

# Convert to dataclass with nested types
PersonClass = schema_to_dataclass(person_schema, "Person")
```

## Usage Examples

### Basic Usage

```python
from bdge_csv_utils.schema.types import Schema, Field, PrimaryKey
from bdge_csv_utils.schema.dataclass_conversion import schema_to_dataclass
from bdge_csv_utils.schema.ops import schema_to_sql
from typing import Annotated
from datetime import datetime

# 1. Define schema
user_schema = Schema([
    Field("id", Annotated[int, PrimaryKey()]),
    Field("username", str),
    Field("email", str | None),
    Field("created_at", datetime),
    Field("is_active", bool)
])

# 2. Convert to dataclass
UserClass = schema_to_dataclass(user_schema, "User")

# 3. Create instances
user = UserClass(
    id=1,
    username="alice",
    email="alice@example.com",
    created_at=datetime.now(),
    is_active=True
)

# 4. Generate SQL
sql = schema_to_sql(user_schema, "users")
print(sql)
```

### Real-World Example

```python
# E-commerce product schema
product_schema = Schema([
    Field("id", Annotated[int, PrimaryKey()]),
    Field("name", str),
    Field("description", str | None),
    Field("price", float),
    Field("category_id", Annotated[int, Reference[int]()]),
    Field("sku", str),
    Field("in_stock", bool),
    Field("created_at", datetime),
    Field("updated_at", datetime | None)
])

# Convert to dataclass
ProductClass = schema_to_dataclass(product_schema, "Product")

# Generate SQL
create_table_sql = schema_to_sql(product_schema, "products")
```

## Running Tests

The system includes comprehensive tests:

```bash
# Run basic tests
python3 -m tests.test_schema_creation_and_conversion

# Run advanced tests
python3 -m tests.test_schema_advanced

# Run demonstration
python3 demo_schema_system.py
```

## File Structure

```
schema/
├── __init__.py              # Package initialization
├── types.py                 # Core schema types (Schema, Field, PrimaryKey, Reference)
├── dataclass_conversion.py  # Dataclass conversion functions
├── ops.py                   # Schema operations and SQL generation
└── README.md               # This documentation
```

## Benefits

1. **Type Safety**: Full type annotation support with Python's typing system
2. **Code Generation**: Automatic dataclass and SQL generation
3. **Schema Evolution**: Easy schema modification and merging
4. **Validation**: Built-in schema validation
5. **Documentation**: Self-documenting schema definitions
6. **Integration**: Seamless integration with existing Python codebases
7. **Flexibility**: Support for complex nested structures

## Use Cases

- **Database Schema Design**: Define tables and generate SQL
- **API Development**: Define data models for REST APIs
- **Data Validation**: Validate data structures before processing
- **Code Generation**: Generate dataclasses from schema definitions
- **Documentation**: Document data structures in a standardized way
- **Schema Migration**: Track and manage schema changes over time

This schema system provides a powerful foundation for managing data structures in Python applications with full integration between schemas, dataclasses, and SQL databases.
