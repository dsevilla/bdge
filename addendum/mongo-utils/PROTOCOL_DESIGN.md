# Protocol-Based Design for csv_to_mongo

## Overview

The `csv_to_mongo.py` module now uses a Protocol-based approach instead of depending directly on PyMongo's `Collection` class. This provides better flexibility, testability, and dependency management.

## CollectionProtocol

The `CollectionProtocol` defines the minimal interface required:

```python
class CollectionProtocol(Protocol):
    def drop(self) -> None:
        """Drop/clear the collection."""
        ...

    def insert_many(self, documents: list[dict[str, Any]]) -> Any:
        """Insert multiple documents into the collection."""
        ...
```

## Benefits

### 1. **Loose Coupling**
- No direct dependency on PyMongo
- Can work with any object that implements the required methods
- Easier to mock and test

### 2. **Testability**
- Included `MockCollection` class for testing
- No need for actual MongoDB connection during unit tests
- Can verify behavior without external dependencies

### 3. **Flexibility**
- Can be used with different database backends
- Easy to create adapters for other document stores
- Future-proof against PyMongo API changes

## Usage Examples

### With PyMongo (Production)
```python
from pymongo import MongoClient

client = MongoClient('mongodb://localhost:27017/')
db = client.mydatabase
collection = db.mycollection

csv_to_mongo('data.csv', collection)
```

### With Mock (Testing)
```python
mock_coll = MockCollection()
csv_to_mongo('test_data.csv', mock_coll)

# Verify results
assert mock_coll.dropped == True
assert len(mock_coll.documents) > 0
print(f"Inserted {len(mock_coll.documents)} documents")
```

### Custom Implementation
```python
class CustomCollectionAdapter:
    def __init__(self, backend):
        self.backend = backend

    def drop(self):
        self.backend.clear_all()

    def insert_many(self, documents):
        return self.backend.bulk_insert(documents)

# Use with any backend that has clear_all() and bulk_insert()
adapter = CustomCollectionAdapter(my_custom_backend)
csv_to_mongo('data.csv', adapter)
```

## Migration Guide

### Before (Direct PyMongo Dependency)
```python
from pymongo.collection import Collection

def csv_to_mongo(file: str, coll: Collection, batch_size: int = 5000):
    # Function implementation
```

### After (Protocol-Based)
```python
from typing import Protocol

class CollectionProtocol(Protocol):
    def drop(self) -> None: ...
    def insert_many(self, documents: list[dict[str, Any]]) -> Any: ...

def csv_to_mongo(file: str, coll: CollectionProtocol, batch_size: int = 5000):
    # Function implementation (unchanged)
```

## Compatibility

- **Backward Compatible**: Existing PyMongo Collection objects work without changes
- **Type Safe**: Static type checkers will verify protocol compliance
- **Runtime Safe**: Duck typing allows any compatible object to work

The protocol approach maintains all existing functionality while providing better abstractions and testing capabilities.
