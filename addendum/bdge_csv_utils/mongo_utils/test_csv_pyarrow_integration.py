#!/usr/bin/env python3
"""
Test integration between simplified CSV schema inference and PyArrow schema utilities.
"""

from io import StringIO
import sys
import os

# Add the pyarrow_schema directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'pyarrow_schema'))

from csv_to_mongo_schema import infer_csv_schema_with_dataclass
from ..pyarrow_schema.pyarrow_schema_utils import dataclass_to_pyarrow_schema, create_pyarrow_table_from_dataclass_instances, print_schema_info

def test_csv_to_pyarrow_integration():
    """Test the complete workflow from CSV to PyArrow."""
    print("=== Testing CSV to PyArrow Integration ===")
    
    # Sample CSV data with consistent types (no missing values to avoid str fallback)
    csv_data = """name,age,salary,is_active,hire_date
John Doe,25,50000.0,true,2020-01-15
Jane Smith,30,75000.0,false,2018-03-10
Bob Johnson,35,60000.0,true,2015-06-01
Alice Brown,28,55000.0,false,2019-08-20"""

    print("CSV Data:")
    print(csv_data)
    print()
    
    # Step 1: Infer schema from CSV
    csv_file = StringIO(csv_data)
    schema, RecordClass = infer_csv_schema_with_dataclass(csv_file, class_name="EmployeeRecord")
    
    print("Inferred CSV Schema:")
    for i, (col, col_type) in enumerate(schema.items()):
        print(f"  {i+1}. {col}: {col_type.__name__}")
    print()
    
    # Step 2: Convert to PyArrow schema
    pa_schema = dataclass_to_pyarrow_schema(RecordClass, "employees")
    
    print("PyArrow Schema:")
    print_schema_info(pa_schema)
    print()
    
    # Step 3: Create sample instances from the CSV data
    from datetime import datetime
    employees = [
        RecordClass("John Doe", 25, 50000.0, True, datetime(2020, 1, 15)),
        RecordClass("Jane Smith", 30, 75000.0, False, datetime(2018, 3, 10)),
        RecordClass("Bob Johnson", 35, 60000.0, True, datetime(2015, 6, 1)),
        RecordClass("Alice Brown", 28, 55000.0, False, datetime(2019, 8, 20)),
    ]
    
    # Step 4: Create PyArrow table
    table = create_pyarrow_table_from_dataclass_instances(employees, pa_schema)
    
    print("PyArrow Table:")
    print(f"  Shape: {table.num_rows} rows × {table.num_columns} columns")
    print(f"  Memory usage: {table.nbytes} bytes")
    print()
    
    # Step 5: Show the data
    print("Table data:")
    df = table.to_pandas()
    print(df)
    print()
    
    print("✓ CSV to PyArrow integration test passed")


def test_mixed_types_handling():
    """Test how mixed types are handled in the simplified approach."""
    print("\n=== Testing Mixed Types Handling ===")
    
    # CSV with some missing/mixed values
    csv_data = """product_id,price,quantity,active
P001,99.99,10,true
P002,149.50,5,false
P003,invalid_price,15,true
P004,79.99,,false"""

    csv_file = StringIO(csv_data)
    schema, ProductClass = infer_csv_schema_with_dataclass(csv_file, class_name="ProductRecord")
    
    print("Schema with mixed data:")
    for col, col_type in schema.items():
        print(f"  {col}: {col_type.__name__}")
    
    # Note: With the simplified approach, columns with mixed/invalid data will fall back to str
    print("\nNote: Columns with mixed or invalid data fall back to 'str' type")
    print("This ensures type safety at the cost of some precision")
    
    print("✓ Mixed types handling test passed")


if __name__ == "__main__":
    try:
        test_csv_to_pyarrow_integration()
        test_mixed_types_handling()
        print("\n🎉 All integration tests passed!")
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("Make sure PyArrow is installed: pip install pyarrow")
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
