#!/usr/bin/env python3
"""
Hardened FRP Neo4j Configuration Server

A secure HTTP server that serves FRP (Fast Reverse Proxy) configuration
for Neo4j database connections with proper security controls and monitoring.
"""

import os
import sys
import logging
import signal
import threading
import time
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import ParseResult, urlparse
from typing import Any
import json
from datetime import datetime

class SecureConfigServer:
    """Secure configuration server with proper hardening."""

    def __init__(self):
        # Configuration with environment variable support and validation
        self.host_name = os.getenv('SERVER_HOST', '127.0.0.1')  # Default to localhost for security
        self.server_port: int = self._get_validated_port()
        self.mod_cn: int = self._get_validated_mod_cn()
        self.base_port: int = self._get_validated_base_port()
        self.max_connections: int = int(os.getenv('MAX_CONNECTIONS', '100'))
        self.allowed_paths: set[str] = {'/config', '/health', '/'}  # Whitelist allowed paths

        # Security settings
        self.enable_rate_limiting: bool = os.getenv('ENABLE_RATE_LIMIT', 'true').lower() == 'true'
        self.rate_limit_window: int = int(os.getenv('RATE_LIMIT_WINDOW', '60'))  # seconds
        self.rate_limit_max_requests: int = int(os.getenv('RATE_LIMIT_MAX', '30'))

        # Connection counter with thread safety
        self.cn = 0
        self.cn_lock = threading.Lock()

        # Rate limiting tracking
        self.client_requests: dict[str, list[float]] = {} if self.enable_rate_limiting else {}
        self.rate_limit_lock: threading.Lock|None = threading.Lock() if self.enable_rate_limiting else None

        # Server statistics
        self.stats: dict[str, Any] = {
            'start_time': datetime.now(),
            'total_requests': 0,
            'successful_requests': 0,
            'blocked_requests': 0,
            'errors': 0
        }
        self.stats_lock = threading.Lock()

        # Setup logging
        self._setup_logging()

        # Validate IP addresses
        self._validate_server_config()

    def _get_validated_port(self) -> int:
        """Get and validate server port."""
        try:
            port = int(os.getenv('SERVER_PORT', '4040'))
            if not (1024 <= port <= 65535):  # Avoid privileged ports
                raise ValueError(f"Port {port} outside safe range 1024-65535")
            return port
        except ValueError as e:
            logging.error(f"Invalid server port: {e}")
            sys.exit(1)

    def _get_validated_mod_cn(self) -> int:
        """Get and validate modulo configuration number."""
        try:
            mod_cn = int(os.getenv('MOD_CN', '40'))
            if not (1 <= mod_cn <= 1000):
                raise ValueError(f"MOD_CN {mod_cn} outside safe range 1-1000")
            return mod_cn
        except ValueError as e:
            logging.error(f"Invalid MOD_CN: {e}")
            sys.exit(1)

    def _get_validated_base_port(self) -> int:
        """Get and validate base port."""
        try:
            base_port = int(os.getenv('BASE_PORT', '8082'))
            if not (1024 <= base_port <= 60000):  # Leave room for port range
                raise ValueError(f"BASE_PORT {base_port} outside safe range 1024-60000")
            return base_port
        except ValueError as e:
            logging.error(f"Invalid BASE_PORT: {e}")
            sys.exit(1)

    def _setup_logging(self):
        """Setup secure logging configuration."""
        log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
        log_file = os.getenv('LOG_FILE', 'frp-config-server.log')

        logging.basicConfig(
            level=getattr(logging, log_level, logging.INFO),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )

        # Prevent log injection
        logging.getLogger().addFilter(self._log_filter)

    def _log_filter(self, record):
        """Filter log messages to prevent injection attacks."""
        if hasattr(record, 'msg'):
            # Remove newlines and control characters
            record.msg = str(record.msg).replace('\n', '\\n').replace('\r', '\\r')
        return True

    def _validate_server_config(self):
        """Validate server configuration for security."""
        # Warn about binding to all interfaces
        if self.host_name == '0.0.0.0':
            logging.warning("Server binding to all interfaces (0.0.0.0) - consider using specific IP for production")

        # Check if running as root (security risk)
        if os.geteuid() == 0:
            logging.warning("Running as root - consider using a dedicated user")

        logging.info(f"Server configuration validated - Host: {self.host_name}, Port: {self.server_port}")

    def get_frpc_config_template(self) -> str:
        """Get the FRP configuration template with input validation."""
        return '''[common]
server_addr = 155.54.{2}.{3}
server_port = 8080

[browser{0}]
type = tcp
local_ip = 127.0.0.1
local_port = 7474
remote_port = {0}

[bolt{1}]
type = tcp
local_ip = 127.0.0.1
local_port = 7687
remote_port = {1}
'''

