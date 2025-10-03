import { httpRequest } from '../lib/http.js';

export interface JobTreadPushJobToQboParams {
  jobId: string;
}

/**
 * Pushes a JobTread job to QuickBooks Online
 * @param params - Parameters with jobId
 * @param brand - Brand identifier (DB or CI)
 * @param grantKey - JobTread grant key for authentication
 * @param mode - Execution mode (dry_run or execute)
 * @returns Push result
 */
export async function executeJobTreadPushJobToQbo(
  params: JobTreadPushJobToQboParams,
  brand: 'DB' | 'CI',
  grantKey: string,
  mode: 'dry_run' | 'execute'
) {
  // Dry run mode - return validation message
  if (mode === 'dry_run') {
    return {
      result: `Dry run: Would push job ${params.jobId} to QuickBooks Online via JobTread API.`,
      notes: ['This is a side-effect action - idempotency is enforced by the server']
    };
  }

  // Execute mode - make actual API call
  try {
    // Build Pave body for pushJobToQbo mutation
    const paveBody = {
      version: {},
      $: {
        grantKey: grantKey,
        timeZone: 'America/Chicago'
      },
      currentGrant: {
        _type: {},
        id: {}
      },
      pushJobToQbo: {
        _type: {},
        $: { id: params.jobId },
        job: {
          _type: {},
          $: { id: params.jobId },
          id: {},
          qboId: {}
        }
      }
    };

    // Make POST request to JobTread API
    const response = await httpRequest({
      url: 'https://api.jobtread.com/pave',
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: paveBody,
      timeout: 20000,
      maxRetries: 2
    });

    return {
      result: response.data,
      notes: [`Job ${params.jobId} pushed to QuickBooks Online successfully`]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to push job to QuickBooks: ${errorMessage}`);
  }
}
