from dataclasses import make_dataclass, is_dataclass, fields as dc_fields, MISSING
from .types import Schema, Fld
from typing import Any, Annotated, get_args, get_origin
import inspect

def schema_to_dataclass(schema: Schema, name: str = "GeneratedDataclass") -> type:
    """Convert a Schema to a dataclass type."""
    required_fields = []
    optional_fields = []

    for field in schema.get_fields():
        field_type = field.field_type
        default_value = MISSING

        # Handle Optional types by setting default to None
        origin = get_origin(field_type)
        if origin is type(int | str):  # Check for Union type
            args = get_args(field_type)
            if type(None) in args:
                default_value = None
        elif origin is Annotated:
            # For annotated types, check if the base type is optional
            base_type = get_args(field_type)[0]
            base_origin = get_origin(base_type)
            if base_origin is type(int | str):  # Check for Union type
                base_args = get_args(base_type)
                if type(None) in base_args:
                    default_value = None

        # Handle nested schemas
        if isinstance(field.field_type, Schema):
            field_type = schema_to_dataclass(field.field_type, field.name.capitalize())
        elif origin is Annotated:
            # Preserve the base type for annotated fields
            field_type = get_args(field.field_type)[0]

        # Separate required and optional fields for proper ordering
        if default_value is not MISSING:
            optional_fields.append((field.name, field_type, default_value))
        else:
            required_fields.append((field.name, field_type))

    # Combine fields with required first, then optional
    all_fields = required_fields + optional_fields

    return make_dataclass(name, all_fields)

def dataclass_to_schema(cls: type) -> Schema:
    """Convert a dataclass type to a Schema."""
    if not is_dataclass(cls):
        raise TypeError(f"{cls} is not a dataclass")

    schema_fields = []
    for dc_field in dc_fields(cls):
        field_type: Any = dc_field.type

        # If the field type is another dataclass, convert it to a nested schema
        if inspect.isclass(field_type) and is_dataclass(field_type):
            field_type = dataclass_to_schema(field_type)

        schema_fields.append(Fld(dc_field.name, field_type))

    return Schema(name=cls.__name__, fields=schema_fields)

def instance_to_schema(instance: Any) -> Schema:
    """Create a Schema from a dataclass instance, inferring types from values."""
    if not is_dataclass(instance):
        raise TypeError(f"{type(instance)} is not a dataclass instance")

    schema_fields = []
    for dc_field in dc_fields(instance):
        value = getattr(instance, dc_field.name)
        inferred_type: Any = type(value) if value is not None else dc_field.type

        # Handle nested dataclass instances
        if is_dataclass(value):
            inferred_type = instance_to_schema(value)

        schema_fields.append(Fld(dc_field.name, inferred_type))

    return Schema(name=type(instance).__name__, fields=schema_fields)

def create_dataclass_with_annotations(schema: Schema, name: str = "AnnotatedDataclass") -> type:
    """Create a dataclass that preserves schema annotations like PrimaryKey and Reference."""
    required_fields = []
    optional_fields = []
    annotations = {}

    for field in schema.get_fields():
        field_type = field.field_type
        default_value = MISSING

        # Handle Optional types
        origin = get_origin(field_type)
        if origin is type(int | str):  # Check for Union type
            args = get_args(field_type)
            if type(None) in args:
                default_value = None
        elif origin is Annotated:
            # Check if the base type is optional
            args = get_args(field_type)
            base_type = args[0]
            if get_origin(base_type) is type(int | str) and type(None) in get_args(base_type):
                default_value = None

        # Store the original annotated type for metadata preservation
        annotations[field.name] = field_type

        # Extract base type for dataclass creation
        if origin is Annotated:
            base_type = get_args(field_type)[0]
        else:
            base_type = field_type

        # Separate required and optional fields
        if default_value is not MISSING:
            optional_fields.append((field.name, base_type, default_value))
        else:
            required_fields.append((field.name, base_type))

    # Combine fields with required first, then optional
    all_fields = required_fields + optional_fields

    # Create the dataclass
    cls = make_dataclass(name, all_fields)

    # Add the original annotations to preserve metadata
    cls.__annotations__.update(annotations)

    return cls
