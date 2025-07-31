#!/usr/bin/env python3
"""
Test script for PyArrow Schema Utilities

This module tests the conversion between Python dataclasses and PyArrow schemas.
"""

from dataclasses import make_dataclass
from datetime import datetime
from pyarrow_schema_utils import (
    dataclass_to_pyarrow_schema,
    create_pyarrow_table_from_dataclass_instances,
    print_schema_info,
    python_type_to_pyarrow_type
)
import pyarrow as pa


def test_basic_dataclass_to_schema():
    """Test basic dataclass to PyArrow schema conversion."""
    print("=== Testing Basic Dataclass to PyArrow Schema Conversion ===")
    
    # Create a sample dataclass (simulating one from csv_to_mongo)
    SampleRecord = make_dataclass(
        "SampleRecord",
        [
            ("name", str),
            ("age", int),
            ("salary", float),
            ("is_active", bool),
            ("birth_date", datetime),
        ]
    )
    
    # Convert to PyArrow schema
    schema = dataclass_to_pyarrow_schema(SampleRecord, "employee_schema")
    
    # Print schema information
    print_schema_info(schema)
    
    # Verify schema properties
    assert len(schema) == 5, f"Expected 5 fields, got {len(schema)}"
    assert schema.names == ["name", "age", "salary", "is_active", "birth_date"]
    
    # All fields should be non-nullable since we don't use union types
    field_nullable = {field.name: field.nullable for field in schema}
    assert not any(field_nullable.values()), "All fields should be non-nullable"
    
    print("✓ Basic schema conversion test passed")


def test_table_creation():
    """Test creating PyArrow table from dataclass instances."""
    print("\n=== Testing Table Creation ===")
    
    # Create a sample dataclass
    SampleRecord = make_dataclass(
        "SampleRecord",
        [
            ("name", str),
            ("age", int),
            ("salary", float),
            ("is_active", bool),
            ("birth_date", datetime),
        ]
    )
    
    # Create schema
    schema = dataclass_to_pyarrow_schema(SampleRecord, "employee_schema")
    
    # Create sample instances
    instances = [
        SampleRecord("John Doe", 25, 50000.0, True, datetime(1998, 1, 15)),
        SampleRecord("Jane Smith", 30, 75000.0, False, datetime(1993, 5, 22)),
        SampleRecord("Bob Johnson", 35, 60000.0, True, datetime(1988, 12, 1)),
    ]
    
    # Create PyArrow table
    table = create_pyarrow_table_from_dataclass_instances(instances, schema)
    
    print(f"Created PyArrow Table:")
    print(f"  Shape: {table.num_rows} rows × {table.num_columns} columns")
    print(f"  Schema: {table.schema}")
    print(f"  Memory usage: {table.nbytes} bytes")
    
    # Verify table properties
    assert table.num_rows == 3, f"Expected 3 rows, got {table.num_rows}"
    assert table.num_columns == 5, f"Expected 5 columns, got {table.num_columns}"
    
    # Show the data
    print(f"\nTable data:")
    pandas_df = table.to_pandas()
    print(pandas_df)
    
    # Verify data integrity
    assert pandas_df.iloc[0]["name"] == "John Doe"
    assert pandas_df.iloc[0]["age"] == 25
    assert pandas_df.iloc[1]["name"] == "Jane Smith"
    assert pandas_df.iloc[2]["name"] == "Bob Johnson"
    
    print("✓ Table creation test passed")


def test_type_conversion():
    """Test individual type conversions."""
    print("\n=== Testing Type Conversions ===")
    
    # Test basic types
    assert python_type_to_pyarrow_type(str) == pa.string()
    assert python_type_to_pyarrow_type(int) == pa.int64()
    assert python_type_to_pyarrow_type(float) == pa.float64()
    assert python_type_to_pyarrow_type(bool) == pa.bool_()
    assert python_type_to_pyarrow_type(datetime) == pa.timestamp('us')
    assert python_type_to_pyarrow_type(bytes) == pa.binary()
    
    print("✓ Type conversion test passed")


