#!/usr/bin/env python3
"""
Tests for advanced schema operations and edge cases.
"""

from dataclasses import dataclass, field
from datetime import datetime, date
from typing import List, Dict, Any, Annotated
from bdge_csv_utils.schema.types import Schema, Field, PrimaryKey, Reference
from bdge_csv_utils.schema.dataclass_conversion import (
    schema_to_dataclass,
    dataclass_to_schema,
    instance_to_schema,
    create_dataclass_with_annotations
)
from bdge_csv_utils.schema.ops import (
    schema_to_sql,
    merge_schemas,
    validate_schema,
    add_field,
    remove_field
)


def test_complex_dataclass_to_schema():
    """Test converting complex dataclasses with various field types."""
    
    @dataclass
    class Tag:
        name: str
        color: str = "blue"
    
    @dataclass
    class Article:
        id: int
        title: str
        content: str
        author_id: int | None = None
        tags: List[str] = field(default_factory=list)
        metadata: Dict[str, Any] = field(default_factory=dict)
        published_at: datetime | None = None
        is_draft: bool = True
        tag_objects: List[Tag] = field(default_factory=list)
    
    schema = dataclass_to_schema(Article)
    
    print("=== Complex Dataclass to Schema ===")
    print(f"Schema has {len(schema.fields)} fields:")
    for f in schema.fields:
        print(f"  - {f.name}: {f.field_type}")
    
    # Verify specific fields
    assert schema.has_field("id")
    assert schema.has_field("title")
    assert schema.has_field("tags")
    assert schema.has_field("metadata")
    
    # Convert back to dataclass
    GeneratedClass = schema_to_dataclass(schema, "GeneratedArticle")
    
    # Test creating an instance
    article = GeneratedClass(
        id=1,
        title="Test Article",
        content="This is a test",
        author_id=123,
        tags=["python", "testing"],
        metadata={"category": "tech"},
        published_at=datetime.now(),
        is_draft=False,
        tag_objects=[]
    )
    
    assert article.id == 1
    assert article.title == "Test Article"
    assert len(article.tags) == 2
    print("✓ Complex dataclass conversion successful")


def test_annotated_fields_preservation():
    """Test that annotated fields with metadata are properly handled."""
    
    # Create schema with annotated fields
    schema = Schema([
        Field("id", Annotated[int, PrimaryKey()]),
        Field("name", str),
        Field("parent_id", Annotated[int | None, Reference[int]()]),
        Field("created_at", datetime)
    ])
    
    print("\n=== Annotated Fields Test ===")
    print("Original schema:")
    for f in schema.fields:
        print(f"  - {f.name}: {f.field_type}")
    
    # Convert to dataclass with annotations preserved
    AnnotatedClass = create_dataclass_with_annotations(schema, "AnnotatedEntity")
    
    # Test creating instance
    entity = AnnotatedClass(
        id=1,
        name="Test Entity",
        parent_id=None,
        created_at=datetime.now()
    )
    
    assert entity.id == 1
    assert entity.name == "Test Entity"
    assert entity.parent_id is None
    
    # Convert back to schema
    converted_schema = dataclass_to_schema(AnnotatedClass)
    
    print("Converted back to schema:")
    for f in converted_schema.fields:
        print(f"  - {f.name}: {f.field_type}")
    
    print("✓ Annotated fields preservation successful")


