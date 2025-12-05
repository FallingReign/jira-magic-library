/**
 * Unified Test Matrix Helper
 * 
 * Provides dynamic field discovery and converter mapping for unified integration tests.
 * Maps JIRA schema fields to available type converters to exercise all converters in minimal issues.
 * 
 * Story: E3-S13 - Unified Integration Suite (Minimal Issues)
 * AC2: Dynamic Field Discovery via CreateMeta
 * AC3: Exercise All Converters In A Single Issue
 */

import { SchemaDiscovery } from '../../src/schema/SchemaDiscovery.js';
import { FieldSchema } from '../../src/types/schema.js';
import { TEST_USER_EMAIL } from './test-users.js';

/**
 * Converter matrix - maps JIRA field types to our converter types
 */
const CONVERTER_MATRIX = {
  // Basic types
  string: 'string',
  text: 'text', 
  number: 'number',
  date: 'date',
  datetime: 'datetime',
  
  // Complex types
  array: 'array',
  priority: 'priority',
  user: 'user',
  option: 'option',
  'option-with-child': 'option-with-child',
  component: 'component',
  version: 'version',
  timetracking: 'timetracking',
  issuetype: 'issuetype',
  project: 'project',
} as const;

/**
 * Representative test values for each converter type
 * These should be valid for most JIRA instances
 */
const TEST_VALUES = {
  string: 'Test Summary via Unified Suite',
  text: 'Test description with multiple lines\nCreated by unified integration test\nFor converter validation',
  number: 42,
  date: '2025-12-31',
  datetime: '2025-12-31T23:59:59.000Z',
  array: ['All'], // Generic array value - "All" is a common option in many arrays
  priority: 'P3 - Medium',  // instance specific priority format
  user: TEST_USER_EMAIL, // Use primary email to avoid ambiguity
  option: 'Not Started', // Production Phase value for Task issues
  'option-with-child': 'MP -> mp_apartment', // Valid cascading select for Level field
  component: 'Frontend', // Common component name  
  version: '1.0.0', // Generic version
  timetracking: { 
    originalEstimate: '2h',
    remainingEstimate: '1h'
  }, // Object format expected by JIRA API
  issuetype: 'Task', // Will be converted to issuetype object
  project: process.env.JIRA_PROJECT_KEY || 'PROJ', // Current project
} as const;

/**
 * Fields to skip because they require instance-specific valid values
 * These fields will be excluded from converter testing to avoid validation errors
 * 
 * Note: Reduced for maximum converter coverage - allowing generic component/version testing
 */
const SKIP_FIELDS = new Set([
  'fixVersions', // System field with strict validation 
  'affectedVersion', // System field with strict validation
  'affectedVersions', // System field with strict validation
  'versions', // System field with strict validation
  // Removed 'components' - will attempt with generic fallback
]);

/**
 * Field name patterns to skip (case-insensitive)
 * These patterns match fields that typically require project-specific data
 * 
 * Note: Reduced for maximum converter coverage
 */
const SKIP_FIELD_PATTERNS = [
  /fixversion/i, // System version fields with strict validation
  /affectedversion/i, // System version fields with strict validation  
  // Removed /version/i and /component/i patterns to allow testing generic values
];

/**
 * Converter types to skip because they're too instance-specific
 * Even though we can detect them, the test values rarely work
 * 
 * Note: All converters now enabled for maximum coverage in unified suite
 */
const SKIP_CONVERTER_TYPES = new Set<string>([
  // All converters enabled - using generic test values like priority
]);

/**
 * Get appropriate test value for option fields based on the specific field name
 * Different fields have different valid option values
 */
function getOptionValueForField(fieldName: string, _issueType: string): string {
  // Bug-specific fields
  if (fieldName === 'Repeatability') {
    return 'Always - 100%'; // Valid for Bug Repeatability field
  }
  
  // Task-specific fields  
  if (fieldName === 'Production Phase') {
    return 'Not Started'; // Valid for Task Production Phase field
  }
  
  // Default option value - use most common one
  return 'Not Started';
}

/**
 * Check if a field should be skipped for a specific issue type
 * Some fields have different validation rules between issue types
 */
function shouldSkipFieldForIssueType(fieldId: string, fieldName: string, issueType: string): boolean {
  // Skip priority for Bug issues - they often have different priority schemes
  if (fieldId === 'priority' && issueType === 'Bug') {
    return true;
  }
  
  // Apply general skip logic
  return shouldSkipField(fieldId, fieldName);
}

