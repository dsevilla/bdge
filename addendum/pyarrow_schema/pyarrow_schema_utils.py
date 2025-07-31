#!/usr/bin/env python3
"""
PyArrow Schema Utilities

This module provides functions to convert between Python dataclasses and PyArrow schemas.
Useful for creating PyArrow schemas from CSV-inferred dataclasses for efficient data processing.

Features:
- Convert dataclasses to PyArrow schemas
- Support for optional/nullable fields using Type | None syntax
- Primary key annotations using Annotated[Type, PrimaryKey]
- Reference annotations using Annotated[Type, Reference[OtherDataclass]]
- Create PyArrow tables from dataclass instances
- Detailed schema information display

Example:
    from dataclasses import dataclass
    from typing import Annotated
    from datetime import datetime
    from pyarrow_schema_utils import dataclass_to_pyarrow_schema, PrimaryKey, Reference
    
    @dataclass
    class User:
        id: Annotated[int, PrimaryKey]
        name: str
        email: str | None  # Optional field
        is_active: bool = True
    
    @dataclass
    class Order:
        id: Annotated[int, PrimaryKey]
        user_id: Annotated[int, Reference[User]]
        total: float
        description: str | None
        created_at: datetime
    
    # Convert to PyArrow schema
    user_schema = dataclass_to_pyarrow_schema(User, "users")
    order_schema = dataclass_to_pyarrow_schema(Order, "orders")
"""

try:
    import pyarrow as pa
except ImportError:
    print("PyArrow is not installed. Install it with: pip install pyarrow")
    raise

import dataclasses
from dataclasses import fields, is_dataclass
from datetime import datetime
from typing import Any, Annotated, Union, get_origin, get_args
import sys
import types

class PrimaryKey:
    """Annotation marker for primary key fields."""
    pass

class Reference[T]:
    """
    Annotation marker for reference fields to other dataclasses.
    
    Example usage:
        user_id: Annotated[int, Reference[User]]
    """


def python_type_to_pyarrow_type(python_type: Any) -> pa.DataType:
    """
    Convert a Python type to a PyArrow data type.
    
    Args:
        python_type: Python type to convert (supports Union types for nullable fields)
        
    Returns:
        PyArrow DataType
        
    Raises:
        ValueError: If the type is not supported
    """
    # Handle Union types (both typing.Union and types.UnionType for Python 3.10+)
    if get_origin(python_type) is Union or (hasattr(types, 'UnionType') and isinstance(python_type, types.UnionType)):
        if hasattr(types, 'UnionType') and isinstance(python_type, types.UnionType):
            # Python 3.10+ types.UnionType (from X | Y syntax)
            union_args = python_type.__args__
        else:
            # typing.Union
            union_args = get_args(python_type)
        
        # Check if it's a nullable type (Type | None)
        if len(union_args) == 2 and type(None) in union_args:
            # Extract the non-None type
            non_none_type = next(arg for arg in union_args if arg is not type(None))
            return python_type_to_pyarrow_type(non_none_type)
        else:
            raise ValueError(f"Complex Union types not supported: {python_type}")
    
    # Handle basic types directly
    if python_type == str:
        return pa.string()
    elif python_type == int:
        return pa.int64()
    elif python_type == float:
        return pa.float64()
    elif python_type == bool:
        return pa.bool_()
    elif python_type == datetime:
        return pa.timestamp('us')  # microsecond precision
    elif python_type == bytes:
        return pa.binary()
    else:
        raise ValueError(f"Unsupported Python type: {python_type}")


def _extract_type_and_annotations(field_type: Any) -> tuple[Any, list]:
    """
    Extract the actual type and annotations from an Annotated type.
    
    Args:
        field_type: The field type, potentially Annotated
        
    Returns:
        Tuple of (actual_type, list_of_annotations)
    """
    if get_origin(field_type) is Annotated:
        args = get_args(field_type)
        actual_type = args[0]
        annotations = list(args[1:])
        return actual_type, annotations
    else:
        return field_type, []


def _is_nullable_type(field_type: Any) -> bool:
    """
    Check if a type is nullable (Union with None or has default value).
    
    Args:
        field_type: The field type to check
        
    Returns:
        True if the type is nullable
    """
    # Handle both typing.Union and types.UnionType
    if get_origin(field_type) is Union or (hasattr(types, 'UnionType') and isinstance(field_type, types.UnionType)):
        if hasattr(types, 'UnionType') and isinstance(field_type, types.UnionType):
            # Python 3.10+ types.UnionType (from X | Y syntax)
            union_args = field_type.__args__
        else:
            # typing.Union
            union_args = get_args(field_type)
        
        return len(union_args) == 2 and type(None) in union_args
    return False


