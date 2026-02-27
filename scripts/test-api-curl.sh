#!/bin/bash
#
# Qopy API test using curl: store plaintext and retrieve it.
# Matches the FAQ: direct API sends plaintext (no client-side encryption).
#
# Usage: ./scripts/test-api-curl.sh [base_url]
# Examples:
#   ./scripts/test-api-curl.sh http://localhost:8080
#   ./scripts/test-api-curl.sh https://qopy.app
#
# Prerequisites: curl; optional: node (for JSON parsing).

set -e
BASE_URL="${1:-http://localhost:8080}"
TMP_DIR="${TMPDIR:-/tmp}/qopy-curl-test-$$"
mkdir -p "$TMP_DIR"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

# Plaintext per FAQ: "When using the API directly, content is sent as plaintext to the server."
TEST_TEXT="Hello from Qopy API test"
echo "$TEST_TEXT" > "$TMP_DIR/message.txt"
FILE_SIZE=$(wc -c < "$TMP_DIR/message.txt")

echo "Qopy API test (curl, plaintext per FAQ)"
echo "Base URL: $BASE_URL"
echo ""

# 1) Health check
echo "1. Health check"
curl -sf -o /dev/null "$BASE_URL/health" && echo "   OK" || { echo "   FAIL"; exit 1; }

# 2) Initiate upload (FAQ: fileName, fileSize, totalChunks – server accepts filename, filesize)
echo "2. Initiate upload"
INIT_RESP=$(curl -sf -X POST "$BASE_URL/api/upload/initiate" \
  -H "Content-Type: application/json" \
  -d "{
    \"filename\": \"message.txt\",
    \"filesize\": $FILE_SIZE,
    \"totalChunks\": 1,
    \"expiration\": \"1hr\",
    \"oneTime\": false,
    \"hasPassword\": false
  }")
UPLOAD_ID=$(echo "$INIT_RESP" | node -e "let d=require('fs').readFileSync(0,'utf8'); d=JSON.parse(d); process.stdout.write(d.uploadId||'')")
if [ -z "$UPLOAD_ID" ]; then
  echo "   FAIL: no uploadId"
  echo "$INIT_RESP" | head -5
  exit 1
fi
echo "   uploadId: $UPLOAD_ID"
echo "   Before upload (plaintext): $TEST_TEXT"

# 3) Upload chunk (plaintext file)
echo "3. Upload chunk (plaintext)"
curl -sf -X POST "$BASE_URL/api/upload/chunk/$UPLOAD_ID/0" \
  -F "chunk=@$TMP_DIR/message.txt" \
  -o /dev/null
echo "   chunk uploaded"

# 4) Complete upload
echo "4. Complete upload"
COMPLETE_RESP=$(curl -sf -X POST "$BASE_URL/api/upload/complete/$UPLOAD_ID" \
  -H "Content-Type: application/json" \
  -d '{}')
CLIP_ID=$(echo "$COMPLETE_RESP" | node -e "let d=require('fs').readFileSync(0,'utf8'); d=JSON.parse(d); process.stdout.write(d.clipId||'')")
if [ -z "$CLIP_ID" ]; then
  echo "   FAIL: no clipId"
  echo "$COMPLETE_RESP" | head -5
  exit 1
fi
echo "   clipId: $CLIP_ID"

# 5) Get clip (JSON with redirectTo for file)
echo "5. Get clip"
CLIP_RESP=$(curl -sf "$BASE_URL/api/clip/$CLIP_ID")
REDIRECT=$(echo "$CLIP_RESP" | node -e "let d=require('fs').readFileSync(0,'utf8'); d=JSON.parse(d); process.stdout.write(d.redirectTo||'')")
if [ -z "$REDIRECT" ]; then
  echo "   FAIL: no redirectTo"
  exit 1
fi
echo "   redirectTo: $REDIRECT"

# 6) Get file (POST required – GET /api/file returns 410; for protected clips send body {"accessCode":"<128-char-hex-hash>"} only, never plaintext)
echo "6. Get file"
HTTP_CODE=$(curl -s -o "$TMP_DIR/retrieved.txt" -w "%{http_code}" -X POST "$BASE_URL$REDIRECT" -H "Content-Type: application/json" -d '{}')
if [ "$HTTP_CODE" != "200" ]; then
  echo "   FAIL: HTTP $HTTP_CODE"
  head -c 300 "$TMP_DIR/retrieved.txt" 2>/dev/null | cat -v
  echo ""
  exit 1
fi
RETRIEVED=$(cat "$TMP_DIR/retrieved.txt")
echo "   After retrieve (plaintext): $RETRIEVED"

# 7) Verify
echo "7. Verify"
if [ "$RETRIEVED" = "$TEST_TEXT" ]; then
  echo "   Match: OK"
else
  echo "   FAIL: text mismatch"
  exit 1
fi

echo ""
echo "All steps OK (plaintext API)."
