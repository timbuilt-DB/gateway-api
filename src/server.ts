import Fastify from 'fastify';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import ajv from './lib/ajv.js';
import { verifyHmacSignature, getBrandFromGatewayKey, getGrantKeyForBrand } from './lib/auth.js';
import { createTraceId, addLog, getLogs, maskSecrets } from './lib/logs.js';
import { executeEcho } from './actions/echo.js';
import { executeJobTreadQuery } from './actions/jobtread.query.js';
import { executeJobTreadPushJobToQbo } from './actions/jobtread.pushJobToQbo.js';
import { executeMakeTrigger } from './actions/make.trigger.js';

// Get current directory for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load and compile JSON schemas
const envelopeSchemaJson = JSON.parse(
  readFileSync(join(__dirname, 'schemas/envelope.schema.json'), 'utf-8')
);
const jobtreadQuerySchemaJson = JSON.parse(
  readFileSync(join(__dirname, 'schemas/jobtread.query.schema.json'), 'utf-8')
);
const jobtreadPushJobToQboSchemaJson = JSON.parse(
  readFileSync(join(__dirname, 'schemas/jobtread.pushJobToQbo.schema.json'), 'utf-8')
);
const makeTriggerSchemaJson = JSON.parse(
  readFileSync(join(__dirname, 'schemas/make.trigger.schema.json'), 'utf-8')
);

// Compile schemas
const validateEnvelope = ajv.compile(envelopeSchemaJson);
const validateJobTreadQuery = ajv.compile(jobtreadQuerySchemaJson);
const validateJobTreadPushJobToQbo = ajv.compile(jobtreadPushJobToQboSchemaJson);
const validateMakeTrigger = ajv.compile(makeTriggerSchemaJson);

// Create Fastify instance with pino logger
const fastify = Fastify({
  logger: {
    level: 'info'
  }
});

// Add content parser that preserves raw body for HMAC verification
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (req, body, done) => {
    // Store raw body for HMAC verification
    (req as any).rawBody = body;

    try {
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err) {
      const error = err as Error;
      error.message = 'Invalid JSON';
      done(error, undefined);
    }
  }
);

// Idempotency cache: Map<action+brand+idempotencyKey, result>
const idempotencyCache = new Map<string, any>();

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

