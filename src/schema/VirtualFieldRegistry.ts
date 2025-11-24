/**
 * Virtual field metadata
 * 
 * A virtual field is a field name that doesn't exist in JIRA's schema
 * but maps to a property of a real parent field.
 * 
 * Example: "Original Estimate" is a virtual field that maps to
 * the `originalEstimate` property of the `timetracking` parent field.
 */
export interface VirtualFieldDefinition {
  /** Display name shown to users: "Original Estimate" */
  name: string;
  
  /** Parent field ID in JIRA: "timetracking" */
  parentFieldId: string;
  
  /** Property path within parent: "originalEstimate" */
  propertyPath: string;
  
  /** Type for converter: "string", "number", etc. */
  type: string;
  
  /** Optional help text for users */
  description?: string;
}

/**
 * Registry for virtual field mappings
 * 
 * Keeps virtual field logic separate from core resolution logic.
 * Extensible pattern for adding new virtual field types in future stories.
 * 
 * @example
 * const registry = VirtualFieldRegistry.getInstance();
 * const virtualField = registry.get('originalestimate');
 * // { name: 'Original Estimate', parentFieldId: 'timetracking', ... }
 */
export class VirtualFieldRegistry {
  private static instance: VirtualFieldRegistry;
  private mappings = new Map<string, VirtualFieldDefinition>();

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}

  /**
   * Get singleton instance
   * Registers built-in fields automatically on first call
   */
  static getInstance(): VirtualFieldRegistry {
    if (!VirtualFieldRegistry.instance) {
      VirtualFieldRegistry.instance = new VirtualFieldRegistry();
      VirtualFieldRegistry.registerBuiltInFields();
    }
    return VirtualFieldRegistry.instance;
  }

  /**
   * Register built-in virtual fields
   * Called automatically on first getInstance()
   */
  private static registerBuiltInFields(): void {
    const registry = VirtualFieldRegistry.getInstance();

    // Time tracking sub-fields
    registry.register('originalestimate', {
      name: 'Original Estimate',
      parentFieldId: 'timetracking',
      propertyPath: 'originalEstimate',
      type: 'string',
      description: 'Original time estimate for the issue'
    });

    registry.register('remainingestimate', {
      name: 'Remaining Estimate',
      parentFieldId: 'timetracking',
      propertyPath: 'remainingEstimate',
      type: 'string',
      description: 'Remaining time estimate for the issue'
    });
  }

  /**
   * Register a virtual field mapping
   * 
   * @param normalizedName - Normalized field name (lowercase, no spaces)
   * @param definition - Virtual field metadata
   * 
   * @example
   * registry.register('originalestimate', {
   *   name: 'Original Estimate',
   *   parentFieldId: 'timetracking',
   *   propertyPath: 'originalEstimate',
   *   type: 'string'
   * });
   */
  register(normalizedName: string, definition: VirtualFieldDefinition): void {
    this.mappings.set(normalizedName, definition);
  }

  /**
   * Get virtual field by normalized name
   * 
   * @param normalizedName - Normalized field name (lowercase, no spaces)
   * @returns Virtual field definition or undefined
   * 
   * @example
   * const field = registry.get('originalestimate');
   * // { name: 'Original Estimate', parentFieldId: 'timetracking', ... }
   */
  get(normalizedName: string): VirtualFieldDefinition | undefined {
    return this.mappings.get(normalizedName);
  }

  /**
   * Get all virtual fields for a parent field
   * Useful for schema discovery to generate virtual fields
   * 
   * @param parentFieldId - Parent field ID (e.g., "timetracking")
   * @returns Array of virtual field definitions
   * 
   * @example
   * const virtualFields = registry.getByParentField('timetracking');
   * // [
   * //   { name: 'Original Estimate', ... },
   * //   { name: 'Remaining Estimate', ... }
   * // ]
   */
  getByParentField(parentFieldId: string): VirtualFieldDefinition[] {
    return Array.from(this.mappings.values()).filter(
      (def) => def.parentFieldId === parentFieldId
    );
  }
}
