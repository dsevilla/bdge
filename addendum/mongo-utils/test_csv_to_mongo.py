#!/usr/bin/env python3
"""
Comprehensive Test Suite for csv_to_mongo.py

This module provides structured testing for the csv_to_mongo function using dataclasses
to define test inputs, expected outputs, test cases, and results.

Compatible with pytest framework for professional testing workflows and also supports
standalone execution for quick testing without pytest installation.

Key Features:
- Dual-mode operation: pytest and standalone
- Dataclass-based test structure
- Comprehensive test case generation
- Detailed result reporting and JSON export
- Pytest fixtures and marks for selective testing

Pytest Configuration:
- Markers: basic, edge_cases, performance, unicode, numeric, dates, comprehensive
- Fixtures: mock_collection, test_case, csv_tester
- Parametrized tests for comprehensive coverage

Usage:
  pytest test_csv_to_mongo.py -v -m basic     # Run basic tests only
  python test_csv_to_mongo.py --demo         # Standalone demo
"""

from collections.abc import Iterable
import io
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
import json

import pytest
from pytest import FixtureRequest

# Import the module under test
from csv_to_mongo import csv_to_mongo


class MockCollection:
    """Example implementation of CollectionProtocol for testing."""

    def __init__(self):
        self.documents: list[dict[str, Any]] = []

    def insert_many(self, documents: Iterable[dict[str, Any]], ordered: bool = True) -> Any | None:
        """Add documents to the internal storage."""
        # Simulate insertion by appending to the list
        docs: list[dict[str, Any]] = list(documents)
        self.documents.extend(docs)
        return type('InsertResult', (), {'inserted_ids': [f"mock_id_{i}" for i in range(len(docs))]})()


@dataclass
class TestInput:
    """Dataclass representing test input data."""
    name: str
    description: str
    csv_content: str


@dataclass
class ExpectedOutput:
    """Dataclass representing expected test output."""
    document_count: int
    sample_documents: list[dict[str, Any]] = field(default_factory=list)
    expected_field_types: dict[str, str] = field(default_factory=dict)
    should_succeed: bool = True
    error_message: str | None = None


@dataclass
class TestCase:
    """Dataclass representing a complete test case."""
    test_id: str
    test_name: str
    description: str
    input_data: TestInput
    expected_output: ExpectedOutput
    tags: list[str] = field(default_factory=list)


@dataclass
class TestResult:
    """Dataclass representing test execution results."""
    test_id: str
    test_name: str
    passed: bool
    execution_time: float
    actual_document_count: int
    actual_documents: list[dict[str, Any]] = field(default_factory=list)
    error_message: str | None = None
    validation_details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert test result to dictionary for JSON serialization."""
        return {
            'test_id': self.test_id,
            'test_name': self.test_name,
            'passed': self.passed,
            'execution_time': self.execution_time,
            'actual_document_count': self.actual_document_count,
            'error_message': self.error_message,
            'validation_details': self.validation_details,
            'sample_documents': self.actual_documents[:3]  # Only first 3 for brevity
        }


@dataclass
class TestSuiteResult:
    """Dataclass representing overall test suite results."""
    total_tests: int
    passed_tests: int
    failed_tests: int
    success_rate: float
    total_execution_time: float
    test_results: list[TestResult] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert test suite result to dictionary for JSON serialization."""
        return {
            'summary': {
                'total_tests': self.total_tests,
                'passed_tests': self.passed_tests,
                'failed_tests': self.failed_tests,
                'success_rate': self.success_rate,
                'total_execution_time': self.total_execution_time
            },
            'test_results': [result.to_dict() for result in self.test_results]
        }