def _find_annotation_of_type(annotations: list, annotation_type: type) -> Any:
    """
    Find an annotation of a specific type in the annotations list.
    
    Args:
        annotations: List of annotations
        annotation_type: Type of annotation to find
        
    Returns:
        The annotation instance or None if not found
    """
    for annotation in annotations:
        if isinstance(annotation, annotation_type):
            return annotation
        elif annotation is annotation_type:
            return annotation
    return None


def dataclass_to_pyarrow_schema(dataclass_type: type, schema_name: str | None = None) -> pa.Schema:
    """
    Convert a dataclass to a PyArrow schema.
    
    Supports:
    - Optional fields: Type | None
    - Primary key annotations: Annotated[Type, PrimaryKey]
    - Reference annotations: Annotated[Type, Reference[OtherDataclass]]
    
    Args:
        dataclass_type: A dataclass type (created with @dataclass or make_dataclass)
        schema_name: Optional name for the schema metadata
        
    Returns:
        PyArrow Schema with fields corresponding to the dataclass fields
        
    Raises:
        ValueError: If the input is not a dataclass or contains unsupported types
    """
    if not is_dataclass(dataclass_type):
        raise ValueError("Input must be a dataclass type")
    
    pa_fields = []
    primary_keys = []
    references = {}
    
    for field in fields(dataclass_type):
        field_name = field.name
        field_type = field.type
        
        try:
            # Extract type and annotations
            actual_type, annotations = _extract_type_and_annotations(field_type)
            
            # Check for primary key annotation
            if _find_annotation_of_type(annotations, PrimaryKey) is not None:
                primary_keys.append(field_name)
            
            # Check for reference annotation
            reference_annotation = _find_annotation_of_type(annotations, Reference)
            if reference_annotation is not None:
                references[field_name] = reference_annotation.referenced_type.__name__
            
            # Determine if field is nullable first (before converting type)
            is_nullable = False
            
            # Check if type is explicitly nullable (Type | None)
            if _is_nullable_type(actual_type):
                is_nullable = True
            
            # Check for default values
            if hasattr(field, 'default') and field.default is not dataclasses.MISSING:
                is_nullable = True
            elif hasattr(field, 'default_factory') and field.default_factory is not dataclasses.MISSING:
                is_nullable = True
            
            # Convert Python type to PyArrow type (this will handle Union types)
            pa_type = python_type_to_pyarrow_type(actual_type)
            
            # Create PyArrow field with metadata
            field_metadata = {}
            if field_name in primary_keys:
                field_metadata["primary_key"] = "true"
            if field_name in references:
                field_metadata["reference"] = references[field_name]
            
            pa_field = pa.field(
                field_name, 
                pa_type, 
                nullable=is_nullable,
                metadata=field_metadata if field_metadata else None
            )
            pa_fields.append(pa_field)
            
        except ValueError as e:
            raise ValueError(f"Error converting field '{field_name}': {e}")
    
    # Create schema metadata
    metadata = {}
    if schema_name:
        metadata["schema_name"] = schema_name
    if primary_keys:
        metadata["primary_keys"] = ",".join(primary_keys)
    if references:
        metadata["references"] = str(references)
    
    return pa.schema(pa_fields, metadata=metadata if metadata else None)


def create_pyarrow_table_from_dataclass_instances(instances: list, schema: pa.Schema | None = None) -> pa.Table:
    """
    Create a PyArrow Table from a list of dataclass instances.
    
    Args:
        instances: List of dataclass instances
        schema: Optional PyArrow schema. If not provided, will be inferred from the first instance
        
    Returns:
        PyArrow Table containing the data
        
    Raises:
        ValueError: If instances is empty or contains non-dataclass objects
    """
    if not instances:
        raise ValueError("Instances list cannot be empty")
    
    first_instance = instances[0]
    if not is_dataclass(first_instance):
        raise ValueError("All instances must be dataclass objects")
    
    # If no schema provided, create one from the first instance
    if schema is None:
        schema = dataclass_to_pyarrow_schema(type(first_instance))
    
    # At this point schema is guaranteed to not be None
    assert schema is not None
    
    # Convert instances to dictionaries
    data_dict = {name: [] for name in schema.names}
    
    for instance in instances:
        if not is_dataclass(instance):
            raise ValueError("All instances must be dataclass objects")
        
        for field_name in data_dict.keys():
            value = getattr(instance, field_name, None)
            data_dict[field_name].append(value)
    
    return pa.table(data_dict, schema=schema)