def test_complex_schema():
    """Test with a more complex schema resembling real CSV data."""
    print("\n=== Testing Complex Schema ===")
    
    # Create a more complex dataclass (like one from CSV inference)
    PersonRecord = make_dataclass(
        "PersonRecord",
        [
            ("first_name", str),
            ("last_name", str),
            ("email", str),
            ("age", int),
            ("height_cm", float),
            ("is_employee", bool),
            ("hire_date", datetime),
            ("salary", float),
            ("department", str),
            ("active", bool),
        ]
    )
    
    # Convert to schema
    schema = dataclass_to_pyarrow_schema(PersonRecord, "person_records")
    
    print(f"Complex schema with {len(schema)} fields:")
    print_schema_info(schema)
    
    # Create sample data
    people = [
        PersonRecord("John", "Doe", "john@company.com", 25, 175.5, True, datetime(2020, 1, 15), 50000.0, "Engineering", True),
        PersonRecord("Jane", "Smith", "jane@company.com", 30, 165.0, True, datetime(2018, 3, 10), 75000.0, "Marketing", True),
        PersonRecord("Bob", "Johnson", "bob@company.com", 35, 180.0, False, datetime(2015, 6, 1), 60000.0, "Sales", False),
    ]
    
    # Create table
    table = create_pyarrow_table_from_dataclass_instances(people, schema)
    
    print(f"\nComplex table:")
    print(f"  Shape: {table.num_rows} rows × {table.num_columns} columns")
    print(f"  Memory usage: {table.nbytes} bytes")
    
    # Show sample of the data
    df = table.to_pandas()
    print(f"\nFirst few rows:")
    print(df.head())
    
    print("✓ Complex schema test passed")


def test_integration_with_csv_schema():
    """Test integration with CSV schema inference (simulated)."""
    print("\n=== Testing Integration with CSV Schema Inference ===")
    
    # Simulate what csv_to_mongo.infer_csv_schema might return
    from collections import OrderedDict
    
    simulated_csv_schema = OrderedDict([
        ("product_id", str),
        ("product_name", str),
        ("price", float),
        ("in_stock", bool),
        ("created_date", datetime),
        ("category_id", int),
        ("description", str),
    ])
    
    # Create dataclass from schema (simulating create_dataclass_from_schema)
    fields_for_dataclass = []
    for field_name, field_type in simulated_csv_schema.items():
        fields_for_dataclass.append((field_name, field_type))
    
    ProductRecord = make_dataclass("ProductRecord", fields_for_dataclass)
    
    # Convert to PyArrow schema
    pa_schema = dataclass_to_pyarrow_schema(ProductRecord, "product_catalog")
    
    print("CSV-like schema converted to PyArrow:")
    print_schema_info(pa_schema)
    
    # Create sample product data
    products = [
        ProductRecord("P001", "Laptop", 999.99, True, datetime(2023, 1, 1), 1, "High-performance laptop"),
        ProductRecord("P002", "Mouse", 29.99, False, datetime(2023, 2, 15), 2, "Wireless mouse"),
        ProductRecord("P003", "Keyboard", 79.99, True, datetime(2023, 3, 10), 2, "Mechanical keyboard"),
    ]
    
    # Create table
    table = create_pyarrow_table_from_dataclass_instances(products, pa_schema)
    
    print(f"\nProduct catalog table:")
    print(f"  Shape: {table.num_rows} rows × {table.num_columns} columns")
    print(table.to_pandas())
    
    print("✓ CSV integration test passed")


def run_all_tests():
    """Run all test functions."""
    print("Starting PyArrow Schema Utils Tests")
    print("=" * 60)
    
    try:
        test_basic_dataclass_to_schema()
        test_table_creation()
        test_type_conversion()
        test_complex_schema()
        test_integration_with_csv_schema()
        
        print("\n" + "=" * 60)
        print("🎉 All tests passed successfully!")
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True


if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
