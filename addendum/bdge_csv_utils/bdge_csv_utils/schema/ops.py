from typing import Any, Annotated, get_args, get_origin
from datetime import datetime, date
import re

from .types import Schema, Field, PrimaryKey, Reference

def print_schema(schema: Schema) -> None:
    """Print a human-readable representation of the schema."""
    print(f"Schema:")
    for field in schema.fields:
        annotations = []
        if hasattr(field.field_type, '__metadata__'):
            for metadata in field.field_type.__metadata__:
                if isinstance(metadata, PrimaryKey):
                    annotations.append("PRIMARY KEY")
                elif isinstance(metadata, Reference):
                    annotations.append("REFERENCE")
        annotation_str = f" ({', '.join(annotations)})" if annotations else ""
        print(f"  Field: {field.name}, Type: {field.field_type}{annotation_str}")

def add_field(schema: Schema, field: Field) -> Schema:
    """Add a field to a schema, returning a new schema."""
    return Schema(schema.fields + [field])

def remove_field(schema: Schema, field_name: str) -> Schema:
    """Remove a field from a schema by name, returning a new schema."""
    return Schema([f for f in schema.fields if f.name != field_name])

def rename_field(schema: Schema, old_name: str, new_name: str) -> Schema:
    """Rename a field in a schema, returning a new schema."""
    new_fields = []
    for field in schema.fields:
        if field.name == old_name:
            new_fields.append(Field(new_name, field.field_type))
        else:
            new_fields.append(field)
    return Schema(new_fields)

def get_field(schema: Schema, field_name: str) -> Field | None:
    """Get a field by name from the schema."""
    for field in schema.fields:
        if field.name == field_name:
            return field
    return None

def merge_schemas(schema1: Schema, schema2: Schema) -> Schema:
    """Merge two schemas, with schema2 fields taking precedence on name conflicts."""
    field_dict = {f.name: f for f in schema1.fields}
    for field in schema2.fields:
        field_dict[field.name] = field
    return Schema(list(field_dict.values()))

def validate_schema(schema: Schema) -> list[str]:
    """Validate a schema and return a list of validation errors."""
    errors = []
    field_names = [f.name for f in schema.fields]
    
    # Check for duplicate field names
    seen_names = set()
    for name in field_names:
        if name in seen_names:
            errors.append(f"Duplicate field name: {name}")
        seen_names.add(name)
    
    # Check for valid field names (must be valid Python identifiers)
    for field in schema.fields:
        if not field.name.isidentifier():
            errors.append(f"Invalid field name: {field.name} (must be a valid Python identifier)")
    
    return errors

# SQL generation functions

def schema_to_sql(schema: Schema, table_name: str) -> str:
    """Generate a SQL CREATE TABLE statement from a schema."""
    def python_type_to_sql(field_type: type) -> str:
        origin = get_origin(field_type)
        args = get_args(field_type)
        
        # Handle Annotated types
        if origin is Annotated:
            base = args[0]
        # Handle Union types (including None unions)
        elif origin is type(int | str):  # Check for Union type
            # For X | None, this is Union[X, None]
            non_none_types = [arg for arg in args if arg is not type(None)]
            if len(non_none_types) == 1:
                base = non_none_types[0]
            else:
                base = str  # Default fallback for complex unions
        else:
            base = field_type
        
        # Map Python types to SQL types
        type_mapping = {
            int: "INTEGER",
            str: "TEXT",
            float: "REAL",
            bool: "BOOLEAN",
            datetime: "TIMESTAMP",
            date: "DATE",
            bytes: "BLOB"
        }
        
        if base in type_mapping:
            return type_mapping[base]
        elif isinstance(base, Schema):
            return "JSON"  # Store nested schemas as JSON
        else:
            return "TEXT"  # Default fallback
    
    def get_field_constraints(field: Field) -> list[str]:
        """Extract SQL constraints from field annotations."""
        constraints = []
        origin = get_origin(field.field_type)
        
        if origin is Annotated:
            args = get_args(field.field_type)
            for metadata in args[1:]:  # Skip the base type
                if isinstance(metadata, PrimaryKey):
                    constraints.append("PRIMARY KEY")
                elif isinstance(metadata, Reference):
                    constraints.append("REFERENCES")  # Would need table name in real implementation
        
        # Check if field is optional (Union with None)
        if origin is type(int | str):  # Check for Union type
            args = get_args(field.field_type)
            if type(None) not in args:
                constraints.append("NOT NULL")
        elif origin is not Annotated:
            # Non-annotated, non-union types are required by default
            constraints.append("NOT NULL")
        
        return constraints
    
    field_defs = []
    for field in schema.fields:
        sql_type = python_type_to_sql(field.field_type)
        constraints = get_field_constraints(field)
        constraint_str = " " + " ".join(constraints) if constraints else ""
        field_defs.append(f"{field.name} {sql_type}{constraint_str}")
    
    return f"CREATE TABLE {table_name} (\n  {',\n  '.join(field_defs)}\n);"

def schema_to_sql_insert(schema: Schema, table_name: str) -> str:
    """Generate a SQL INSERT statement template from a schema."""
    field_names = [f.name for f in schema.fields]
    placeholders = ["?" for _ in field_names]
    return f"INSERT INTO {table_name} ({', '.join(field_names)}) VALUES ({', '.join(placeholders)});"

def schema_to_sql_select(schema: Schema, table_name: str) -> str:
    """Generate a SQL SELECT statement from a schema."""
    field_names = [f.name for f in schema.fields]
    return f"SELECT {', '.join(field_names)} FROM {table_name};"
