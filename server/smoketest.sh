#!/bin/bash
# Smoketest for Whereish Go server and CLI
# Usage: ./smoketest.sh
#
# This script:
# 1. Builds the binaries
# 2. Starts a dev server in the background
# 3. Runs CLI commands to verify functionality
# 4. Cleans up

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test directory (isolated from user config)
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR; [ -n \"$SERVER_PID\" ] && kill $SERVER_PID 2>/dev/null || true" EXIT

# Configuration
export CONFIG="$TEST_DIR/config.json"
export DATABASE_URL="$TEST_DIR/whereish.db"
export DEV_MODE=1
export PORT=18080

# Paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI="$SCRIPT_DIR/bin/whereish"
SERVER="$SCRIPT_DIR/bin/server"
API_URL="http://localhost:$PORT/api"

echo "=== Whereish Smoketest ==="
echo "Test directory: $TEST_DIR"
echo ""

# Build
echo -n "Building binaries... "
cd "$SCRIPT_DIR"
go build -o bin/whereish ./cmd/cli
go build -o bin/server ./cmd/server
echo -e "${GREEN}OK${NC}"

# Start server
echo -n "Starting server on port $PORT... "
$SERVER > "$TEST_DIR/server.log" 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
for i in {1..30}; do
    if curl -s "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}FAILED${NC}"
        echo "Server log:"
        cat "$TEST_DIR/server.log"
        exit 1
    fi
    sleep 0.1
done

# Helper function for tests
pass=0
fail=0

test_cmd() {
    local desc="$1"
    shift
    echo -n "  $desc... "
    if output=$("$@" 2>&1); then
        echo -e "${GREEN}OK${NC}"
        ((pass++))
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        echo "    Output: $output"
        ((fail++))
        return 1
    fi
}

test_cmd_expect() {
    local desc="$1"
    local expect="$2"
    shift 2
    echo -n "  $desc... "
    if output=$("$@" 2>&1) && echo "$output" | grep -q "$expect"; then
        echo -e "${GREEN}OK${NC}"
        ((pass++))
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        echo "    Expected: $expect"
        echo "    Output: $output"
        ((fail++))
        return 1
    fi
}

# Run tests
echo ""
echo "=== Configuration ==="
test_cmd "Set server URL" $CLI config set "$API_URL"
test_cmd_expect "Show config" "$API_URL" $CLI config show

echo ""
echo "=== Health Check ==="
test_cmd_expect "Server health" "healthy" $CLI health

echo ""
echo "=== Authentication ==="
test_cmd_expect "Dev login" "Logged in" $CLI dev-login test@example.com "Test User"
test_cmd_expect "Whoami shows email" "test@example.com" $CLI whoami
test_cmd_expect "Whoami shows name" "Test User" $CLI whoami

echo ""
echo "=== Contacts (empty) ==="
test_cmd_expect "List contacts" "No contacts" $CLI contacts list
test_cmd_expect "List requests" "No pending" $CLI requests list

echo ""
echo "=== Devices ==="
test_cmd_expect "List devices (empty)" "No devices" $CLI devices list

echo ""
echo "=== Identity ==="
test_cmd_expect "No identity yet" "No identity backup" $CLI identity get

echo ""
echo "=== Logout ==="
test_cmd "Logout" $CLI logout

# Summary
echo ""
echo "=== Results ==="
echo -e "Passed: ${GREEN}$pass${NC}"
echo -e "Failed: ${RED}$fail${NC}"

if [ $fail -gt 0 ]; then
    echo ""
    echo "Server log:"
    cat "$TEST_DIR/server.log"
    exit 1
fi

echo ""
echo -e "${GREEN}All tests passed!${NC}"
