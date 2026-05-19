import { describe, it, expect } from 'vitest';
import { ResourceDefinition, parseFieldSpec, parseRelationsSpec } from '../resource-definition.js';

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

  it('should parse ref field with target model', () => {
    const field = parseFieldSpec('categoryId:ref[Category]:required');
    expect(field.name).toBe('categoryId');
    expect(field.type).toBe('ref');
    expect(field.special.model).toBe('Category');
    expect(field.validation.required).toBe(true);
  });
});

describe('parseRelationsSpec', () => {
  it('parses a single hasMany virtual', () => {
    const { hasMany } = parseRelationsSpec('orders:hasMany:Order:customerId');
    expect(hasMany).toEqual([
      { field: 'orders', model: 'Order', foreignKey: 'customerId' },
    ]);
  });

  it('parses multiple segments', () => {
    const { hasMany } = parseRelationsSpec(
      'orders:hasMany:Order:customerId;reviews:hasMany:Review:userId',
    );
    expect(hasMany).toHaveLength(2);
    expect(hasMany[1].model).toBe('Review');
  });

  it('throws on bad segment count', () => {
    expect(() => parseRelationsSpec('orders:hasMany:Order')).toThrow(/4 parts/);
  });

  it('preserves hasMany relations on ResourceDefinition', () => {
    const def = new ResourceDefinition({
      name: 'Customer',
      fields: [{ name: 'name', type: 'string' }],
      relations: { hasMany: [{ field: 'orders', model: 'Order', foreignKey: 'customerId' }] },
    });
    expect(def.relations.hasMany).toHaveLength(1);
    expect(def.relations.hasMany[0].foreignKey).toBe('customerId');
  });
});
