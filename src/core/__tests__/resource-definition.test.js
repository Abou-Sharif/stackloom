import { describe, it, expect } from 'vitest';
import { ResourceDefinition, parseFieldSpec } from '../resource-definition.js';

describe('ResourceDefinition', () => {
  it('should parse compact field spec', () => {
    const spec = 'email:email[required]|unique';
    const field = parseFieldSpec(spec);
    expect(field.name).toBe('email');
    expect(field.type).toBe('email');
    expect(field.validation.required).toBe(true);
    expect(field.validation.unique).toBe(true);
  });

  it('should parse select options', () => {
    const spec = 'role:select[admin,user,guest]';
    const field = parseFieldSpec(spec);
    expect(field.special.options).toEqual(['admin', 'user', 'guest']);
  });

  it('should create ResourceDefinition instance', () => {
    const def = new ResourceDefinition({
      name: 'Product',
      fields: [
        { name: 'name', type: 'string', validation: { required: true } },
        { name: 'price', type: 'number', validation: { min: 0 } }
      ]
    });
    expect(def.pascalName).toBe('Product');
    expect(def.kebabName).toBe('product');
    expect(def.fields.length).toBe(2);
  });
});
