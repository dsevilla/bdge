"""
Pytest configuration and shared fixtures for csv_to_mongo test suite.

This module provides shared fixtures and configuration for the pytest test suite.
"""

import pytest
from test_csv_to_mongo import MockCollection, TestCaseGenerator


@pytest.fixture(scope="function")
def fresh_mock_collection():
    """Provide a fresh MockCollection instance for each test function."""
    return MockCollection()


@pytest.fixture(scope="session")
def all_test_cases():
    """Provide all test cases for the session (cached)."""
    return TestCaseGenerator.generate_all_test_cases()


@pytest.fixture(scope="function")
def csv_sample_basic():
    """Provide a basic CSV sample for simple tests."""
    return """name,age,salary
John Doe,30,50000.50
Jane Smith,25,45000"""


@pytest.fixture(scope="function")
def csv_sample_empty():
    """Provide an empty CSV (headers only) for edge case tests."""
    return "name,age,email"


@pytest.fixture(scope="function")
def csv_sample_unicode():
    """Provide a CSV with Unicode characters for encoding tests."""
    return '''name,description
"Café Latté","Coffee with milk"
"naïve résumé","Unicode test"'''


@pytest.fixture(scope="function")
def csv_sample_dates():
    """Provide a CSV with various date formats."""
    return """event,date
Meeting,2023-01-15
Conference,01/15/2023
Workshop,2024-06-01T10:30:00"""


def pytest_configure(config):
    """Configure pytest with custom settings."""
    # Register custom markers
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )
    config.addinivalue_line(
        "markers", "unit: mark test as unit test"
    )


def pytest_collection_modifyitems(config, items):
    """Modify collected test items."""
    # Add markers based on test names
    for item in items:
        if "parametrized" in item.name:
            item.add_marker(pytest.mark.comprehensive)
        if "edge" in item.name.lower() or "empty" in item.name.lower():
            item.add_marker(pytest.mark.edge_cases)
        if "unicode" in item.name.lower() or "special" in item.name.lower():
            item.add_marker(pytest.mark.unicode)
        if "batch" in item.name.lower() or "performance" in item.name.lower():
            item.add_marker(pytest.mark.performance)


# Pytest plugin hooks for better reporting
def pytest_report_header(config):
    """Add custom header to pytest report."""
    return [
        "CSV to Mongo Test Suite",
        "Testing csv_to_mongo.py functionality",
        "=" * 50
    ]


def pytest_terminal_summary(terminalreporter, exitstatus, config):
    """Add custom summary to pytest terminal output."""
    if hasattr(terminalreporter, 'stats'):
        passed = len(terminalreporter.stats.get('passed', []))
        failed = len(terminalreporter.stats.get('failed', []))
        total = passed + failed

        if total > 0:
            success_rate = (passed / total) * 100
            terminalreporter.write_sep("=", "CSV to Mongo Test Summary")
            terminalreporter.write_line(f"Success Rate: {success_rate:.1f}% ({passed}/{total})")

            if failed == 0:
                terminalreporter.write_line("🎉 All tests passed!", green=True)
            else:
                terminalreporter.write_line(f"⚠️  {failed} test(s) failed", red=True)