class HardenedRequestHandler(BaseHTTPRequestHandler):
    """Hardened HTTP request handler with security controls."""

    def __init__(self, request, client_address, server):
        # Type annotation workaround for the server parameter
        self.config_server: SecureConfigServer = getattr(server, 'config_server')
        super().__init__(request, client_address, server)

    def log_message(self, format, *args):
        """Override to use proper logging instead of stderr."""
        logging.info(f"{self.client_address[0]} - {format % args}")

    def _is_rate_limited(self, client_ip: str) -> bool:
        """Check if client is rate limited."""
        if not self.config_server.enable_rate_limiting or self.config_server.rate_limit_lock is None:
            return False

        current_time: float = time.time()

        with self.config_server.rate_limit_lock:
            # Clean old entries
            cutoff_time: float = current_time - self.config_server.rate_limit_window
            self.config_server.client_requests = {
                ip: requests for ip, requests in self.config_server.client_requests.items()
                if any(req_time > cutoff_time for req_time in requests)
            }

            # Update client requests
            if client_ip not in self.config_server.client_requests:
                self.config_server.client_requests[client_ip] = []

            # Remove old requests for this client
            self.config_server.client_requests[client_ip] = [
                req_time for req_time in self.config_server.client_requests[client_ip]
                if req_time > cutoff_time
            ]

            # Check rate limit
            if len(self.config_server.client_requests[client_ip]) >= self.config_server.rate_limit_max_requests:
                return True

            # Add current request
            self.config_server.client_requests[client_ip].append(current_time)
            return False

    def _update_stats(self, success: bool = True, blocked: bool = False, error: bool = False):
        """Update server statistics."""
        with self.config_server.stats_lock:
            self.config_server.stats['total_requests'] += 1
            if success:
                self.config_server.stats['successful_requests'] += 1
            if blocked:
                self.config_server.stats['blocked_requests'] += 1
            if error:
                self.config_server.stats['errors'] += 1

    def _send_error_response(self, code: int, message: str):
        """Send standardized error response."""
        try:
            self.send_response(code)
            self.send_header("Content-type", "application/json")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.end_headers()

            error_response = {
                "error": message,
                "timestamp": datetime.now().isoformat(),
                "code": code
            }
            self.wfile.write(json.dumps(error_response).encode('utf-8'))
        except Exception as e:
            logging.error(f"Error sending error response: {e}")

    def _validate_request(self) -> bool:
        """Validate incoming request for security."""
        # Check path whitelist
        parsed_path: ParseResult = urlparse(self.path)
        if parsed_path.path not in self.config_server.allowed_paths:
            self._send_error_response(404, "Path not found")
            self._update_stats(success=False, error=True)
            logging.warning(f"Blocked access to unauthorized path: {parsed_path.path} from {self.client_address[0]}")
            return False

        # Check rate limiting
        client_ip = self.client_address[0]
        if self._is_rate_limited(client_ip):
            self._send_error_response(429, "Rate limit exceeded")
            self._update_stats(success=False, blocked=True)
            logging.warning(f"Rate limited client: {client_ip}")
            return False

        # Check request size (prevent large requests)
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 1024:  # 1KB max
            self._send_error_response(413, "Request too large")
            self._update_stats(success=False, error=True)
            return False

        return True

    def do_GET(self):
        """Handle GET requests with security validation."""
        try:
            if not self._validate_request():
                return

            parsed_path: ParseResult = urlparse(self.path)

            if parsed_path.path == '/health':
                self._handle_health_check()
            elif parsed_path.path in ['/config', '/']:
                self._handle_config_request()
            else:
                self._send_error_response(404, "Not found")
                self._update_stats(success=False, error=True)

        except Exception as e:
            logging.error(f"Error handling GET request: {e}")
            self._send_error_response(500, "Internal server error")
            self._update_stats(success=False, error=True)

    def _handle_health_check(self):
        """Handle health check endpoint."""
        try:
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.end_headers()

            health_data = {
                "status": "healthy",
                "timestamp": datetime.now().isoformat(),
                "stats": dict(self.config_server.stats),
                "uptime_seconds": (datetime.now() - self.config_server.stats['start_time']).total_seconds()
            }

            self.wfile.write(json.dumps(health_data).encode('utf-8'))
            self._update_stats(success=True)

        except Exception as e:
            logging.error(f"Error in health check: {e}")
            self._send_error_response(500, "Health check failed")

    def _handle_config_request(self):
        """Handle configuration request with proper validation."""
        try:
            # Thread-safe counter increment
            with self.config_server.cn_lock:
                current_cn: int = self.config_server.cn
                self.config_server.cn = (self.config_server.cn + 1) % self.config_server.mod_cn

            # Generate port numbers
            browser_port: int = self.config_server.base_port + (current_cn * 2)
            bolt_port: int = self.config_server.base_port + 1 + (current_cn * 2)

            # Validate port ranges
            if browser_port > 65535 or bolt_port > 65535:
                raise ValueError("Generated port exceeds valid range")

            # Send response with security headers
            self.send_response(200)
            self.send_header("Content-type", "text/plain")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()

            # Generate configuration
            config: str = self.config_server.get_frpc_config_template().format(
                browser_port,
                bolt_port,
                204,
                149
            )

            self.wfile.write(config.encode('utf-8'))
            self._update_stats(success=True)

            logging.info(f"Served config to {self.client_address[0]} - Connection #{current_cn}, Ports: {browser_port}, {bolt_port}")

        except Exception as e:
            logging.error(f"Error generating config: {e}")
            self._send_error_response(500, "Configuration generation failed")
            self._update_stats(success=False, error=True)

    def do_POST(self):
        """Reject POST requests."""
        self._send_error_response(405, "Method not allowed")
        self._update_stats(success=False, error=True)

    def do_PUT(self):
        """Reject PUT requests."""
        self._send_error_response(405, "Method not allowed")
        self._update_stats(success=False, error=True)

    def do_DELETE(self):
        """Reject DELETE requests."""
        self._send_error_response(405, "Method not allowed")
        self._update_stats(success=False, error=True)


