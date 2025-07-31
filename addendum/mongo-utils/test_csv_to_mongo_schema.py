#!/usr/bin/env python3
"""
Comprehensive Test Suite for new CSV functions

This module provides structured testing for infer_csv_schema and csv_to_mongo_with_converters
functions using dataclasses to define test inputs, expected outputs, test cases, and results.

Compatible with pytest framework for professional testing workflows and also supports
standalone execution for quick testing without pytest installation.

Key Features:
- Dual-mode operation: pytest and standalone
- Dataclass-based test structure
- Comprehensive test case generation for schema inference and custom converters
- Detailed result reporting and JSON export
- Testing of CSVConverters and CSVTypeDetectors classes

Pytest Configuration:
- Markers: schema_inference, converters, type_detection, comprehensive
- Fixtures: mock_collection, test_case, csv_tester
- Parametrized tests for comprehensive coverage

Usage:
  pytest test_csv_to_mongo_schema.py -v -m schema_inference  # Run schema tests only
  python test_csv_to_mongo_schema.py --demo                  # Standalone demo
"""

from collections.abc import Iterable
import io
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
import json
import sys
import os

try:
    # I do this because in the notebooks all files will be
    # at the same directory level
    from csv_schema_utils import ( # type: ignore
        infer_csv_schema,
        CSVConverters,
        CSVTypeDetectorsForDB,
        CSVToPythonConverterFunction
    )
except ImportError:
    # If running as a script, adjust the path to import from the parent directory
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
    from csv_schema.csv_schema_utils import (
        infer_csv_schema,
        CSVConverters,
        CSVTypeDetectorsForDB,
        CSVToPythonConverterFunction
    )

import pytest
from pytest import FixtureRequest

# Import the modules under test
from csv_to_mongo_schema import (
    csv_to_mongo_with_converters
)

class MockCollection:
    """Example implementation of CollectionProtocol for testing."""
    def __init__(self):
        self.documents: list[dict[str, Any]] = []

    def insert_many(self, documents: Iterable[dict[str, Any]], ordered: bool = True) -> Any:
        """Add documents to the internal storage."""
        docs: list[dict[str, Any]] = list(documents)
        self.documents.extend(docs)
        return type('InsertResult', (), {'inserted_ids': [f"mock_id_{i}" for i in range(len(docs))]})()

@dataclass
class SchemaTestInput:
    name: str
    description: str
    csv_content: str
    sample_rows: int = 10000

@dataclass
class ConverterTestInput:
    name: str
    description: str
    csv_content: str
    converters: dict[str, CSVToPythonConverterFunction]
    batch_size: int = 5000

@dataclass
class SchemaExpectedOutput:
    expected_schema: dict[str, type]
    should_succeed: bool = True
    error_message: str | None = None

@dataclass
class ConverterExpectedOutput:
    document_count: int
    collection_dropped: bool
    sample_documents: list[dict[str, Any]] = field(default_factory=list)
    expected_field_types: dict[str, str] = field(default_factory=dict)
    should_succeed: bool = True
    error_message: str | None = None

@dataclass
class SchemaTestCase:
    test_id: str
    test_name: str
    description: str
    input_data: SchemaTestInput
    expected_output: SchemaExpectedOutput
    tags: list[str] = field(default_factory=list)

@dataclass
class ConverterTestCase:
    test_id: str
    test_name: str
    description: str
    input_data: ConverterTestInput
    expected_output: ConverterExpectedOutput
    tags: list[str] = field(default_factory=list)

@dataclass
class SchemaTestResult:
    test_id: str
    test_name: str
    passed: bool
    execution_time: float
    actual_schema: dict[str, type]
    error_message: str | None = None
    validation_details: dict[str, Any] = field(default_factory=dict)
    def to_dict(self) -> dict[str, Any]:
        return {
            'test_id': self.test_id,
            'test_name': self.test_name,
            'passed': self.passed,
            'execution_time': self.execution_time,
            'actual_schema': {k: v.__name__ if hasattr(v, '__name__') else str(v) for k, v in self.actual_schema.items()},
            'error_message': self.error_message,
            'validation_details': self.validation_details
        }