// Main action execution endpoint
fastify.post('/v1/actions/execute', async (request, reply) => {
  const startTime = Date.now();
  let traceId: string | undefined;
  let brand: 'DB' | 'CI' | undefined;
  let action: string | undefined;
  let mode: 'dry_run' | 'execute' | undefined;

  try {
    // Step 1: Extract rawBody, headers
    const rawBody = (request as any).rawBody as string;
    const gatewayKey = request.headers['x-gateway-key'] as string;
    const signature = request.headers['x-signature'] as string;

    if (!rawBody) {
      reply.code(400);
      return { ok: false, error: 'Request body is required' };
    }

    if (!gatewayKey) {
      reply.code(401);
      return { ok: false, error: 'x-gateway-key header is required' };
    }

    if (!signature) {
      reply.code(401);
      return { ok: false, error: 'X-Signature header is required' };
    }

    // Step 2: Verify HMAC signature
    const hmacSecret = process.env.HMAC_SECRET;
    if (!hmacSecret) {
      throw new Error('HMAC_SECRET not configured');
    }

    if (!verifyHmacSignature(rawBody, signature, hmacSecret)) {
      reply.code(401);
      return { ok: false, error: 'Invalid HMAC signature' };
    }

    // Step 3: Get brand from gateway key
    const brandResult = getBrandFromGatewayKey(gatewayKey);
    if (!brandResult) {
      reply.code(401);
      return { ok: false, error: 'Invalid gateway key' };
    }
    brand = brandResult;

    // Step 4: Validate envelope schema
    const envelope = request.body as any;
    if (!validateEnvelope(envelope)) {
      reply.code(422);
      return {
        ok: false,
        error: 'Invalid request format',
        details: validateEnvelope.errors
      };
    }

    // Step 5: Create traceId
    traceId = createTraceId();
    action = envelope.action as string;
    mode = envelope.mode as 'dry_run' | 'execute';

    // Step 6: Validate action-specific params schema
    let paramsValid = false;
    let paramsValidator: any;

    switch (action) {
      case 'echo':
        paramsValid = true; // Echo accepts any params
        break;
      case 'jobtread.query':
        paramsValidator = validateJobTreadQuery;
        paramsValid = paramsValidator(envelope.params);
        break;
      case 'jobtread.pushJobToQbo':
        paramsValidator = validateJobTreadPushJobToQbo;
        paramsValid = paramsValidator(envelope.params);
        break;
      case 'make.trigger':
        paramsValidator = validateMakeTrigger;
        paramsValid = paramsValidator(envelope.params);
        break;
      default:
        reply.code(422);
        return { ok: false, error: `Unknown action: ${action}` };
    }

    if (!paramsValid && paramsValidator) {
      reply.code(422);
      return {
        ok: false,
        error: 'Invalid parameters for action',
        details: paramsValidator.errors
      };
    }

    // Step 7: Check idempotency for execute mode
    const idempotencyKey = `${action}:${brand}:${envelope.idempotencyKey}`;
    if (mode === 'execute' && idempotencyCache.has(idempotencyKey)) {
      const cachedResult = idempotencyCache.get(idempotencyKey);
      fastify.log.info({ traceId, brand, action }, 'Returning cached result for idempotent request');
      return cachedResult;
    }

    // Step 8: Get grantKey for brand (if needed)
    let grantKey: string | undefined;
    if (action.startsWith('jobtread.')) {
      grantKey = getGrantKeyForBrand(brand);
    }

    // Step 10: Route to appropriate action handler
    let result: any;
    let notes: string[] = [];

    switch (action) {
      case 'echo':
        result = executeEcho(envelope.params, traceId);
        break;
      case 'jobtread.query':
        const queryResult = await executeJobTreadQuery(
          envelope.params,
          brand,
          grantKey!,
          mode
        );
        result = queryResult.result;
        notes = queryResult.notes || [];
        break;
      case 'jobtread.pushJobToQbo':
        const pushResult = await executeJobTreadPushJobToQbo(
          envelope.params,
          brand,
          grantKey!,
          mode
        );
        result = pushResult.result;
        notes = pushResult.notes || [];
        break;
      case 'make.trigger':
        const triggerResult = await executeMakeTrigger(
          envelope.params,
          mode
        );
        result = triggerResult.result;
        notes = triggerResult.notes || [];
        break;
    }

    // Step 9: Calculate duration
    const duration = Date.now() - startTime;

    // Step 11: Add log entry
    addLog({
      timestamp: new Date().toISOString(),
      traceId,
      brand,
      action,
      mode,
      status: 'success',
      duration,
      notes
    });

    // Cache result for idempotency (execute mode only)
    const response = { ok: true, traceId, result, notes };
    if (mode === 'execute') {
      idempotencyCache.set(idempotencyKey, response);
    }

    // Step 12: Return response
    return response;

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Ensure we have a traceId for error logging
    if (!traceId) {
      traceId = createTraceId();
    }

    // Log error
    if (brand && action && mode) {
      addLog({
        timestamp: new Date().toISOString(),
        traceId,
        brand,
        action,
        mode,
        status: 'error',
        duration,
        notes: [],
        error: errorMessage
      });
    }

    fastify.log.error({ traceId, error: errorMessage }, 'Action execution failed');

    reply.code(500);
    return {
      ok: false,
      traceId,
      error: errorMessage
    };
  }
});

// Admin logs endpoint with Basic Auth
fastify.get('/admin/logs', async (request, reply) => {
  try {
    // Step 1: Check Basic Auth
    const authHeader = request.headers.authorization;
    const adminUser = process.env.ADMIN_BASIC_USER;
    const adminPass = process.env.ADMIN_BASIC_PASS;

    if (!adminUser || !adminPass) {
      throw new Error('Admin credentials not configured');
    }

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      reply.code(401);
      reply.header('WWW-Authenticate', 'Basic realm="Admin Area"');
      return { ok: false, error: 'Authentication required' };
    }

    // Decode and verify Basic Auth
    const base64Credentials = authHeader.slice(6); // Remove "Basic "
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    if (username !== adminUser || password !== adminPass) {
      reply.code(401);
      reply.header('WWW-Authenticate', 'Basic realm="Admin Area"');
      return { ok: false, error: 'Invalid credentials' };
    }

    // Step 2: Parse query params
    const { traceId, brand, action, status } = request.query as {
      traceId?: string;
      brand?: 'DB' | 'CI';
      action?: string;
      status?: 'success' | 'error' | 'warning';
    };

    // Step 3: Get logs with filters
    const filters: any = {};
    if (traceId) filters.traceId = traceId;
    if (brand) filters.brand = brand;
    if (action) filters.action = action;
    if (status) filters.status = status;

    const logs = getLogs(filters);

    // Step 4: Return masked logs (secrets already masked in log storage)
    return { ok: true, logs };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    fastify.log.error({ error: errorMessage }, 'Admin logs endpoint failed');
    reply.code(500);
    return { ok: false, error: errorMessage };
  }
});

// Server start function
async function start() {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    fastify.log.info(`Gateway API server listening on ${host}:${port}`);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

// Start server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export default fastify;
