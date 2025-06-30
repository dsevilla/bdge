#!/usr/bin/env python3
"""
Test Framework for csv_to_mongo Function

This module provides comprehensive testing capabilities for the csv_to_mongo function
including data generation, mock collections, and validation of results.
Uses in-memory file objects for testing without creating actual files.
"""

import io
import random
import string
from datetime import datetime, timedelta
from typing import Any, Optional
from dataclasses import dataclass
import json

# Import the csv_to_mongo module
try:
    from csv_to_mongo import csv_to_mongo, CollectionProtocol
except ImportError:
    # Handle case where file is in same directory
    import sys
    import os
    sys.path.append(os.path.dirname(__file__))
    from csv_to_mongo import csv_to_mongo, CollectionProtocol


@dataclass
class TestResult:
    """Container for test results and statistics."""
    test_name: str
    success: bool
    documents_inserted: int
    expected_documents: int
    execution_time: float
    error_message: Optional[str] = None
    validation_details: Optional[dict[str, Any]] = None


class TestMockCollection:
    """Enhanced mock collection for testing with detailed tracking and validation."""
    
    def __init__(self, name: str = "test_collection"):
        self.name = name
        self.documents: list[dict[str, Any]] = []
        self.dropped = False
        self.insert_calls: list[dict[str, Any]] = []
        self.drop_calls: int = 0
        
    def drop(self) -> None:
        """Clear all documents and track drop operations."""
        self.documents.clear()
        self.dropped = True
        self.drop_calls += 1
        
    def insert_many(self, documents: list[dict[str, Any]]) -> Any:
        """Insert documents and track the operation."""
        # Record the insert operation
        insert_info = {
            'timestamp': datetime.now(),
            'document_count': len(documents),
            'batch_number': len(self.insert_calls) + 1
        }
        self.insert_calls.append(insert_info)
        
        # Add documents to collection
        self.documents.extend(documents)
        
        # Return mock result
        return type('InsertResult', (), {
            'inserted_ids': [f"test_id_{i}" for i in range(len(documents))]
        })()
    
    def get_statistics(self) -> dict[str, Any]:
        """Get comprehensive collection statistics."""
        type_stats = {}
        for doc in self.documents:
            for field, value in doc.items():
                field_type = type(value).__name__
                if field not in type_stats:
                    type_stats[field] = {}
                type_stats[field][field_type] = type_stats[field].get(field_type, 0) + 1
        
        return {
            'total_documents': len(self.documents),
            'total_inserts': len(self.insert_calls),
            'total_drops': self.drop_calls,
            'was_dropped': self.dropped,
            'type_distribution': type_stats,
            'batch_sizes': [call['document_count'] for call in self.insert_calls]
        }
    
    def find_by_field(self, field: str, value: Any) -> list[dict[str, Any]]:
        """Find documents by field value."""
        return [doc for doc in self.documents if doc.get(field) == value]
    
    def count_field_types(self, field: str) -> dict[str, int]:
        """Count types for a specific field."""
        type_counts = {}
        for doc in self.documents:
            if field in doc:
                field_type = type(doc[field]).__name__
                type_counts[field_type] = type_counts.get(field_type, 0) + 1
        return type_counts


