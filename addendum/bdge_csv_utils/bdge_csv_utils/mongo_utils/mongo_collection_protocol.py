from collections.abc import Iterable
from typing import Any, Protocol

class CollectionProtocol(Protocol):
    """Protocol defining the minimal interface needed for a MongoDB-like collection."""

    def insert_many(self, documents: Iterable[dict[str, Any]], ordered: bool = True) -> Any | None:
        """Insert multiple documents into the collection."""
        ...