@dataclass
class ConverterTestResult:
    test_id: str
    test_name: str
    passed: bool
    execution_time: float
    actual_document_count: int
    actual_documents: list[dict[str, Any]] = field(default_factory=list)
    error_message: str | None = None
    validation_details: dict[str, Any] = field(default_factory=dict)
    def to_dict(self) -> dict[str, Any]:
        return {
            'test_id': self.test_id,
            'test_name': self.test_name,
            'passed': self.passed,
            'execution_time': self.execution_time,
            'actual_document_count': self.actual_document_count,
            'error_message': self.error_message,
            'validation_details': self.validation_details,
            'sample_documents': self.actual_documents[:3]
        }


class SchemaTestCaseGenerator:
    """Generator for schema inference test cases."""

    @staticmethod
    def generate_all_test_cases() -> list[SchemaTestCase]:
        """Generate all test cases for infer_csv_schema function."""
        return [
            # Test Case 1: Basic mixed types
            SchemaTestCase(
                test_id="schema_001",
                test_name="Basic Mixed Types",
                description="Test schema inference with mixed data types",
                input_data=SchemaTestInput(
                    name="basic_mixed",
                    description="Basic CSV with mixed types",
                    csv_content="name,age,salary,is_active,join_date\nJohn,25,50000.5,true,2023-01-15\nJane,30,60000.0,false,2023-02-20\nBob,35,75000.25,true,2023-03-10"
                ),
                expected_output=SchemaExpectedOutput(
                    expected_schema={
                        'name': str,
                        'age': int,
                        'salary': float,
                        'is_active': bool,
                        'join_date': datetime
                    }
                ),
                tags=["basic", "schema_inference"]
            ),

            # Test Case 2: All strings
            SchemaTestCase(
                test_id="schema_002",
                test_name="All String Types",
                description="Test schema inference with all string data",
                input_data=SchemaTestInput(
                    name="all_strings",
                    description="CSV with only string data",
                    csv_content="name,department,location\nJohn,Engineering,New York\nJane,Marketing,Los Angeles\nBob,Sales,Chicago"
                ),
                expected_output=SchemaExpectedOutput(
                    expected_schema={
                        'name': str,
                        'department': str,
                        'location': str
                    }
                ),
                tags=["basic", "schema_inference"]
            ),

            # Test Case 3: Empty and null values
            SchemaTestCase(
                test_id="schema_003",
                test_name="Empty and Null Values",
                description="Test schema inference with empty/null values",
                input_data=SchemaTestInput(
                    name="empty_nulls",
                    description="CSV with empty and null values",
                    csv_content="name,age,score\nJohn,25,95.5\nJane,,87.2\nBob,30,\n,35,92.0\nAlice,28,88.5"
                ),
                expected_output=SchemaExpectedOutput(
                    expected_schema={
                        'name': str,
                        'age': int,
                        'score': float
                    }
                ),
                tags=["edge_cases", "schema_inference"]
            ),

            # Test Case 4: Boolean variations
            SchemaTestCase(
                test_id="schema_004",
                test_name="Boolean Variations",
                description="Test schema inference with various boolean representations",
                input_data=SchemaTestInput(
                    name="boolean_variations",
                    description="CSV with different boolean formats",
                    csv_content="active,verified,enabled\ntrue,1,yes\nfalse,0,no\ntrue,1,y\nfalse,0,n"
                ),
                expected_output=SchemaExpectedOutput(
                    expected_schema={
                        'active': bool,
                        'verified': bool,
                        'enabled': bool
                    }
                ),
                tags=["boolean", "schema_inference"]
            ),

            # Test Case 5: Date variations
            SchemaTestCase(
                test_id="schema_005",
                test_name="Date Format Variations",
                description="Test schema inference with various date formats",
                input_data=SchemaTestInput(
                    name="date_variations",
                    description="CSV with different date formats",
                    csv_content="iso_date,us_date,eu_date\n2023-01-15,01/15/2023,15/01/2023\n2023-02-20,02/20/2023,20/02/2023\n2023-03-10,03/10/2023,10/03/2023"
                ),
                expected_output=SchemaExpectedOutput(
                    expected_schema={
                        'iso_date': datetime,
                        'us_date': datetime,
                        'eu_date': datetime
                    }
                ),
                tags=["dates", "schema_inference"]
            ),

            # Test Case 6: Mixed types falling back to string
            SchemaTestCase(
                test_id="schema_006",
                test_name="Mixed Types Fallback",
                description="Test schema inference when mixed types fall back to string",
                input_data=SchemaTestInput(
                    name="mixed_fallback",
                    description="CSV with mixed types that should fall back to string",
                    csv_content="mixed_col\n123\nabc\n456\ndef\n789"
                ),
                expected_output=SchemaExpectedOutput(
                    expected_schema={
                        'mixed_col': str
                    }
                ),
                tags=["edge_cases", "schema_inference"]
            )
        ]