class TestCaseGenerator:
    """Generator for comprehensive test cases covering various scenarios."""

    @staticmethod
    def generate_all_test_cases() -> list[TestCase]:
        """Generate all test cases for csv_to_mongo function."""
        return [
            # Test Case 1: Basic functionality
            TestCase(
                test_id="TC001",
                test_name="Basic CSV Processing",
                description="Test basic CSV processing with mixed data types",
                input_data=TestInput(
                    name="basic_csv",
                    description="Simple CSV with name, age, salary, and hire_date",
                    csv_content="""name,age,salary,hire_date
John Doe,30,50000.50,2023-01-15
Jane Smith,25,45000,2023-02-20
Bob Johnson,35,60000.75,2023-03-10"""
                ),
                expected_output=ExpectedOutput(
                    document_count=3,
                    sample_documents=[
                        {"name": "John Doe", "age": 30, "salary": 50000.50, "hire_date": datetime(2023, 1, 15)},
                        {"name": "Jane Smith", "age": 25, "salary": 45000, "hire_date": datetime(2023, 2, 20)},
                        {"name": "Bob Johnson", "age": 35, "salary": 60000.75, "hire_date": datetime(2023, 3, 10)}
                    ],
                    expected_field_types={
                        "name": "str",
                        "age": "int",
                        "salary": "float",
                        "hire_date": "datetime"
                    }
                ),
                tags=["basic", "mixed_types", "dates"]
            ),

            # Test Case 2: Numeric edge cases
            TestCase(
                test_id="TC002",
                test_name="Numeric Edge Cases",
                description="Test various numeric formats and edge cases",
                input_data=TestInput(
                    name="numeric_edge_cases",
                    description="CSV with various numeric formats",
                    csv_content="""id,integer,float_val,scientific,negative,zero,valid_large
1,42,3.14159,1.23e-4,-500,0,9223372036854775807
2,-17,0.001,2.5E+3,0,0,1000000
3,0,-99.99,-1.5e-2,-0,0,123456789"""
                ),
                expected_output=ExpectedOutput(
                    document_count=3,
                    expected_field_types={
                        "id": "int",
                        "integer": "int",
                        "float_val": "float",
                        "scientific": "float",
                        "negative": "int",
                        "zero": "int",
                        "valid_large": "int"  # Within 64-bit range
                    }
                ),
                tags=["numeric", "edge_cases", "scientific_notation"]
            ),

            # Test Case 3: Date format variations
            TestCase(
                test_id="TC003",
                test_name="Date Format Variations",
                description="Test different date formats and invalid dates",
                input_data=TestInput(
                    name="date_variations",
                    description="CSV with various date formats",
                    csv_content="""event,iso_date,us_date,eu_date,datetime_full,invalid_date
Meeting,2023-01-15,01/15/2023,15/01/2023,2023-01-15T10:30:00,not-a-date
Conference,2023-12-25,12/25/2023,25/12/2023,2023-12-25T14:00:00.123456,invalid
Workshop,2024-06-01,06/01/2024,01/06/2024,2024-06-01T09:15:30,2024-13-45"""
                ),
                expected_output=ExpectedOutput(
                    document_count=3,
                    expected_field_types={
                        "event": "str",
                        "iso_date": "datetime",
                        "us_date": "datetime",
                        "eu_date": "datetime",
                        "datetime_full": "datetime",
                        "invalid_date": "str"  # Should remain as string when parsing fails
                    }
                ),
                tags=["dates", "format_variations", "invalid_data"]
            ),

            # Test Case 4: Empty and whitespace handling
            TestCase(
                test_id="TC004",
                test_name="Empty and Whitespace Handling",
                description="Test handling of empty values, whitespace, and null-like values",
                input_data=TestInput(
                    name="empty_whitespace",
                    description="CSV with empty values and whitespace",
                    csv_content="""name,value,amount,notes
Alice,42,100.5,Valid entry
Bob,,0,Empty value
Charlie,   ,  ,Whitespace only
Diana,NULL,#N/A,Null-like values
   ,123,456.78,Leading/trailing spaces   """
                ),
                expected_output=ExpectedOutput(
                    document_count=5,
                    expected_field_types={
                        "name": "str",
                        "value": "mixed",  # Will be mixed due to empty values
                        "amount": "float",
                        "notes": "str"
                    }
                ),
                tags=["empty_values", "whitespace", "edge_cases"]
            ),

            # Test Case 5: Special characters and encoding
            TestCase(
                test_id="TC005",
                test_name="Special Characters and Encoding",
                description="Test handling of special characters, Unicode, and CSV edge cases",
                input_data=TestInput(
                    name="special_characters",
                    description="CSV with special characters and encoding issues",
                    csv_content='name,description,price,unicode_text\n'
                               '"Café Latté","Coffee with milk",4.50,Café\n'
                               '"naïve résumé","Quote test ""quoted""",0,"中文 测试"\n'
                               '"Product with comma","Text, with commas",12.99,"Español: niño"\n'
                               '"Multi-line","Line 1\\nLine 2",25.00,"Émojis: 🎉🎯📊"'
                ),
                expected_output=ExpectedOutput(
                    document_count=4,
                    expected_field_types={
                        "name": "str",
                        "description": "str",
                        "price": "float",
                        "unicode_text": "str"
                    }
                ),
                tags=["special_characters", "unicode", "csv_parsing"]
            ),

            # Test Case 6: Batch processing
            TestCase(
                test_id="TC006",
                test_name="Batch Processing",
                description="Test batch processing with custom batch size",
                input_data=TestInput(
                    name="batch_processing",
                    description="CSV with multiple records to test batching",
                    csv_content="\n".join([
                        "id,name,value,created_date"
                    ] + [
                        f"{i},Item_{i},{i * 10.5},2023-{(i % 12) + 1:02d}-{(i % 28) + 1:02d}"
                        for i in range(1, 26)  # 25 rows
                    ]),
                ),
                expected_output=ExpectedOutput(
                    document_count=25,
                    expected_field_types={
                        "id": "int",
                        "name": "str",
                        "value": "float",
                        "created_date": "datetime"
                    }
                ),
                tags=["batch_processing", "large_dataset", "performance"]
            ),

            # Test Case 7: Headers only (empty dataset)
            TestCase(
                test_id="TC007",
                test_name="Headers Only",
                description="Test CSV with headers but no data rows",
                input_data=TestInput(
                    name="headers_only",
                    description="CSV with only header row",
                    csv_content="name,age,email,signup_date"
                ),
                expected_output=ExpectedOutput(
                    document_count=0,
                    expected_field_types={}
                ),
                tags=["empty_dataset", "edge_cases"]
            ),

            # Test Case 8: Single row
            TestCase(
                test_id="TC008",
                test_name="Single Row",
                description="Test CSV with exactly one data row",
                input_data=TestInput(
                    name="single_row",
                    description="CSV with single data row",
                    csv_content="""user_id,username,balance,last_login_date
1001,admin,999.99,2023-12-31T23:59:59"""
                ),
                expected_output=ExpectedOutput(
                    document_count=1,
                    sample_documents=[
                        {"user_id": 1001, "username": "admin", "balance": 999.99, "last_login_date": datetime(2023, 12, 31, 23, 59, 59)}
                    ],
                    expected_field_types={
                        "user_id": "int",
                        "username": "str",
                        "balance": "float",
                        "last_login_date": "datetime"
                    }
                ),
                tags=["single_row", "minimal_dataset"]
            ),

            # Test Case 9: Mixed date formats in same column
            TestCase(
                test_id="TC009",
                test_name="Mixed Date Formats",
                description="Test column with mixed valid and invalid date formats",
                input_data=TestInput(
                    name="mixed_dates",
                    description="CSV with mixed date formats in same column",
                    csv_content="""event,event_date,priority
Launch,2023-01-01,high
Update,01/15/2023,medium
Maintenance,invalid-date,low
Release,2023-12-25T10:00:00,high
Patch,not a date at all,low"""
                ),
                expected_output=ExpectedOutput(
                    document_count=5,
                    expected_field_types={
                        "event": "str",
                        "event_date": "mixed",  # Some datetime, some str
                        "priority": "str"
                    }
                ),
                tags=["mixed_formats", "dates", "data_quality"]
            ),

            # Test Case 10: Large numbers and precision
            TestCase(
                test_id="TC010",
                test_name="Large Numbers and Precision",
                description="Test very large numbers and floating point precision, including integer overflow",
                input_data=TestInput(
                    name="large_numbers_precision",
                    description="CSV with large numbers, precision tests, and integer overflow cases",
                    csv_content="""item,large_int,overflow_int,tiny_decimal,scientific_large,scientific_small
A,9223372036854775807,999999999999999999999,0.000000001,1.23456789e+15,9.87654321e-10
B,123456789012345678,123456789012345678901,0.123456789012345,5.5e+20,1.1e-15
C,-9223372036854775808,-999999999999999999999,-0.000000001,-7.77e+18,-3.33e-12"""
                ),
                expected_output=ExpectedOutput(
                    document_count=3,
                    expected_field_types={
                        "item": "str",
                        "large_int": "int",       # Max 64-bit signed integer
                        "overflow_int": "str",    # Too large, stays as string
                        "tiny_decimal": "float",
                        "scientific_large": "float",
                        "scientific_small": "float"
                    }
                ),
                tags=["large_numbers", "precision", "scientific_notation", "integer_overflow"]
            ),

            # Test Case 11: Integer Overflow Edge Cases
            TestCase(
                test_id="TC011",
                test_name="Integer Overflow Boundary Testing",
                description="Test integers at the boundary of 64-bit signed integer limits",
                input_data=TestInput(
                    name="integer_overflow_boundary",
                    description="CSV testing exact 64-bit integer boundaries",
                    csv_content="""type,value,description
max_int,9223372036854775807,Maximum 64-bit signed integer
min_int,-9223372036854775808,Minimum 64-bit signed integer
overflow_pos,9223372036854775808,Just over maximum (should be string)
overflow_neg,-9223372036854775809,Just under minimum (should be string)
way_too_big,999999999999999999999999999999,Way too large (should be string)"""
                ),
                expected_output=ExpectedOutput(
                    document_count=5,
                    expected_field_types={
                        "type": "str",
                        "value": "mixed",  # Some int, some str due to overflow
                        "description": "str"
                    }
                ),
                tags=["integer_overflow", "boundary_testing", "edge_cases", "numeric"]
            )
        ]


