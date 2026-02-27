# Qopy API – curl examples

Use these in the terminal against a running server (e.g. `http://localhost:8080` or `https://qopy.app`).

**Direct API = plaintext.** When using the API with curl, content is sent as plaintext to the server (no client-side encryption). For a full automated test, run:

```bash
./scripts/test-api-curl.sh https://qopy.app
```

---

## Health

```bash
curl -s https://qopy.app/health
```

---

## Get clip info

```bash
curl -s https://qopy.app/api/clip/CLIPID/info
```

Replace `CLIPID` with a 6-char (Quick Share) or 10-char clip ID.

---

## Initiate upload (plaintext, 1 chunk)

```bash
curl -s -X POST https://qopy.app/api/upload/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "message.txt",
    "filesize": 26,
    "totalChunks": 1,
    "expiration": "1hr",
    "oneTime": false,
    "hasPassword": false
  }'
```

Use the `uploadId` from the response for the next steps.

---

## Upload one chunk (plaintext file)

```bash
curl -s -X POST "https://qopy.app/api/upload/chunk/UPLOAD_ID/0" \
  -F "chunk=@message.txt"
```

`message.txt` is sent as-is (plaintext).

---

## Complete upload

```bash
curl -s -X POST "https://qopy.app/api/upload/complete/UPLOAD_ID" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Use the `clipId` from the response to retrieve.

---

## Get clip (returns JSON with redirectTo)

```bash
curl -s https://qopy.app/api/clip/CLIP_ID
```

The JSON includes `redirectTo: "/api/file/CLIP_ID"`. Use that path for the file download.

---

## Download file (must use POST)

GET `/api/file/:clipId` returns 410 Gone. Use **POST** with optional JSON body (e.g. `{}` for unprotected clips, or `{"accessCode":"..."}` if protected).

```bash
curl -s -o retrieved.txt -X POST "https://qopy.app/api/file/CLIP_ID" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Full store + retrieve test

```bash
./scripts/test-api-curl.sh https://qopy.app
```

Runs: health → initiate → upload plaintext chunk → complete → get clip → POST file download → verify content. Requires `curl` and `node` (for JSON parsing).