class CSVDataGenerator:
    """Generate test CSV data with various data types and scenarios."""
    
    @staticmethod
    def create_basic_csv(num_rows: int = 100) -> str:
        """Generate basic CSV with mixed data types."""
        lines = ["name,age,salary,hire_date,active"]
        
        for i in range(num_rows):
            name = f"Employee_{i+1}"
            age = random.randint(22, 65)
            salary = round(random.uniform(30000, 150000), 2)
            hire_date = (datetime.now() - timedelta(days=random.randint(0, 3650))).strftime("%Y-%m-%d")
            active = random.choice(["true", "false", "1", "0", "yes", "no"])
            
            lines.append(f"{name},{age},{salary},{hire_date},{active}")
        
        return "\n".join(lines)
    
    @staticmethod
    def create_numeric_csv(num_rows: int = 50) -> str:
        """Generate CSV focused on numeric conversions."""
        lines = ["integer_val,float_val,scientific_val,negative_val,zero_val,large_number"]
        
        for i in range(num_rows):
            integer_val = random.randint(-1000, 1000)
            float_val = round(random.uniform(-100.5, 100.5), 3)
            scientific_val = f"{random.uniform(1, 9):.2f}e{random.randint(-5, 5)}"
            negative_val = -random.randint(1, 1000)
            zero_val = 0
            large_number = random.randint(1000000, 999999999)
            
            lines.append(f"{integer_val},{float_val},{scientific_val},{negative_val},{zero_val},{large_number}")
        
        return "\n".join(lines)
    
    @staticmethod
    def create_date_csv(num_rows: int = 30) -> str:
        """Generate CSV with various date formats."""
        lines = ["iso_date,simple_date,euro_date,us_date,datetime_iso,invalid_date"]
        
        for i in range(num_rows):
            base_date = datetime.now() - timedelta(days=random.randint(0, 365))
            
            iso_date = base_date.strftime("%Y-%m-%d")
            simple_date = base_date.strftime("%Y-%m-%d")
            euro_date = base_date.strftime("%d/%m/%Y")
            us_date = base_date.strftime("%m/%d/%Y")
            datetime_iso = base_date.strftime("%Y-%m-%dT%H:%M:%S")
            invalid_date = "not-a-date" if i % 5 == 0 else iso_date
            
            lines.append(f"{iso_date},{simple_date},{euro_date},{us_date},{datetime_iso},{invalid_date}")
        
        return "\n".join(lines)
    
    @staticmethod
    def create_edge_cases_csv() -> str:
        """Generate CSV with edge cases and special characters."""
        return '''name,value,description,special_date,empty_field
"Normal","123","Simple text","2023-01-01",""
"Empty Value","","","","  "
"Whitespace"," ","   ",
"Special Chars","áéíóú","Café & Piñata","2023-02-14","test"
"Quotes","She said ""Hello""","Quote test","2023-03-15",
"Commas","1,000","Text with, commas","2023-04-01","value"
"Large Number","999999999999999999","Very large number","2023-05-01",
"Small Float","0.00001","Very small float","2023-06-01",
"Invalid Date","42","Normal value","not-a-date",
"Mixed Case","MiXeD","CaSe TeXt","2023-07-01","End"'''
    
    @staticmethod
    def create_performance_csv(num_rows: int = 1000) -> str:
        """Generate large CSV for performance testing."""
        lines = ["id,category,data,timestamp,value,description"]
        
        categories = ["Electronics", "Books", "Clothing", "Sports", "Home"]
        
        for i in range(num_rows):
            data_string = ''.join(random.choices(string.ascii_letters + string.digits, k=15))
            timestamp = (datetime.now() - timedelta(seconds=random.randint(0, 86400*365))).isoformat()
            category = random.choice(categories)
            value = random.randint(1, 10000)
            description = f"Item {i} description with some text"
            
            lines.append(f"{i},{category},{data_string},{timestamp},{value},\"{description}\"")
        
        return "\n".join(lines)


class CSVTestValidator:
    """Validation utilities for test results."""
    
    @staticmethod
    def validate_type_conversions(collection: TestMockCollection) -> dict[str, Any]:
        """Validate that proper type conversions occurred."""
        stats = collection.get_statistics()
        type_dist = stats['type_distribution']
        
        validation_results = {
            'numeric_conversions': 0,
            'date_conversions': 0,
            'string_preserved': 0,
            'issues': []
        }
        
        for field, types in type_dist.items():
            if 'int' in types or 'float' in types:
                validation_results['numeric_conversions'] += sum(count for t, count in types.items() if t in ['int', 'float'])
            
            if 'datetime' in types:
                validation_results['date_conversions'] += types['datetime']
            
            if 'str' in types:
                validation_results['string_preserved'] += types['str']
        
        return validation_results
    
    @staticmethod
    def validate_batch_processing(collection: TestMockCollection, expected_batches: int) -> dict[str, Any]:
        """Validate batch processing behavior."""
        stats = collection.get_statistics()
        
        return {
            'actual_batches': stats['total_inserts'],
            'expected_batches': expected_batches,
            'batch_sizes': stats['batch_sizes'],
            'total_documents': stats['total_documents'],
            'properly_batched': len(stats['batch_sizes']) <= expected_batches + 1
        }
    
    @staticmethod
    def validate_data_integrity(collection: TestMockCollection, expected_rows: int) -> dict[str, Any]:
        """Validate data integrity and completeness."""
        stats = collection.get_statistics()
        
        return {
            'expected_documents': expected_rows,
            'actual_documents': stats['total_documents'],
            'data_complete': stats['total_documents'] == expected_rows,
            'collection_dropped': stats['was_dropped'],
            'type_distribution': stats['type_distribution']
        }