class ConverterTestCaseGenerator:
    """Generator for converter test cases."""

    @staticmethod
    def generate_all_test_cases() -> list[ConverterTestCase]:
        """Generate all test cases for csv_to_mongo_with_converters function."""
        return [
            # Test Case 1: Basic converters
            ConverterTestCase(
                test_id="conv_001",
                test_name="Basic Converters",
                description="Test basic type converters",
                input_data=ConverterTestInput(
                    name="basic_converters",
                    description="CSV with basic converter usage",
                    csv_content="name,age,salary,is_active\nJohn,25,50000.5,true\nJane,30,60000.0,false\nBob,35,75000.25,true",
                    converters={
                        'age': CSVConverters.int_converter(),
                        'salary': CSVConverters.float_converter(),
                        'is_active': CSVConverters.bool_converter()
                    }
                ),
                expected_output=ConverterExpectedOutput(
                    document_count=3,
                    collection_dropped=True,
                    sample_documents=[
                        {'name': 'John', 'age': 25, 'salary': 50000.5, 'is_active': True},
                        {'name': 'Jane', 'age': 30, 'salary': 60000.0, 'is_active': False},
                        {'name': 'Bob', 'age': 35, 'salary': 75000.25, 'is_active': True}
                    ]
                ),
                tags=["basic", "converters"]
            ),

            # Test Case 2: Date converters
            ConverterTestCase(
                test_id="conv_002",
                test_name="Date Converters",
                description="Test date converter functionality",
                input_data=ConverterTestInput(
                    name="date_converters",
                    description="CSV with date converter usage",
                    csv_content="name,join_date,birth_date\nJohn,2023-01-15,1990-05-10\nJane,2023-02-20,1985-12-25\nBob,2023-03-10,1988-07-08",
                    converters={
                        'join_date': CSVConverters.date_converter(),
                        'birth_date': CSVConverters.date_converter()
                    }
                ),
                expected_output=ConverterExpectedOutput(
                    document_count=3,
                    collection_dropped=True,
                    sample_documents=[
                        {'name': 'John', 'join_date': datetime(2023, 1, 15), 'birth_date': datetime(1990, 5, 10)},
                        {'name': 'Jane', 'join_date': datetime(2023, 2, 20), 'birth_date': datetime(1985, 12, 25)},
                        {'name': 'Bob', 'join_date': datetime(2023, 3, 10), 'birth_date': datetime(1988, 7, 8)}
                    ]
                ),
                tags=["dates", "converters"]
            ),

            # Test Case 4: String converters
            ConverterTestCase(
                test_id="conv_004",
                test_name="String Converters",
                description="Test string transformation converters",
                input_data=ConverterTestInput(
                    name="string_converters",
                    description="CSV with string converter usage",
                    csv_content="name,department,email\n  John  ,  Engineering  ,  john@example.com  \n  Jane  ,  Marketing  ,  jane@example.com  ",
                    converters={
                        'name': CSVConverters.upper_converter(),
                        'department': CSVConverters.lower_converter(),
                        'email': CSVConverters.strip_converter()
                    }
                ),
                expected_output=ConverterExpectedOutput(
                    document_count=2,
                    collection_dropped=True,
                    sample_documents=[
                        {'name': '  JOHN  ', 'department': '  engineering  ', 'email': 'john@example.com'},
                        {'name': '  JANE  ', 'department': '  marketing  ', 'email': 'jane@example.com'}
                    ]
                ),
                tags=["string", "converters"]
            ),

            # Test Case 5: Mixed converters with graceful degradation
            ConverterTestCase(
                test_id="conv_005",
                test_name="Graceful Degradation",
                description="Test graceful degradation when conversion fails",
                input_data=ConverterTestInput(
                    name="graceful_degradation",
                    description="CSV with conversion failures",
                    csv_content="name,age,score\nJohn,25,95.5\nJane,invalid,87.2\nBob,30,invalid",
                    converters={
                        'age': CSVConverters.int_converter(),
                        'score': CSVConverters.float_converter()
                    }
                ),
                expected_output=ConverterExpectedOutput(
                    document_count=3,
                    collection_dropped=True,
                    sample_documents=[
                        {'name': 'John', 'age': 25, 'score': 95.5},
                        {'name': 'Jane', 'age': 0, 'score': 87.2},  # age conversion fails, gets default 0
                        {'name': 'Bob', 'age': 30, 'score': 0.0}    # score conversion fails, gets default 0.0
                    ]
                ),
                tags=["edge_cases", "converters"]
            )
        ]


