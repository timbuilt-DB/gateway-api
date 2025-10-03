import { isHostAllowed } from '../lib/allowlist.js';
import { httpRequest } from '../lib/http.js';

export interface MakeTriggerParams {
  webhookUrl: string;
  payload: any;
}

/**
 * Triggers a Make.com webhook
 * @param params - Parameters with webhookUrl and payload
 * @param mode - Execution mode (dry_run or execute)
 * @returns Trigger result
 */
export async function executeMakeTrigger(
  params: MakeTriggerParams,
  mode: 'dry_run' | 'execute'
) {
  // Step 1: Validate webhook URL is in ALLOW_HOSTS
  if (!isHostAllowed(params.webhookUrl)) {
    throw new Error(
      `Webhook URL host not allowed: ${params.webhookUrl}. ` +
      `Host must be in ALLOW_HOSTS environment variable.`
    );
  }

  // Step 2: Dry run mode - return validation message
  if (mode === 'dry_run') {
    return {
      result: `Dry run: Would POST payload to Make.com webhook: ${params.webhookUrl}`,
      notes: ['Webhook URL validated against ALLOW_HOSTS']
    };
  }

  // Step 3: Execute mode - trigger the webhook
  try {
    const response = await httpRequest({
      url: params.webhookUrl,
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: params.payload,
      timeout: 20000,
      maxRetries: 2
    });

    return {
      result: response.data,
      notes: ['Make.com webhook triggered successfully']
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to trigger Make.com webhook: ${errorMessage}`);
  }
}
