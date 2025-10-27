#!/bin/bash

# Health Check Script for Qopy
# Validates that the application is running correctly

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
TARGET_URL="${1:-https://qopy.app}"
TIMEOUT=10
MAX_RETRIES=3

echo "========================================="
echo "🏥 Qopy Health Check"
echo "========================================="
echo "Target: $TARGET_URL"
echo "========================================="

# Function to check endpoint
check_endpoint() {
    local endpoint=$1
    local expected_code=${2:-200}
    local description=$3
    local url="${TARGET_URL}${endpoint}"

    echo -n "Checking $description... "

    # Try with retries
    for i in $(seq 1 $MAX_RETRIES); do
        response_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "$url")

        if [ "$response_code" -eq "$expected_code" ]; then
            echo -e "${GREEN}✅ OK${NC} (HTTP $response_code)"
            return 0
        fi

        if [ $i -lt $MAX_RETRIES ]; then
            echo -n "⏳ Retrying... "
            sleep 2
        fi
    done

    echo -e "${RED}❌ FAILED${NC} (HTTP $response_code, expected $expected_code)"
    return 1
}

# Function to measure response time
measure_response_time() {
    local endpoint=$1
    local description=$2
    local url="${TARGET_URL}${endpoint}"

    echo -n "Measuring $description response time... "

    response_time=$(curl -o /dev/null -s -w '%{time_total}\n' --max-time $TIMEOUT "$url")
    response_time_ms=$(echo "$response_time * 1000" | bc)

    if (( $(echo "$response_time < 3.0" | bc -l) )); then
        echo -e "${GREEN}✅ ${response_time_ms}ms${NC}"
        return 0
    elif (( $(echo "$response_time < 5.0" | bc -l) )); then
        echo -e "${YELLOW}⚠️ ${response_time_ms}ms${NC} (slow)"
        return 0
    else
        echo -e "${RED}❌ ${response_time_ms}ms${NC} (too slow)"
        return 1
    fi
}

# Start health checks
FAILED_CHECKS=0

# Check main endpoints
check_endpoint "/health" 200 "Health endpoint" || ((FAILED_CHECKS++))
check_endpoint "/ping" 200 "Ping endpoint" || ((FAILED_CHECKS++))
check_endpoint "/api/health" 200 "API health endpoint" || ((FAILED_CHECKS++))
check_endpoint "/" 200 "Homepage" || ((FAILED_CHECKS++))

echo ""
echo "Response Time Checks:"
measure_response_time "/health" "Health" || ((FAILED_CHECKS++))
measure_response_time "/" "Homepage" || ((FAILED_CHECKS++))

# Summary
echo ""
echo "========================================="
if [ $FAILED_CHECKS -eq 0 ]; then
    echo -e "${GREEN}✅ All health checks passed!${NC}"
    echo "========================================="
    exit 0
else
    echo -e "${RED}❌ $FAILED_CHECKS health check(s) failed${NC}"
    echo "========================================="
    exit 1
fi
