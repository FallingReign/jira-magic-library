/**
 * Error classes for JIRA Magic Library
 */

export { JMLError } from './JMLError.js';
export { ValidationError } from './ValidationError.js';
export { AmbiguityError } from './AmbiguityError.js';
export { AuthenticationError } from './AuthenticationError.js';
export { CacheError } from './CacheError.js';
export { ConfigurationError } from './ConfigurationError.js';
export { HierarchyError } from './HierarchyError.js';
export { JiraServerError as JIRAApiError } from './JiraServerError.js';
export { NetworkError as ConnectionError } from './NetworkError.js';
export { NotFoundError } from './NotFoundError.js';
export { RateLimitError } from './RateLimitError.js';
export { InputParseError } from './InputParseError.js';
export { FileNotFoundError } from './FileNotFoundError.js';

// Export ConversionError (from ValidationError for now)
export { ValidationError as ConversionError } from './ValidationError.js';

// Export SchemaError (from JMLError for now)
export { JMLError as SchemaError } from './JMLError.js';