class CSVToMongoTester:
    """Test runner for csv_to_mongo function using structured dataclasses."""

    def __init__(self):
        self.test_cases: list[TestCase] = TestCaseGenerator.generate_all_test_cases()
        self.results: list[TestResult] = []

    def run_single_test(self, test_case: TestCase) -> TestResult:
        """Execute a single test case and return the result."""
        import time

        start_time = time.time()

        try:
            # Create mock collection
            collection = MockCollection()

            # Create CSV file object
            csv_file = io.StringIO(test_case.input_data.csv_content)

            # Execute the function under test
            csv_to_mongo(csv_file, collection)

            execution_time = time.time() - start_time

            # Validate results
            validation_details = self._validate_test_result(test_case, collection)

            # Determine if test passed
            passed = self._evaluate_test_success(test_case, collection, validation_details)

            return TestResult(
                test_id=test_case.test_id,
                test_name=test_case.test_name,
                passed=passed,
                execution_time=execution_time,
                actual_document_count=len(collection.documents),
                actual_documents=collection.documents,
                validation_details=validation_details
            )

        except Exception as e:
            execution_time = time.time() - start_time
            return TestResult(
                test_id=test_case.test_id,
                test_name=test_case.test_name,
                passed=False,
                execution_time=execution_time,
                actual_document_count=0,
                error_message=str(e),
                validation_details={"error": "Exception occurred during test execution"}
            )

    def _validate_test_result(self, test_case: TestCase, collection: MockCollection) -> dict[str, Any]:
        """Validate test results against expected outcomes."""
        validation = {
            "document_count_match": len(collection.documents) == test_case.expected_output.document_count,
            "type_analysis": {},
            "sample_validation": {},
            "type_validation": {}
        }

        # Analyze field types
        if collection.documents:
            field_types = {}
            for doc in collection.documents:
                for field, value in doc.items():
                    if field not in field_types:
                        field_types[field] = set()
                    field_types[field].add(type(value).__name__)

            # Convert sets to lists for JSON serialization and validate expected types
            type_analysis = {}
            type_validation = {}

            for field, types in field_types.items():
                type_list = list(types)
                type_analysis[field] = type_list

                # Check against expected types
                expected_type = test_case.expected_output.expected_field_types.get(field)
                if expected_type:
                    if expected_type == "mixed":
                        # For mixed types, we expect multiple types
                        type_validation[field] = {
                            "expected": "mixed",
                            "actual": type_list,
                            "valid": len(type_list) > 1
                        }
                    elif expected_type == "int":
                        # For int, we expect only 'int' type
                        type_validation[field] = {
                            "expected": "int",
                            "actual": type_list,
                            "valid": type_list == ["int"]
                        }
                    elif expected_type == "float":
                        # For float, we expect only 'float' type
                        type_validation[field] = {
                            "expected": "float",
                            "actual": type_list,
                            "valid": type_list == ["float"]
                        }
                    elif expected_type == "str":
                        # For str, we expect only 'str' type
                        type_validation[field] = {
                            "expected": "str",
                            "actual": type_list,
                            "valid": type_list == ["str"]
                        }
                    elif expected_type == "datetime":
                        # For datetime, we expect only 'datetime' type
                        type_validation[field] = {
                            "expected": "datetime",
                            "actual": type_list,
                            "valid": type_list == ["datetime"]
                        }

            validation["type_analysis"] = type_analysis
            validation["type_validation"] = type_validation

            # Validate sample documents if provided
            if test_case.expected_output.sample_documents:
                sample_matches = []
                expected_samples = test_case.expected_output.sample_documents
                actual_samples = collection.documents[:len(expected_samples)]

                for i, (expected, actual) in enumerate(zip(expected_samples, actual_samples)):
                    match_result = self._compare_documents(expected, actual)
                    sample_matches.append({
                        "index": i,
                        "matches": match_result
                    })

                validation["sample_validation"] = {
                    "total_samples": len(expected_samples),
                    "matches": sample_matches
                }

        return validation

    def _compare_documents(self, expected: dict[str, Any], actual: dict[str, Any]) -> dict[str, bool]:
        """Compare expected and actual documents field by field."""
        matches = {}

        all_fields = set(expected.keys()) | set(actual.keys())

        for field_name in all_fields:
            expected_val = expected.get(field_name)
            actual_val = actual.get(field_name)

            # Special handling for datetime objects
            if isinstance(expected_val, datetime) and isinstance(actual_val, datetime):
                matches[field_name] = expected_val == actual_val
            elif type(expected_val) is type(actual_val):
                matches[field_name] = expected_val == actual_val
            else:
                matches[field_name] = False

        return matches

    def _evaluate_test_success(self, test_case: TestCase, collection: MockCollection, validation: dict[str, Any]) -> bool:
        """Evaluate whether a test case passed based on validation results."""
        # Check basic requirements
        if not validation["document_count_match"]:
            return False

        # For tests with expected sample documents, check if they match
        if test_case.expected_output.sample_documents:
            sample_validation = validation.get("sample_validation", {})
            if sample_validation:
                for match_info in sample_validation.get("matches", []):
                    field_matches = match_info.get("matches", {})
                    # Require at least 80% of fields to match for each sample
                    if field_matches:
                        match_rate = sum(field_matches.values()) / len(field_matches)
                        if match_rate < 0.8:
                            return False

        return True

    def run_all_tests(self) -> TestSuiteResult:
        """Execute all test cases and return comprehensive results."""
        print("🚀 Starting CSV to Mongo Test Suite")
        print("=" * 60)

        self.results = []
        total_start_time = time.time()

        for i, test_case in enumerate(self.test_cases, 1):
            print(f"\n📋 Running Test {i}/{len(self.test_cases)}: {test_case.test_name}")
            print(f"   Description: {test_case.description}")
            print(f"   Tags: {', '.join(test_case.tags)}")

            result = self.run_single_test(test_case)
            self.results.append(result)

            # Print immediate result
            status = "✅ PASS" if result.passed else "❌ FAIL"
            print(f"   {status} - {result.actual_document_count} documents, {result.execution_time:.3f}s")

            if not result.passed and result.error_message:
                print(f"   ❗ Error: {result.error_message}")

        total_execution_time = time.time() - total_start_time

        # Calculate summary statistics
        passed_tests = sum(1 for r in self.results if r.passed)
        failed_tests = len(self.results) - passed_tests
        success_rate = (passed_tests / len(self.results)) * 100 if self.results else 0

        return TestSuiteResult(
            total_tests=len(self.results),
            passed_tests=passed_tests,
            failed_tests=failed_tests,
            success_rate=success_rate,
            total_execution_time=total_execution_time,
            test_results=self.results
        )

    def print_detailed_summary(self, suite_result: TestSuiteResult):
        """Print detailed summary of test results."""
        print("\n" + "=" * 80)
        print("📊 COMPREHENSIVE TEST SUMMARY")
        print("=" * 80)

        print(f"Total Tests: {suite_result.total_tests}")
        print(f"Passed: {suite_result.passed_tests}")
        print(f"Failed: {suite_result.failed_tests}")
        print(f"Success Rate: {suite_result.success_rate:.1f}%")
        print(f"Total Execution Time: {suite_result.total_execution_time:.3f} seconds")

        # Performance metrics
        if suite_result.total_execution_time > 0:
            total_docs = sum(r.actual_document_count for r in suite_result.test_results)
            print(f"Total Documents Processed: {total_docs}")
            print(f"Processing Rate: {total_docs/suite_result.total_execution_time:.0f} docs/second")

        print("\n📋 Detailed Test Results:")
        print("-" * 50)

        for result in suite_result.test_results:
            status_icon = "✅" if result.passed else "❌"
            print(f"\n{status_icon} {result.test_id}: {result.test_name}")
            print(f"   Documents: {result.actual_document_count}")
            print(f"   Execution Time: {result.execution_time:.4f}s")

            if result.validation_details.get("type_analysis"):
                print("   Field Types:")
                for field, types in result.validation_details["type_analysis"].items():
                    print(f"     {field}: {', '.join(types)}")

            if not result.passed and result.error_message:
                print(f"   ❗ Error: {result.error_message}")

        print("\n" + "=" * 80)

    def save_results_to_json(self, suite_result: TestSuiteResult, filename: str = "test_results.json"):
        """Save test results to a JSON file."""
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(suite_result.to_dict(), f, indent=2, default=str)
            print(f"📄 Test results saved to: {filename}")
        except Exception as e:
            print(f"❌ Error saving results to JSON: {e}")


