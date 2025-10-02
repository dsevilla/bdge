#! /bin/sh

set -e

# Get directory residing the script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Execute the script with BASE_DIR if provided
sh ${SCRIPT_DIR}/setup-mysql-data.sh ${BASE_DIR}

# Keep waiting so that the container does not end
exec tail -f /dev/null
