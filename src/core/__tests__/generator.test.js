import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Generator } from '../generator.js';
import { ResourceDefinition } from '../resource-definition.js';

describe('Generator', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `loom-test-${Math.random().toString(36).slice(2)}`);
    await fs.ensureDir(tempDir);
    // Create a mock project structure
    await fs.ensureDir(path.join(tempDir, 'backend', 'src', 'modules'));
    await fs.writeJSON(path.join(tempDir, 'backend', 'package.json'), { name: 'backend' });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('should validate project root', async () => {
    const gen = new Generator({ projectRoot: os.tmpdir() });
    await expect(gen.validateProject()).rejects.toThrow(/Not a MERN Starter Kit backend/);
  });

  it('should build context correctly', async () => {
    const res = new ResourceDefinition({ name: 'Product' });
    const gen = new Generator({ projectRoot: tempDir });
    gen.resource = res;
    const context = await gen.buildContext();
    
    expect(context.resource.name).toBe('Product');
    expect(context.project.backendDir).toBe('backend');
    expect(context.utils.pascal('test')).toBe('Test');
  });

  it('should generate files (backend)', async () => {
    const res = new ResourceDefinition({ 
      name: 'Product',
      fields: [{ name: 'name', type: 'string' }]
    });
    const gen = new Generator({ projectRoot: tempDir, verbose: true });
    
    const result = await gen.generateFromDefinition(res);
    
    expect(result.files.length).toBeGreaterThan(0);
    const modelFile = path.join(tempDir, 'backend/src/modules/product/models/Product.js');
    expect(await fs.pathExists(modelFile)).toBe(true);
    
    const content = await fs.readFile(modelFile, 'utf-8');
    expect(content).toContain('ProductSchema');
    expect(content).toContain('AUTO-GENERATED');
  });

  it('should respect dry-run mode', async () => {
    const res = new ResourceDefinition({ name: 'Product' });
    const gen = new Generator({ projectRoot: tempDir, dryRun: true });
    
    const result = await gen.generateFromDefinition(res);
    
    const modelFile = path.join(tempDir, 'backend/src/modules/product/models/Product.js');
    expect(await fs.pathExists(modelFile)).toBe(false);
    expect(result.files.find(f => f.action === 'CREATE')).toBeTruthy();
  });
});