class CSVTestRunner:
    """Main test runner for comprehensive csv_to_mongo testing."""
    
    def __init__(self):
        self.results: list[TestResult] = []
        self.generator = CSVDataGenerator()
        self.validator = CSVTestValidator()
    
    def test_basic_functionality(self) -> TestResult:
        """Test basic CSV to MongoDB conversion."""
        test_name = "Basic Functionality Test"
        
        try:
            import time
            start_time = time.time()
            
            # Generate test data
            csv_data = self.generator.create_basic_csv(50)
            csv_file = io.StringIO(csv_data)
            
            # Create test collection
            collection = TestMockCollection()
            
            # Run conversion
            csv_to_mongo(csv_file, collection, batch_size=20)
            
            execution_time = time.time() - start_time
            
            # Validate results
            integrity_check = self.validator.validate_data_integrity(collection, 50)
            type_check = self.validator.validate_type_conversions(collection)
            
            success = (integrity_check['data_complete'] and 
                      integrity_check['collection_dropped'] and
                      type_check['numeric_conversions'] > 0)
            
            return TestResult(
                test_name=test_name,
                success=success,
                documents_inserted=len(collection.documents),
                expected_documents=50,
                execution_time=execution_time,
                validation_details={
                    'integrity': integrity_check,
                    'type_conversions': type_check
                }
            )
            
        except Exception as e:
            return TestResult(
                test_name=test_name,
                success=False,
                documents_inserted=0,
                expected_documents=50,
                execution_time=0.0,
                error_message=str(e)
            )
    
    def test_numeric_conversions(self) -> TestResult:
        """Test numeric data type conversions."""
        test_name = "Numeric Type Conversions"
        
        try:
            import time
            start_time = time.time()
            
            csv_data = self.generator.create_numeric_csv(30)
            csv_file = io.StringIO(csv_data)
            collection = TestMockCollection()
            
            csv_to_mongo(csv_file, collection)
            
            execution_time = time.time() - start_time
            
            # Check type conversions
            type_validation = self.validator.validate_type_conversions(collection)
            
            success = (type_validation['numeric_conversions'] > 0 and
                      len(collection.documents) == 30)
            
            return TestResult(
                test_name=test_name,
                success=success,
                documents_inserted=len(collection.documents),
                expected_documents=30,
                execution_time=execution_time,
                validation_details=type_validation
            )
            
        except Exception as e:
            return TestResult(
                test_name=test_name,
                success=False,
                documents_inserted=0,
                expected_documents=30,
                execution_time=0.0,
                error_message=str(e)
            )
    
    def test_date_conversions(self) -> TestResult:
        """Test date format parsing and conversion."""
        test_name = "Date Format Conversions"
        
        try:
            import time
            start_time = time.time()
            
            csv_data = self.generator.create_date_csv(25)
            csv_file = io.StringIO(csv_data)
            collection = TestMockCollection()
            
            csv_to_mongo(csv_file, collection)
            
            execution_time = time.time() - start_time
            
            type_validation = self.validator.validate_type_conversions(collection)
            
            success = (type_validation['date_conversions'] > 0 and
                      len(collection.documents) == 25)
            
            return TestResult(
                test_name=test_name,
                success=success,
                documents_inserted=len(collection.documents),
                expected_documents=25,
                execution_time=execution_time,
                validation_details=type_validation
            )
            
        except Exception as e:
            return TestResult(
                test_name=test_name,
                success=False,
                documents_inserted=0,
                expected_documents=25,
                execution_time=0.0,
                error_message=str(e)
            )
    
    def test_edge_cases(self) -> TestResult:
        """Test edge cases and special character handling."""
        test_name = "Edge Cases and Special Characters"
        
        try:
            import time
            start_time = time.time()
            
            csv_data = self.generator.create_edge_cases_csv()
            csv_file = io.StringIO(csv_data)
            collection = TestMockCollection()
            
            csv_to_mongo(csv_file, collection)
            
            execution_time = time.time() - start_time
            
            # Success if function handles edge cases without crashing
            success = len(collection.documents) > 0
            
            return TestResult(
                test_name=test_name,
                success=success,
                documents_inserted=len(collection.documents),
                expected_documents=10,  # Expected rows in edge cases CSV
                execution_time=execution_time,
                validation_details={
                    'sample_documents': collection.documents[:3],  # Show first 3 docs
                    'statistics': collection.get_statistics()
                }
            )
            
        except Exception as e:
            return TestResult(
                test_name=test_name,
                success=False,
                documents_inserted=0,
                expected_documents=10,
                execution_time=0.0,
                error_message=str(e)
            )
    
    def test_batch_processing(self) -> TestResult:
        """Test batch processing with large datasets."""
        test_name = "Batch Processing"
        
        try:
            import time
            start_time = time.time()
            
            # Generate larger dataset
            csv_data = self.generator.create_performance_csv(300)
            csv_file = io.StringIO(csv_data)
            collection = TestMockCollection()
            
            batch_size = 75
            csv_to_mongo(csv_file, collection, batch_size=batch_size)
            
            execution_time = time.time() - start_time
            
            # Calculate expected batches
            expected_batches = (300 + batch_size - 1) // batch_size
            batch_validation = self.validator.validate_batch_processing(collection, expected_batches)
            
            success = (batch_validation['properly_batched'] and
                      len(collection.documents) == 300)
            
            return TestResult(
                test_name=test_name,
                success=success,
                documents_inserted=len(collection.documents),
                expected_documents=300,
                execution_time=execution_time,
                validation_details=batch_validation
            )
            
        except Exception as e:
            return TestResult(
                test_name=test_name,
                success=False,
                documents_inserted=0,
                expected_documents=300,
                execution_time=0.0,
                error_message=str(e)
            )
    
    def test_empty_data(self) -> TestResult:
        """Test handling of empty or minimal CSV data."""
        test_name = "Empty Data Handling"
        
        try:
            import time
            start_time = time.time()
            
            # Test with headers only
            csv_data = "name,age,date"
            csv_file = io.StringIO(csv_data)
            collection = TestMockCollection()
            
            csv_to_mongo(csv_file, collection)
            
            execution_time = time.time() - start_time
            
            # Success if function handles empty data gracefully
            success = (len(collection.documents) == 0 and 
                      collection.dropped)
            
            return TestResult(
                test_name=test_name,
                success=success,
                documents_inserted=len(collection.documents),
                expected_documents=0,
                execution_time=execution_time,
                validation_details=collection.get_statistics()
            )
            
        except Exception as e:
            return TestResult(
                test_name=test_name,
                success=False,
                documents_inserted=0,
                expected_documents=0,
                execution_time=0.0,
                error_message=str(e)
            )
    
    def run_all_tests(self) -> list[TestResult]:
        """Execute all test cases."""
        print("Running Comprehensive csv_to_mongo Tests")
        print("=" * 50)
        
        test_methods = [
            self.test_basic_functionality,
            self.test_numeric_conversions,
            self.test_date_conversions,
            self.test_edge_cases,
            self.test_batch_processing,
            self.test_empty_data
        ]
        
        results = []
        
        for i, test_method in enumerate(test_methods, 1):
            print(f"\nRunning Test {i}/{len(test_methods)}: {test_method.__doc__.strip()}")
            
            result = test_method()
            results.append(result)
            
            status = "✅ PASS" if result.success else "❌ FAIL"
            print(f"  {status} - {result.documents_inserted}/{result.expected_documents} documents")
            print(f"  Time: {result.execution_time:.3f}s")
            
            if not result.success and result.error_message:
                print(f"  Error: {result.error_message}")
        
        self.results = results
        return results
    
    def print_comprehensive_summary(self):
        """Print detailed test summary with statistics."""
        if not self.results:
            print("No test results to display")
            return
        
        print("\n" + "=" * 60)
        print("COMPREHENSIVE TEST SUMMARY")
        print("=" * 60)
        
        # Overall statistics
        passed = sum(1 for r in self.results if r.success)
        total = len(self.results)
        success_rate = (passed / total) * 100 if total > 0 else 0
        
        total_docs = sum(r.documents_inserted for r in self.results)
        total_time = sum(r.execution_time for r in self.results)
        
        print(f"Test Results: {passed}/{total} passed ({success_rate:.1f}%)")
        print(f"Documents Processed: {total_docs}")
        print(f"Total Execution Time: {total_time:.3f} seconds")
        
        if total_docs > 0 and total_time > 0:
            print(f"Processing Rate: {total_docs/total_time:.0f} documents/second")
        
        print("\nDetailed Test Results:")
        print("-" * 40)
        
        for result in self.results:
            status_icon = "✅" if result.success else "❌"
            print(f"\n{status_icon} {result.test_name}")
            print(f"   Documents: {result.documents_inserted}/{result.expected_documents}")
            print(f"   Time: {result.execution_time:.3f}s")
            
            if result.validation_details:
                print("   Validation Details:")
                # Print key validation information
                if isinstance(result.validation_details, dict):
                    for key, value in result.validation_details.items():
                        if key in ['type_conversions', 'integrity']:
                            print(f"     {key}: {value}")
                        elif key == 'batch_sizes' and value:
                            print(f"     Batch sizes: {value}")
            
            if not result.success and result.error_message:
                print(f"   ❗ Error: {result.error_message}")
        
        print("\n" + "=" * 60)