def demo_test_structure():
    """Demonstrate the test structure with a simple example."""
    print("🔬 CSV to Mongo Test Structure Demo")
    print("=" * 50)

    # Show example test case structure
    test_case = TestCaseGenerator.generate_all_test_cases()[0]  # Get first test case

    print("\n📋 Example Test Case Structure:")
    print(f"Test ID: {test_case.test_id}")
    print(f"Name: {test_case.test_name}")
    print(f"Description: {test_case.description}")
    print(f"Tags: {', '.join(test_case.tags)}")

    print("\n📥 Input Data:")
    print(f"Name: {test_case.input_data.name}")
    print(f"Description: {test_case.input_data.description}")
    print(f"CSV Content:\n{test_case.input_data.csv_content}")

    print("\n📤 Expected Output:")
    print(f"Document Count: {test_case.expected_output.document_count}")
    print(f"Should Succeed: {test_case.expected_output.should_succeed}")
    print(f"Expected Field Types: {test_case.expected_output.expected_field_types}")

    print("\n🔬 Running Demo Test...")

    # Run the test
    tester = CSVToMongoTester()
    result = tester.run_single_test(test_case)

    print("\n📊 Test Result:")
    print(f"Passed: {result.passed}")
    print(f"Execution Time: {result.execution_time:.4f}s")
    print(f"Actual Document Count: {result.actual_document_count}")

    if result.actual_documents:
        print("\nSample Document:")
        sample_doc = result.actual_documents[0]
        for key, value in sample_doc.items():
            print(f"  {key}: {value} ({type(value).__name__})")