def test_nested_schema_operations():
    """Test operations with nested schemas."""
    
    # Create nested schemas
    address_schema = Schema([
        Field("street", str),
        Field("city", str),
        Field("country", str),
        Field("postal_code", str | None)
    ])
    
    contact_schema = Schema([
        Field("email", str),
        Field("phone", str | None)
    ])
    
    person_schema = Schema([
        Field("id", Annotated[int, PrimaryKey()]),
        Field("name", str),
        Field("address", address_schema),
        Field("contact", contact_schema),
        Field("birth_date", date | None)
    ])
    
    print("\n=== Nested Schema Operations ===")
    print(f"Person schema has {len(person_schema.fields)} fields:")
    for f in person_schema.fields:
        if isinstance(f.field_type, Schema):
            print(f"  - {f.name}: Schema with {len(f.field_type.fields)} fields")
        else:
            print(f"  - {f.name}: {f.field_type}")
    
    # Convert to dataclass
    PersonClass = schema_to_dataclass(person_schema, "Person")
    
    # Get the nested dataclass types
    AddressClass = PersonClass.__annotations__["address"]
    ContactClass = PersonClass.__annotations__["contact"]
    
    # Create instances
    address = AddressClass(
        street="123 Main St",
        city="Anytown",
        country="USA",
        postal_code="12345"
    )
    
    contact = ContactClass(
        email="john@example.com",
        phone="+1-555-1234"
    )
    
    person = PersonClass(
        id=1,
        name="John Doe",
        address=address,
        contact=contact,
        birth_date=date(1990, 1, 1)
    )
    
    assert person.id == 1
    assert person.name == "John Doe"
    assert person.address.street == "123 Main St"
    assert person.contact.email == "john@example.com"
    
    print("✓ Nested schema operations successful")


def test_sql_generation_edge_cases():
    """Test SQL generation with various edge cases."""
    
    schema = Schema([
        Field("id", Annotated[int, PrimaryKey()]),
        Field("title", str),
        Field("content", str | None),
        Field("tags", List[str]),  # Complex type -> TEXT
        Field("metadata", Dict[str, Any]),  # Complex type -> TEXT
        Field("score", float),
        Field("published", bool),
        Field("created_at", datetime),
        Field("updated_at", datetime | None),
        Field("data", bytes)
    ])
    
    print("\n=== SQL Generation Edge Cases ===")
    
    # Test CREATE TABLE
    create_sql = schema_to_sql(schema, "articles")
    print("CREATE TABLE SQL:")
    print(create_sql)
    
    # Verify key components
    assert "id INTEGER PRIMARY KEY" in create_sql
    assert "title TEXT NOT NULL" in create_sql
    assert "content TEXT" in create_sql  # Optional, no NOT NULL
    assert "tags TEXT NOT NULL" in create_sql  # List -> TEXT
    assert "metadata TEXT NOT NULL" in create_sql  # Dict -> TEXT
    assert "score REAL NOT NULL" in create_sql
    assert "published BOOLEAN NOT NULL" in create_sql
    assert "created_at TIMESTAMP NOT NULL" in create_sql
    assert "updated_at TIMESTAMP" in create_sql  # Optional
    assert "data BLOB NOT NULL" in create_sql
    
    print("✓ SQL generation edge cases successful")


def test_schema_validation_comprehensive():
    """Test comprehensive schema validation."""
    
    print("\n=== Schema Validation Tests ===")
    
    # Test valid schema
    valid_schema = Schema([
        Field("id", int),
        Field("name", str),
        Field("valid_field_name", str),
        Field("_private_field", str),
        Field("field123", str)
    ])
    
    errors = validate_schema(valid_schema)
    assert len(errors) == 0, f"Valid schema should have no errors, got: {errors}"
    print("✓ Valid schema passes validation")
    
    # Test schema with various validation errors
    invalid_schema = Schema([
        Field("id", int),
        Field("name", str),
        Field("id", str),  # Duplicate name
        Field("123invalid", str),  # Starts with number
        Field("invalid-name", str),  # Contains hyphen
        Field("invalid name", str),  # Contains space
        Field("def", str),  # Python keyword
        Field("class", str),  # Python keyword
    ])
    
    errors = validate_schema(invalid_schema)
    print(f"Invalid schema has {len(errors)} errors:")
    for error in errors:
        print(f"  - {error}")
    
    assert len(errors) > 0, "Invalid schema should have errors"
    
    # Check for specific errors
    assert any("Duplicate field name: id" in error for error in errors)
    assert any("123invalid" in error for error in errors)
    assert any("invalid-name" in error for error in errors)
    
    print("✓ Invalid schema properly rejected")


