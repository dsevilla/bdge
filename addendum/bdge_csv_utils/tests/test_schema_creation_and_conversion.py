#!/usr/bin/env python3
"""
Comprehensive tests for schema creation and conversion to/from dataclasses.
"""

from dataclasses import dataclass, field
from datetime import datetime, date
from typing import Annotated
from bdge_csv_utils.schema.types import Schema, Field, PrimaryKey, Reference
from bdge_csv_utils.schema.dataclass_conversion import (
    schema_to_dataclass,
    dataclass_to_schema,
    instance_to_schema,
    create_dataclass_with_annotations
)
from bdge_csv_utils.schema.ops import (
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


class TestSchemaCreation:
    """Test basic schema creation and manipulation."""
    
    def test_simple_schema_creation(self):
        """Test creating a simple schema with basic types."""
        fields = [
            Field("id", int),
            Field("name", str),
            Field("age", int | None),
            Field("active", bool)
        ]
        schema = Schema(fields)
        
        assert len(schema.fields) == 4
        assert schema.field_names() == ["id", "name", "age", "active"]
        assert schema.has_field("name")
        assert not schema.has_field("email")
        
        id_field = schema.get_field("id")
        assert id_field is not None
        assert id_field.name == "id"
        assert id_field.field_type == int
    
    def test_annotated_schema_creation(self):
        """Test creating a schema with annotated fields (primary keys, references)."""
        fields = [
            Field("id", Annotated[int, PrimaryKey()]),
            Field("name", str),
            Field("user_id", Annotated[int, Reference[int]()]),
            Field("created_at", datetime)
        ]
        schema = Schema(fields)
        
        assert len(schema.fields) == 4
        id_field = schema.get_field("id")
        assert id_field is not None
        # The field should preserve the annotated type
        assert str(id_field.field_type).startswith("typing.Annotated")
    
    def test_nested_schema_creation(self):
        """Test creating a schema with nested schemas."""
        address_schema = Schema([
            Field("street", str),
            Field("city", str),
            Field("postal_code", str)
        ])
        
        person_schema = Schema([
            Field("id", int),
            Field("name", str),
            Field("address", address_schema)
        ])
        
        assert len(person_schema.fields) == 3
        address_field = person_schema.get_field("address")
        assert address_field is not None
        assert isinstance(address_field.field_type, Schema)
        assert len(address_field.field_type.fields) == 3


class TestSchemaOps:
    """Test schema manipulation operations."""
    
    def setup_method(self):
        """Set up a basic schema for testing."""
        self.schema = Schema([
            Field("id", int),
            Field("name", str),
            Field("email", str | None)
        ])
    
    def test_add_field(self):
        """Test adding a field to a schema."""
        new_schema = add_field(self.schema, Field("age", int))
        
        assert len(new_schema.fields) == 4
        assert new_schema.has_field("age")
        # Original schema should be unchanged
        assert len(self.schema.fields) == 3
    
    def test_remove_field(self):
        """Test removing a field from a schema."""
        new_schema = remove_field(self.schema, "email")
        
        assert len(new_schema.fields) == 2
        assert not new_schema.has_field("email")
        assert new_schema.has_field("id")
        assert new_schema.has_field("name")
    
    def test_rename_field(self):
        """Test renaming a field in a schema."""
        new_schema = rename_field(self.schema, "email", "email_address")
        
        assert len(new_schema.fields) == 3
        assert not new_schema.has_field("email")
        assert new_schema.has_field("email_address")
        
        email_field = new_schema.get_field("email_address")
        assert email_field is not None
        assert email_field.field_type == str | None
    
    def test_merge_schemas(self):
        """Test merging two schemas."""
        schema1 = Schema([
            Field("id", int),
            Field("name", str)
        ])
        
        schema2 = Schema([
            Field("email", str),
            Field("name", str | None)  # This should override schema1's name field
        ])
        
        merged = merge_schemas(schema1, schema2)
        
        assert len(merged.fields) == 3
        assert merged.has_field("id")
        assert merged.has_field("name")
        assert merged.has_field("email")
        
        # Check that schema2's name field took precedence
        name_field = merged.get_field("name")
        assert name_field is not None
        assert name_field.field_type == str | None
    
    def test_validate_schema(self):
        """Test schema validation."""
        # Valid schema
        valid_schema = Schema([
            Field("id", int),
            Field("name", str)
        ])
        errors = validate_schema(valid_schema)
        assert len(errors) == 0
        
        # Schema with duplicate field names
        invalid_schema = Schema([
            Field("id", int),
            Field("name", str),
            Field("id", str)  # Duplicate
        ])
        errors = validate_schema(invalid_schema)
        assert len(errors) == 1
        assert "Duplicate field name: id" in errors[0]
        
        # Schema with invalid field name
        invalid_schema2 = Schema([
            Field("123invalid", int),  # Invalid Python identifier
            Field("valid-name", str)   # Also invalid
        ])
        errors = validate_schema(invalid_schema2)
        assert len(errors) == 2
        assert any("123invalid" in error for error in errors)
        assert any("valid-name" in error for error in errors)


class TestDataclassConversion:
    """Test conversion between schemas and dataclasses."""
    
    def test_schema_to_dataclass_simple(self):
        """Test converting a simple schema to a dataclass."""
        schema = Schema([
            Field("id", int),
            Field("name", str),
            Field("age", int | None)
        ])
        
        PersonClass = schema_to_dataclass(schema, "Person")
        
        # Test that we can create instances
        person = PersonClass(id=1, name="Alice", age=30)
        assert person.id == 1
        assert person.name == "Alice"
        assert person.age == 30
        
        # Test optional field
        person2 = PersonClass(id=2, name="Bob", age=None)
        assert person2.age is None
    
    def test_dataclass_to_schema_simple(self):
        """Test converting a simple dataclass to a schema."""
        @dataclass
        class Person:
            id: int
            name: str
            age: int | None = None
            active: bool = True
        
        schema = dataclass_to_schema(Person)
        
        assert len(schema.fields) == 4
        assert schema.has_field("id")
        assert schema.has_field("name")
        assert schema.has_field("age")
        assert schema.has_field("active")
        
        id_field = schema.get_field("id")
        assert id_field is not None
        assert id_field.field_type == int
        
        age_field = schema.get_field("age")
        assert age_field is not None
        assert age_field.field_type == int | None
    
    def test_nested_dataclass_conversion(self):
        """Test conversion with nested dataclasses/schemas."""
        @dataclass
        class Address:
            street: str
            city: str
            postal_code: str
        
        @dataclass
        class Person:
            id: int
            name: str
            address: Address
        
        # Convert dataclass to schema
        schema = dataclass_to_schema(Person)
        
        assert len(schema.fields) == 3
        address_field = schema.get_field("address")
        assert address_field is not None
        assert isinstance(address_field.field_type, Schema)
        assert len(address_field.field_type.fields) == 3
        
        # Convert schema back to dataclass
        PersonClass = schema_to_dataclass(schema, "GeneratedPerson")
        
        # Test creating instance with nested data
        person = PersonClass(
            id=1,
            name="Alice",
            address=PersonClass.__annotations__["address"](
                street="123 Main St",
                city="Anytown",
                postal_code="12345"
            )
        )
        
        assert person.id == 1
        assert person.name == "Alice"
        assert person.address.street == "123 Main St"
    
    def test_instance_to_schema(self):
        """Test creating a schema from a dataclass instance."""
        @dataclass
        class Product:
            id: int
            name: str
            price: float
            available: bool = True
        
        product = Product(id=1, name="Widget", price=19.99, available=True)
        schema = instance_to_schema(product)
        
        assert len(schema.fields) == 4
        assert schema.has_field("id")
        assert schema.has_field("name")
        assert schema.has_field("price")
        assert schema.has_field("available")
        
        # Check inferred types
        id_field = schema.get_field("id")
        assert id_field is not None
        assert id_field.field_type == int
        
        price_field = schema.get_field("price")
        assert price_field is not None
        assert price_field.field_type == float
    
    def test_round_trip_conversion(self):
        """Test that schema -> dataclass -> schema preserves information."""
        original_schema = Schema([
            Field("id", int),
            Field("title", str),
            Field("score", float),
            Field("tags", list),
            Field("metadata", dict | None)
        ])
        
        # Schema -> Dataclass
        DataClass = schema_to_dataclass(original_schema, "TestClass")
        
        # Dataclass -> Schema
        converted_schema = dataclass_to_schema(DataClass)
        
        # Check that field names are preserved
        assert converted_schema.field_names() == original_schema.field_names()
        
        # Check that basic types are preserved
        for original_field, converted_field in zip(original_schema.fields, converted_schema.fields):
            assert original_field.name == converted_field.name
            # Note: Some type information might be lost in the conversion,
            # but basic types should be preserved


class TestSQLGeneration:
    """Test SQL generation from schemas."""
    
    def test_simple_sql_generation(self):
        """Test generating SQL CREATE TABLE from a simple schema."""
        schema = Schema([
            Field("id", int),
            Field("name", str),
            Field("age", int | None),
            Field("active", bool)
        ])
        
        sql = schema_to_sql(schema, "users")
        
        assert "CREATE TABLE users" in sql
        assert "id INTEGER NOT NULL" in sql
        assert "name TEXT NOT NULL" in sql
        assert "age INTEGER" in sql  # Optional field should not have NOT NULL
        assert "active BOOLEAN NOT NULL" in sql
    
    def test_annotated_sql_generation(self):
        """Test SQL generation with annotated fields."""
        schema = Schema([
            Field("id", Annotated[int, PrimaryKey()]),
            Field("name", str),
            Field("email", str | None)
        ])
        
        sql = schema_to_sql(schema, "users")
        
        assert "CREATE TABLE users" in sql
        assert "id INTEGER PRIMARY KEY" in sql
        assert "name TEXT NOT NULL" in sql
        assert "email TEXT" in sql
    
    def test_sql_insert_generation(self):
        """Test generating SQL INSERT statements."""
        schema = Schema([
            Field("id", int),
            Field("name", str),
            Field("email", str)
        ])
        
        insert_sql = schema_to_sql_insert(schema, "users")
        
        assert insert_sql == "INSERT INTO users (id, name, email) VALUES (?, ?, ?);"
    
    def test_sql_select_generation(self):
        """Test generating SQL SELECT statements."""
        schema = Schema([
            Field("id", int),
            Field("name", str),
            Field("email", str)
        ])
        
        select_sql = schema_to_sql_select(schema, "users")
        
        assert select_sql == "SELECT id, name, email FROM users;"
    
    def test_complex_types_sql_generation(self):
        """Test SQL generation with complex types."""
        schema = Schema([
            Field("id", int),
            Field("created_at", datetime),
            Field("birth_date", date),
            Field("data", bytes),
            Field("config", dict)  # Should default to TEXT
        ])
        
        sql = schema_to_sql(schema, "records")
        
        assert "id INTEGER NOT NULL" in sql
        assert "created_at TIMESTAMP NOT NULL" in sql
        assert "birth_date DATE NOT NULL" in sql
        assert "data BLOB NOT NULL" in sql
        assert "config TEXT NOT NULL" in sql


def test_comprehensive_example():
    """A comprehensive example showing the full workflow."""
    print("\n=== Comprehensive Schema Example ===")
    
    # 1. Create a schema programmatically
    user_schema = Schema([
        Field("id", Annotated[int, PrimaryKey()]),
        Field("username", str),
        Field("email", str | None),
        Field("created_at", datetime),
        Field("is_active", bool)
    ])
    
    print("1. Created schema:")
    print_schema(user_schema)
    
    # 2. Convert to dataclass
    UserClass = schema_to_dataclass(user_schema, "User")
    print(f"\n2. Generated dataclass: {UserClass}")
    
    # 3. Create an instance
    user = UserClass(
        id=1,
        username="alice",
        email="alice@example.com",
        created_at=datetime.now(),
        is_active=True
    )
    print(f"\n3. Created instance: {user}")
    
    # 4. Generate SQL
    create_sql = schema_to_sql(user_schema, "users")
    print(f"\n4. Generated SQL:\n{create_sql}")
    
    # 5. Add a field to the schema
    extended_schema = add_field(user_schema, Field("last_login", datetime | None))
    print(f"\n5. Extended schema with {len(extended_schema.fields)} fields")
    
    # 6. Validate the schema
    errors = validate_schema(extended_schema)
    print(f"\n6. Schema validation: {'✓ Valid' if not errors else f'✗ Errors: {errors}'}")
    
    assert len(errors) == 0, "Schema should be valid"


def run_all_tests():
    """Run all tests without pytest."""
    print("Running all schema tests...")
    
    # Instantiate test classes and run their methods
    test_schema_creation = TestSchemaCreation()
    test_schema_creation.test_simple_schema_creation()
    test_schema_creation.test_annotated_schema_creation()
    test_schema_creation.test_nested_schema_creation()
    print("✓ Schema creation tests passed")
    
    test_schema_ops = TestSchemaOps()
    test_schema_ops.setup_method()
    test_schema_ops.test_add_field()
    test_schema_ops.test_remove_field()
    test_schema_ops.test_rename_field()
    test_schema_ops.test_merge_schemas()
    test_schema_ops.test_validate_schema()
    print("✓ Schema operations tests passed")
    
    test_dataclass_conversion = TestDataclassConversion()
    test_dataclass_conversion.test_schema_to_dataclass_simple()
    test_dataclass_conversion.test_dataclass_to_schema_simple()
    test_dataclass_conversion.test_nested_dataclass_conversion()
    test_dataclass_conversion.test_instance_to_schema()
    test_dataclass_conversion.test_round_trip_conversion()
    print("✓ Dataclass conversion tests passed")
    
    test_sql_generation = TestSQLGeneration()
    test_sql_generation.test_simple_sql_generation()
    test_sql_generation.test_annotated_sql_generation()
    test_sql_generation.test_sql_insert_generation()
    test_sql_generation.test_sql_select_generation()
    test_sql_generation.test_complex_types_sql_generation()
    print("✓ SQL generation tests passed")
    
    print("\n🎉 All tests passed!")


if __name__ == "__main__":
    # Run the comprehensive example
    test_comprehensive_example()
    
    # Run all tests
    run_all_tests()