def demo_in_memory_testing():
    """Demonstrate the new in-memory testing capabilities."""
    print("CSV to MongoDB - In-Memory Testing Demo")
    print("=" * 45)
    
    # Demo 1: Basic usage
    print("\n1. Basic In-Memory Testing")
    print("-" * 30)
    
    csv_content = '''name,age,salary,start_date
Alice Johnson,28,75000.50,2022-01-15
Bob Smith,34,82000,2021-06-20
Carol Davis,29,68000.75,2022-11-10'''
    
    collection = TestMockCollection("demo_collection")
    csv_file = io.StringIO(csv_content)
    
    csv_to_mongo(csv_file, collection)
    
    print(f"✓ Processed {len(collection.documents)} documents")
    print(f"✓ Collection was dropped: {collection.dropped}")
    print("✓ Sample document:")
    print(json.dumps(collection.documents[0], indent=2, default=str))
    
    # Demo 2: Type conversion verification
    print("\n2. Type Conversion Verification")
    print("-" * 35)
    
    stats = collection.get_statistics()
    print("Field type distribution:")
    for field, types in stats['type_distribution'].items():
        print(f"  {field}: {types}")
    
    # Demo 3: Generated data testing
    print("\n3. Generated Data Testing")
    print("-" * 30)
    
    generator = CSVDataGenerator()
    test_csv = generator.create_numeric_csv(5)
    
    print("Generated CSV content:")
    print(test_csv[:200] + "..." if len(test_csv) > 200 else test_csv)
    
    collection2 = TestMockCollection()
    csv_file2 = io.StringIO(test_csv)
    csv_to_mongo(csv_file2, collection2)
    
    print(f"\n✓ Processed {len(collection2.documents)} documents")
    print("✓ Type conversions:", collection2.count_field_types('integer_val'))


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Test csv_to_mongo function with in-memory data')
    parser.add_argument('--demo', action='store_true', help='Run demonstration examples')
    parser.add_argument('--full', action='store_true', help='Run full comprehensive test suite')
    parser.add_argument('--quick', action='store_true', help='Run essential tests only')
    
    args = parser.parse_args()
    
    if args.demo:
        demo_in_memory_testing()
    elif args.full:
        runner = CSVTestRunner()
        runner.run_all_tests()
        runner.print_comprehensive_summary()
    elif args.quick:
        runner = CSVTestRunner()
        quick_results = [
            runner.test_basic_functionality(),
            runner.test_numeric_conversions(),
            runner.test_edge_cases()
        ]
        runner.results = quick_results
        runner.print_comprehensive_summary()
    else:
        print("CSV to MongoDB In-Memory Testing Framework")
        print("Available options:")
        print("  --demo    Show usage examples and demonstrations")
        print("  --full    Run comprehensive test suite")
        print("  --quick   Run essential tests only")
        print("\nExample usage:")
        print("  python test_csv_to_mongo.py --demo")
        print("  python test_csv_to_mongo.py --full")
        demo_in_memory_testing()
        self.insert_calls.append(insert_info)
        
        # Store the documents
        self.documents.extend(documents)
        
        # Return mock result
        return type('InsertResult', (), {
            'inserted_ids': [f"mock_id_{len(self.documents) - len(documents) + i}" 
                           for i in range(len(documents))]
        })()
    
    def get_stats(self) -> dict[str, Any]:
        """Get comprehensive statistics about the collection operations."""
        return {
            'total_documents': len(self.documents),
            'total_batches': len(self.insert_calls),
            'drop_calls': self.drop_calls,
            'was_dropped': self.dropped,
            'batch_sizes': [call['document_count'] for call in self.insert_calls],
            'avg_batch_size': sum(call['document_count'] for call in self.insert_calls) / len(self.insert_calls) if self.insert_calls else 0
        }
    
    def validate_documents(self, expected_count: Optional[int] = None, 
                          required_fields: Optional[list[str]] = None) -> dict[str, Any]:
        """Validate the inserted documents against expected criteria."""
        validation_result = {
            'valid': True,
            'errors': [],
            'warnings': [],
            'document_count': len(self.documents),
            'field_analysis': {}
        }
        
        # Check document count
        if expected_count is not None and len(self.documents) != expected_count:
            validation_result['valid'] = False
            validation_result['errors'].append(
                f"Expected {expected_count} documents, got {len(self.documents)}"
            )
        
        # Check required fields
        if required_fields and self.documents:
            for field in required_fields:
                field_present = all(field in doc for doc in self.documents)
                if not field_present:
                    validation_result['valid'] = False
                    validation_result['errors'].append(f"Field '{field}' missing in some documents")
        
        # Analyze field types and values
        if self.documents:
            field_analysis = {}
            all_fields = set()
            for doc in self.documents:
                all_fields.update(doc.keys())
            
            for field in all_fields:
                field_values = [doc.get(field) for doc in self.documents if field in doc]
                field_types = set(type(v).__name__ for v in field_values if v is not None)
                
                field_analysis[field] = {
                    'present_in': len(field_values),
                    'total_docs': len(self.documents),
                    'coverage': len(field_values) / len(self.documents),
                    'types': list(field_types),
                    'null_count': sum(1 for v in field_values if v is None),
                    'sample_values': field_values[:5] if field_values else []
                }
                
                # Check for potential issues
                if len(field_types) > 2:  # More than 2 types might indicate conversion issues
                    validation_result['warnings'].append(
                        f"Field '{field}' has multiple types: {field_types}"
                    )
            
            validation_result['field_analysis'] = field_analysis
        
        return validation_result


