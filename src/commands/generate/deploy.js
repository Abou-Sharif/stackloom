#!/usr/bin/env node

import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';

export default async function generateDeployCmd(options) {
  const spinner = ora();
  const projectRoot = process.cwd();

  // Targets might be "all"
  const targets = options.target === 'all'
    ? ['docker', 'vercel', 'railway']
    : [options.target];

  for (const target of targets) {
    switch (target) {
      case 'docker': {
        spinner.start('Generating Dockerfile...');
        const dockerfile = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN pnpm install --prod --frozen-lockfile
EXPOSE 5000
CMD ["node", "backend/server.js"]
`;
        await fs.writeFile(path.join(projectRoot, 'Dockerfile'), dockerfile);
        spinner.succeed('Dockerfile created');

        spinner.start('Generating docker-compose.yml...');
        const dc = `version: '3.8'
services:
  api:
    build: .
    ports:
      - "5000:5000"
    env_file:
      - .env
`;
        await fs.writeFile(path.join(projectRoot, 'docker-compose.yml'), dc);
        spinner.succeed('docker-compose.yml created');
        break;
      }
      case 'vercel': {
        spinner.start('Generating vercel.json...');
        const vercelJson = {
          version: 2,
          builds: [
            { src: 'frontend/package.json', use: '@vercel/static-build', config: { distDir: 'dist' } },
            { src: 'backend/package.json', use: '@vercel/node' },
          ],
          routes: [
            { src: '/api/(.*)', dest: '/backend/server.js' },
            { handle: 'filesystem' },
            { src: '/(.*)', dest: '/frontend/index.html' },
          ],
        };
        await fs.writeFile(path.join(projectRoot, 'vercel.json'), JSON.stringify(vercelJson, null, 2));
        spinner.succeed('vercel.json created');
        break;
      }
      case 'railway': {
        spinner.start('Generating railway.yaml...');
        const railwayYaml = `{
  "build": {
    "builder": "NIXPACKS",
    "env": {
      "NODE_VERSION": "20"
    }
  },
  "deploy": {
    "startCommand": "pnpm start",
    "restartPolicy": {
      "policy": "ON_FAILURE",
      "delayMs": 5000
    }
  }
}
`;
        await fs.writeFile(path.join(projectRoot, 'railway.yaml'), railwayYaml);
        spinner.succeed('railway.yaml created');
        break;
      }
      default:
        console.log(chalk.yellow(`⚠  Unknown target: ${target}`));
    }
  }

  console.log(chalk.green('✓  Deployment configuration complete.'));
}
