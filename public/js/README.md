# Qopy Frontend JavaScript Modules

## Structure

- **crypto/EncryptionService.js** - Shared client-side encryption (AES-256-GCM). Supports legacy (16-char) and enhanced (40+ char) formats. Attaches to `window.QopyCrypto`.

- **standalone/ErrorMessages.js** - Centralized error, success, and info messages. Attaches to `window.ERROR_MESSAGES`, `window.SUCCESS_MESSAGES`, `window.INFO_MESSAGES`.

- **standalone/UIHelpers.js** - UI utilities (showPasswordSection, hideLoading, etc.). Attaches to `window.UIHelpers`.

- **services/ApiClient.js** - ES module API client (use with `type="module"`).

- **helpers/UIHelpers.js** - ES module version of UIHelpers.

- **constants/ErrorMessages.js** - ES module version of ErrorMessages.

## Loading Order (index.html)

1. QopyCrypto (EncryptionService.js)
2. ErrorMessages (standalone)
3. UIHelpers (standalone)
4. script.js (main app)
5. file-upload.js (file upload)

## Usage

Plain scripts (script.js, file-upload.js) use the standalone versions via `window`:

```javascript
if (window.UIHelpers) window.UIHelpers.showPasswordSection();
this.showToast(window.ERROR_MESSAGES?.ACCESS_DENIED || 'Fallback', 'error');
```