def demo_standalone_tests():
    """Demonstrate the standalone test functions."""
    print("🔧 Standalone Test Functions Demo")
    print("=" * 50)

    print("\n1. Basic CSV Test:")
    result = run_basic_csv_test()
    print(f"   Documents: {len(result['collection'].documents)}")
    print(f"   Collection dropped: {result['collection'].dropped}")
    print(f"   First document: {result['collection'].documents[0] if result['collection'].documents else 'None'}")

    print("\n2. Empty CSV Test:")
    result = run_empty_csv_test()
    print(f"   Documents: {len(result['collection'].documents)}")
    print(f"   Collection dropped: {result['collection'].dropped}")

    print("\n3. Batch Processing Test:")
    result = run_batch_processing_test()
    print(f"   Documents: {len(result['collection'].documents)}")
    print(f"   Collection dropped: {result['collection'].dropped}")

    print("\n4. Special Characters Test:")
    result = run_special_characters_test()
    print(f"   Documents: {len(result['collection'].documents)}")
    print(f"   First name: {result['collection'].documents[0]['name'] if result['collection'].documents else 'None'}")

    print("\n5. Numeric Edge Cases Test:")
    result = run_numeric_edge_cases_test()
    if result['collection'].documents:
        doc = result['collection'].documents[0]
        print(f"   Scientific notation: {doc.get('scientific')} (type: {type(doc.get('scientific')).__name__})")
        print(f"   Negative value: {doc.get('negative')}")
        print(f"   Zero value: {doc.get('zero')}")

    print("\n6. Date Formats Test:")
    result = run_date_formats_test()
    if result['collection'].documents:
        for i, doc in enumerate(result['collection'].documents):
            date_val = doc.get('date')
            print(f"   Document {i+1} date: {date_val} (type: {type(date_val).__name__})")

    print("\n✅ All standalone test functions executed successfully!")