class CSVDataGenerator:
    """Generate test CSV data with various data types and edge cases."""
    
    def __init__(self, seed: int = 42):
        random.seed(seed)
        self.fake_names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry']
        self.fake_cities = ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Bilbao', 'Málaga']
        
    def generate_basic_dataset(self, rows: int = 100) -> tuple[list[str], list[list[str]]]:
        """Generate a basic dataset with common data types."""
        headers = ['id', 'name', 'age', 'salary', 'birth_date', 'active', 'city']
        
        data = []
        base_date = datetime(1970, 1, 1)
        
        for i in range(rows):
            birth_date = base_date + timedelta(days=random.randint(0, 20000))
            row = [
                str(i + 1),  # id
                random.choice(self.fake_names),  # name
                str(random.randint(18, 80)),  # age
                f"{random.uniform(25000, 100000):.2f}",  # salary
                birth_date.strftime('%Y-%m-%d'),  # birth_date
                random.choice(['true', 'false', '1', '0']),  # active
                random.choice(self.fake_cities)  # city
            ]
            data.append(row)
        
        return headers, data
    
    def generate_numeric_edge_cases(self, rows: int = 50) -> tuple[list[str], list[list[str]]]:
        """Generate dataset with numeric edge cases."""
        headers = ['id', 'integer', 'float', 'scientific', 'negative', 'zero', 'large_number']
        
        data = []
        for i in range(rows):
            row = [
                str(i + 1),
                str(random.randint(-1000, 1000)),
                f"{random.uniform(-100, 100):.4f}",
                f"{random.uniform(1, 10):.2e}",
                str(-random.randint(1, 1000)),
                '0' if i % 10 == 0 else str(random.randint(1, 100)),
                str(random.randint(1000000, 9999999999))
            ]
            data.append(row)
        
        return headers, data
    
    def generate_date_variations(self, rows: int = 30) -> tuple[list[str], list[list[str]]]:
        """Generate dataset with various date formats."""
        headers = ['id', 'iso_date', 'us_date', 'eu_date', 'simple_date', 'datetime_full']
        
        data = []
        base_date = datetime(2020, 1, 1)
        
        for i in range(rows):
            test_date = base_date + timedelta(days=random.randint(0, 1000))
            row = [
                str(i + 1),
                test_date.strftime('%Y-%m-%d'),  # iso_date
                test_date.strftime('%m/%d/%Y'),  # us_date
                test_date.strftime('%d/%m/%Y'),  # eu_date
                test_date.strftime('%Y-%m-%d'),  # simple_date
                test_date.strftime('%Y-%m-%dT%H:%M:%S.%f')  # datetime_full
            ]
            data.append(row)
        
        return headers, data
    
    def generate_messy_data(self, rows: int = 25) -> tuple[list[str], list[list[str]]]:
        """Generate dataset with messy/problematic data."""
        headers = ['id', 'mixed_content', 'empty_values', 'whitespace', 'special_chars']
        
        problematic_values = ['', '   ', 'N/A', 'NULL', 'null', '#REF!', '???', 'undefined']
        special_chars = ['café', 'niño', 'resumé', 'naïve', '中文', '🎉', 'test\nline']
        
        data = []
        for i in range(rows):
            row = [
                str(i + 1),
                random.choice(['123', 'abc', '12.34', 'true', 'false'] + problematic_values),
                random.choice(['valid_data'] + problematic_values),
                random.choice(['  spaced  ', '\ttabbed\t', '\nlined\n', 'normal']),
                random.choice(['normal'] + special_chars)
            ]
            data.append(row)
        
        return headers, data
    
    def write_csv(self, headers: list[str], data: list[list[str]], filename: str) -> str:
        """Write CSV data to file and return the file path."""
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(headers)
            writer.writerows(data)
        return filename


