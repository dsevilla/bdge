from typing import Any, Annotated
from collections import OrderedDict

class PrimaryKey:
    """Marker for primary key fields."""
    ...

class Reference[R]:
    """Marker for reference fields."""
    ...

class Field:
    """Represents a field in a schema."""
    def __init__(self, name: str, field_type: Any, metadata: dict[Any, Any] | None = None) -> None:
        self.name: str = name
        self.field_type: Any = field_type
        self.metadata: dict[Any, Any] = metadata if metadata is not None else {}

    def __repr__(self) -> str:
        return f"Field(name='{self.name}', field_type={self.field_type}, metadata={self.metadata})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Field):
            return False
        return (
            self.name == other.name and
            self.field_type == other.field_type and
            self.metadata == other.metadata
        )

class Schema:
    """Represents a struct-like schema."""
    def __init__(self, name: str = "", fields: OrderedDict[str, Field] | None = None) -> None:
        self.name: str = name
        self.fields: OrderedDict[str, Field] = fields if fields is not None else OrderedDict()

    def __repr__(self) -> str:
        return f"Schema(name='{self.name}', fields={list(self.fields.values())})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Schema):
            return False
        return self.name == other.name and list(self.fields.values()) == list(other.fields.values())

    def structurally_equal(self, other: "Schema") -> bool:
        """Check if the schema has the same structure as another schema."""
        if not isinstance(other, Schema):
            return False
        if list(self.fields.keys()) != list(other.fields.keys()):
            return False
        return all(
            self.fields[name].field_type == other.fields[name].field_type
            for name in self.fields.keys()
        )

    def field_names(self) -> list[str]:
        """Get a list of all field names in the schema."""
        return list(self.fields.keys())

    def get_field(self, name: str) -> Field | None:
        """Get a field by name."""
        return self.fields.get(name, None)

    def has_field(self, name: str) -> bool:
        """Check if schema has a field with the given name."""
        return name in self.fields
