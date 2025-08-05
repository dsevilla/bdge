from typing import Annotated, get_args, get_origin
from datetime import datetime, date

from .types import Schema, Fld, PrimaryKey, Reference

def print_schema(schema: Schema) -> None:
    """Print a human-readable representation of the schema."""
    print("Schema:")
    for field in schema.get_fields():
        annotations = []
        if hasattr(field.field_type, '__metadata__'):
            for metadata in field.field_type.__metadata__:
                if metadata is PrimaryKey:
                    annotations.append("PRIMARY KEY")
                elif getattr(metadata, '__origin__', None) is Reference or metadata is Reference:
                    # Extract referenced type and attribute name
                    ref_args = getattr(metadata, '__args__', None)
                    if ref_args is None:
                        ref_args = getattr(metadata, '_name', None)
                    if ref_args and isinstance(ref_args, tuple):
                        ref_type = ref_args[0]
                        ref_attr = ref_args[1] if len(ref_args) > 1 else None
                        ref_type_name = getattr(ref_type, '__name__', str(ref_type))
                        if ref_attr is not None:
                            annotations.append(f"REFERENCE {ref_type_name}({ref_attr})")
                        else:
                            annotations.append(f"REFERENCE {ref_type_name}({field.name})")
                    else:
                        annotations.append(f"REFERENCE ({field.name})")
        annotation_str = f" ({', '.join(annotations)})" if annotations else ""
        print(f"  Field: {field.name}, Type: {field.field_type}{annotation_str}")

def add_field(schema: Schema, field: Fld) -> Schema:
    """Add a field to a schema, returning a new schema."""
    new_fields: list[Fld] = schema.get_fields() + [field]
    return Schema(name=schema.name, fields=new_fields)

def remove_field(schema: Schema, field_name: str) -> Schema:
    """Remove a field from a schema by name, returning a new schema."""
    new_fields: list[Fld] = [f for f in schema.get_fields() if f.name != field_name]
    return Schema(name=schema.name, fields=new_fields)

def rename_field(schema: Schema, old_name: str, new_name: str) -> Schema:
    """Rename a field in a schema, returning a new schema."""
    new_fields = []
    for field in schema.get_fields():
        if field.name == old_name:
            new_fields.append(Fld(new_name, field.field_type, getattr(field, 'metadata', None)))
        else:
            new_fields.append(field)
    return Schema(fields=new_fields)

def get_field(schema: Schema, field_name: str) -> Fld | None:
    """Get a field by name from the schema."""
    return schema.get_field(field_name)

def merge_schemas(schema1: Schema, schema2: Schema) -> Schema:
    """Merge two schemas, with schema2 fields taking precedence on name conflicts."""
    # Merge fields by name, schema2 takes precedence
    field_dict = {f.name: f for f in schema1.get_fields()}
    for f in schema2.get_fields():
        field_dict[f.name] = f
    merged_fields = list(field_dict.values())
    return Schema(fields=merged_fields)

def validate_schema(schema: Schema) -> list[str]:
    """Validate a schema and return a list of validation errors."""
    errors = []
    field_names = schema.field_names()

    # Check for duplicate field names (should not happen with OrderedDict)
    if len(field_names) != len(set(field_names)):
        errors.append("Duplicate field names detected.")

    # Check for valid field names (must be valid Python identifiers)
    for name in field_names:
        if not name.isidentifier():
            errors.append(f"Invalid field name: {name} (must be a valid Python identifier)")

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

    def get_field_constraints(field: Fld) -> list[str]:
        """Extract SQL constraints from field annotations."""
        constraints = []
        origin = get_origin(field.field_type)

        if origin is Annotated:
            args = get_args(field.field_type)
            for metadata in args[1:]:  # Skip the base type
                if metadata is PrimaryKey:
                    constraints.append("PRIMARY KEY")
                elif getattr(metadata, '__origin__', None) is Reference or metadata is Reference:
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
    for field in schema.get_fields():
        sql_type = python_type_to_sql(field.field_type)
        constraints = get_field_constraints(field)
        constraint_str = " " + " ".join(constraints) if constraints else ""
        field_defs.append(f"{field.name} {sql_type}{constraint_str}")

    return f"CREATE TABLE {table_name} (\n  {',\n  '.join(field_defs)}\n);"

def schema_to_sql_insert(schema: Schema, table_name: str) -> str:
    """Generate a SQL INSERT statement template from a schema."""
    field_names = schema.field_names()
    placeholders = ["?" for _ in field_names]
    return f"INSERT INTO {table_name} ({', '.join(field_names)}) VALUES ({', '.join(placeholders)});"

def schema_to_sql_select(schema: Schema, table_name: str) -> str:
    """Generate a SQL SELECT statement from a schema."""
    field_names = schema.field_names()
    return f"SELECT {', '.join(field_names)} FROM {table_name};"
