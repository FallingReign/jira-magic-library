/**
 * Payload Preview
 *
 * Shows "here is what I will send to Jira" without calling create.
 * Runs the same resolution + conversion + adaptation flow, then returns
 * the fully resolved payload with metadata about each field resolution.
 */

import type { JiraClient } from '../client/JiraClient.js';
import type { SchemaDiscovery } from '../schema/SchemaDiscovery.js';
import type { FieldResolver } from '../converters/FieldResolver.js';
import type { ConverterRegistry } from '../converters/ConverterRegistry.js';
import type { CloudCreateAdapter } from './CloudCreateAdapter.js';
import type { EndpointResolver } from '../client/EndpointResolver.js';
import type { DeploymentType, JMLConfig } from '../types/config.js';
import type { LookupCache, GenericCache } from '../types/converter.js';

/**
 * Details about how a single field was resolved.
 */
export interface FieldResolution {
  /** What the user provided (key=value) */
  input: string;
  /** Human-readable resolved value */
  resolvedTo: string;
  /** Jira field ID used */
  fieldId: string;
  /** Confidence 0-1 (1.0 = exact, lower for fuzzy) */
  confidence: number;
  /** The actual payload value sent to Jira */
  resolvedValue: unknown;
}

/**
 * Result of a payload preview.
 */
export interface PreviewResult {
  /** The fully resolved payload that would be sent to Jira */
  payload: { fields: Record<string, unknown> };
  /** How each field was resolved */
  resolutions: Record<string, FieldResolution>;
  /** Any warnings (e.g., low confidence matches) */
  warnings: Array<{ field: string; message: string }>;
  /** The target Jira endpoint */
  endpoint: string;
  /** Deployment type detected */
  deployment: 'server' | 'cloud';
}

export class PayloadPreview {
  constructor(
    private readonly client: JiraClient,
    private readonly schema: SchemaDiscovery,
    private readonly resolver: FieldResolver,
    private readonly converter: ConverterRegistry,
    private readonly cloudAdapter: CloudCreateAdapter | undefined,
    private readonly endpointResolverFn: () => Promise<EndpointResolver>,
    private readonly deploymentFn: () => Promise<DeploymentType>,
    private readonly cache?: LookupCache,
    private readonly config?: JMLConfig
  ) {}

