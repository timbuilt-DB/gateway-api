import crypto from 'crypto';

/**
 * Verifies HMAC SHA256 signature using constant-time comparison
 * @param body - Request body as string
 * @param signature - Signature in format "sha256=<hex>"
 * @param secret - HMAC secret key
 * @returns true if signature is valid
 */
export function verifyHmacSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const providedSignature = signature.slice(7); // Remove "sha256=" prefix
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  // Use constant-time comparison to prevent timing attacks
  try {
    const providedBuffer = Buffer.from(providedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch (error) {
    return false;
  }
}

/**
 * Maps gateway key to brand ('DB' or 'CI')
 * @param key - Gateway key from x-gateway-key header
 * @returns 'DB' for Design Builders, 'CI' for Creative Interiors, or null if invalid
 */
export function getBrandFromGatewayKey(key: string): 'DB' | 'CI' | null {
  const GATEWAY_KEY_DB = process.env.GATEWAY_KEY_DB;
  const GATEWAY_KEY_CI = process.env.GATEWAY_KEY_CI;

  if (!GATEWAY_KEY_DB || !GATEWAY_KEY_CI) {
    throw new Error('Gateway keys not configured in environment variables');
  }

  if (key === GATEWAY_KEY_DB) {
    return 'DB';
  }

  if (key === GATEWAY_KEY_CI) {
    return 'CI';
  }

  return null;
}

/**
 * Returns JobTread grant key for the specified brand
 * @param brand - 'DB' or 'CI'
 * @returns JobTread grant key for the brand
 */
export function getGrantKeyForBrand(brand: 'DB' | 'CI'): string {
  const grantKey = brand === 'DB'
    ? process.env.JT_GRANT_KEY_DB
    : process.env.JT_GRANT_KEY_CI;

  if (!grantKey) {
    throw new Error(`JobTread grant key not configured for brand: ${brand}`);
  }

  return grantKey;
}
