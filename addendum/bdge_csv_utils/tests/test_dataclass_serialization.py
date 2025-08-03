#!/usr/bin/env python3
"""
Test script demonstrating dataclass serialization and deserialization.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from csv_schema.csv_schema_utils import (
    schema_to_python_code,
    save_schema_to_file,
    load_schema_from_file,
    load_schema_from_string
)

# Example dataclass with various field types
@dataclass
class Person:
    name: str
    age: int = 0
    email: Optional[str] = None
    tags: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    active: bool = True

def test_schema_serialization():
    """Test converting dataclass to Python code."""
    print("=== Original Dataclass ===")
    print(f"Class name: {Person.__name__}")

    # Create instance
    person = Person(name="Alice", age=25, tags=["admin", "user"])
    print(f"Instance: {person}")

    print("\n=== Generated Python Code ===")
    code: str = schema_to_python_code(Person)
    print(code)

    print("\n=== Save to File and Load Back ===")

    # Save to file
    save_schema_to_file(Person, "person_schema.py")
    print("✓ Saved to person_schema.py")

    # Load from file
    LoadedPerson = load_schema_from_file("person_schema.py", "Person")
    print(f"✓ Loaded class: {LoadedPerson.__name__}")

    # Test that it works
    loaded_person = LoadedPerson(name="Bob", age=30)
    print(f"✓ Created instance: {loaded_person}")

    print("\n=== Load from String ===")

    # Load from code string (using default namespace name)
    StringLoadedPerson = load_schema_from_string(code, "Person")
    string_person = StringLoadedPerson(name="Charlie", age=35, tags=["developer"])
    print(f"✓ Created from string: {string_person}")

    # Test with custom namespace name
    CustomNamespacePerson = load_schema_from_string(code, "Person")
    custom_person = CustomNamespacePerson(name="Diana", age=28, email="diana@example.com")
    print(f"✓ Created from string with custom namespace: {custom_person}")

    print("\n=== Comparison ===")
    print(f"Original fields: {[f.name for f in Person.__dataclass_fields__.values()]}")
    print(f"Loaded fields: {[f.name for f in LoadedPerson.__dataclass_fields__.values()]}")
    print(f"String loaded fields: {[f.name for f in StringLoadedPerson.__dataclass_fields__.values()]}")
    print(f"Custom namespace fields: {[f.name for f in CustomNamespacePerson.__dataclass_fields__.values()]}")

    print("\n=== Namespace Test ===")
    print(f"String loaded class module: {StringLoadedPerson.__module__}")
    print(f"Custom namespace class module: {CustomNamespacePerson.__module__}")

# Test dataclass with optional type and Annotated field
def test_optional_and_annotated_field():
    """Test a dataclass with an optional type and Annotated field."""
    from typing import Annotated

    @dataclass
    class SchemaWithOptionalAndAnnotated:
        id: Annotated[int, "Primary Key"]
        value: int | None

    print("=== SchemaWithOptionalAndAnnotated ===")
    print(f"Class name: {SchemaWithOptionalAndAnnotated.__name__}")

    # Create instance
    instance = SchemaWithOptionalAndAnnotated(id=1, value=None)
    print(f"Instance: {instance}")

    print("\n=== Generated Python Code ===")
    code: str = schema_to_python_code(SchemaWithOptionalAndAnnotated)
    print(code)

    print("\n=== Save to File and Load Back ===")

    # Save to file
    save_schema_to_file(SchemaWithOptionalAndAnnotated, "schema_with_optional_and_annotated.py")
    print("✓ Saved to schema_with_optional_and_annotated.py")

    # Load from file
    LoadedSchema = load_schema_from_file("schema_with_optional_and_annotated.py", "SchemaWithOptionalAndAnnotated")
    print(f"✓ Loaded class: {LoadedSchema.__name__}")

    # Test that it works
    loaded_instance = LoadedSchema(id=2, value=42)
    print(f"✓ Created instance: {loaded_instance}")

    print("\n=== Load from String ===")

    # Load from code string (using default namespace name)
    StringLoadedSchema = load_schema_from_string(code, "SchemaWithOptionalAndAnnotated")
    string_instance = StringLoadedSchema(id=3, value=99)
    print(f"✓ Created from string: {string_instance}")

    print("\n=== Comparison ===")
    print(f"Original fields: {[f.name for f in SchemaWithOptionalAndAnnotated.__dataclass_fields__.values()]}")
    print(f"Loaded fields: {[f.name for f in LoadedSchema.__dataclass_fields__.values()]}")
    print(f"String loaded fields: {[f.name for f in StringLoadedSchema.__dataclass_fields__.values()]}")

if __name__ == "__main__":
    test_schema_serialization()
    test_optional_and_annotated_field()