  /**
   * Preview a single issue creation payload.
   *
   * Runs resolution, conversion, and adaptation without POSTing to Jira.
   */
  async preview(input: Record<string, unknown>): Promise<PreviewResult> {
    const warnings: Array<{ field: string; message: string }> = [];
    const resolutions: Record<string, FieldResolution> = {};

    // Capture original input keys for resolution tracking
    const originalInput = { ...input };

    // Strip library-internal fields
    const { uid: _uid, ...cleanInput } = input;

    // Step 1: Resolve field names → Jira field IDs
    let projectKey: string;
    let issueType: string;
    let resolvedFields: Record<string, unknown>;

    try {
      const result = await this.resolver.resolveFieldsWithExtraction(cleanInput);
      projectKey = result.projectKey;
      issueType = result.issueType;
      resolvedFields = result.fields;
    } catch (err) {
      // If resolution fails, return partial result with warning
      const endpoint = await this.resolveEndpoint();
      const deployment = await this.resolveDeployment();
      warnings.push({
        field: '_resolution',
        message: `Field resolution failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return {
        payload: { fields: {} },
        resolutions,
        warnings,
        endpoint,
        deployment,
      };
    }

    // Step 2: Convert values using schema
    let convertedFields: Record<string, unknown>;
    try {
      const projectSchema = await this.schema.getFieldsForIssueType(projectKey, issueType);
      convertedFields = await this.converter.convertFields(
        projectSchema,
        resolvedFields,
        {
          projectKey,
          issueType,
          cache: this.cache,
          cacheClient: this.cache as unknown as GenericCache,
          client: this.client,
          config: this.config,
        }
      );
    } catch (err) {
      // Conversion failure — use resolved fields as-is
      convertedFields = resolvedFields;
      warnings.push({
        field: '_conversion',
        message: `Conversion failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Step 3: Build payload and adapt for deployment
    let payload: Record<string, unknown> = { fields: convertedFields };
    if (this.cloudAdapter) {
      payload = this.cloudAdapter.adaptPayload(payload);
    }

    // Step 4: Build resolution details by comparing input vs output
    const finalFields = payload.fields as Record<string, unknown>;
    this.buildResolutions(originalInput, finalFields, resolutions, warnings);

    // Resolve endpoint and deployment
    const endpoint = await this.resolveEndpoint();
    const deployment = await this.resolveDeployment();

    return {
      payload: { fields: finalFields },
      resolutions,
      warnings,
      endpoint,
      deployment,
    };
  }

  /**
   * Preview multiple issues (bulk).
   */
  async previewBulk(inputs: Array<Record<string, unknown>>): Promise<PreviewResult[]> {
    return Promise.all(inputs.map((input) => this.preview(input)));
  }

  /**
   * Build resolution metadata by comparing input keys to output field IDs.
   */
  private buildResolutions(
    originalInput: Record<string, unknown>,
    finalFields: Record<string, unknown>,
    resolutions: Record<string, FieldResolution>,
    warnings: Array<{ field: string; message: string }>
  ): void {
    // Build a reverse map: original key → final field ID
    // We compare normalized forms to detect matches
    const inputKeys = Object.keys(originalInput).filter(
      (k) => k !== 'uid'
    );

    for (const inputKey of inputKeys) {
      const inputValue = originalInput[inputKey];
      const normalizedInput = inputKey.toLowerCase().replace(/[\s_-]/g, '');

      // Find corresponding output field
      let matchedFieldId: string | undefined;
      let matchedValue: unknown;
      let confidence = 1.0;

      for (const [fieldId, fieldValue] of Object.entries(finalFields)) {
        const normalizedFieldId = fieldId.toLowerCase().replace(/[\s_-]/g, '');
        if (normalizedFieldId === normalizedInput) {
          matchedFieldId = fieldId;
          matchedValue = fieldValue;
          confidence = 1.0; // exact match
          break;
        }
      }

      // If no exact match, try partial matching
      if (!matchedFieldId) {
        for (const [fieldId, fieldValue] of Object.entries(finalFields)) {
          const normalizedFieldId = fieldId.toLowerCase().replace(/[\s_-]/g, '');
          if (
            normalizedFieldId.includes(normalizedInput) ||
            normalizedInput.includes(normalizedFieldId)
          ) {
            matchedFieldId = fieldId;
            matchedValue = fieldValue;
            confidence = 0.7; // fuzzy match
            break;
          }
        }
      }

      if (matchedFieldId) {
        resolutions[inputKey] = {
          input: String(inputValue),
          resolvedTo: this.describeValue(matchedValue),
          fieldId: matchedFieldId,
          confidence,
          resolvedValue: matchedValue,
        };

        if (confidence < 0.8) {
          warnings.push({
            field: inputKey,
            message: `Low confidence match (${confidence.toFixed(2)}): "${inputKey}" → "${matchedFieldId}"`,
          });
        }
      } else {
        // Field was consumed or not found in output (e.g. project/issuetype get restructured)
        // Check if it's a system field that got transformed
        const systemFields = ['project', 'issuetype', 'issue type'];
        const isSystem = systemFields.some(
          (sf) => normalizedInput === sf.replace(/[\s_-]/g, '')
        );

        if (isSystem) {
          // Find it in the final payload
          const sysFieldId = normalizedInput.includes('issue') ? 'issuetype' : 'project';
          const sysValue = finalFields[sysFieldId];
          if (sysValue !== undefined) {
            resolutions[inputKey] = {
              input: String(inputValue),
              resolvedTo: this.describeValue(sysValue),
              fieldId: sysFieldId,
              confidence: 1.0,
              resolvedValue: sysValue,
            };
          }
        }
      }
    }
  }

  /**
   * Describe a resolved value in human-readable form.
   */
  private describeValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      // Common Jira object patterns
      if (obj.key) return `{key: ${obj.key}}`;
      if (obj.name) return `{name: ${obj.name}}`;
      if (obj.id) return `{id: ${obj.id}}`;
      if (obj.accountId) return `{accountId: ${obj.accountId}}`;
      if (obj.value) return `{value: ${obj.value}}`;
      if (obj.type === 'doc') return '[ADF document]';
      return JSON.stringify(value).slice(0, 80);
    }
    return String(value);
  }

  private async resolveEndpoint(): Promise<string> {
    try {
      const resolver = await this.endpointResolverFn();
      return resolver.issueCreate();
    } catch {
      return '/rest/api/2/issue';
    }
  }

  private async resolveDeployment(): Promise<'server' | 'cloud'> {
    try {
      const dt = await this.deploymentFn();
      if (dt === 'cloud') return 'cloud';
      return 'server';
    } catch {
      return 'server';
    }
  }
}
