import { lintJobTreadQuery } from '../lib/lint.js';
import { httpRequest } from '../lib/http.js';

export interface JobTreadQueryParams {
  pave: any;
}

/**
 * Executes a JobTread Pave query
 * @param params - Query parameters with pave object
 * @param brand - Brand identifier (DB or CI)
 * @param grantKey - JobTread grant key for authentication
 * @param mode - Execution mode (dry_run or execute)
 * @returns Query result with notes
 */
export async function executeJobTreadQuery(
  params: JobTreadQueryParams,
  brand: 'DB' | 'CI',
  grantKey: string,
  mode: 'dry_run' | 'execute'
) {
  // Step 1: Lint the Pave query
  const lint = lintJobTreadQuery(params.pave);

  // Step 2: If lint fails, throw error
  if (!lint.valid) {
    throw new Error(
      `JobTread query validation failed:\n${lint.errors.join('\n')}`
    );
  }

  // Step 3: Dry run mode - return validation result
  if (mode === 'dry_run') {
    return {
      result: 'Dry run: Query validated successfully. Would execute against JobTread API.',
      notes: lint.notes
    };
  }

  // Step 4: Execute mode - make actual API call
  try {
    // Build full Pave body with required wrapper
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
      ...params.pave
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
      notes: lint.notes
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`JobTread query failed: ${errorMessage}`);
  }
}
