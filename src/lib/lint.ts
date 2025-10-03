export interface LintResult {
  valid: boolean;
  notes: string[];
  errors: string[];
}

/**
 * Validates JobTread Pave query against business rules
 * @param pave - JobTread Pave query object
 * @returns Validation result with errors and notes
 */
export function lintJobTreadQuery(pave: any): LintResult {
  const errors: string[] = [];
  const notes: string[] = [];

  // Recursive function to check object properties
  function checkObject(obj: any, path: string = ''): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    // Rule 1: Reject contacts.nodes.email (tenant schema error)
    if (path.includes('contacts.nodes') && obj.hasOwnProperty('email')) {
      errors.push(
        `contacts.nodes.email is not supported due to tenant schema limitations. ` +
        `Use contacts.edges.node.email instead. Found at: ${path}.email`
      );
    }

    // Rule 2: Check .size properties for page size limit
    if (obj.hasOwnProperty('size')) {
      const size = obj.size;
      if (typeof size === 'number' && size > 100) {
        errors.push(
          `Page size limit exceeded: ${path}.size = ${size}. ` +
          `Maximum allowed is 100. Please use pagination for larger result sets.`
        );
      }
    }

    // Rule 3: Warn if unitPrice is used without unitCost
    if (obj.hasOwnProperty('unitPrice') && !obj.hasOwnProperty('unitCost')) {
      notes.push(
        `unitPrice used at ${path} without unitCost. ` +
        `Consider using unitCost as it is the authoritative source for pricing data.`
      );
    }

    // Recursively check nested objects and arrays
    for (const [key, value] of Object.entries(obj)) {
      const newPath = path ? `${path}.${key}` : key;

      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          checkObject(item, `${newPath}[${index}]`);
        });
      } else if (value && typeof value === 'object') {
        checkObject(value, newPath);
      }
    }
  }

  // Start recursive checking from root
  checkObject(pave);

  return {
    valid: errors.length === 0,
    notes,
    errors
  };
}
