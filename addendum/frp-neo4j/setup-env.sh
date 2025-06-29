#! /bin/sh
# FRP Neo4j Configuration Server - Environment Setup Script

# Basic server configuration
export SERVER_HOST="127.0.0.1"        # Bind to localhost for security
export SERVER_PORT="4040"             # Server port
export BASE_PORT="8082"               # Base port for Neo4j connections
export MOD_CN="40"                    # Number of connection slots

# Security settings
export ENABLE_RATE_LIMIT="true"       # Enable rate limiting
export RATE_LIMIT_WINDOW="60"         # Rate limit window in seconds
export RATE_LIMIT_MAX="30"            # Max requests per window
export MAX_CONNECTIONS="100"          # Maximum concurrent connections

# Logging configuration
export LOG_LEVEL="INFO"               # Log level (DEBUG, INFO, WARNING, ERROR)
export LOG_FILE="frp-config-server.log" # Log file path

# Production settings (uncomment for production)
# export SERVER_HOST="0.0.0.0"        # Bind to all interfaces (use with caution)
# export LOG_LEVEL="WARNING"           # Reduce log verbosity in production
# export RATE_LIMIT_MAX="60"           # Higher rate limit for production

echo "Environment configured for FRP Neo4j Configuration Server"
echo "Host: $SERVER_HOST:$SERVER_PORT"
echo "Rate limiting: $ENABLE_RATE_LIMIT ($RATE_LIMIT_MAX requests per ${RATE_LIMIT_WINDOW}s)"
echo "Log level: $LOG_LEVEL"
echo ""
echo "To start the server, run:"
echo "python3 serve-frp-neo4j-conf.py"
