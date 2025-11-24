import { VirtualFieldRegistry, VirtualFieldDefinition } from '../../../src/schema/VirtualFieldRegistry.js';

describe('VirtualFieldRegistry', () => {
  beforeEach(() => {
    // Reset singleton for testing
    (VirtualFieldRegistry as any).instance = undefined;
  });

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = VirtualFieldRegistry.getInstance();
      const instance2 = VirtualFieldRegistry.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should register built-in fields automatically', () => {
      const registry = VirtualFieldRegistry.getInstance();
      
      const originalEstimate = registry.get('originalestimate');
      expect(originalEstimate).toBeDefined();
      expect(originalEstimate?.name).toBe('Original Estimate');
      expect(originalEstimate?.parentFieldId).toBe('timetracking');
      
      const remainingEstimate = registry.get('remainingestimate');
      expect(remainingEstimate).toBeDefined();
      expect(remainingEstimate?.name).toBe('Remaining Estimate');
      expect(remainingEstimate?.parentFieldId).toBe('timetracking');
    });
  });

  describe('Register and Get', () => {
    it('should register and retrieve virtual field by normalized name', () => {
      const registry = VirtualFieldRegistry.getInstance();
      
      const definition: VirtualFieldDefinition = {
        name: 'Test Field',
        parentFieldId: 'parent_123',
        propertyPath: 'testProperty',
        type: 'string',
        description: 'Test description'
      };
      
      registry.register('testfield', definition);
      
      const retrieved = registry.get('testfield');
      expect(retrieved).toEqual(definition);
    });

    it('should return undefined for unregistered field', () => {
      const registry = VirtualFieldRegistry.getInstance();
      
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing registration', () => {
      const registry = VirtualFieldRegistry.getInstance();
      
      const definition1: VirtualFieldDefinition = {
        name: 'First',
        parentFieldId: 'parent_1',
        propertyPath: 'prop1',
        type: 'string'
      };
      
      const definition2: VirtualFieldDefinition = {
        name: 'Second',
        parentFieldId: 'parent_2',
        propertyPath: 'prop2',
        type: 'number'
      };
      
      registry.register('field', definition1);
      registry.register('field', definition2);
      
      const retrieved = registry.get('field');
      expect(retrieved).toEqual(definition2);
    });
  });

  describe('Get By Parent Field', () => {
    it('should return all virtual fields for parent field', () => {
      const registry = VirtualFieldRegistry.getInstance();
      
      const virtualFields = registry.getByParentField('timetracking');
      
      expect(virtualFields).toHaveLength(2);
      expect(virtualFields.some(vf => vf.name === 'Original Estimate')).toBe(true);
      expect(virtualFields.some(vf => vf.name === 'Remaining Estimate')).toBe(true);
    });

    it('should return empty array for parent with no virtual fields', () => {
      const registry = VirtualFieldRegistry.getInstance();
      
      const virtualFields = registry.getByParentField('nonexistent');
      
      expect(virtualFields).toEqual([]);
    });

    it('should handle multiple virtual fields for same parent', () => {
      const registry = VirtualFieldRegistry.getInstance();
      
      registry.register('testfield1', {
        name: 'Test Field 1',
        parentFieldId: 'parent_123',
        propertyPath: 'prop1',
        type: 'string'
      });
      
      registry.register('testfield2', {
        name: 'Test Field 2',
        parentFieldId: 'parent_123',
        propertyPath: 'prop2',
        type: 'number'
      });
      
      registry.register('otherfield', {
        name: 'Other Field',
        parentFieldId: 'parent_456',
        propertyPath: 'prop3',
        type: 'string'
      });
      
      const virtualFields = registry.getByParentField('parent_123');
      
      expect(virtualFields).toHaveLength(2);
      expect(virtualFields.every(vf => vf.parentFieldId === 'parent_123')).toBe(true);
    });
  });

  describe('Built-in Time Tracking Fields', () => {
    it('should have Original Estimate with correct metadata', () => {
      const registry = VirtualFieldRegistry.getInstance();
      
      const field = registry.get('originalestimate');
      
      expect(field).toEqual({
        name: 'Original Estimate',
        parentFieldId: 'timetracking',
        propertyPath: 'originalEstimate',
        type: 'string',
        description: 'Original time estimate for the issue'
      });
    });

    it('should have Remaining Estimate with correct metadata', () => {
      const registry = VirtualFieldRegistry.getInstance();
      
      const field = registry.get('remainingestimate');
      
      expect(field).toEqual({
        name: 'Remaining Estimate',
        parentFieldId: 'timetracking',
        propertyPath: 'remainingEstimate',
        type: 'string',
        description: 'Remaining time estimate for the issue'
      });
    });
  });
});
