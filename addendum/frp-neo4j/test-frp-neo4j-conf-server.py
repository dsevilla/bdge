#!/usr/bin/env python3
"""
Mock Testing Framework for FRP Neo4j Configuration Server

A comprehensive testing framework that allows creating a server without actually
serving requests and simulating sequences of requests to validate behavior.
"""

from importlib.machinery import ModuleSpec
import os
import logging
import time
import io
import json
from datetime import datetime
from urllib.parse import urlparse
from typing import Any, Optional

# Import the server components
try:
    # Try direct import first
    import serve_frp_neo4j_conf as serve_module
    SecureConfigServer = serve_module.SecureConfigServer
except ImportError:
    # Handle hyphenated filename
    import importlib.util
    spec: ModuleSpec | None = importlib.util.spec_from_file_location(
        "serve_frp_neo4j_conf",
        "serve-frp-neo4j-conf.py"
    )
    if spec and spec.loader:
        serve_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(serve_module)
        SecureConfigServer = serve_module.SecureConfigServer
    else:
        raise ImportError("Could not import server module")


class MockSocket:
    """Mock socket for testing HTTP requests."""

    def __init__(self, request_data: str):
        self.request_data = request_data.encode('utf-8')
        self.response_data = io.BytesIO()
        self.closed = False

    def recv(self, size: int) -> bytes:
        """Mock receiving data."""
        if len(self.request_data) == 0:
            return b''
        data = self.request_data[:size]
        self.request_data = self.request_data[size:]
        return data

    def sendall(self, data: bytes):
        """Mock sending data."""
        self.response_data.write(data)

    def close(self):
        """Mock closing socket."""
        self.closed = True

    def getpeername(self) -> tuple[str, int]:
        """Mock peer address."""
        return ('127.0.0.1', 12345)


class MockRequest:
    """Mock HTTP request for testing."""

    def __init__(self, method: str, path: str, headers: Optional[dict[str, str]] = None,
                 body: str = "", client_ip: str = "127.0.0.1"):
        self.method = method.upper()
        self.path = path
        self.headers = headers or {}
        self.body = body
        self.client_ip = client_ip

        # Build HTTP request string
        self.request_string = self._build_request_string()

    def _build_request_string(self) -> str:
        """Build complete HTTP request string."""
        lines = [f"{self.method} {self.path} HTTP/1.1"]

        # Add default headers
        if 'Host' not in self.headers:
            self.headers['Host'] = 'localhost:4040'

        if self.body and 'Content-Length' not in self.headers:
            self.headers['Content-Length'] = str(len(self.body))

        # Add all headers
        for header, value in self.headers.items():
            lines.append(f"{header}: {value}")

        lines.append("")  # Empty line before body
        if self.body:
            lines.append(self.body)

        return "\r\n".join(lines) + "\r\n"


class MockResponse:
    """Represents a mock HTTP response."""

    def __init__(self, raw_response: bytes):
        self.raw_response = raw_response.decode('utf-8', errors='ignore')
        self.status_code = self._parse_status_code()
        self.headers = self._parse_headers()
        self.body = self._parse_body()

    def _parse_status_code(self) -> int:
        """Parse HTTP status code from response."""
        try:
            first_line = self.raw_response.split('\r\n')[0]
            return int(first_line.split()[1])
        except (IndexError, ValueError):
            return 0

    def _parse_headers(self) -> dict[str, str]:
        """Parse headers from response."""
        headers = {}
        lines = self.raw_response.split('\r\n')

        for line in lines[1:]:
            if line == "":  # End of headers
                break
            if ": " in line:
                key, value = line.split(": ", 1)
                headers[key] = value

        return headers

    def _parse_body(self) -> str:
        """Parse body from response."""
        try:
            header_end = self.raw_response.find('\r\n\r\n')
            if header_end != -1:
                return self.raw_response[header_end + 4:]
            return ""
        except Exception:
            return ""