def test_schema_merging_complex():
    """Test complex schema merging scenarios."""
    
    print("\n=== Complex Schema Merging ===")
    
    # Base user schema
    user_schema = Schema([
        Field("id", Annotated[int, PrimaryKey()]),
        Field("username", str),
        Field("email", str),
        Field("created_at", datetime)
    ])
    
    # Profile extension schema
    profile_schema = Schema([
        Field("email", str | None),  # Override to make optional
        Field("first_name", str),
        Field("last_name", str),
        Field("bio", str | None),
        Field("avatar_url", str | None)
    ])
    
    # Preferences schema
    preferences_schema = Schema([
        Field("theme", str),
        Field("language", str),
        Field("notifications_enabled", bool),
        Field("timezone", str)
    ])
    
    # Merge all schemas
    extended_schema = merge_schemas(user_schema, profile_schema)
    full_schema = merge_schemas(extended_schema, preferences_schema)
    
    print(f"Merged schema has {len(full_schema.fields)} fields:")
    for f in full_schema.fields:
        print(f"  - {f.name}: {f.field_type}")
    
    # Verify merging behavior
    assert full_schema.has_field("id")
    assert full_schema.has_field("username")
    assert full_schema.has_field("first_name")
    assert full_schema.has_field("theme")
    
    # Check that email field was overridden
    email_field = full_schema.get_field("email")
    assert email_field is not None
    assert email_field.field_type == str | None  # Should be optional from profile_schema
    
    print("✓ Complex schema merging successful")


def test_real_world_example():
    """Test a real-world example with e-commerce entities."""
    
    print("\n=== Real-World E-commerce Example ===")
    
    # Define related schemas
    category_schema = Schema([
        Field("id", Annotated[int, PrimaryKey()]),
        Field("name", str),
        Field("slug", str),
        Field("parent_id", Annotated[int | None, Reference[int]()])
    ])
    
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
    
    order_item_schema = Schema([
        Field("id", Annotated[int, PrimaryKey()]),
        Field("product_id", Annotated[int, Reference[int]()]),
        Field("quantity", int),
        Field("unit_price", float),
        Field("total_price", float)
    ])
    
    # Convert to dataclasses
    CategoryClass = schema_to_dataclass(category_schema, "Category")
    ProductClass = schema_to_dataclass(product_schema, "Product")
    OrderItemClass = schema_to_dataclass(order_item_schema, "OrderItem")
    
    # Create instances
    category = CategoryClass(
        id=1,
        name="Electronics",
        slug="electronics",
        parent_id=None
    )
    
    product = ProductClass(
        id=101,
        name="Smartphone",
        description="Latest model smartphone",
        price=699.99,
        category_id=1,
        sku="PHONE-001",
        in_stock=True,
        created_at=datetime.now(),
        updated_at=None
    )
    
    order_item = OrderItemClass(
        id=1001,
        product_id=101,
        quantity=2,
        unit_price=699.99,
        total_price=1399.98
    )
    
    # Generate SQL for all tables
    print("Generated SQL tables:")
    print("\n1. Categories:")
    print(schema_to_sql(category_schema, "categories"))
    
    print("\n2. Products:")
    print(schema_to_sql(product_schema, "products"))
    
    print("\n3. Order Items:")
    print(schema_to_sql(order_item_schema, "order_items"))
    
    # Verify instances
    assert category.name == "Electronics"
    assert product.price == 699.99
    assert order_item.total_price == 1399.98
    
    print("\n✓ Real-world e-commerce example successful")


def run_all_tests():
    """Run all the tests."""
    print("Running Advanced Schema Tests...")
    
    test_complex_dataclass_to_schema()
    test_annotated_fields_preservation()
    test_nested_schema_operations()
    test_sql_generation_edge_cases()
    test_schema_validation_comprehensive()
    test_schema_merging_complex()
    test_real_world_example()
    
    print("\n🎉 All advanced schema tests passed!")


if __name__ == "__main__":
    run_all_tests()
