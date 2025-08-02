import pytest
from dataclasses import dataclass, field
from typing import Any, Optional, get_origin, get_args, Union
from datetime import datetime

from csv_schema_utils import update_schema_fields


def is_list_of_type(field_type, expected_element_type):
    """Check if a type annotation is list[expected_element_type]"""
    origin = get_origin(field_type)
    args = get_args(field_type)

    # Check if origin is list and argument matches expected type
    return origin is list and len(args) == 1 and args[0] is expected_element_type


def is_dict_of_types(field_type, expected_key_type, expected_value_type):
    """Check if a type annotation is dict[expected_key_type, expected_value_type]"""
    origin = get_origin(field_type)
    args = get_args(field_type)

    # Check if origin is dict and arguments match expected types
    return (origin is dict and len(args) == 2 and
            args[0] is expected_key_type and args[1] is expected_value_type)


def is_optional_of_type(field_type, expected_type):
    """Check if a type annotation is Optional[expected_type] (Union[expected_type, None])"""
    origin = get_origin(field_type)
    args = get_args(field_type)

    # Optional[T] is Union[T, None]
    if origin is not Union:
        return False

    # Should have exactly 2 args: the type and NoneType
    if len(args) != 2:
        return False

    # One should be the expected type, the other should be NoneType
    return (args[0] is expected_type and args[1] is type(None)) or \
           (args[0] is type(None) and args[1] is expected_type)


