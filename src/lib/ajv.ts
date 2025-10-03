import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Configure Ajv instance for JSON Schema validation
const ajv = new Ajv({
  allErrors: true,
  removeAdditional: false,
  strict: true
});

// Add format validators (uri, email, etc.)
addFormats(ajv);

export default ajv;
