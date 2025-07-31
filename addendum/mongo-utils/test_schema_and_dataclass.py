#!/usr/bin/env python3
"""
Test script to demonstrate the new schema inference and dataclass generation features.
"""

from io import StringIO
from csv_to_mongo_schema import infer_csv_schema, create_dataclass_from_schema, infer_csv_schema_with_dataclass
from datetime import datetime

def test_schema_inference_and_dataclass():
    """Test the new schema inference and dataclass generation."""

    # Sample CSV data with consistent types to avoid str fallback
    csv_data = """name,age,salary,is_active,birth_date,score
John Doe,25,50000.5,true,1998-01-15,85.5
Jane Smith,30,75000.0,false,1993-05-22,92.3
Bob Johnson,35,60000.0,true,1988-12-01,78.9
Alice Brown,28,55000.0,false,1995-03-10,88.1"""

    print("=== Testing Schema Inference with OrderedDict ===")

    # Test schema inference
    csv_file = StringIO(csv_data)
    schema = infer_csv_schema(csv_file, sample_rows=10)

    print("Inferred schema (preserves column order):")
    for i, (col, col_type) in enumerate(schema.items()):
        print(f"  {i+1}. {col}: {col_type.__name__}")

    print(f"\nSchema type: {type(schema)}")
    print(f"Number of columns: {len(schema)}")

    print("\n=== Testing Dataclass Generation ===")

    # Test dataclass creation
    RecordClass = create_dataclass_from_schema(schema, "PersonRecord")

    print(f"Generated dataclass: {RecordClass}")
    print(f"Dataclass fields:")
    for field in RecordClass.__dataclass_fields__.values():
        print(f"  - {field.name}: {field.type}")

    # Create an instance
    try:
        record = RecordClass(
            name="Test Person",
            age=25,
            salary=50000.0,
            is_active=True,
            birth_date=datetime(1998, 1, 15),
            score=85.5
        )
        print(f"\nCreated record instance: {record}")
    except Exception as e:
        print(f"Error creating record: {e}")

    print("\n=== Testing Combined Function ===")

    # Test combined function
    csv_file = StringIO(csv_data)  # Reset the StringIO
    schema2, RecordClass2 = infer_csv_schema_with_dataclass(
        csv_file,
        sample_rows=10,
        class_name="CombinedRecord"
    )

    print(f"Combined function result:")
    print(f"  Schema: {list(schema2.keys())}")
    print(f"  Dataclass: {RecordClass2}")

    print("\n=== Testing Field Name Cleaning ===")

    # Test with problematic field names
    problematic_csv = """First Name,Last-Name,Email Address,Age (years),2023 Score
John,Doe,john@email.com,25,85.5
Jane,Smith,jane@email.com,30,92.3"""

    csv_file = StringIO(problematic_csv)
    schema3 = infer_csv_schema(csv_file)
    RecordClass3 = create_dataclass_from_schema(schema3, "CleanedRecord")

    print("Original column names vs cleaned field names:")
    for original, field in zip(schema3.keys(), RecordClass3.__dataclass_fields__.keys()):
        print(f"  '{original}' -> '{field}'")


if __name__ == "__main__":
    test_schema_inference_and_dataclass()