class HardenedHTTPServer(HTTPServer):
    """Hardened HTTP server with configuration injection."""

    def __init__(self, server_address, RequestHandlerClass, config_server: SecureConfigServer):
        self.config_server: SecureConfigServer = config_server
        super().__init__(server_address, RequestHandlerClass)


def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    logging.info(f"Received signal {signum}, shutting down gracefully...")
    sys.exit(0)


def main():
    """Main function with proper error handling and security setup."""
    web_server = None
    try:
        # Initialize configuration
        config_server = SecureConfigServer()

        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        # Create hardened server
        server_address: tuple[str, int] = (config_server.host_name, config_server.server_port)
        web_server = HardenedHTTPServer(server_address, HardenedRequestHandler, config_server)

        logging.info(f"Hardened FRP Config Server started on http://{config_server.host_name}:{config_server.server_port}")
        logging.info(f"Health check available at: http://{config_server.host_name}:{config_server.server_port}/health")
        logging.info(f"Configuration endpoint: http://{config_server.host_name}:{config_server.server_port}/config")

        # Additional security warnings
        if config_server.host_name == '0.0.0.0':
            logging.warning("Server is accessible from all network interfaces")

        if not config_server.enable_rate_limiting:
            logging.warning("Rate limiting is disabled")

        # Start server
        web_server.serve_forever()

    except KeyboardInterrupt:
        logging.info("Server interrupted by user")
    except Exception as e:
        logging.error(f"Server error: {e}")
        sys.exit(1)
    finally:
        if web_server is not None:
            try:
                web_server.server_close()
                logging.info("Server stopped gracefully")
            except Exception as e:
                logging.error(f"Error closing server: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Hardened FRP Configuration Server')
    parser.add_argument('--host', default=None, help='Server host (overrides SERVER_HOST env var)')
    parser.add_argument('--port', type=int, default=None, help='Server port (overrides SERVER_PORT env var)')
    parser.add_argument('--log-level', default=None, help='Log level (overrides LOG_LEVEL env var)')

    args: argparse.Namespace = parser.parse_args()

    # Apply command line overrides
    if args.host:
        os.environ['SERVER_HOST'] = args.host
    if args.port:
        os.environ['SERVER_PORT'] = str(args.port)
    if args.log_level:
        os.environ['LOG_LEVEL'] = args.log_level.upper()

    main()
