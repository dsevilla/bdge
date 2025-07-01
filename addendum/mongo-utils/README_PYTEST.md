# CSV to Mongo Test Suite - Pytest Usage

This test suite is now fully compatible with pytest, providing both standalone execution and professional testing framework integration.

## Installation

First, install the testing dependencies:

```bash
pip install -r requirements-test.txt
```

Or just the essential pytest package:

```bash
pip install pytest
```

## Running Tests with Pytest

### Basic Usage

```bash
# Run all tests
pytest test_csv_to_mongo.py

# Run with verbose output
pytest test_csv_to_mongo.py -v

# Run with extra verbose output (shows individual test cases)
pytest test_csv_to_mongo.py -vv
```

### Selective Test Execution

```bash
# Run tests by keyword
pytest test_csv_to_mongo.py -k "basic"
pytest test_csv_to_mongo.py -k "date"
pytest test_csv_to_mongo.py -k "edge_cases"

# Run tests by markers
pytest test_csv_to_mongo.py -m basic
pytest test_csv_to_mongo.py -m "not slow"
pytest test_csv_to_mongo.py -m "unicode or dates"

# Run specific test function
pytest test_csv_to_mongo.py::test_basic_csv_processing
pytest test_csv_to_mongo.py::test_empty_csv_processing
```

### Available Test Markers

- `basic`: Basic functionality tests
- `comprehensive`: Comprehensive parametrized tests (all 10 test cases)
- `edge_cases`: Edge case and boundary condition tests
- `performance`: Performance and batch processing tests
- `unicode`: Unicode and special character handling tests
- `numeric`: Numeric data type and format tests
- `dates`: Date parsing and format tests

### Advanced Options

```bash
# Parallel execution (requires pytest-xdist)
pytest test_csv_to_mongo.py -n auto

# Stop on first failure
pytest test_csv_to_mongo.py -x

# Run failed tests from last run
pytest test_csv_to_mongo.py --lf

# Generate coverage report (requires pytest-cov)
pytest test_csv_to_mongo.py --cov=csv_to_mongo --cov-report=html

# Generate HTML report (requires pytest-html)
pytest test_csv_to_mongo.py --html=report.html --self-contained-html

# Set timeout for long-running tests (requires pytest-timeout)
pytest test_csv_to_mongo.py --timeout=30
```

## Test Structure

The test suite includes:

1. **Parametrized Tests**: `test_csv_to_mongo_parametrized` runs all 10 comprehensive test cases
2. **Individual Tests**: Specific tests for common scenarios:
   - `test_basic_csv_processing`: Basic CSV functionality
   - `test_empty_csv_processing`: Empty CSV handling
   - `test_batch_processing`: Batch processing with custom size
   - `test_special_characters`: Unicode and special character handling
   - `test_numeric_edge_cases`: Various numeric formats
   - `test_date_formats`: Date parsing and formats

## Fixtures

The test suite provides several pytest fixtures:

- `mock_collection`: Fresh MockCollection for each test
- `test_case`: Parametrized fixture providing each test case
- `csv_tester`: CSVToMongoTester instance
- `fresh_mock_collection`: Alternative fresh collection fixture
- `csv_sample_*`: Various CSV samples for testing

## Integration with CI/CD

Example pytest commands for CI/CD pipelines:

```bash
# Basic CI run
pytest test_csv_to_mongo.py --tb=short --strict-markers

# Full CI run with coverage and reports
pytest test_csv_to_mongo.py \
  --cov=csv_to_mongo \
  --cov-report=xml \
  --cov-report=term-missing \
  --html=test-report.html \
  --junitxml=test-results.xml \
  --strict-markers \
  --tb=short

# Quick smoke test (basic tests only)
pytest test_csv_to_mongo.py -m basic --tb=line
```

## Standalone Usage (Original Interface)

The original standalone interface is still available:

```bash
# Run demonstration
python test_csv_to_mongo.py --demo

# Run all tests (original test runner)
python test_csv_to_mongo.py --run-all

# Run specific test case
python test_csv_to_mongo.py --test-id TC001

# Save results to JSON
python test_csv_to_mongo.py --run-all --save-json results.json
```

## Configuration Files

- `pytest.ini`: Pytest configuration with markers and options
- `conftest.py`: Shared fixtures and pytest hooks
- `requirements-test.txt`: Testing dependencies

This dual-mode design allows for both professional pytest integration and simple standalone execution.
