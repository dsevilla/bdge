#!/usr/bin/env python3
"""
Test script for the new PyArrow schema features:
- Optional fields (Type | None)
- Primary key annotations
- Reference annotations
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Annotated
from pyarrow_schema_utils import (
    dataclass_to_pyarrow_schema, 
    print_schema_info, 
    create_pyarrow_table_from_dataclass_instances,
    PrimaryKey,
    Reference
)

def test_new_features():
    """Test all new features: nullable fields, primary keys, references"""
    
    print("=== Testing New Features ===")
    
    # Define test dataclasses
    @dataclass
    class User:
        id: Annotated[int, PrimaryKey]
        name: str
        email: str | None  # Optional field
        age: int | None = None  # Optional with default
        is_active: bool = True  # Default value
    
    @dataclass
    class Order:
        id: Annotated[int, PrimaryKey]
        user_id: Annotated[int, Reference[User]]
        amount: float
        description: str | None
        created_at: datetime
    
    # Test schema creation
    user_schema = dataclass_to_pyarrow_schema(User, "users")
    order_schema = dataclass_to_pyarrow_schema(Order, "orders")
    
    print("USER SCHEMA:")
    print_schema_info(user_schema)
    print()
    
    print("ORDER SCHEMA:")
    print_schema_info(order_schema)
    print()
    
    # Test with actual data
    users = [
        User(1, "Alice", "alice@example.com", 30, True),
        User(2, "Bob", None, None, False),  # None values
    ]
    
    orders = [
        Order(101, 1, 99.99, "First order", datetime.now()),
        Order(102, 2, 149.50, None, datetime.now()),  # None description
    ]
    
    # Create tables
    user_table = create_pyarrow_table_from_dataclass_instances(users, user_schema)
    order_table = create_pyarrow_table_from_dataclass_instances(orders, order_schema)
    
    print(f"✓ Created user table with {user_table.num_rows} rows")
    print(f"✓ Created order table with {order_table.num_rows} rows")
    
    # Verify metadata
    user_metadata = {k.decode(): v.decode() for k, v in user_schema.metadata.items()}
    order_metadata = {k.decode(): v.decode() for k, v in order_schema.metadata.items()}
    
    assert "primary_keys" in user_metadata
    assert user_metadata["primary_keys"] == "id"
    assert "references" in order_metadata
    print("✓ Metadata correctly stored")
    
    # Verify field metadata
    user_id_field = user_schema.field("id")
    order_user_id_field = order_schema.field("user_id")
    
    user_id_metadata = {k.decode(): v.decode() for k, v in user_id_field.metadata.items()}
    order_user_id_metadata = {k.decode(): v.decode() for k, v in order_user_id_field.metadata.items()}
    
    assert user_id_metadata["primary_key"] == "true"
    assert order_user_id_metadata["reference"] == "User"
    print("✓ Field metadata correctly stored")
    
    # Verify nullable fields
    assert user_schema.field("email").nullable == True
    assert user_schema.field("age").nullable == True
    assert user_schema.field("is_active").nullable == True  # Has default
    assert user_schema.field("name").nullable == False
    print("✓ Nullable fields correctly identified")
    
    print("\n🎉 All new feature tests passed!")

if __name__ == "__main__":
    test_new_features()