class CSVToMongoTester:
    """Comprehensive test framework for csv_to_mongo function."""
    
    def __init__(self):
        self.generator = CSVDataGenerator()
        self.test_results: list[dict[str, Any]] = []
        
    def run_basic_functionality_test(self) -> dict[str, Any]:
        """Test basic functionality with a simple dataset."""
        print("🧪 Running Basic Functionality Test...")
        
        # Generate test data
        headers, data = self.generator.generate_basic_dataset(50)
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8') as f:
            csv_file = f.name
        
        try:
            # Write CSV
            self.generator.write_csv(headers, data, csv_file)
            
            # Create mock collection
            mock_coll = TestMockCollection("basic_test")
            
            # Test with default batch size
            csv_to_mongo(csv_file, mock_coll)
            
            # Validate results
            validation = mock_coll.validate_documents(
                expected_count=50,
                required_fields=['id', 'name', 'age', 'salary', 'birth_date', 'active', 'city']
            )
            
            stats = mock_coll.get_stats()
            
            result = {
                'test_name': 'Basic Functionality',
                'success': validation['valid'],
                'expected_rows': 50,
                'actual_rows': len(mock_coll.documents),
                'validation': validation,
                'stats': stats,
                'sample_documents': mock_coll.documents[:3] if mock_coll.documents else []
            }
            
            print(f"✅ Basic test completed: {stats['total_documents']} documents inserted")
            return result
            
        finally:
            os.unlink(csv_file)
    
    def run_batch_size_test(self) -> dict[str, Any]:
        """Test different batch sizes."""
        print("🧪 Running Batch Size Test...")
        
        headers, data = self.generator.generate_basic_dataset(100)
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8') as f:
            csv_file = f.name
        
        try:
            self.generator.write_csv(headers, data, csv_file)
            
            batch_results = {}
            
            for batch_size in [10, 25, 50, 100]:
                mock_coll = TestMockCollection(f"batch_{batch_size}")
                csv_to_mongo(csv_file, mock_coll, batch_size=batch_size)
                
                stats = mock_coll.get_stats()
                batch_results[batch_size] = {
                    'total_documents': stats['total_documents'],
                    'total_batches': stats['total_batches'],
                    'batch_sizes': stats['batch_sizes'],
                    'avg_batch_size': stats['avg_batch_size']
                }
            
            result = {
                'test_name': 'Batch Size Variations',
                'success': True,
                'batch_results': batch_results
            }
            
            print(f"✅ Batch size test completed with {len(batch_results)} configurations")
            return result
            
        finally:
            os.unlink(csv_file)
    
    def run_data_type_conversion_test(self) -> dict[str, Any]:
        """Test data type conversions."""
        print("🧪 Running Data Type Conversion Test...")
        
        headers, data = self.generator.generate_numeric_edge_cases(30)
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8') as f:
            csv_file = f.name
        
        try:
            self.generator.write_csv(headers, data, csv_file)
            
            mock_coll = TestMockCollection("type_conversion")
            csv_to_mongo(csv_file, mock_coll)
            
            # Analyze type conversions
            validation = mock_coll.validate_documents(expected_count=30)
            
            # Check specific type conversions
            type_analysis = {}
            if mock_coll.documents:
                for field_name, field_info in validation['field_analysis'].items():
                    type_analysis[field_name] = {
                        'detected_types': field_info['types'],
                        'sample_values': field_info['sample_values']
                    }
            
            result = {
                'test_name': 'Data Type Conversion',
                'success': validation['valid'],
                'type_analysis': type_analysis,
                'validation': validation,
                'sample_documents': mock_coll.documents[:3]
            }
            
            print(f"✅ Type conversion test completed: analyzed {len(type_analysis)} fields")
            return result
            
        finally:
            os.unlink(csv_file)
    
    def run_date_parsing_test(self) -> dict[str, Any]:
        """Test date parsing capabilities."""
        print("🧪 Running Date Parsing Test...")
        
        headers, data = self.generator.generate_date_variations(20)
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8') as f:
            csv_file = f.name
        
        try:
            self.generator.write_csv(headers, data, csv_file)
            
            mock_coll = TestMockCollection("date_parsing")
            csv_to_mongo(csv_file, mock_coll)
            
            validation = mock_coll.validate_documents(expected_count=20)
            
            # Analyze date fields
            date_analysis = {}
            for field_name, field_info in validation['field_analysis'].items():
                if 'date' in field_name.lower():
                    datetime_count = sum(1 for v in field_info['sample_values'] 
                                       if isinstance(v, datetime))
                    date_analysis[field_name] = {
                        'datetime_conversions': datetime_count,
                        'total_values': field_info['present_in'],
                        'success_rate': datetime_count / field_info['present_in'] if field_info['present_in'] else 0,
                        'types': field_info['types']
                    }
            
            result = {
                'test_name': 'Date Parsing',
                'success': validation['valid'],
                'date_analysis': date_analysis,
                'validation': validation,
                'sample_documents': mock_coll.documents[:3]
            }
            
            print(f"✅ Date parsing test completed: analyzed {len(date_analysis)} date fields")
            return result
            
        finally:
            os.unlink(csv_file)
    
    def run_edge_cases_test(self) -> dict[str, Any]:
        """Test handling of edge cases and problematic data."""
        print("🧪 Running Edge Cases Test...")
        
        headers, data = self.generator.generate_messy_data(30)
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8') as f:
            csv_file = f.name
        
        try:
            self.generator.write_csv(headers, data, csv_file)
            
            mock_coll = TestMockCollection("edge_cases")
            
            # This should not raise an exception
            try:
                csv_to_mongo(csv_file, mock_coll)
                processing_success = True
                error_message = None
            except Exception as e:
                processing_success = False
                error_message = str(e)
            
            validation = mock_coll.validate_documents() if processing_success else {'valid': False}
            
            result = {
                'test_name': 'Edge Cases',
                'success': processing_success,
                'error_message': error_message,
                'documents_processed': len(mock_coll.documents) if processing_success else 0,
                'validation': validation,
                'sample_documents': mock_coll.documents[:3] if processing_success else []
            }
            
            print(f"✅ Edge cases test completed: processed {len(mock_coll.documents) if processing_success else 0} documents")
            return result
            
        finally:
            os.unlink(csv_file)
    
    def run_all_tests(self) -> dict[str, Any]:
        """Run all tests and return comprehensive results."""
        print("🚀 Starting Comprehensive CSV to Mongo Test Suite")
        print("=" * 60)
        
        all_results = {
            'test_suite': 'CSV to Mongo Comprehensive Tests',
            'timestamp': datetime.now().isoformat(),
            'tests': []
        }
        
        # Run individual tests
        test_methods = [
            self.run_basic_functionality_test,
            self.run_batch_size_test,
            self.run_data_type_conversion_test,
            self.run_date_parsing_test,
            self.run_edge_cases_test
        ]
        
        for test_method in test_methods:
            try:
                result = test_method()
                all_results['tests'].append(result)
            except Exception as e:
                error_result = {
                    'test_name': test_method.__name__,
                    'success': False,
                    'error': str(e)
                }
                all_results['tests'].append(error_result)
                print(f"❌ {test_method.__name__} failed: {e}")
        
        # Summary
        successful_tests = sum(1 for test in all_results['tests'] if test.get('success', False))
        total_tests = len(all_results['tests'])
        
        all_results['summary'] = {
            'total_tests': total_tests,
            'successful_tests': successful_tests,
            'failed_tests': total_tests - successful_tests,
            'success_rate': successful_tests / total_tests if total_tests else 0
        }
        
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {total_tests}")
        print(f"Successful: {successful_tests}")
        print(f"Failed: {total_tests - successful_tests}")
        print(f"Success Rate: {all_results['summary']['success_rate']:.1%}")
        
        return all_results
    
    def save_results(self, results: dict[str, Any], filename: str = "test_results.json"):
        """Save test results to a JSON file."""
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, default=str)
        print(f"📄 Test results saved to {filename}")