def print_schema_info(schema: pa.Schema) -> None:
    """
    Print detailed information about a PyArrow schema.
    
    Args:
        schema: PyArrow schema to analyze
    """
    print(f"PyArrow Schema ({len(schema)} fields):")
    print("-" * 50)
    
    for i, field in enumerate(schema):
        nullable_str = "nullable" if field.nullable else "non-null"
        field_info = f"  {i+1}. {field.name}: {field.type} ({nullable_str})"
        
        # Add field-specific metadata
        if field.metadata:
            metadata_items = []
            # Convert bytes to strings for PyArrow metadata
            field_metadata = {k.decode() if isinstance(k, bytes) else k: 
                            v.decode() if isinstance(v, bytes) else v 
                            for k, v in field.metadata.items()}
            if "primary_key" in field_metadata:
                metadata_items.append("PRIMARY KEY")
            if "reference" in field_metadata:
                metadata_items.append(f"REFERENCES {field_metadata['reference']}")
            if metadata_items:
                field_info += f" - {', '.join(metadata_items)}"
        
        print(field_info)
    
    # Print schema-level metadata
    if schema.metadata:
        # Convert bytes to strings for PyArrow metadata
        schema_metadata = {k.decode() if isinstance(k, bytes) else k: 
                          v.decode() if isinstance(v, bytes) else v 
                          for k, v in schema.metadata.items()}
        print(f"\nSchema Metadata:")
        if "schema_name" in schema_metadata:
            print(f"  Name: {schema_metadata['schema_name']}")
        if "primary_keys" in schema_metadata:
            print(f"  Primary Keys: {schema_metadata['primary_keys']}")
        if "references" in schema_metadata:
            print(f"  References: {schema_metadata['references']}")
    
    print(f"\nSchema size estimate: ~{len(str(schema))} bytes")


# Example usage function for documentation
def example_usage():
    """
    Example demonstrating how to use the PyArrow schema utilities.
    
    This function shows the typical workflow of:
    1. Creating dataclasses with annotations (primary keys, references, nullable fields)
    2. Converting them to PyArrow schemas
    3. Creating PyArrow tables from instances
    """
    from dataclasses import make_dataclass, dataclass
    
    # Step 1: Create dataclasses with the new features
    
    # User dataclass (referenced by other dataclasses)
    @dataclass
    class User:
        id: Annotated[int, PrimaryKey]
        name: str
        email: str | None  # Nullable field
        is_active: bool = True  # Default value makes it nullable
    
    # Order dataclass with references
    @dataclass 
    class Order:
        id: Annotated[int, PrimaryKey]
        user_id: Annotated[int, Reference[User]]  # Reference to User
        total: float
        description: str | None  # Optional field
        created_at: datetime
    
    # Step 2: Convert dataclasses to PyArrow schemas
    user_schema = dataclass_to_pyarrow_schema(User, "users")
    order_schema = dataclass_to_pyarrow_schema(Order, "orders")
    
    # Step 3: Create some data instances
    users = [
        User(1, "Alice", "alice@example.com", True),
        User(2, "Bob", None, False),  # None email
    ]
    
    orders = [
        Order(101, 1, 99.99, "Test order", datetime.now()),
        Order(102, 2, 149.50, None, datetime.now()),  # None description
    ]
    
    # Step 4: Create PyArrow tables
    user_table = create_pyarrow_table_from_dataclass_instances(users, user_schema)
    order_table = create_pyarrow_table_from_dataclass_instances(orders, order_schema)
    
    return user_schema, order_schema, user_table, order_table


if __name__ == "__main__":
    print("PyArrow Schema Utils - Example Usage")
    print("For full tests, run: python test_pyarrow_schema_utils.py")
    print()
    
    user_schema, order_schema, user_table, order_table = example_usage()
    
    print("=== USER SCHEMA ===")
    print_schema_info(user_schema)
    print()
    
    print("=== ORDER SCHEMA ===")
    print_schema_info(order_schema)
    print()
    
    print(f"Created user table with {user_table.num_rows} rows")
    print(f"Created order table with {order_table.num_rows} rows")