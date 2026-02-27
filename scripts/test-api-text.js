#!/usr/bin/env node
/**
 * Qopy API test: store text and retrieve it
 *
 * Uses the same flow as the web app: upload/initiate → chunk → complete,
 * then GET /api/clip/:clipId and decrypt. Requires DATABASE_URL and server running.
 *
 * Run: node scripts/test-api-text.js [baseUrl]
 * Example: node scripts/test-api-text.js http://localhost:8080
 */

const crypto = require('crypto');
const FormData = require('form-data');

const BASE_URL = process.argv[2] || process.env.BASE_URL || 'http://localhost:8080';

const FORMAT_VERSION_V3 = 0x03;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 600000;
const V3_HEADER_LENGTH = 1 + SALT_LENGTH + IV_LENGTH; // 45

function generateUrlSecret() {
  return crypto.randomBytes(32).toString('base64');
}

function deriveKeyV3(urlSecret, salt) {
  return crypto.pbkdf2Sync(urlSecret, salt, PBKDF2_ITERATIONS, 32, 'sha256');
}

function encryptChunkV3(plaintext, urlSecret) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKeyV3(urlSecret, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.allocUnsafe(1 + SALT_LENGTH + IV_LENGTH + encrypted.length + 16);
  let offset = 0;
  payload[offset++] = FORMAT_VERSION_V3;
  salt.copy(payload, offset); offset += SALT_LENGTH;
  iv.copy(payload, offset); offset += IV_LENGTH;
  encrypted.copy(payload, offset); offset += encrypted.length;
  authTag.copy(payload, offset);
  return payload;
}

function decryptV3(encryptedBuffer, urlSecret) {
  if (encryptedBuffer[0] !== FORMAT_VERSION_V3 || encryptedBuffer.length < V3_HEADER_LENGTH + 16) {
    throw new Error('Invalid V3 payload');
  }
  const salt = encryptedBuffer.subarray(1, 1 + SALT_LENGTH);
  const iv = encryptedBuffer.subarray(1 + SALT_LENGTH, V3_HEADER_LENGTH);
  const ciphertext = encryptedBuffer.subarray(V3_HEADER_LENGTH, encryptedBuffer.length - 16);
  const authTag = encryptedBuffer.subarray(encryptedBuffer.length - 16);
  const key = deriveKeyV3(urlSecret, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function main() {
  const testText = 'Hello from Qopy API test at ' + new Date().toISOString();
  const urlSecret = generateUrlSecret();

  console.log('Qopy API text store + retrieve test');
  console.log('Base URL:', BASE_URL);
  console.log('Test text length:', testText.length);

  const textBytes = Buffer.from(testText, 'utf8');
  const encryptedChunk = encryptChunkV3(textBytes, urlSecret);

  // 1) Initiate upload
  const initRes = await fetch(`${BASE_URL}/api/upload/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: 'test-api-text.txt',
      totalChunks: 1,
      expiration: '1hr',
      oneTime: false,
      hasPassword: false,
      quickShare: false,
      contentType: 'text',
      isTextContent: true,
    }),
  });
  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Init failed (${initRes.status}): ${err}`);
  }
  const initData = await initRes.json();
  const { uploadId } = initData;
  console.log('Upload initiated, uploadId:', uploadId);

  // 2) Upload single chunk
  const form = new FormData();
  form.append('chunk', encryptedChunk, { filename: 'chunk_0' });
  form.append('chunkNumber', '0');
  const chunkRes = await fetch(`${BASE_URL}/api/upload/chunk/${uploadId}/0`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });
  if (!chunkRes.ok) {
    const err = await chunkRes.text();
    throw new Error(`Chunk upload failed (${chunkRes.status}): ${err}`);
  }
  console.log('Chunk uploaded');

  // 3) Complete upload
  const completeRes = await fetch(`${BASE_URL}/api/upload/complete/${uploadId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      isTextUpload: true,
      contentType: 'text',
      requiresAccessCode: false,
    }),
  });
  if (!completeRes.ok) {
    const err = await completeRes.text();
    throw new Error(`Complete failed (${completeRes.status}): ${err}`);
  }
  const completeData = await completeRes.json();
  const clipId = completeData.clipId;
  console.log('Upload complete, clipId:', clipId);

  // 4) Get clip metadata (returns redirectTo for text stored as file)
  const clipRes = await fetch(`${BASE_URL}/api/clip/${clipId}`);
  if (!clipRes.ok) {
    throw new Error(`Get clip failed (${clipRes.status})`);
  }
  const clipData = await clipRes.json();
  const fileUrl = clipData.redirectTo ? `${BASE_URL}${clipData.redirectTo}` : null;
  if (!fileUrl) {
    throw new Error('Clip response missing redirectTo');
  }

  // 5) Fetch encrypted file body
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    throw new Error(`Get file failed (${fileRes.status})`);
  }
  const encryptedBody = Buffer.from(await fileRes.arrayBuffer());
  if (encryptedBody.length < V3_HEADER_LENGTH + 16) {
    throw new Error('Retrieved content too short to be V3 encrypted');
  }

  // 6) Decrypt and verify
  const decrypted = decryptV3(encryptedBody, urlSecret);
  const retrievedText = decrypted.toString('utf8');
  if (retrievedText !== testText) {
    throw new Error('Retrieved text does not match. Expected length ' + testText.length + ', got ' + retrievedText.length);
  }
  console.log('Retrieved and decrypted successfully.');
  console.log('Text:', retrievedText.slice(0, 60) + (retrievedText.length > 60 ? '...' : ''));
  console.log('\nTest passed.');
}

main().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