def demo_testing():
    """Demonstrate the testing framework with examples."""
    print("CSV to Mongo Testing Framework Demo")
    print("=" * 50)
    
    # Create tester
    tester = CSVToMongoTester()
    
    # Run a simple test
    print("\n1. Quick Basic Test")
    basic_result = tester.run_basic_functionality_test()
    print(f"Result: {'✅ PASSED' if basic_result['success'] else '❌ FAILED'}")
    
    # Show sample data
    if basic_result['sample_documents']:
        print("\nSample inserted documents:")
        for i, doc in enumerate(basic_result['sample_documents']):
            print(f"  Document {i+1}: {doc}")
    
    # Show type analysis
    print("\n2. Type Analysis Example")
    type_result = tester.run_data_type_conversion_test()
    if 'type_analysis' in type_result:
        for field, analysis in type_result['type_analysis'].items():
            print(f"  {field}: {analysis['detected_types']}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='CSV to Mongo Test Framework')
    parser.add_argument('--demo', action='store_true', help='Run demonstration tests')
    parser.add_argument('--comprehensive', action='store_true', help='Run comprehensive test suite')
    parser.add_argument('--save', type=str, help='Save results to specified JSON file')
    parser.add_argument('--basic', action='store_true', help='Run only basic functionality test')
    
    args = parser.parse_args()
    
    tester = CSVToMongoTester()
    
    if args.demo:
        demo_testing()
    elif args.basic:
        result = tester.run_basic_functionality_test()
        print(f"\nTest {'PASSED' if result['success'] else 'FAILED'}")
    elif args.comprehensive:
        results = tester.run_all_tests()
        if args.save:
            tester.save_results(results, args.save)
    else:
        print("CSV to Mongo Testing Framework")
        print("Available options:")
        print("  --demo           Run demonstration tests")
        print("  --comprehensive  Run full test suite")
        print("  --basic          Run basic functionality test")
        print("  --save FILE      Save comprehensive results to JSON file")
        print("\nExample usage:")
        print("  python test_csv_to_mongo.py --demo")
        print("  python test_csv_to_mongo.py --comprehensive --save results.json")
        demo_testing()
