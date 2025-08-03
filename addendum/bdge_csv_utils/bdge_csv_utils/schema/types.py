from typing import Any, Annotated

class PrimaryKey:
    """Marker for primary key fields."""
    ...

class Reference[R]:
    """Marker for reference fields."""
    ...

class Field:
    """Represents a field in a schema."""
    def __init__(self, name: str, field_type: Any) -> None:
        self.name: str = name
        self.field_type: Any = field_type
    
    def __repr__(self) -> str:
        return f"Field(name='{self.name}', field_type={self.field_type})"
    
    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Field):
            return False
        return self.name == other.name and self.field_type == other.field_type

class Schema:
    """Represents a struct-like schema."""
    def __init__(self, fields: list[Field]) -> None:
        self.fields: list[Field] = fields

    def __repr__(self) -> str:
        return f"Schema(fields={self.fields})"
    
    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Schema):
            return False
        return self.fields == other.fields
    
    def field_names(self) -> list[str]:
        """Get a list of all field names in the schema."""
        return [field.name for field in self.fields]
    
    def get_field(self, name: str) -> Field | None:
        """Get a field by name."""
        for field in self.fields:
            if field.name == name:
                return field
        return None
    
    def has_field(self, name: str) -> bool:
        """Check if schema has a field with the given name."""
        return self.get_field(name) is not None