class CSVTester:
    """Main test execution class for CSV functions."""

    def __init__(self):
        self.schema_results: list[SchemaTestResult] = []
        self.converter_results: list[ConverterTestResult] = []

    def run_schema_test(self, test_case: SchemaTestCase) -> SchemaTestResult:
        """Execute a single schema inference test case."""
        start_time = time.time()

        try:
            # Create CSV file object
            csv_file = io.StringIO(test_case.input_data.csv_content)

            # Run schema inference
            actual_schema = infer_csv_schema(csv_file, test_case.input_data.sample_rows)

            # Validate results
            passed = self._validate_schema_result(actual_schema, test_case.expected_output)

            result = SchemaTestResult(
                test_id=test_case.test_id,
                test_name=test_case.test_name,
                passed=passed,
                execution_time=time.time() - start_time,
                actual_schema=actual_schema
            )

        except Exception as e:
            result = SchemaTestResult(
                test_id=test_case.test_id,
                test_name=test_case.test_name,
                passed=False,
                execution_time=time.time() - start_time,
                actual_schema={},
                error_message=str(e)
            )

        self.schema_results.append(result)
        return result

    def run_converter_test(self, test_case: ConverterTestCase) -> ConverterTestResult:
        """Execute a single converter test case."""
        start_time = time.time()

        try:
            # Create mock collection and CSV file object
            mock_collection = MockCollection()
            csv_file = io.StringIO(test_case.input_data.csv_content)

            # Run converter function
            csv_to_mongo_with_converters(
                csv_file,
                mock_collection,
                test_case.input_data.converters,
            )

            # Validate results
            passed = self._validate_converter_result(mock_collection, test_case.expected_output)

            result = ConverterTestResult(
                test_id=test_case.test_id,
                test_name=test_case.test_name,
                passed=passed,
                execution_time=time.time() - start_time,
                actual_document_count=len(mock_collection.documents),
                actual_documents=mock_collection.documents
            )

        except Exception as e:
            result = ConverterTestResult(
                test_id=test_case.test_id,
                test_name=test_case.test_name,
                passed=False,
                execution_time=time.time() - start_time,
                actual_document_count=0,
                error_message=str(e)
            )

        self.converter_results.append(result)
        return result

    def _validate_schema_result(self, actual_schema: dict[str, type], expected_output: SchemaExpectedOutput) -> bool:
        """Validate schema inference results."""
        if not expected_output.should_succeed:
            return False

        expected_schema = expected_output.expected_schema

        # Check if all expected columns are present
        if set(actual_schema.keys()) != set(expected_schema.keys()):
            return False

        # Check if types match
        for col, expected_type in expected_schema.items():
            if actual_schema.get(col) != expected_type:
                return False

        return True

    def _validate_converter_result(self, mock_collection: MockCollection, expected_output: ConverterExpectedOutput) -> bool:
        """Validate converter results."""
        if not expected_output.should_succeed:
            return False

        # Check document count
        if len(mock_collection.documents) != expected_output.document_count:
            return False

        # Check sample documents if provided
        if expected_output.sample_documents:
            for i, expected_doc in enumerate(expected_output.sample_documents):
                if i < len(mock_collection.documents):
                    actual_doc = mock_collection.documents[i]
                    if actual_doc != expected_doc:
                        return False

        return True

    def run_all_schema_tests(self) -> dict[str, Any]:
        """Run all schema inference tests."""
        test_cases = SchemaTestCaseGenerator.generate_all_test_cases()

        print(f"\n🧪 Running {len(test_cases)} schema inference tests...")

        for test_case in test_cases:
            result = self.run_schema_test(test_case)
            status = "✅ PASS" if result.passed else "❌ FAIL"
            print(f"  {status} {result.test_name} ({result.execution_time:.3f}s)")
            if not result.passed and result.error_message:
                print(f"    Error: {result.error_message}")

        # Calculate summary
        passed = sum(1 for r in self.schema_results if r.passed)
        total = len(self.schema_results)
        success_rate = (passed / total) * 100 if total > 0 else 0
        total_time = sum(r.execution_time for r in self.schema_results)

        return {
            'total_tests': total,
            'passed_tests': passed,
            'failed_tests': total - passed,
            'success_rate': success_rate,
            'total_execution_time': total_time,
            'test_results': [r.to_dict() for r in self.schema_results]
        }

    def run_all_converter_tests(self) -> dict[str, Any]:
        """Run all converter tests."""
        test_cases = ConverterTestCaseGenerator.generate_all_test_cases()

        print(f"\n🔄 Running {len(test_cases)} converter tests...")

        for test_case in test_cases:
            result = self.run_converter_test(test_case)
            status = "✅ PASS" if result.passed else "❌ FAIL"
            print(f"  {status} {result.test_name} ({result.execution_time:.3f}s)")
            if not result.passed and result.error_message:
                print(f"    Error: {result.error_message}")

        # Calculate summary
        passed = sum(1 for r in self.converter_results if r.passed)
        total = len(self.converter_results)
        success_rate = (passed / total) * 100 if total > 0 else 0
        total_time = sum(r.execution_time for r in self.converter_results)

        return {
            'total_tests': total,
            'passed_tests': passed,
            'failed_tests': total - passed,
            'success_rate': success_rate,
            'total_execution_time': total_time,
            'test_results': [r.to_dict() for r in self.converter_results]
        }


