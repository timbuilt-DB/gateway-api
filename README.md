# Gateway API

A secure middleware API that sits between ChatGPT and business systems (JobTread and QuickBooks), providing controlled access for AI-powered business automation.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Deployment to Vercel](#deployment-to-vercel)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Future Enhancements](#future-enhancements)

---

## Overview

### What This Gateway Does

The Gateway API acts as a **secure translator and enforcer** between ChatGPT and your business systems:

```
ChatGPT → Gateway API → Business Systems
          (validates,
           enforces rules,
           logs everything)
```

**Key Features:**

✅ **Security by Design** - HMAC signatures, RBAC, secret masking, audit logs
✅ **Multi-Tenant Support** - Separate credentials for Design Builders (DB) and Creative Interiors (CI)
✅ **Business Rule Enforcement** - Validates queries, enforces page limits, prevents schema errors
✅ **Idempotency** - Prevents duplicate operations (like creating two invoices)
✅ **Dry-Run Mode** - Test operations without side effects
✅ **Complete Audit Trail** - All actions logged with traceId

**Supported Actions:**

1. **jobtread.query** - Query JobTread for jobs, cost items, vendors, invoices
2. **jobtread.pushJobToQbo** - Sync completed jobs to QuickBooks Online
3. **make.trigger** - Trigger Make.com webhooks for custom automations

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         ChatGPT                             │
│  (Sends JSON requests with HMAC signatures)                 │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ HTTPS + HMAC
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Gateway API (Vercel Serverless)                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 1. Verify HMAC signature (timing-safe)               │  │
│  │ 2. Validate request schema (Ajv)                     │  │
│  │ 3. Check brand routing (DB vs CI)                    │  │
│  │ 4. Apply business rules (linting)                    │  │
│  │ 5. Check idempotency cache                           │  │
│  │ 6. Inject correct tenant secrets                     │  │
│  │ 7. Execute or dry-run                                │  │
│  │ 8. Log everything (masked secrets)                   │  │
│  └───────────────────────────────────────────────────────┘  │
└───────┬──────────────────────┬──────────────────────────────┘
        │                      │
        │                      ├─────────────┬────────────────┐
        ▼                      ▼             ▼                ▼
  ┌──────────┐          ┌──────────┐  ┌───────────┐   ┌──────────┐
  │ JobTread │          │ JobTread │  │ Make.com  │   │   QBO    │
  │    DB    │          │    CI    │  │ Webhooks  │   │(via Make)│
  └──────────┘          └──────────┘  └───────────┘   └──────────┘
```

**Tech Stack:**

- **Runtime:** Node.js 20 (TypeScript)
- **Framework:** Fastify (fast, low-overhead)
- **Validation:** Ajv (JSON Schema)
- **HTTP Client:** undici (Node.js recommended client)
- **Logging:** pino (structured logging)
- **Deployment:** Vercel Serverless (free tier)

---

## Prerequisites

Before you begin, ensure you have:

- **Node.js 20+** - [Download here](https://nodejs.org/)
- **npm** - Comes with Node.js
- **Vercel Account** - [Sign up free](https://vercel.com/)
- **JobTread Credentials** - Grant keys for both tenants (DB and CI)
- **Make.com Webhook** - (Optional) For purchase order automation
- **Git** - For version control and Vercel deployment

---

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/gateway-api.git
cd gateway-api
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in all required values:

```bash
# Generate HMAC secret (32-byte hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate gateway keys for DB and CI
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate admin password
node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"
```

**Required Variables:**

- `HMAC_SECRET` - For signature verification
- `GATEWAY_KEY_DB` - Routes to Design Builders
- `GATEWAY_KEY_CI` - Routes to Creative Interiors
- `JT_GRANT_KEY_DB` - JobTread API key for DB tenant
- `JT_GRANT_KEY_CI` - JobTread API key for CI tenant
- `ADMIN_BASIC_USER` - Admin panel username
- `ADMIN_BASIC_PASS` - Admin panel password

See `.env.example` for complete documentation.

### 4. Run Locally

Start the development server:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

Test the health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok"}
```

---

## Deployment to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "Initial Gateway API setup"
git push origin main
```

### 2. Deploy to Vercel

**Option A: Vercel CLI (Recommended)**

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel
```

**Option B: Vercel Dashboard**

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Vercel will auto-detect the configuration from `vercel.json`
4. Click "Deploy"

### 3. Set Environment Variables

In the Vercel Dashboard:

1. Go to **Project Settings** → **Environment Variables**
2. Add all variables from `.env.local`:
   - `HMAC_SECRET`
   - `GATEWAY_KEY_DB`
   - `GATEWAY_KEY_CI`
   - `JT_GRANT_KEY_DB`
   - `JT_GRANT_KEY_CI`
   - `MAKE_WEBHOOK_PO`
   - `ADMIN_BASIC_USER`
   - `ADMIN_BASIC_PASS`
   - `LOG_RETENTION_DAYS`
   - `ALLOW_HOSTS`

3. Set environment to **Production** (or both Preview and Production)
4. Click **Save**

### 4. Redeploy

After setting environment variables, redeploy:

```bash
vercel --prod
```

Your API will be live at: `https://your-project.vercel.app`

---

## API Documentation

### Endpoints

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/health` | GET | Health check | None |
| `/v1/actions/execute` | POST | Execute actions | HMAC + Gateway Key |
| `/admin/logs` | GET | View audit logs | Basic Auth |

---

### POST /v1/actions/execute

Execute an action (query, push to QBO, or trigger webhook).

#### Required Headers

```
Content-Type: application/json
x-gateway-key: <GATEWAY_KEY_DB or GATEWAY_KEY_CI>
X-Signature: sha256=<hmac_signature>
```

#### Request Body (ActionEnvelope)

```json
{
  "action": "echo|jobtread.query|jobtread.pushJobToQbo|make.trigger",
  "mode": "dry_run|execute",
  "idempotencyKey": "unique-string-per-operation",
  "params": {
    // Action-specific parameters
  }
}
```

#### Response

**Success (200):**
```json
{
  "ok": true,
  "traceId": "uuid-v4",
  "result": { /* action-specific result */ },
  "notes": ["array", "of", "warnings"]
}
```

**Error (4xx/5xx):**
```json
{
  "ok": false,
  "traceId": "uuid-v4",
  "error": "Error message",
  "details": [/* validation errors if applicable */]
}
```

---

### Action 1: Echo (Testing)

Simple action to verify the pipeline works.

**params:**
```json
{
  "message": "Hello, World!",
  "any": "data"
}
```

**Full Request Example:**
```json
{
  "action": "echo",
  "mode": "dry_run",
  "idempotencyKey": "test-echo-1",
  "params": {
    "message": "Hello from ChatGPT"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "traceId": "abc-123",
  "result": {
    "echo": {
      "message": "Hello from ChatGPT"
    },
    "traceId": "abc-123",
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "notes": []
}
```

---

### Action 2: jobtread.query

Query JobTread using Pave query language.

**params:**
```json
{
  "pave": {
    "jobs": {
      "nodes": {
        "id": {},
        "name": {},
        "status": {}
      },
      "size": 50
    }
  }
}
```

**Business Rules (Automatic Linting):**

- ❌ `contacts.nodes.email` not allowed (use `contacts.edges.node.email`)
- ❌ `.size` > 100 rejected (pagination required)
- ⚠️  `unitPrice` without `unitCost` warns to use authoritative source

**Full Request Example:**
```json
{
  "action": "jobtread.query",
  "mode": "execute",
  "idempotencyKey": "query-jobs-2024-01-15",
  "params": {
    "pave": {
      "jobs": {
        "nodes": {
          "id": {},
          "name": {},
          "number": {},
          "status": {},
          "costItems": {
            "nodes": {
              "description": {},
              "unitCost": {}
            },
            "size": 100
          }
        },
        "size": 10
      }
    }
  }
}
```

---

### Action 3: jobtread.pushJobToQbo

Push a completed job from JobTread to QuickBooks Online.

**params:**
```json
{
  "jobId": "12345"
}
```

**⚠️ Important:** This is a side-effect action. Idempotency is enforced to prevent duplicate pushes.

**Full Request Example:**
```json
{
  "action": "jobtread.pushJobToQbo",
  "mode": "execute",
  "idempotencyKey": "push-job-12345",
  "params": {
    "jobId": "12345"
  }
}
```

**Dry Run Response:**
```json
{
  "ok": true,
  "traceId": "def-456",
  "result": "Dry run: Would push job 12345 to QuickBooks Online via JobTread API.",
  "notes": ["This is a side-effect action - idempotency is enforced by the server"]
}
```

---

### Action 4: make.trigger

Trigger a Make.com webhook with custom payload.

**params:**
```json
{
  "webhookUrl": "https://hooks.make.com/your-webhook",
  "payload": {
    "any": "data"
  }
}
```

**Security:** Webhook URL host must be in `ALLOW_HOSTS` environment variable.

**Full Request Example:**
```json
{
  "action": "make.trigger",
  "mode": "execute",
  "idempotencyKey": "trigger-po-create-2024-01-15",
  "params": {
    "webhookUrl": "https://hooks.make.com/abc123def456",
    "payload": {
      "action": "create_po",
      "vendor": "ABC Supply",
      "items": [
        { "description": "2x4 Lumber", "qty": 100, "price": 4.50 }
      ]
    }
  }
}
```

---

### GET /admin/logs

View audit logs with optional filtering.

**Authentication:** Basic Auth (ADMIN_BASIC_USER / ADMIN_BASIC_PASS)

**Query Parameters:**

- `traceId` - Filter by trace ID
- `brand` - Filter by brand (DB or CI)
- `action` - Filter by action name
- `status` - Filter by status (success, error, warning)

**Example:**
```bash
curl -u admin:yourpassword \
  "https://your-api.vercel.app/admin/logs?brand=DB&status=success"
```

**Response:**
```json
{
  "ok": true,
  "logs": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "traceId": "abc-123",
      "brand": "DB",
      "action": "jobtread.query",
      "mode": "execute",
      "status": "success",
      "duration": 1234,
      "notes": [],
      "error": null
    }
  ]
}
```

---

## Testing

### Using the HMAC Helper

Generate signatures for manual testing:

```bash
node test/hmac-helper.js '{"action":"echo","mode":"dry_run","idempotencyKey":"test-1","params":{"message":"hello"}}'
```

Output includes a ready-to-use cURL command.

### cURL Examples

#### Test Echo Action

```bash
# 1. Generate signature
node test/hmac-helper.js '{"action":"echo","mode":"dry_run","idempotencyKey":"test-echo-1","params":{"message":"Hello"}}'

# 2. Copy the signature from output and use in cURL
curl -X POST http://localhost:3000/v1/actions/execute \
  -H "Content-Type: application/json" \
  -H "x-gateway-key: YOUR_GATEWAY_KEY_DB" \
  -H "X-Signature: sha256=YOUR_SIGNATURE_HERE" \
  -d '{"action":"echo","mode":"dry_run","idempotencyKey":"test-echo-1","params":{"message":"Hello"}}'
```

#### Test JobTread Query (Dry Run)

```bash
# Generate signature
BODY='{"action":"jobtread.query","mode":"dry_run","idempotencyKey":"test-query-1","params":{"pave":{"jobs":{"nodes":{"id":{},"name":{}},"size":10}}}}'

node test/hmac-helper.js "$BODY"

# Use the generated signature in cURL
curl -X POST http://localhost:3000/v1/actions/execute \
  -H "Content-Type: application/json" \
  -H "x-gateway-key: YOUR_GATEWAY_KEY_DB" \
  -H "X-Signature: sha256=SIGNATURE" \
  -d "$BODY"
```

#### Test Push to QBO (Dry Run)

```bash
BODY='{"action":"jobtread.pushJobToQbo","mode":"dry_run","idempotencyKey":"test-push-1","params":{"jobId":"12345"}}'

node test/hmac-helper.js "$BODY"

curl -X POST http://localhost:3000/v1/actions/execute \
  -H "Content-Type: application/json" \
  -H "x-gateway-key: YOUR_GATEWAY_KEY_CI" \
  -H "X-Signature: sha256=SIGNATURE" \
  -d "$BODY"
```

#### View Logs

```bash
curl -u admin:yourpassword http://localhost:3000/admin/logs

# Filter by brand
curl -u admin:yourpassword "http://localhost:3000/admin/logs?brand=DB"

# Filter by trace ID
curl -u admin:yourpassword "http://localhost:3000/admin/logs?traceId=abc-123"
```

---

## Troubleshooting

### 401 Unauthorized

**Problem:** `Invalid HMAC signature`

**Solutions:**
- Ensure `HMAC_SECRET` in `.env.local` matches what you used to generate the signature
- Use the `hmac-helper.js` script to generate signatures
- Verify the request body is **exactly** the same as what was signed (no extra whitespace)
- Check that `X-Signature` header starts with `sha256=`

**Problem:** `Invalid gateway key`

**Solutions:**
- Verify `x-gateway-key` header matches `GATEWAY_KEY_DB` or `GATEWAY_KEY_CI`
- Check for typos or extra whitespace in the key

---

### 422 Unprocessable Entity

**Problem:** `Invalid request format`

**Solutions:**
- Ensure JSON body has all required fields: `action`, `mode`, `idempotencyKey`, `params`
- Check `action` is one of: `echo`, `jobtread.query`, `jobtread.pushJobToQbo`, `make.trigger`
- Check `mode` is either `dry_run` or `execute`

**Problem:** `Invalid parameters for action`

**Solutions:**
- For `jobtread.query`: Ensure `params.pave` is an object
- For `jobtread.pushJobToQbo`: Ensure `params.jobId` is a non-empty string
- for `make.trigger`: Ensure `params.webhookUrl` (valid URI) and `params.payload` (object) are present

---

### JobTread Query Lint Errors

**Error:** `contacts.nodes.email is not supported`

**Solution:** Use `contacts.edges.node.email` instead
```json
{
  "contacts": {
    "edges": {
      "node": {
        "email": {}
      }
    }
  }
}
```

**Error:** `Page size limit exceeded`

**Solution:** Reduce `.size` to 100 or less, use pagination for larger datasets

**Warning:** `unitPrice used without unitCost`

**Recommendation:** Use `unitCost` as the authoritative pricing source

---

### 500 Internal Server Error

**Problem:** `JobTread grant key not configured for brand`

**Solutions:**
- Set `JT_GRANT_KEY_DB` and `JT_GRANT_KEY_CI` in environment variables
- Verify grant keys are correct from JobTread API settings

**Problem:** `HTTP request failed after 3 attempts`

**Solutions:**
- Check internet connectivity
- Verify JobTread API is accessible
- Check if Make.com webhook URL is correct
- Review logs for specific error messages

---

### Idempotency Issues

**Problem:** Getting cached result when you don't want it

**Solution:** Change the `idempotencyKey` to a new unique value

**Note:** Idempotency only applies to `execute` mode, not `dry_run`

---

## Security

### HMAC Signature Verification

All requests must include a valid HMAC SHA256 signature:

1. ChatGPT signs the request body with `HMAC_SECRET`
2. Gateway verifies signature using **constant-time comparison** (prevents timing attacks)
3. Invalid signatures are rejected with 401

**Signature Format:**
```
X-Signature: sha256=<hex_digest>
```

### Role-Based Access Control (RBAC)

Two gateway keys provide tenant isolation:

- `GATEWAY_KEY_DB` → Design Builders → `JT_GRANT_KEY_DB`
- `GATEWAY_KEY_CI` → Creative Interiors → `JT_GRANT_KEY_CI`

**Data never mixes between tenants.**

### Secret Masking

All logs automatically mask sensitive data:

Keys containing: `grantKey`, `password`, `secret`, `token`, `key`, `authorization`

**Logged as:** `***MASKED***`

### Webhook Allowlist

The `ALLOW_HOSTS` environment variable prevents requests to unauthorized domains:

```
ALLOW_HOSTS=api.jobtread.com,hooks.make.com,quickbooks.api.intuit.com
```

Any webhook URL not in this list will be rejected.

### Admin Panel

`/admin/logs` endpoint requires Basic Auth:

- Username: `ADMIN_BASIC_USER`
- Password: `ADMIN_BASIC_PASS`

**Always use strong passwords in production.**

---

## Future Enhancements

### Planned Features

1. **Direct QuickBooks Integration**
   - OAuth 2.0 flow for QBO
   - Direct invoice/PO creation
   - Remove Make.com dependency

2. **Persistent Logging**
   - Replace in-memory logs with database (PostgreSQL/MongoDB)
   - Long-term log retention and analytics
   - Advanced filtering and search

3. **Rate Limiting**
   - Per-brand rate limits
   - Prevent API abuse
   - Cost control for external API calls

4. **Enhanced Idempotency**
   - TTL-based cache expiration
   - Redis/Upstash for distributed idempotency
   - Cross-deployment consistency

5. **Webhook Support**
   - Real-time notifications to ChatGPT
   - Async job status updates
   - Event-driven workflows

6. **Additional Integrations**
   - Airtable for project tracking
   - Stripe for payment processing
   - Email/SMS notifications

7. **Advanced Monitoring**
   - OpenTelemetry tracing
   - Error tracking (Sentry)
   - Performance metrics (Datadog)

8. **File Upload Support**
   - Invoice/receipt uploads
   - Image attachments for jobs
   - S3/Cloudflare R2 storage

---

## Support

For issues or questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review logs via `/admin/logs`
3. Open an issue on GitHub

---

## License

MIT License - see LICENSE file for details.

---

**Built with ❤️ for Tim's business automation needs**