class ServerMockTester:
    """Mock tester for the FRP configuration server."""

    def __init__(self, config_overrides: Optional[dict[str, str]] = None):
        """Initialize mock tester with optional configuration overrides."""
        # Set environment variables for testing
        self.original_env = dict(os.environ)

        # Default test configuration
        test_config = {
            'SERVER_HOST': '127.0.0.1',
            'SERVER_PORT': '4040',
            'MOD_CN': '5',  # Small number for easier testing
            'BASE_PORT': '8100',
            'MAX_CONNECTIONS': '10',
            'ENABLE_RATE_LIMIT': 'true',
            'RATE_LIMIT_WINDOW': '60',
            'RATE_LIMIT_MAX': '5',  # Low for testing
            'LOG_LEVEL': 'DEBUG'
        }

        if config_overrides:
            test_config.update(config_overrides)

        # Apply test configuration
        os.environ.update(test_config)

        # Initialize server configuration
        self.config_server = SecureConfigServer()

        # Track test results
        self.test_results: list[dict[str, Any]] = []

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - restore environment."""
        os.environ.clear()
        os.environ.update(self.original_env)

    def simulate_request(self, request: MockRequest) -> MockResponse:
        """Simulate a single HTTP request."""
        try:
            # Create a mock response directly by calling handler methods
            # This avoids the complex socket mocking

            # Create a simple mock handler that we can call directly
            class MockHandler:
                def __init__(self, config_server, client_ip):
                    self.config_server = config_server
                    self.client_address = (client_ip, 12345)
                    self.path = request.path
                    self.method = request.method
                    self.headers = request.headers
                    self.response_data = []
                    self.response_code = 200
                    self.response_headers = {}

                def send_response(self, code):
                    self.response_code = code

                def send_header(self, key, value):
                    self.response_headers[key] = value

                def end_headers(self):
                    pass

                def wfile_write(self, data):
                    if isinstance(data, str):
                        data = data.encode('utf-8')
                    self.response_data.append(data)

                def get_response_string(self):
                    # Build HTTP response
                    lines = [f"HTTP/1.1 {self.response_code} OK"]
                    for key, value in self.response_headers.items():
                        lines.append(f"{key}: {value}")
                    lines.append("")  # Empty line

                    response = "\r\n".join(lines).encode('utf-8')
                    for data in self.response_data:
                        response += data

                    return response

            # Create mock handler
            mock_handler = MockHandler(self.config_server, request.client_ip)

            # Simulate the request processing
            if request.method == 'GET':
                self._simulate_get_request(mock_handler, request)
            else:
                mock_handler.send_response(405)
                mock_handler.send_header("Content-type", "application/json")
                mock_handler.end_headers()
                mock_handler.wfile_write('{"error": "Method not allowed"}')

            # Get response
            response_data = mock_handler.get_response_string()
            response = MockResponse(response_data)

            # Record test result
            test_result = {
                'request': {
                    'method': request.method,
                    'path': request.path,
                    'client_ip': request.client_ip,
                    'headers': request.headers
                },
                'response': {
                    'status_code': response.status_code,
                    'headers': response.headers,
                    'body_length': len(response.body)
                },
                'timestamp': datetime.now().isoformat()
            }
            self.test_results.append(test_result)

            return response

        except Exception as e:
            logging.error(f"Error simulating request: {e}")
            # Return error response
            error_response = MockResponse(b'HTTP/1.1 500 Internal Server Error\r\n\r\n')
            return error_response

    def _simulate_get_request(self, mock_handler, request: MockRequest):
        """Simulate GET request processing."""
        # Validate request (simplified version)
        parsed_path = urlparse(request.path)

        # Check path whitelist
        if parsed_path.path not in self.config_server.allowed_paths:
            mock_handler.send_response(404)
            mock_handler.send_header("Content-type", "application/json")
            mock_handler.end_headers()
            mock_handler.wfile_write('{"error": "Path not found"}')
            self._update_stats_direct(success=False, error=True)
            return

        # Check rate limiting
        if self._is_rate_limited_direct(request.client_ip):
            mock_handler.send_response(429)
            mock_handler.send_header("Content-type", "application/json")
            mock_handler.end_headers()
            mock_handler.wfile_write('{"error": "Rate limit exceeded"}')
            self._update_stats_direct(success=False, blocked=True)
            return

        # Handle specific paths
        if parsed_path.path == '/health':
            self._simulate_health_check(mock_handler)
        elif parsed_path.path in ['/config', '/']:
            self._simulate_config_request(mock_handler)
        else:
            mock_handler.send_response(404)
            mock_handler.send_header("Content-type", "application/json")
            mock_handler.end_headers()
            mock_handler.wfile_write('{"error": "Not found"}')
            self._update_stats_direct(success=False, error=True)

    def _simulate_health_check(self, mock_handler):
        """Simulate health check response."""
        mock_handler.send_response(200)
        mock_handler.send_header("Content-type", "application/json")
        mock_handler.end_headers()

        health_data = {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "stats": dict(self.config_server.stats),
            "uptime_seconds": (datetime.now() - self.config_server.stats['start_time']).total_seconds()
        }

        mock_handler.wfile_write(json.dumps(health_data))
        self._update_stats_direct(success=True)

    def _simulate_config_request(self, mock_handler):
        """Simulate config request response."""
        try:
            # Thread-safe counter increment
            with self.config_server.cn_lock:
                current_cn = self.config_server.cn
                self.config_server.cn = (self.config_server.cn + 1) % self.config_server.mod_cn

            # Generate port numbers
            browser_port = self.config_server.base_port + (current_cn * 2)
            bolt_port = self.config_server.base_port + 1 + (current_cn * 2)

            mock_handler.send_response(200)
            mock_handler.send_header("Content-type", "text/plain")
            mock_handler.end_headers()

            config = self.config_server.get_frpc_config_template().format(
                browser_port, bolt_port, 204, 149
            )

            mock_handler.wfile_write(config)
            self._update_stats_direct(success=True)

        except Exception as e:
            logging.error(f"Error generating config: {e}")
            mock_handler.send_response(500)
            mock_handler.send_header("Content-type", "application/json")
            mock_handler.end_headers()
            mock_handler.wfile_write('{"error": "Configuration generation failed"}')
            self._update_stats_direct(success=False, error=True)

    def _is_rate_limited_direct(self, client_ip: str) -> bool:
        """Direct rate limiting check for testing."""
        if not self.config_server.enable_rate_limiting or not self.config_server.rate_limit_lock:
            return False

        current_time = time.time()

        with self.config_server.rate_limit_lock:
            cutoff_time = current_time - self.config_server.rate_limit_window

            if client_ip not in self.config_server.client_requests:
                self.config_server.client_requests[client_ip] = []

            # Remove old requests
            self.config_server.client_requests[client_ip] = [
                req_time for req_time in self.config_server.client_requests[client_ip]
                if req_time > cutoff_time
            ]

            # Check limit
            if len(self.config_server.client_requests[client_ip]) >= self.config_server.rate_limit_max_requests:
                return True

            # Add current request
            self.config_server.client_requests[client_ip].append(current_time)
            return False

    def _update_stats_direct(self, success: bool = True, blocked: bool = False, error: bool = False):
        """Direct stats update for testing."""
        with self.config_server.stats_lock:
            self.config_server.stats['total_requests'] += 1
            if success:
                self.config_server.stats['successful_requests'] += 1
            if blocked:
                self.config_server.stats['blocked_requests'] += 1
            if error:
                self.config_server.stats['errors'] += 1

    def simulate_request_sequence(self, requests: list[MockRequest]) -> list[MockResponse]:
        """Simulate a sequence of HTTP requests."""
        responses = []

        logging.info(f"Starting simulation of {len(requests)} requests")

        for i, request in enumerate(requests):
            logging.debug(f"Simulating request {i+1}/{len(requests)}: {request.method} {request.path}")
            response = self.simulate_request(request)
            responses.append(response)

            # Small delay to simulate real timing
            time.sleep(0.01)

        logging.info(f"Completed simulation of {len(requests)} requests")
        return responses

    def get_server_stats(self) -> dict[str, Any]:
        """Get current server statistics."""
        with self.config_server.stats_lock:
            return dict(self.config_server.stats)

    def get_rate_limit_status(self, client_ip: str) -> dict[str, Any]:
        """Get rate limiting status for a client."""
        if not self.config_server.enable_rate_limiting or not self.config_server.rate_limit_lock:
            return {'rate_limiting_enabled': False}

        with self.config_server.rate_limit_lock:
            current_time = time.time()
            cutoff_time = current_time - self.config_server.rate_limit_window

            client_requests = self.config_server.client_requests.get(client_ip, [])
            recent_requests = [req for req in client_requests if req > cutoff_time]

            return {
                'rate_limiting_enabled': True,
                'client_ip': client_ip,
                'recent_requests': len(recent_requests),
                'max_requests': self.config_server.rate_limit_max_requests,
                'window_seconds': self.config_server.rate_limit_window,
                'is_rate_limited': len(recent_requests) >= self.config_server.rate_limit_max_requests
            }

    def print_test_summary(self):
        """Print a summary of test results."""
        if not self.test_results:
            print("No test results to display")
            return

        print("\n" + "="*60)
        print("TEST SIMULATION SUMMARY")
        print("="*60)

        # Overall statistics
        total_requests = len(self.test_results)
        status_codes = {}

        for result in self.test_results:
            status = result['response']['status_code']
            status_codes[status] = status_codes.get(status, 0) + 1

        print(f"Total Requests: {total_requests}")
        print("Status Code Distribution:")
        for status, count in sorted(status_codes.items()):
            print(f"  {status}: {count} requests")

        # Server statistics
        server_stats = self.get_server_stats()
        print("\nServer Statistics:")
        for key, value in server_stats.items():
            if key != 'start_time':
                print(f"  {key}: {value}")

        print("\n" + "="*60)


# ==================== TEST SCENARIOS ====================

def create_test_scenarios() -> list[tuple[str, list[MockRequest]]]:
    """Create various test scenarios for comprehensive testing."""

    scenarios = []

    # Scenario 1: Basic functionality test
    basic_requests = [
        MockRequest('GET', '/health'),
        MockRequest('GET', '/config'),
        MockRequest('GET', '/config'),
        MockRequest('GET', '/'),
        MockRequest('GET', '/health'),
    ]
    scenarios.append(('Basic Functionality', basic_requests))

    # Scenario 2: Rate limiting test
    rate_limit_requests = [
        MockRequest('GET', '/config', client_ip='192.168.1.100') for _ in range(10)
    ]
    scenarios.append(('Rate Limiting', rate_limit_requests))

    # Scenario 3: Security test (unauthorized paths)
    security_requests = [
        MockRequest('GET', '/admin'),
        MockRequest('GET', '/config'),
        MockRequest('GET', '/../../etc/passwd'),
        MockRequest('GET', '/config'),
        MockRequest('POST', '/config'),
        MockRequest('PUT', '/config'),
        MockRequest('DELETE', '/config'),
    ]
    scenarios.append(('Security Tests', security_requests))

    # Scenario 4: Mixed client test
    mixed_requests = [
        MockRequest('GET', '/config', client_ip='192.168.1.1'),
        MockRequest('GET', '/config', client_ip='192.168.1.2'),
        MockRequest('GET', '/config', client_ip='192.168.1.1'),
        MockRequest('GET', '/health', client_ip='192.168.1.3'),
        MockRequest('GET', '/config', client_ip='192.168.1.2'),
    ]
    scenarios.append(('Mixed Clients', mixed_requests))

    # Scenario 5: Large request test
    large_request = MockRequest(
        'GET',
        '/config',
        headers={'Content-Length': '2048'},
        body='x' * 2048
    )
    large_requests = [large_request]
    scenarios.append(('Large Request', large_requests))

    return scenarios


def run_comprehensive_tests():
    """Run comprehensive mock tests."""
    print("Starting Comprehensive Mock Tests")
    print("="*50)

    # Test different configurations
    test_configs = [
        {'ENABLE_RATE_LIMIT': 'true', 'RATE_LIMIT_MAX': '3'},
        {'ENABLE_RATE_LIMIT': 'false'},
        {'MOD_CN': '2', 'BASE_PORT': '9000'},
    ]

    for i, config in enumerate(test_configs):
        print(f"\nTest Configuration {i+1}: {config}")
        print("-" * 40)

        with ServerMockTester(config) as tester:
            scenarios = create_test_scenarios()

            for scenario_name, requests in scenarios:
                print(f"\nRunning scenario: {scenario_name}")
                responses = tester.simulate_request_sequence(requests)

                # Quick summary for this scenario
                success_count = sum(1 for r in responses if 200 <= r.status_code < 300)
                print(f"  Results: {success_count}/{len(responses)} successful")

            # Print comprehensive summary
            tester.print_test_summary()


def demo_mock_testing():
    """Demonstrate mock testing capabilities with examples."""
    print("FRP Configuration Server - Mock Testing Demo")
    print("="*50)

    # Example 1: Basic server testing
    print("\n1. Basic Server Testing")
    print("-" * 30)

    with ServerMockTester() as tester:
        # Test basic endpoints
        requests = [
            MockRequest('GET', '/health'),
            MockRequest('GET', '/config'),
            MockRequest('GET', '/config'),
        ]

        responses = tester.simulate_request_sequence(requests)

        for i, (req, resp) in enumerate(zip(requests, responses)):
            print(f"Request {i+1}: {req.method} {req.path} -> Status: {resp.status_code}")

        print(f"Server Stats: {tester.get_server_stats()}")

    # Example 2: Rate limiting testing
    print("\n2. Rate Limiting Testing")
    print("-" * 30)

    config = {'RATE_LIMIT_MAX': '3', 'RATE_LIMIT_WINDOW': '60'}
    with ServerMockTester(config) as tester:
        client_ip = '192.168.1.100'

        # Make requests until rate limited
        for i in range(5):
            request = MockRequest('GET', '/config', client_ip=client_ip)
            response = tester.simulate_request(request)

            rate_status = tester.get_rate_limit_status(client_ip)
            print(f"Request {i+1}: Status {response.status_code}, "
                  f"Rate Limited: {rate_status['is_rate_limited']}")

    # Example 3: Security testing
    print("\n3. Security Testing")
    print("-" * 30)

    with ServerMockTester() as tester:
        security_requests = [
            MockRequest('GET', '/admin'),  # Should be blocked
            MockRequest('POST', '/config'),  # Should be blocked
            MockRequest('GET', '/config'),  # Should work
            MockRequest('GET', '/../../etc/passwd'),  # Should be blocked
        ]

        for req in security_requests:
            resp = tester.simulate_request(req)
            status = "BLOCKED" if resp.status_code >= 400 else "ALLOWED"
            print(f"{req.method} {req.path} -> {resp.status_code} ({status})")


def run_custom_scenario():
    """Run a custom test scenario."""
    print("Custom Test Scenario")
    print("="*30)

    # Example: Test port allocation sequence
    with ServerMockTester({'MOD_CN': '3', 'BASE_PORT': '8000'}) as tester:
        print("Testing port allocation sequence...")

        responses = []
        for i in range(5):  # More than MOD_CN to test wraparound
            request = MockRequest('GET', '/config', client_ip=f'192.168.1.{i+1}')
            response = tester.simulate_request(request)
            responses.append(response)

            if response.status_code == 200:
                # Extract port numbers from config
                config_lines = response.body.split('\n')
                for line in config_lines:
                    if 'remote_port' in line:
                        port = line.split('=')[1].strip()
                        print(f"Client {i+1}: Assigned port {port}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='FRP Configuration Server Mock Tester')
    parser.add_argument('--demo', action='store_true', help='Run demo mock tests')
    parser.add_argument('--comprehensive', action='store_true', help='Run comprehensive tests')
    parser.add_argument('--custom', action='store_true', help='Run custom scenario')
    parser.add_argument('--all', action='store_true', help='Run all test types')

    args = parser.parse_args()

    if args.all:
        demo_mock_testing()
        run_comprehensive_tests()
        run_custom_scenario()
    elif args.demo:
        demo_mock_testing()
    elif args.comprehensive:
        run_comprehensive_tests()
    elif args.custom:
        run_custom_scenario()
    else:
        print("FRP Configuration Server Mock Testing Framework")
        print("Available options:")
        print("  --demo          Run demonstration tests")
        print("  --comprehensive Run comprehensive test suite")
        print("  --custom        Run custom test scenario")
        print("  --all           Run all test types")
        print("\nExample usage:")
        print("  python test-frp-neo4j-conf-server.py --demo")
        demo_mock_testing()