/**
 * Check if a field should be skipped due to instance-specific constraints
 */
function shouldSkipField(fieldId: string, fieldName: string): boolean {
  // Skip specific field IDs
  if (SKIP_FIELDS.has(fieldId)) {
    return true;
  }
  
  // Skip based on field name patterns (but allow basic array fields)
  if (SKIP_FIELD_PATTERNS.some(pattern => pattern.test(fieldName))) {
    return true;
  }
  
  return false;
}

/**
 * Passthrough test values (already in JIRA API format)
 * These test that converters don't alter valid JIRA API objects
 */
const PASSTHROUGH_VALUES = {
  priority: { id: '3' }, // Medium priority ID
  user: { accountId: 'auser@company.com' },
  option: { value: 'Not Started' },
  component: { id: '10000' },
  version: { id: '10000' },
  issuetype: { id: '10001' },
  project: { key: process.env.JIRA_PROJECT_KEY || 'PROJ' },
} as const;

export interface FieldMapping {
  fieldId: string;
  fieldName: string;
  converterType: string;
  friendlyValue: any;
  passthroughValue?: any;
  schema: FieldSchema;
}

export interface IssueTypeMatrix {
  issueTypeId: string;
  issueTypeName: string;
  mappedFields: FieldMapping[];
  unmappedFields: FieldSchema[];
}

/**
 * Discovers available fields for an issue type and maps them to converters
 */
export class UnifiedTestMatrix {
  constructor(private schemaDiscovery: SchemaDiscovery) {}

  /**
   * Get field mappings for an issue type to exercise all converters
   */
  async getFieldMappings(projectKey: string, issueTypeName: string): Promise<IssueTypeMatrix> {
    // Get schema for this issue type
    const projectSchema = await this.schemaDiscovery.getFieldsForIssueType(projectKey, issueTypeName);
    const schema = projectSchema.fields; // Extract the actual fields
    
    const mappedFields: FieldMapping[] = [];
    const unmappedFields: FieldSchema[] = [];
    const usedConverters = new Set<string>();

    // Debug: Log first few fields to understand schema structure
    const fieldEntries = Object.entries(schema);
    console.log(`   🔍 Debug: Found ${fieldEntries.length} fields for ${issueTypeName}`);
    for (const [fieldId, fieldSchema] of fieldEntries.slice(0, 5)) {
      console.log(`      ${fieldId}: ${fieldSchema.name} (type: ${fieldSchema.type}, schema: ${JSON.stringify(fieldSchema.schema)})`);
    }

    // Map fields to converters, preferring one field per converter type
    for (const [fieldId, fieldSchema] of Object.entries(schema)) {
      // Skip fields that require instance-specific data or are problematic for this issue type
      if (shouldSkipFieldForIssueType(fieldId, fieldSchema.name || '', issueTypeName)) {
        console.log(`   🚫 Skipped ${fieldSchema.name} (${fieldId}) - requires instance-specific data`);
        unmappedFields.push(fieldSchema);
        continue;
      }

      const converterType = this.getConverterType(fieldSchema);
      
      if (converterType && !usedConverters.has(converterType) && !SKIP_CONVERTER_TYPES.has(converterType)) {
        // Get the appropriate test value for this field
        let testValue = TEST_VALUES[converterType as keyof typeof TEST_VALUES];
        
        // Use dynamic option values for option fields
        if (converterType === 'option') {
          testValue = getOptionValueForField(fieldSchema.name || '', issueTypeName);
        }
        
        // Map this field to exercise this converter
        const mapping: FieldMapping = {
          fieldId,
          fieldName: fieldSchema.name,
          converterType,
          friendlyValue: testValue,
          schema: fieldSchema,
        };

        // Add passthrough value if available
        if (converterType in PASSTHROUGH_VALUES) {
          mapping.passthroughValue = PASSTHROUGH_VALUES[converterType as keyof typeof PASSTHROUGH_VALUES];
        }

        mappedFields.push(mapping);
        usedConverters.add(converterType);
        console.log(`   ✅ Mapped ${fieldSchema.name} (${fieldId}) → ${converterType}`);
      } else if (converterType) {
        console.log(`   ⚠️  Skipped ${fieldSchema.name} (${fieldId}) → ${converterType} (already used)`);
      } else {
        // Field doesn't map to a converter
        unmappedFields.push(fieldSchema);
      }
    }

    // Get issue type ID for metadata
    const issueTypes = await this.schemaDiscovery.getIssueTypesForProject(projectKey);
    const issueType = issueTypes.find(it => it.name === issueTypeName);
    
    return {
      issueTypeId: issueType?.id || 'unknown',
      issueTypeName,
      mappedFields,
      unmappedFields,
    };
  }

