# Zero-Knowledge Audit Checklist

Use this checklist when adding or changing client–server flows to ensure we never send data that the docs promise to keep zero-knowledge.

## Never send to the server

- **URL secret** — Must stay in the URL fragment only. The browser does not send the fragment; the client must never include it in any request body or header.
- **Plaintext access code (password)** — Only a PBKDF2-SHA-512 hash (128 hex chars, 600k iterations) may be sent for access validation. Use `generateAccessCodeHash(password)` and send that as `accessCode` or `accessCodeHash`.
- **Plaintext content** — All content must be encrypted client-side before upload; the server only ever sees ciphertext.

## For access control, send only

- **PBKDF2-SHA-512 hash** of the access code (e.g. `accessCode` or `accessCodeHash` in request body). Same salt and iterations as server (see `/api/config` `pbkdf2Salt` and client `CLIP_CONFIG.PBKDF2_ITERATIONS_V3`).

## Flows to verify on changes

| Flow | Client files | What must not be sent |
|------|--------------|------------------------|
| Upload complete (file) | `public/file-upload.js` | `urlSecret`, plaintext password |
| Upload complete (text) | `public/script.js` (`uploadTextAsFile`) | `urlSecret`, plaintext password |
| Clip retrieval | `public/script.js` | URL secret (fragment only); if password needed, send hash only |
| File download (main app) | `public/script.js` (`downloadFile`, text-file redirect) | URL secret; if password needed, send hash only |
| File download (file UI) | `public/file-upload.js` (`FileDownloadManager.downloadFile`) | URL secret; if password needed, send hash only. Use POST `/api/file/:clipId` with `accessCode` (hash), not token in URL. |

## Reference

- [SECURITY_REVIEW.md](SECURITY_REVIEW.md) — Full security review and controls.
- [CLAUDE.md](../CLAUDE.md) — Architecture and encryption flow.
