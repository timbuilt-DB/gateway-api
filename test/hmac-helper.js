#!/usr/bin/env node

/**
 * HMAC Helper - Generate X-Signature headers for manual API testing
 *
 * Usage: node test/hmac-helper.js '{"action":"echo","mode":"dry_run","idempotencyKey":"test-123","params":{}}'
 *
 * This script:
 * 1. Takes a JSON body as input
 * 2. Reads HMAC_SECRET from .env.local
 * 3. Generates sha256 HMAC signature
 * 4. Outputs "X-Signature: sha256=<hex>" header value
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Get JSON body from command line argument
const jsonBody = process.argv[2];

if (!jsonBody) {
  console.error('Error: JSON body is required');
  console.error('');
  console.error('Usage: node test/hmac-helper.js \'{"action":"echo","mode":"dry_run","idempotencyKey":"test-123","params":{}}\'');
  console.error('');
  console.error('Example:');
  console.error('  node test/hmac-helper.js \'{"action":"echo","mode":"dry_run","idempotencyKey":"test-1","params":{"message":"hello"}}\'');
  process.exit(1);
}

// Validate JSON
try {
  JSON.parse(jsonBody);
} catch (error) {
  console.error('Error: Invalid JSON');
  console.error(error.message);
  process.exit(1);
}

// Read HMAC_SECRET from .env.local
const envPath = path.join(__dirname, '..', '.env.local');

if (!fs.existsSync(envPath)) {
  console.error('Error: .env.local file not found');
  console.error('Please create .env.local with HMAC_SECRET');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const hmacSecretMatch = envContent.match(/HMAC_SECRET=(.+)/);

if (!hmacSecretMatch) {
  console.error('Error: HMAC_SECRET not found in .env.local');
  process.exit(1);
}

const hmacSecret = hmacSecretMatch[1].trim();

if (!hmacSecret) {
  console.error('Error: HMAC_SECRET is empty in .env.local');
  process.exit(1);
}

// Generate HMAC signature
const signature = crypto
  .createHmac('sha256', hmacSecret)
  .update(jsonBody)
  .digest('hex');

// Output results
console.log('='.repeat(80));
console.log('HMAC Signature Generated');
console.log('='.repeat(80));
console.log('');
console.log('Request Body:');
console.log(jsonBody);
console.log('');
console.log('X-Signature Header:');
console.log(`sha256=${signature}`);
console.log('');
console.log('Full cURL Example:');
console.log('');
console.log(`curl -X POST http://localhost:3000/v1/actions/execute \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -H "x-gateway-key: YOUR_GATEWAY_KEY_HERE" \\`);
console.log(`  -H "X-Signature: sha256=${signature}" \\`);
console.log(`  -d '${jsonBody}'`);
console.log('');
console.log('='.repeat(80));