class TestTypeDetectors:
    """Test class for CSVTypeDetectors static methods."""

    def test_is_empty_or_null(self):
        """Test empty/null detection."""
        assert CSVTypeDetectorsForDB.is_empty_or_null("")
        assert CSVTypeDetectorsForDB.is_empty_or_null("   ")
        assert CSVTypeDetectorsForDB.is_empty_or_null("\t\n")
        assert not CSVTypeDetectorsForDB.is_empty_or_null("hello")
        assert not CSVTypeDetectorsForDB.is_empty_or_null("0")

    def test_is_boolean(self):
        """Test boolean detection."""
        assert CSVTypeDetectorsForDB.is_boolean("true")
        assert CSVTypeDetectorsForDB.is_boolean("false")
        assert CSVTypeDetectorsForDB.is_boolean("1")
        assert CSVTypeDetectorsForDB.is_boolean("0")
        assert CSVTypeDetectorsForDB.is_boolean("yes")
        assert CSVTypeDetectorsForDB.is_boolean("no")
        assert not CSVTypeDetectorsForDB.is_boolean("maybe")
        assert not CSVTypeDetectorsForDB.is_boolean("123")

    def test_is_integer(self):
        """Test integer detection."""
        assert CSVTypeDetectorsForDB.is_integer("123")
        assert CSVTypeDetectorsForDB.is_integer("-456")
        assert CSVTypeDetectorsForDB.is_integer("+789")
        assert not CSVTypeDetectorsForDB.is_integer("12.3")
        assert not CSVTypeDetectorsForDB.is_integer("abc")
        assert not CSVTypeDetectorsForDB.is_integer("1e5")

    def test_is_float(self):
        """Test float detection."""
        assert CSVTypeDetectorsForDB.is_float("12.3")
        assert CSVTypeDetectorsForDB.is_float("-45.6")
        assert CSVTypeDetectorsForDB.is_float("+78.9")
        assert CSVTypeDetectorsForDB.is_float("1e5")
        assert CSVTypeDetectorsForDB.is_float("123")  # integers are valid floats
        assert not CSVTypeDetectorsForDB.is_float("abc")

    def test_is_date(self):
        """Test date detection."""
        assert CSVTypeDetectorsForDB.is_date("2023-01-15")
        assert CSVTypeDetectorsForDB.is_date("01/15/2023")
        assert CSVTypeDetectorsForDB.is_date("15/01/2023")
        assert CSVTypeDetectorsForDB.is_date("2023-01-15T10:30:00")
        assert not CSVTypeDetectorsForDB.is_date("not-a-date")
        assert not CSVTypeDetectorsForDB.is_date("123")


