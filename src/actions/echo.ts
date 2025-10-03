/**
 * Echo action - simplest action for testing the pipeline
 * @param params - Any parameters to echo back
 * @param traceId - Trace ID for the request
 * @returns Echo response with params, traceId, and timestamp
 */
export function executeEcho(params: any, traceId: string) {
  return {
    echo: params,
    traceId: traceId,
    timestamp: new Date().toISOString()
  };
}