  /**
   * Get optimal issue type pairs to exercise all converters in minimal issues
   * Returns Task + Bug configuration that covers all converters
   */
  async getOptimalIssueTypes(projectKey: string): Promise<{
    taskMatrix: IssueTypeMatrix;
    bugMatrix: IssueTypeMatrix;
    allConverters: string[];
    coverageReport: { covered: string[]; missing: string[] };
  }> {
    // Get field mappings for Task and Bug
    const taskMatrix = await this.getFieldMappings(projectKey, 'Task');
    const bugMatrix = await this.getFieldMappings(projectKey, 'Bug');

    // Collect all available converters
    const allConverters = Object.values(CONVERTER_MATRIX);
    
    // Check coverage
    const coveredConverters = new Set([
      ...taskMatrix.mappedFields.map(f => f.converterType),
      ...bugMatrix.mappedFields.map(f => f.converterType),
    ]);

    const covered = Array.from(coveredConverters);
    const missing = allConverters.filter(c => !coveredConverters.has(c));

    return {
      taskMatrix,
      bugMatrix,
      allConverters,
      coverageReport: { covered, missing },
    };
  }

  /**
   * Map JIRA field schema to our converter type
   */
  private getConverterType(fieldSchema: FieldSchema): string | null {
    // Special case: description field should always use text converter
    if (fieldSchema.id === 'description') {
      return 'text';
    }

    // Direct mapping for most types
    if (fieldSchema.type in CONVERTER_MATRIX) {
      return CONVERTER_MATRIX[fieldSchema.type as keyof typeof CONVERTER_MATRIX];
    }

    // Special cases based on field characteristics
    if (fieldSchema.type === 'array') {
      // Check what kind of array from the schema items property
      const itemType = fieldSchema.schema?.items;
      if (itemType === 'component') return shouldSkipField(fieldSchema.id, fieldSchema.name || '') ? null : 'component';
      if (itemType === 'version') return shouldSkipField(fieldSchema.id, fieldSchema.name || '') ? null : 'version'; // Now attempt version arrays with generic values
      if (itemType === 'string' && fieldSchema.name?.toLowerCase().includes('label')) return 'array'; // Labels are safe
      if (itemType === 'string') return 'array'; // Generic string arrays
      return 'array'; // Default array handling for unknown types
    }

    if (fieldSchema.type === 'option') {
      // Check if it has children (cascading select)
      if (fieldSchema.allowedValues?.some((option: any) => option.children)) {
        return 'option-with-child';
      }
      return 'option';
    }

    // Field name based heuristics
    const fieldName = fieldSchema.name?.toLowerCase() || '';
    
    if (!fieldName) return null; // Skip fields with no name
    
    if (fieldName.includes('description')) return 'text'; // Multi-line text fields
    if (fieldName.includes('priority')) return 'priority';
    if (fieldName.includes('assignee') || fieldName.includes('reporter')) return 'user';
    if (fieldName.includes('component')) return 'component';
    if (fieldName.includes('version')) return 'version';
    if (fieldName.includes('timetracking') || fieldName.includes('time spent')) return 'timetracking';
    if (fieldName.includes('issue type')) return 'issuetype';
    if (fieldName.includes('project')) return 'project';

    // No converter mapping found
    return null;
  }

  /**
   * Generate test summary for issues
   */
  generateSummary(issueTypeName: string, converterCount: number): string {
    return `${issueTypeName} for Unified Suite - ${converterCount} converters (${new Date().toISOString()})`;
  }

  /**
   * Generate test description
   */
  generateDescription(converterTypes: string[]): string {
    return [
      'Created by Unified Integration Suite for converter testing.',
      '',
      'Converters exercised:',
      ...converterTypes.map(type => `- ${type}`),
      '',
      'This issue validates that all field type converters work correctly',
      'in combination without conflicts or side effects.',
    ].join('\n');
  }
}