def test_type_detectors():
    """Run type detector tests."""
    print("\n🔍 Testing CSVTypeDetectors...")
    detector_tests = TestTypeDetectors()

    test_methods = [
        detector_tests.test_is_empty_or_null,
        detector_tests.test_is_boolean,
        detector_tests.test_is_integer,
        detector_tests.test_is_float,
        detector_tests.test_is_date
    ]

    passed = 0
    for test_method in test_methods:
        try:
            test_method()
            print(f"  ✅ PASS {test_method.__name__}")
            passed += 1
        except Exception as e:
            print(f"  ❌ FAIL {test_method.__name__}: {e}")

    print(f"CSVTypeDetectors: {passed}/{len(test_methods)} tests passed")


def main():
    """Main function for standalone execution."""
    print("🚀 CSV Functions Test Suite")
    print("=" * 50)

    # Test type detectors
    test_type_detectors()

    # Run comprehensive tests
    tester = CSVTester()

    # Run schema tests
    schema_results = tester.run_all_schema_tests()

    # Run converter tests
    converter_results = tester.run_all_converter_tests()

    # Print summary
    print(f"\n📊 Test Summary")
    print("=" * 50)
    print(f"Schema Inference Tests: {schema_results['passed_tests']}/{schema_results['total_tests']} passed ({schema_results['success_rate']:.1f}%)")
    print(f"Converter Tests: {converter_results['passed_tests']}/{converter_results['total_tests']} passed ({converter_results['success_rate']:.1f}%)")

    total_tests = schema_results['total_tests'] + converter_results['total_tests']
    total_passed = schema_results['passed_tests'] + converter_results['passed_tests']
    overall_success = (total_passed / total_tests) * 100 if total_tests > 0 else 0

    print(f"Overall: {total_passed}/{total_tests} passed ({overall_success:.1f}%)")

    # Export results to JSON
    all_results = {
        'schema_tests': schema_results,
        'converter_tests': converter_results,
        'summary': {
            'total_tests': total_tests,
            'total_passed': total_passed,
            'overall_success_rate': overall_success
        }
    }

    try:
        with open('test_new_csv_functions_results.json', 'w') as f:
            json.dump(all_results, f, indent=2, default=str)
        print(f"\n💾 Results exported to test_new_csv_functions_results.json")
    except Exception as e:
        print(f"\n⚠️  Could not export results: {e}")


# Pytest fixtures and tests
@pytest.fixture
def mock_collection():
    """Pytest fixture for MockCollection."""
    return MockCollection()


@pytest.mark.schema_inference
@pytest.mark.parametrize("test_case", SchemaTestCaseGenerator.generate_all_test_cases())
def test_schema_inference(test_case):
    """Pytest test for schema inference."""
    tester = CSVTester()
    result = tester.run_schema_test(test_case)
    assert result.passed, f"Schema test failed: {result.error_message}"


@pytest.mark.converters
@pytest.mark.parametrize("test_case", ConverterTestCaseGenerator.generate_all_test_cases())
def test_converters(test_case, mock_collection):
    """Pytest test for converters."""
    tester = CSVTester()
    result = tester.run_converter_test(test_case)
    assert result.passed, f"Converter test failed: {result.error_message}"

if __name__ == "__main__":
    main()
