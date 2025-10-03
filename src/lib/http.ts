import { request } from 'undici';

export interface HttpRequestOptions {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | object;
  timeout?: number; // milliseconds
  maxRetries?: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string | string[]>;
  data: any;
}

/**
 * Makes HTTP request with retry logic and exponential backoff
 * @param options - Request configuration
 * @returns Response with status, headers, and parsed JSON data
 * @throws Error after all retries exhausted
 */
export async function httpRequest(options: HttpRequestOptions): Promise<HttpResponse> {
  const {
    url,
    method,
    headers = {},
    body,
    timeout = 20000, // 20 seconds default
    maxRetries = 2
  } = options;

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      // Prepare request body
      let requestBody: string | undefined;
      let requestHeaders = { ...headers };

      if (body) {
        if (typeof body === 'string') {
          requestBody = body;
        } else {
          requestBody = JSON.stringify(body);
          if (!requestHeaders['content-type']) {
            requestHeaders['content-type'] = 'application/json';
          }
        }
      }

      // Make request
      const response = await request(url, {
        method,
        headers: requestHeaders,
        body: requestBody,
        headersTimeout: timeout,
        bodyTimeout: timeout
      });

      // Read response body
      const responseText = await response.body.text();

      // Parse JSON response
      let data: any;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch (parseError) {
        // If JSON parsing fails, return raw text
        data = responseText;
      }

      // Convert headers to plain object
      const responseHeaders: Record<string, string | string[]> = {};
      for (const [key, value] of Object.entries(response.headers)) {
        responseHeaders[key] = value as string | string[];
      }

      return {
        status: response.statusCode,
        headers: responseHeaders,
        data
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      attempt++;

      // If we've exhausted retries, throw the error
      if (attempt > maxRetries) {
        throw new Error(
          `HTTP request failed after ${maxRetries + 1} attempts: ${lastError.message}`
        );
      }

      // Exponential backoff: 1s, 2s
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('HTTP request failed');
}
