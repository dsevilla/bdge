from typing import Any
from collections import OrderedDict

class PrimaryKey:
    """Marker for primary key fields."""
    ...

class Reference[Ref, FieldName=None]:
    """
    Marker for reference fields.

    Reference can be created with an optional type argument that specifies the name of the referenced attribute.
    For example: Reference[Client, "Id"]
    """
    ...

class Fld:
    """Represents a field in a schema."""
    def __init__(self, name: str, field_type: Any, metadata: dict[Any, Any] | None = None) -> None:
        self.name: str = name
        self.field_type: Any = field_type
        self.metadata: dict[Any, Any] = metadata if metadata is not None else {}

    def __repr__(self) -> str:
        return f"Fld(name='{self.name}', field_type={self.field_type}, metadata={self.metadata})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Fld):
            return False
        return (
            self.name == other.name and
            self.field_type == other.field_type and
            self.metadata == other.metadata
        )

class Schema:
    """Represents a struct-like schema."""
    def __init__(self, name: str = "", fields: list[Fld] | None = None) -> None:
        self.name: str = name
        self.__fields: list[Fld] = fields if fields is not None else []
        self.__fields_dict: OrderedDict[str, Fld] = OrderedDict((f.name, f) for f in self.__fields)

    def __repr__(self) -> str:
        return f"Schema(name='{self.name}', fields={self.__fields})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Schema):
            return False
        return self.name == other.name and self.__fields == other.__fields

    def structurally_equal(self, other: "Schema") -> bool:
        """Check if the schema has the same structure as another schema."""
        if not isinstance(other, Schema):
            return False
        if [f.name for f in self.__fields] != [f.name for f in other.__fields]:
            return False
        return all(
            f1.field_type == f2.field_type
            for f1, f2 in zip(self.__fields, other.__fields)
        )

    def field_names(self) -> list[str]:
        """Get a list of all field names in the schema."""
        return [f.name for f in self.__fields]

    def get_field(self, name: str) -> Fld | None:
        """Get a field by name."""
        return self.__fields_dict.get(name, None)

    def has_field(self, name: str) -> bool:
        """Check if schema has a field with the given name."""
        return name in self.__fields_dict

    def get_fields(self) -> list[Fld]:
        """Get the list of fields in the schema."""
        return self.__fields.copy()

    def set_fields(self, fields: list[Fld]) -> None:
        """Set the list of fields in the schema and update the internal dictionary."""
        self.__fields = fields.copy()
        self.__fields_dict = OrderedDict((f.name, f) for f in self.__fields)
