"""
Schema system for defining, manipulating, and converting data structures.

This package provides a comprehensive schema system with support for:
- Schema definition with typed fields
- Dataclass conversion (bidirectional)
- SQL generation (CREATE, INSERT, SELECT)
- Schema operations (add, remove, rename, merge, validate)
- Annotations (PrimaryKey, Reference)
- Nested schemas
"""

from .types import Schema, Fld, PrimaryKey, Reference
from .dataclass_conversion import (
    schema_to_dataclass,
    dataclass_to_schema,
    instance_to_schema,
    create_dataclass_with_annotations
)
from .ops import (
    print_schema,
    add_field,
    remove_field,
    rename_field,
    get_field,
    merge_schemas,
    validate_schema,
    schema_to_sql,
    schema_to_sql_insert,
    schema_to_sql_select
)

__all__ = [
    # Core types
    "Schema",
    "Fld",
    "PrimaryKey",
    "Reference",

    # Dataclass conversion
    "schema_to_dataclass",
    "dataclass_to_schema",
    "instance_to_schema",
    "create_dataclass_with_annotations",

    # Schema operations
    "print_schema",
    "add_field",
    "remove_field",
    "rename_field",
    "get_field",
    "merge_schemas",
    "validate_schema",

    # SQL generation
    "schema_to_sql",
    "schema_to_sql_insert",
    "schema_to_sql_select",
]
