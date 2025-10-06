// Load environment variables (Vercel will inject them)
import Fastify from 'fastify';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import ajv from '../src/lib/ajv.js';
import { verifyHmacSignature, getBrandFromGatewayKey, getGrantKeyForBrand } from '../src/lib/auth.js';
import { createTraceId, addLog, getLogs } from '../src/lib/logs.js';
import { executeEcho } from '../src/actions/echo.js';
import { executeJobTreadQuery } from '../src/actions/jobtread.query.js';
import { executeJobTreadPushJobToQbo } from '../src/actions/jobtread.pushJobToQbo.js';
import { executeMakeTrigger } from '../src/actions/make.trigger.js';

// Get current directory for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load and compile JSON schemas
const envelopeSchemaJson = JSON.parse(
  readFileSync(join(__dirname, '../src/schemas/envelope.schema.json'), 'utf-8')
);
const jobtreadQuerySchemaJson = JSON.parse(
  readFileSync(join(__dirname, '../src/schemas/jobtread.query.schema.json'), 'utf-8')
);
const jobtreadPushJobToQboSchemaJson = JSON.parse(
  readFileSync(join(__dirname, '../src/schemas/jobtread.pushJobToQbo.schema.json'), 'utf-8')
);
const makeTriggerSchemaJson = JSON.parse(
  readFileSync(join(__dirname, '../src/schemas/make.trigger.schema.json'), 'utf-8')
);

// Compile schemas
const validateEnvelope = ajv.compile(envelopeSchemaJson);
const validateJobTreadQuery = ajv.compile(jobtreadQuerySchemaJson);
const validateJobTreadPushJobToQbo = ajv.compile(jobtreadPushJobToQboSchemaJson);
const validateMakeTrigger = ajv.compile(makeTriggerSchemaJson);

// Create Fastify instance
const app = Fastify({ logger: false });

// Add content parser
app.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (req, body, done) => {
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

// Idempotency cache
const idempotencyCache = new Map<string, any>();

// Health check
app.get('/health', async () => {
  return { status: 'ok' };
});

// Main endpoint
app.post('/v1/actions/execute', async (request, reply) => {
  const startTime = Date.now();
  let traceId: string | undefined;
  let brand: 'DB' | 'CI' | undefined;
  let action: string | undefined;
  let mode: 'dry_run' | 'execute' | undefined;

  try {
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

    const hmacSecret = process.env.HMAC_SECRET;
    if (!hmacSecret) {
      throw new Error('HMAC_SECRET not configured');
    }

    if (!verifyHmacSignature(rawBody, signature, hmacSecret)) {
      reply.code(401);
      return { ok: false, error: 'Invalid HMAC signature' };
    }

    const brandResult = getBrandFromGatewayKey(gatewayKey);
    if (!brandResult) {
      reply.code(401);
      return { ok: false, error: 'Invalid gateway key' };
    }
    brand = brandResult;

    const envelope = request.body as any;
    if (!validateEnvelope(envelope)) {
      reply.code(422);
      return {
        ok: false,
        error: 'Invalid request format',
        details: validateEnvelope.errors
      };
    }

    traceId = createTraceId();
    action = envelope.action as string;
    mode = envelope.mode as 'dry_run' | 'execute';

    let paramsValid = false;
    let paramsValidator: any;

    switch (action) {
      case 'echo':
        paramsValid = true;
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

    const idempotencyKey = `${action}:${brand}:${envelope.idempotencyKey}`;
    if (mode === 'execute' && idempotencyCache.has(idempotencyKey)) {
      return idempotencyCache.get(idempotencyKey);
    }

    let grantKey: string | undefined;
    if (action.startsWith('jobtread.')) {
      grantKey = getGrantKeyForBrand(brand);
    }

    let result: any;
    let notes: string[] = [];

    switch (action) {
      case 'echo':
        result = executeEcho(envelope.params, traceId);
        break;
      case 'jobtread.query':
        const queryResult = await executeJobTreadQuery(envelope.params, brand, grantKey!, mode);
        result = queryResult.result;
        notes = queryResult.notes || [];
        break;
      case 'jobtread.pushJobToQbo':
        const pushResult = await executeJobTreadPushJobToQbo(envelope.params, brand, grantKey!, mode);
        result = pushResult.result;
        notes = pushResult.notes || [];
        break;
      case 'make.trigger':
        const triggerResult = await executeMakeTrigger(envelope.params, mode);
        result = triggerResult.result;
        notes = triggerResult.notes || [];
        break;
    }

    const duration = Date.now() - startTime;
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

    const response = { ok: true, traceId, result, notes };
    if (mode === 'execute') {
      idempotencyCache.set(idempotencyKey, response);
    }

    return response;

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (!traceId) {
      traceId = createTraceId();
    }

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

    reply.code(500);
    return {
      ok: false,
      traceId,
      error: errorMessage
    };
  }
});

// Admin logs
app.get('/admin/logs', async (request, reply) => {
  try {
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

    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    if (username !== adminUser || password !== adminPass) {
      reply.code(401);
      reply.header('WWW-Authenticate', 'Basic realm="Admin Area"');
      return { ok: false, error: 'Invalid credentials' };
    }

    const { traceId, brand, action, status } = request.query as {
      traceId?: string;
      brand?: 'DB' | 'CI';
      action?: string;
      status?: 'success' | 'error' | 'warning';
    };

    const filters: any = {};
    if (traceId) filters.traceId = traceId;
    if (brand) filters.brand = brand;
    if (action) filters.action = action;
    if (status) filters.status = status;

    const logs = getLogs(filters);
    return { ok: true, logs };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    reply.code(500);
    return { ok: false, error: errorMessage };
  }
});

// Vercel serverless handler
export default async function handler(req: any, res: any) {
  await app.ready();
  app.server.emit('request', req, res);
}