class TestUpdateSchemaFields:
    """Tests for the update_schema_fields function."""

    def test_update_single_field_type(self):
        """Test updating a single field's type annotation."""
        @dataclass
        class OriginalSchema:
            name: str
            age: int
            email: str

        changes = [("age", float)]
        updated_schema = update_schema_fields(OriginalSchema, changes)

        # Check that the class name is preserved
        assert updated_schema.__name__ == "OriginalSchema"

        # Check field types
        fields_dict = {f.name: f.type for f in updated_schema.__dataclass_fields__.values()}
        assert fields_dict["name"] is str
        assert fields_dict["age"] is float  # Changed from int to float
        assert fields_dict["email"] is str

    def test_update_multiple_fields(self):
        """Test updating multiple fields at once."""
        @dataclass
        class OriginalSchema:
            name: str
            age: int
            height: int
            active: bool

        changes = [
            ("age", Optional[int]),
            ("height", float),
            ("active", str)
        ]
        updated_schema = update_schema_fields(OriginalSchema, changes)

        fields_dict = {f.name: f.type for f in updated_schema.__dataclass_fields__.values()}
        assert fields_dict["name"] is str
        assert is_optional_of_type(fields_dict["age"], int)  # Check Optional[int] properly
        assert fields_dict["height"] is float
        assert fields_dict["active"] is str

    def test_update_nonexistent_field(self):
        """Test that updating a non-existent field doesn't affect the schema."""
        @dataclass
        class OriginalSchema:
            name: str
            age: int

        changes = [("nonexistent_field", float)]
        updated_schema = update_schema_fields(OriginalSchema, changes)

        fields_dict = {f.name: f.type for f in updated_schema.__dataclass_fields__.values()}
        assert fields_dict["name"] is str
        assert fields_dict["age"] is int
        assert len(fields_dict) == 2  # No new fields added

    def test_preserve_default_values(self):
        """Test that default values are preserved."""
        @dataclass
        class OriginalSchema:
            name: str = "default_name"
            age: int = 0
            active: bool = True

        changes = [("age", float)]
        updated_schema = update_schema_fields(OriginalSchema, changes)

        # Create an instance to check defaults
        instance = updated_schema()
        assert instance.name == "default_name"
        assert instance.age == 0
        assert instance.active is True

        # Check that the type was updated
        fields_dict = {f.name: f.type for f in updated_schema.__dataclass_fields__.values()}
        assert fields_dict["age"] is float

    def test_preserve_default_factory(self):
        """Test that default_factory is preserved."""
        @dataclass
        class OriginalSchema:
            name: str
            tags: list[str] = field(default_factory=list)
            created_at: datetime = field(default_factory=datetime.now)

        changes = [("name", Optional[str])]
        updated_schema = update_schema_fields(OriginalSchema, changes)

        # Create an instance to check default factories work
        instance = updated_schema(name="test")
        assert isinstance(instance.tags, list)
        assert len(instance.tags) == 0
        assert isinstance(instance.created_at, datetime)

        # Check that the type was updated
        fields_dict = {f.name: f.type for f in updated_schema.__dataclass_fields__.values()}
        assert is_optional_of_type(fields_dict["name"], str)  # Check Optional[str] properly

    def test_mixed_fields_with_and_without_defaults(self):
        """Test schema with mix of fields with defaults, default_factory, and no defaults."""
        @dataclass
        class OriginalSchema:
            id: int  # No default
            name: str = "unnamed"  # Default value
            tags: list[str] = field(default_factory=list)  # Default factory
            active: bool = True  # Default value

        changes = [
            ("id", str),
            ("tags", list[int])
        ]
        updated_schema = update_schema_fields(OriginalSchema, changes)

        # Check types were updated
        fields_dict = {f.name: f.type for f in updated_schema.__dataclass_fields__.values()}
        assert fields_dict["id"] is str
        assert fields_dict["name"] is str
        assert is_list_of_type(fields_dict["tags"], int)  # Check list[int] properly
        assert fields_dict["active"] is bool

        # Check that defaults are preserved
        instance = updated_schema(id="123")  # id is required now
        assert instance.id == "123"
        assert instance.name == "unnamed"
        assert isinstance(instance.tags, list)
        assert instance.active is True

    def test_empty_changes_list(self):
        """Test that passing an empty changes list returns equivalent schema."""
        @dataclass
        class OriginalSchema:
            name: str
            age: int

        changes = []
        updated_schema = update_schema_fields(OriginalSchema, changes)

        # Should be functionally equivalent
        fields_dict = {f.name: f.type for f in updated_schema.__dataclass_fields__.values()}
        original_fields = {f.name: f.type for f in OriginalSchema.__dataclass_fields__.values()}

        assert fields_dict == original_fields
        assert updated_schema.__name__ == OriginalSchema.__name__

    def test_complex_type_annotations(self):
        """Test with complex type annotations like Optional, list, etc."""
        @dataclass
        class OriginalSchema:
            name: Optional[str]
            ages: list[int]
            metadata: dict[str, Any]

        changes = [
            ("name", str),  # Remove Optional
            ("ages", list[float]),  # Change list element type
            ("metadata", dict[str, str])  # Change dict value type
        ]
        updated_schema = update_schema_fields(OriginalSchema, changes)

        fields_dict = {f.name: f.type for f in updated_schema.__dataclass_fields__.values()}
        assert fields_dict["name"] is str
        assert is_list_of_type(fields_dict["ages"], float)  # Check list[float] properly
        assert is_dict_of_types(fields_dict["metadata"], str, str)  # Check dict[str, str] properly

    def test_schema_class_name_preservation(self):
        """Test that custom class names are preserved."""
        @dataclass
        class CustomUserSchema:
            username: str
            email: str

        changes = [("email", Optional[str])]
        updated_schema = update_schema_fields(CustomUserSchema, changes)

        assert updated_schema.__name__ == "CustomUserSchema"

        # Check that the type was updated properly
        fields_dict = {f.name: f.type for f in updated_schema.__dataclass_fields__.values()}
        assert is_optional_of_type(fields_dict["email"], str)  # Check Optional[str] properly

    def test_field_order_preservation(self):
        """Test that field order is preserved."""
        @dataclass
        class OriginalSchema:
            first_field: str
            second_field: int
            third_field: bool

        changes = [("second_field", float)]
        updated_schema = update_schema_fields(OriginalSchema, changes)

        field_names = list(updated_schema.__dataclass_fields__.keys())
        expected_order = ["first_field", "second_field", "third_field"]
        assert field_names == expected_order


# Future test classes can be added here for other functions
class TestCSVConverters:
    """Tests for CSVConverters class methods."""
    # TODO: Add tests for CSVConverters when needed
    pass


class TestCSVTypeDetectorsForDB:
    """Tests for CSVTypeDetectorsForDB class methods."""
    # TODO: Add tests for CSVTypeDetectorsForDB when needed
    pass


class TestInferCSVSchema:
    """Tests for infer_csv_schema function."""
    # TODO: Add tests for infer_csv_schema when needed
    pass


# Test fixtures and utilities can be added here
@pytest.fixture
def sample_csv_content():
    """Fixture providing sample CSV content for testing."""
    return """name,age,email,active
Alice,25,alice@example.com,true
Bob,30,bob@example.com,false
Charlie,35,charlie@example.com,true"""


@pytest.fixture
def temp_csv_file(tmp_path, sample_csv_content):
    """Fixture creating a temporary CSV file for testing."""
    csv_file = tmp_path / "test.csv"
    csv_file.write_text(sample_csv_content)
    return csv_file
