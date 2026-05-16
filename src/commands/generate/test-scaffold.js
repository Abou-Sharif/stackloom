#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';

/**
 * Generate test scaffolding for modules
 */
export async function generateModuleTests(moduleName, testsDir) {
  const pascalName = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
  
  return `const request = require('supertest');
const { ${pascalName}Model } = require('../${moduleName}/${moduleName}.model');
const app = require('../../app');

describe('${pascalName} Module API', () => {
  let test${pascalName}Id;

  beforeAll(async () => {
    // Setup test database connection
    await connectToTestDatabase();
  });

  afterAll(async () => {
    // Cleanup test database
    await ${pascalName}Model.deleteMany({});
    await disconnectFromTestDatabase();
  });

  describe('POST /api/${moduleName} - Create', () => {
    it('should create a new ${moduleName}', async () => {
      const new${pascalName} = {
        name: 'Test ${pascalName}',
        // Add required fields based on schema
      };

      const response = await request(app)
        .post('/api/${moduleName}')
        .send(new${pascalName})
        .expect(201);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.name).toBe(new${pascalName}.name);
      
      test${pascalName}Id = response.body.data._id;
    });

    it('should return 400 for invalid data', async () => {
      await request(app)
        .post('/api/${moduleName}')
        .send({}) // Empty body
        .expect(400);
    });
  });

  describe('GET /api/${moduleName} - List', () => {
    it('should list all ${moduleName}s', async () => {
      const response = await request(app)
        .get('/api/${moduleName}')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/${moduleName}?page=1&limit=10')
        .expect(200);

      expect(response.body).toHaveProperty('data');
    });
  });

  describe('GET /api/${moduleName}/:id - Get One', () => {
    it('should get a single ${moduleName}', async () => {
      const response = await request(app)
        .get(\`/api/${moduleName}/\${test${pascalName}Id}\`)
        .expect(200);

      expect(response.body.data._id).toBe(test${pascalName}Id);
    });

    it('should return 404 for non-existent ${moduleName}', async () => {
      await request(app)
        .get('/api/${moduleName}/507f1f77bcf86cd799439011')
        .expect(404);
    });
  });

  describe('PUT /api/${moduleName}/:id - Update', () => {
    it('should update a ${moduleName}', async () => {
      const updatedData = {
        name: 'Updated ${pascalName} Name',
      };

      const response = await request(app)
        .put(\`/api/${moduleName}/\${test${pascalName}Id}\`)
        .send(updatedData)
        .expect(200);

      expect(response.body.data.name).toBe(updatedData.name);
    });

    it('should return 404 for updating non-existent ${moduleName}', async () => {
      await request(app)
        .put('/api/${moduleName}/507f1f77bcf86cd799439011')
        .send({ name: 'Updated' })
        .expect(404);
    });
  });

  describe('DELETE /api/${moduleName}/:id - Delete', () => {
    it('should delete a ${moduleName}', async () => {
      await request(app)
        .delete(\`/api/${moduleName}/\${test${pascalName}Id}\`)
        .expect(200);

      // Verify deletion
      await request(app)
        .get(\`/api/${moduleName}/\${test${pascalName}Id}\`)
        .expect(404);
    });

    it('should return 404 when deleting non-existent ${moduleName}', async () => {
      await request(app)
        .delete('/api/${moduleName}/507f1f77bcf86cd799439011')
        .expect(404);
    });
  });

  describe('Validation Tests', () => {
    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/${moduleName}')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should validate field types', async () => {
      const response = await request(app)
        .post('/api/${moduleName}')
        .send({ name: 12345 }) // Wrong type
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});
`;
}

export async function generateFrontendTests(componentName) {
  return `import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ${componentName}Page } from './${componentName}Page';
import '@testing-library/jest-dom';

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { name: 'Test User', email: 'test@example.com' },
  }),
}));

describe('${componentName}Page', () => {
  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <${componentName}Page />
      </BrowserRouter>
    );
  };

  it('should render the page title', () => {
    renderComponent();
    expect(screen.getByText('${componentName}')).toBeInTheDocument();
  });

  it('should display user name', () => {
    renderComponent();
    expect(screen.getByText(/Test User/i)).toBeInTheDocument();
  });

  describe('Page structure', () => {
    it('should have main sections', () => {
      renderComponent();
      expect(screen.getByRole('main')).toBeInTheDocument();
    });
  });
});
`;
}

export async function generateApiTests(moduleName) {
  const pascalName = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
  
  return `import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../app';
import { ${pascalName}Model } from '../../src/modules/${moduleName}/${moduleName}.model';

describe('${pascalName} API Integration Tests', () => {
  let testId;

  beforeAll(async () => {
    // Clear collection before tests
    await ${pascalName}Model.deleteMany({});
  });

  afterAll(async () => {
    await ${pascalName}Model.deleteMany({});
  });

  describe('CRUD Operations', () => {
    it('should create a ${moduleName}', async () => {
      const response = await request(app)
        .post('/api/${moduleName}')
        .send({
          name: 'Integration Test ${pascalName}',
        })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.name).toBe('Integration Test ${pascalName}');
      testId = response.body.data._id;
    });

    it('should retrieve all ${moduleName}s', async () => {
      const response = await request(app)
        .get('/api/${moduleName}')
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should retrieve a single ${moduleName}', async () => {
      const response = await request(app)
        .get(\`/api/${moduleName}/\${testId}\`)
        .expect(200);

      expect(response.body.data._id).toBe(testId);
    });

    it('should update a ${moduleName}', async () => {
      const response = await request(app)
        .put(\`/api/${moduleName}/\${testId}\`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(response.body.data.name).toBe('Updated Name');
    });

    it('should delete a ${moduleName}', async () => {
      await request(app)
        .delete(\`/api/${moduleName}/\${testId}\`)
        .expect(200);

      // Verify it's gone
      await request(app)
        .get(\`/api/${moduleName}/\${testId}\`)
        .expect(404);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent ${moduleName}', async () => {
      await request(app)
        .get('/api/${moduleName}/507f1f77bcf86cd799439011')
        .expect(404);
    });
  });
});
`;
}