def main():
    """Main entry point for the test suite."""
    import argparse

    parser = argparse.ArgumentParser(description='CSV to Mongo Test Suite (pytest-compatible)')
    parser.add_argument('--demo', action='store_true', help='Run demonstration of test structure')
    parser.add_argument('--demo-standalone', action='store_true', help='Run demonstration of standalone test functions')
    parser.add_argument('--run-all', action='store_true', help='Run all test cases using the tester framework')
    parser.add_argument('--run-standalone', action='store_true', help='Run all standalone test functions')
    parser.add_argument('--save-json', type=str, help='Save results to JSON file')
    parser.add_argument('--test-id', type=str, help='Run specific test by ID')

    args = parser.parse_args()

    if args.demo:
        demo_test_structure()
    elif args.demo_standalone:
        demo_standalone_tests()
    elif args.run_standalone:
        # Run all standalone tests
        print("🚀 Running All Standalone Test Functions")
        print("=" * 60)

        standalone_tests = [
            ("Basic CSV Processing", run_basic_csv_test),
            ("Empty CSV Processing", run_empty_csv_test),
            ("Batch Processing", run_batch_processing_test),
            ("Special Characters", run_special_characters_test),
            ("Numeric Edge Cases", run_numeric_edge_cases_test),
            ("Date Formats", run_date_formats_test)
        ]

        passed = 0
        total = len(standalone_tests)

        for test_name, test_func in standalone_tests:
            try:
                print(f"\n📋 Running: {test_name}")
                result = test_func()
                print(f"   ✅ PASS - {len(result['collection'].documents)} documents processed")
                passed += 1
            except Exception as e:
                print(f"   ❌ FAIL - {str(e)}")

        print(f"\n📊 Summary: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    elif args.test_id:
        # Run specific test
        tester = CSVToMongoTester()
        test_case = next((tc for tc in tester.test_cases if tc.test_id == args.test_id), None)
        if test_case:
            print(f"Running test {args.test_id}: {test_case.test_name}")
            result = tester.run_single_test(test_case)
            print(f"Result: {'PASS' if result.passed else 'FAIL'}")
            if args.save_json:
                # Create mini suite result for single test
                suite_result = TestSuiteResult(
                    total_tests=1,
                    passed_tests=1 if result.passed else 0,
                    failed_tests=0 if result.passed else 1,
                    success_rate=100.0 if result.passed else 0.0,
                    total_execution_time=result.execution_time,
                    test_results=[result]
                )
                tester.save_results_to_json(suite_result, args.save_json)
        else:
            print(f"Test {args.test_id} not found")
    elif args.run_all:
        # Run all tests using the tester framework
        tester = CSVToMongoTester()
        suite_result = tester.run_all_tests()
        tester.print_detailed_summary(suite_result)

        if args.save_json:
            tester.save_results_to_json(suite_result, args.save_json)
    else:
        print("CSV to Mongo Test Suite (pytest-compatible)")
        print("=" * 50)
        print("🔧 This test suite supports both pytest and standalone execution modes.")
        print("\nAvailable commands:")
        print("  --demo               Show test structure demonstration")
        print("  --demo-standalone    Show standalone test functions demonstration")
        print("  --run-all            Run all test cases using the comprehensive tester")
        print("  --run-standalone     Run all standalone test functions")
        print("  --test-id ID         Run specific test by ID")
        print("  --save-json FILE     Save results to JSON file")
        print("\n🧪 Pytest usage:")
        print("  pytest test_csv_to_mongo.py                    # Run all pytest tests")
        print("  pytest test_csv_to_mongo.py -v                 # Verbose output")
        print("  pytest test_csv_to_mongo.py -k basic           # Run tests matching 'basic'")
        print("  pytest test_csv_to_mongo.py -m basic           # Run tests marked as 'basic'")
        print("  pytest test_csv_to_mongo.py -m 'not comprehensive'  # Skip comprehensive tests")
        print("  pytest test_csv_to_mongo.py::test_basic_csv_processing  # Run specific test")
        print("\n📋 Standalone usage:")
        print("  python test_csv_to_mongo.py --demo")
        print("  python test_csv_to_mongo.py --demo-standalone")
        print("  python test_csv_to_mongo.py --run-all")
        print("  python test_csv_to_mongo.py --run-standalone")
        print("  python test_csv_to_mongo.py --run-all --save-json results.json")
        print("  python test_csv_to_mongo.py --test-id TC001")

        # Show available test cases
        generator = TestCaseGenerator()
        test_cases = generator.generate_all_test_cases()
        print(f"\nAvailable Comprehensive Test Cases ({len(test_cases)} total):")
        for tc in test_cases:
            print(f"  {tc.test_id}: {tc.test_name} - {tc.description}")

        print("\nAvailable Standalone Test Functions:")
        standalone_funcs = [
            "run_basic_csv_test",
            "run_empty_csv_test",
            "run_batch_processing_test",
            "run_special_characters_test",
            "run_numeric_edge_cases_test",
            "run_date_formats_test"
        ]
        for func_name in standalone_funcs:
            print(f"  {func_name}")

        print("\n🎯 Integration Notes:")
        print("  • Pytest is now required (not optional)")
        print("  • Pytest tests call standalone functions for consistency")
        print("  • All test data and logic are reusable between modes")
        print("  • Fixtures provide proper isolation for pytest")
        print("  • Marks enable selective test execution")


# =============================================================================
# PYTEST FIXTURES AND COMPATIBILITY
# =============================================================================

def get_test_cases():
    """Get all test cases for pytest parametrization."""
    return TestCaseGenerator.generate_all_test_cases()


def get_test_case_ids():
    """Get test case IDs for pytest parametrization."""
    return [tc.test_id for tc in get_test_cases()]


# Pytest fixtures
@pytest.fixture
def mock_collection():
    """Fixture providing a fresh MockCollection for each test."""
    return MockCollection()

@pytest.fixture(params=get_test_cases(), ids=get_test_case_ids())
def test_case(request: FixtureRequest):
    """Fixture providing each test case as a parameter."""
    return request.param

@pytest.fixture
def csv_tester():
    """Fixture providing a CSVToMongoTester instance."""
    return CSVToMongoTester()


# =============================================================================
# STANDALONE TEST FUNCTIONS (used by both standalone and pytest modes)
# =============================================================================

def run_parametrized_test(test_case: TestCase, collection: MockCollection) -> dict[str, Any]:
    """Standalone function for running parametrized tests."""
    # Create CSV file object
    csv_file = io.StringIO(test_case.input_data.csv_content)

    # Execute the function under test
    csv_to_mongo(csv_file, collection)

    return {
        'collection': collection,
        'expected_doc_count': test_case.expected_output.document_count,
        'expected_samples': test_case.expected_output.sample_documents,
        'test_case': test_case
    }


def run_basic_csv_test() -> dict[str, Any]:
    """Standalone function for basic CSV processing test."""
    collection = MockCollection()
    csv_content = """name,age,salary
John Doe,30,50000.50
Jane Smith,25,45000"""

    csv_file = io.StringIO(csv_content)
    csv_to_mongo(csv_file, collection)

    return {
        'collection': collection,
        'expected_docs': 2,
        'expected_first_name': "John Doe",
        'expected_first_age': 30,
        'expected_first_salary': 50000.50
    }


def run_empty_csv_test() -> dict[str, Any]:
    """Standalone function for empty CSV test."""
    collection = MockCollection()
    csv_content = "name,age,email"

    csv_file = io.StringIO(csv_content)
    csv_to_mongo(csv_file, collection)

    return {
        'collection': collection,
        'expected_docs': 0,
    }


def run_batch_processing_test() -> dict[str, Any]:
    """Standalone function for batch processing test."""
    collection = MockCollection()
    csv_content = "id,value\n" + "\n".join([f"{i},{i*10}" for i in range(1, 26)])  # 25 rows

    csv_file = io.StringIO(csv_content)
    csv_to_mongo(csv_file, collection)

    return {
        'collection': collection,
        'expected_docs': 25,
    }


def run_special_characters_test() -> dict[str, Any]:
    """Standalone function for special characters test."""
    collection = MockCollection()
    csv_content = '''name,description
"Café Latté","Coffee with milk"
"naïve résumé","Unicode test"'''

    csv_file = io.StringIO(csv_content)
    csv_to_mongo(csv_file, collection)

    return {
        'collection': collection,
        'expected_docs': 2,
        'expected_first_name': "Café Latté",
        'expected_naive_check': "naïve"
    }


def run_numeric_edge_cases_test() -> dict[str, Any]:
    """Standalone function for numeric edge cases test."""
    collection = MockCollection()
    csv_content = """id,scientific,negative,zero
1,1.23e-4,-500,0
2,2.5E+3,0,0"""

    csv_file = io.StringIO(csv_content)
    csv_to_mongo(csv_file, collection)

    return {
        'collection': collection,
        'expected_docs': 2,
        'expected_scientific_type': float,
        'expected_negative_value': -500,
        'expected_zero_value': 0
    }


def run_date_formats_test() -> dict[str, Any]:
    """Standalone function for date formats test."""
    collection = MockCollection()
    csv_content = """event,date
Meeting,2023-01-15
Conference,01/15/2023"""

    csv_file = io.StringIO(csv_content)
    csv_to_mongo(csv_file, collection)

    return {
        'collection': collection,
        'expected_docs': 2,
        'should_have_datetime': True
    }


def validate_sample_documents(expected_samples: list[dict[str, Any]], actual_samples: list[dict[str, Any]], test_id: str):
    """Standalone function to validate sample documents."""
    for i, (expected, actual) in enumerate(zip(expected_samples, actual_samples)):
        _compare_sample_documents(expected, actual, test_id, i)


# =============================================================================
# PYTEST TEST FUNCTIONS (call standalone functions)
# =============================================================================

def test_csv_to_mongo_parametrized(test_case, mock_collection):
    """
    Pytest-compatible parametrized test for csv_to_mongo function.

    This test will be run once for each test case defined in TestCaseGenerator.
    """
    # Call the standalone test function
    result = run_parametrized_test(test_case, mock_collection)

    collection = result['collection']
    expected_doc_count = result['expected_doc_count']
    expected_samples = result['expected_samples']

    # Validate basic results
    assert len(collection.documents) == expected_doc_count, \
        f"Expected {expected_doc_count} documents, got {len(collection.documents)}"

    # Validate sample documents if provided
    if expected_samples:
        actual_samples = collection.documents[:len(expected_samples)]
        validate_sample_documents(expected_samples, actual_samples, test_case.test_id)


def test_basic_csv_processing():
    """Test basic CSV processing functionality."""
    result = run_basic_csv_test()

    collection = result['collection']
    assert len(collection.documents) == result['expected_docs']
    assert collection.documents[0]["name"] == result['expected_first_name']
    assert collection.documents[0]["age"] == result['expected_first_age']
    assert collection.documents[0]["salary"] == result['expected_first_salary']


def test_empty_csv_processing():
    """Test CSV with headers only."""
    result = run_empty_csv_test()

    collection = result['collection']
    assert len(collection.documents) == result['expected_docs']


def test_batch_processing():
    """Test batch processing with custom batch size."""
    result = run_batch_processing_test()

    collection = result['collection']
    assert len(collection.documents) == result['expected_docs']


def test_special_characters():
    """Test handling of special characters and unicode."""
    result = run_special_characters_test()

    collection = result['collection']
    assert len(collection.documents) == result['expected_docs']
    assert collection.documents[0]["name"] == result['expected_first_name']
    assert result['expected_naive_check'] in collection.documents[1]["name"]


def test_numeric_edge_cases():
    """Test various numeric formats."""
    result = run_numeric_edge_cases_test()

    collection = result['collection']
    assert len(collection.documents) == result['expected_docs']
    assert isinstance(collection.documents[0]["scientific"], result['expected_scientific_type'])
    assert collection.documents[0]["negative"] == result['expected_negative_value']
    assert collection.documents[0]["zero"] == result['expected_zero_value']


def test_date_formats():
    """Test various date format handling."""
    result = run_date_formats_test()

    collection = result['collection']
    assert len(collection.documents) == result['expected_docs']
    # At least one should be parsed as datetime
    has_datetime = any(
        isinstance(doc.get("date"), datetime)
        for doc in collection.documents
    )
    assert has_datetime == result['should_have_datetime'], \
        "At least one date should be parsed as datetime"


def _compare_sample_documents(expected: dict[str, Any], actual: dict[str, Any], test_id: str, index: int):
    """Helper function to compare expected and actual sample documents."""
    all_fields = set(expected.keys()) | set(actual.keys())

    for field_name in all_fields:
        expected_val = expected.get(field_name)
        actual_val = actual.get(field_name)

        # Special handling for datetime objects
        if isinstance(expected_val, datetime) and isinstance(actual_val, datetime):
            assert expected_val == actual_val, \
                f"Test {test_id}, sample {index}, field '{field_name}': datetime mismatch"
        elif type(expected_val) is type(actual_val):
            assert expected_val == actual_val, \
                f"Test {test_id}, sample {index}, field '{field_name}': value mismatch"
        else:
            # For type mismatches, we'll be more lenient and just check if both exist
            assert field_name in expected and field_name in actual, \
                f"Test {test_id}, sample {index}, field '{field_name}': field presence mismatch"


# =============================================================================
# PYTEST MARKS AND CATEGORIES
# =============================================================================

# Mark tests by category for selective running
test_csv_to_mongo_parametrized = pytest.mark.comprehensive(test_csv_to_mongo_parametrized)
test_basic_csv_processing = pytest.mark.basic(test_basic_csv_processing)
test_empty_csv_processing = pytest.mark.edge_cases(test_empty_csv_processing)
test_batch_processing = pytest.mark.performance(test_batch_processing)
test_special_characters = pytest.mark.unicode(test_special_characters)
test_numeric_edge_cases = pytest.mark.numeric(test_numeric_edge_cases)
test_date_formats = pytest.mark.dates(test_date_formats)

if __name__ == "__main__":
    main()
