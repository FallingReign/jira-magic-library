import type { SchemaDiscovery } from '../schema/SchemaDiscovery.js';
import type { FieldResolver } from '../converters/FieldResolver.js';
import type { ConverterRegistry } from '../converters/ConverterRegistry.js';
import type { ConversionContext } from '../types/converter.js';

/** Resolve and convert issue fields. This step never submits an issue. */
export async function prepareIssueFields(
  input: Record<string, unknown>,
  schema: SchemaDiscovery,
  resolver: FieldResolver,
  converter: ConverterRegistry,
  context: Omit<ConversionContext, 'projectKey' | 'issueType'>
): Promise<Record<string, unknown>> {
  const { projectKey, issueType, fields } = await resolver.resolveFieldsWithExtraction(input);
  const projectSchema = await schema.getFieldsForIssueType(projectKey, issueType);
  return converter.convertFields(projectSchema, fields, { ...context, projectKey, issueType, operation: 'create' });
}
